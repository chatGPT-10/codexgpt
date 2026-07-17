import {
  assertFullAccessProfileEligibleV3,
  type FullAccessProfileV3
} from "./fullAccessResources.js";

export interface ExecutionCapabilityReportV3 {
  schemaVersion: 3;
  backendId: string;
  backendVersion: string;
  evidenceRevision: string;
  authorityMode: "full_access" | "workspace";
  filesystemBoundary: "none" | "snapshot_private";
  credentialIsolation: "none" | "isolated";
  registryIsolation: "none" | "protected";
  networkPosture: "unrestricted_host" | "deny_all";
  networkEgressControl: "none" | "platform_enforced";
  processTreeControl: "job_object_members_only" | "sandbox_job";
  brokerEscapeResistance: "none" | "sandbox_proved";
}

function safeIdentifier(value: string, name: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value)) throw new Error(`${name} is invalid.`);
  return value;
}

export function fullAccessCapabilityReportV3(input: {
  backendId: string;
  backendVersion: string;
  evidenceRevision: string;
}): ExecutionCapabilityReportV3 {
  return Object.freeze({
    schemaVersion: 3,
    backendId: safeIdentifier(input.backendId, "backendId"),
    backendVersion: safeIdentifier(input.backendVersion, "backendVersion"),
    evidenceRevision: safeIdentifier(input.evidenceRevision, "evidenceRevision"),
    authorityMode: "full_access",
    filesystemBoundary: "none",
    credentialIsolation: "none",
    registryIsolation: "none",
    networkPosture: "unrestricted_host",
    networkEgressControl: "none",
    processTreeControl: "job_object_members_only",
    brokerEscapeResistance: "none"
  });
}

export function requiredExecutionCapabilitiesV3(input: {
  mode: "full_access" | "workspace";
  profile: FullAccessProfileV3;
  requestedNetworkDestinations: readonly string[];
}): readonly string[] {
  if (input.mode === "full_access") {
    assertFullAccessProfileEligibleV3(input.profile);
    return Object.freeze(["job_object_members_only", "unrestricted_host"]);
  }
  if (input.requestedNetworkDestinations.length > 0) throw new Error("NETWORK_ENFORCEMENT_UNAVAILABLE");
  return Object.freeze([
    "snapshot_private",
    "isolated_credentials",
    "protected_registry",
    "deny_all_network",
    "sandbox_job",
    "sandbox_proved"
  ]);
}

export interface CapabilityEvidenceCallbacksV3 {
  revokePendingAndGrants?(): void | Promise<void>;
  quarantineProcessInput?(): void | Promise<void>;
  terminateProcesses?(): void | Promise<void>;
  revokeWorkspaces?(): void | Promise<void>;
  cleanupAuthenticatedState?(): void | Promise<void>;
}

export class CapabilityEvidenceStoreV3 {
  #report: ExecutionCapabilityReportV3;
  readonly #callbacks: CapabilityEvidenceCallbacksV3;
  readonly #seen = new Set<string>();
  #updating = false;

  constructor(input: { report: ExecutionCapabilityReportV3; callbacks?: CapabilityEvidenceCallbacksV3 }) {
    this.#report = Object.freeze(structuredClone(input.report));
    this.#callbacks = input.callbacks ?? {};
    this.#seen.add(this.#report.evidenceRevision);
  }

  snapshot(): ExecutionCapabilityReportV3 {
    if (this.#updating) throw new Error("Capability evidence update is active; new requests fail closed.");
    return this.#report;
  }

  async replace(next: ExecutionCapabilityReportV3): Promise<void> {
    if (this.#updating) throw new Error("Capability evidence update is already active.");
    if (next.evidenceRevision === this.#report.evidenceRevision) {
      if (JSON.stringify(next) !== JSON.stringify(this.#report)) {
        throw new Error("Capability evidence revision cannot change meaning.");
      }
      return;
    }
    if (this.#seen.has(next.evidenceRevision)) throw new Error("Capability evidence revision rollback is stale.");
    this.#updating = true;
    try {
      await this.#callbacks.revokePendingAndGrants?.();
      await this.#callbacks.quarantineProcessInput?.();
      await this.#callbacks.terminateProcesses?.();
      await this.#callbacks.revokeWorkspaces?.();
      await this.#callbacks.cleanupAuthenticatedState?.();
      this.#report = Object.freeze(structuredClone(next));
      this.#seen.add(next.evidenceRevision);
    } finally {
      this.#updating = false;
    }
  }
}
