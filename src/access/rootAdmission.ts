import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";
import { FullAccessLeaseManager, type ConfirmedRootAccess, type FullAccessLeaseV1 } from "./fullAccessLease.js";
import { ProtectedRootPolicy, assertConfirmedRootPathInput } from "./protectedRoots.js";
import { describeProcessResource } from "../policy/resources.js";
import { semanticDigest } from "../policy/authorizationFacts.js";
import type { ResourceResolutionResult, ToolResourceResolver } from "../policy/integration.js";
import type { PendingApprovalV3 } from "../policy/pendingApprovals.js";
import type { OpenFullAccessWorkspaceInputV1 } from "../tools/schemas/openFullAccessWorkspace.js";

export interface RootAdmissionBindingV1 {
  serverId: string;
  credentialRef: string | null;
  credentialRevision: string;
  transportKind: string;
  transportSessionId: string;
  identityKind: string;
  identitySubject: string | null;
  policyRevision: string;
  contractVersion: 3;
  evidenceRevision: string;
}

export interface RootIdentityV1 {
  canonicalRoot: string;
  comparisonKey: string;
  volumeSerial: string;
  directoryId: string;
  reparsePoint: boolean;
  mappedDrive: boolean;
}

export interface RootIdentityOracleV1 {
  inspectRoot(root: string): RootIdentityV1 | Promise<RootIdentityV1>;
}

export interface RootAdmissionRequestPairV1 {
  publicRequest: {
    schemaVersion: 1;
    access: ConfirmedRootAccess;
    leaseMs: number;
    requestFingerprint: string;
    bindingFingerprint: string;
  };
  localRequest: {
    schemaVersion: 1;
    root: string;
    access: ConfirmedRootAccess;
    leaseMs: number;
    requestFingerprint: string;
    bindingFingerprint: string;
    binding: RootAdmissionBindingV1;
  };
}

export interface PreparedRootApprovalV1 {
  schemaVersion: 1;
  approvalId: string;
  state: "prepared" | "consumed";
  access: ConfirmedRootAccess;
  leaseMs: number;
  rootIdentity: RootIdentityV1;
  binding: RootAdmissionBindingV1;
  bindingFingerprint: string;
  protectedPolicyRevision: string;
  expiresAt: string;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(value), "utf8").digest("hex")}`;
}

function validateBinding(binding: RootAdmissionBindingV1): RootAdmissionBindingV1 {
  if (binding.contractVersion !== 3) throw new Error("Confirmed-root admission requires contract V3.");
  for (const [key, value] of Object.entries(binding)) {
    if (value === null || key === "contractVersion") continue;
    if (typeof value !== "string" || !value || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`Invalid root-admission binding: ${key}.`);
  }
  return Object.freeze({ ...binding });
}

function validateLeaseMs(value: number): number {
  if (!Number.isSafeInteger(value) || value < 60_000 || value > 30 * 60_000) throw new Error("Root lease must be between one and thirty minutes.");
  return value;
}

function stableRootIdentity(value: RootIdentityV1): RootIdentityV1 {
  if (!value.canonicalRoot || !value.comparisonKey || !value.volumeSerial || !value.directoryId) {
    throw new Error("Stable root identity is unavailable.");
  }
  if (value.reparsePoint) throw new Error("Confirmed roots cannot be reparse points or junctions.");
  if (value.mappedDrive) throw new Error("Mapped drives are not eligible confirmed roots.");
  return Object.freeze({ ...value });
}

export function createStatFreeRootAdmissionRequest(input: {
  root: string;
  access: ConfirmedRootAccess;
  leaseMs: number;
  binding: RootAdmissionBindingV1;
  onFilesystemProbe?: () => void;
}): RootAdmissionRequestPairV1 {
  // Intentionally lexical only. The optional callback exists solely so tests can
  // prove this boundary never asks an oracle to stat, enumerate, or canonicalize.
  void input.onFilesystemProbe;
  if (typeof input.root !== "string" || !input.root.trim() || input.root.includes("\0")) throw new Error("Root input is invalid.");
  if (input.access !== "read_only" && input.access !== "read_write") throw new Error("Root access class is invalid.");
  const binding = validateBinding(input.binding);
  const leaseMs = validateLeaseMs(input.leaseMs);
  const root = input.root.trim();
  const bindingFingerprint = digest(binding);
  const requestFingerprint = digest({ lexicalRoot: root, access: input.access, leaseMs, bindingFingerprint });
  return Object.freeze({
    publicRequest: Object.freeze({ schemaVersion: 1, access: input.access, leaseMs, requestFingerprint, bindingFingerprint }),
    localRequest: Object.freeze({ schemaVersion: 1, root, access: input.access, leaseMs, requestFingerprint, bindingFingerprint, binding })
  });
}

export interface RootAdmissionCoordinatorOptions {
  identityOracle: RootIdentityOracleV1;
  leases?: FullAccessLeaseManager;
  protectedPolicy?: ProtectedRootPolicy;
  now?: () => number;
  randomBytes?: (size: number) => Buffer;
}

export class RootAdmissionCoordinator {
  readonly #oracle: RootIdentityOracleV1;
  readonly #leases: FullAccessLeaseManager;
  readonly #protectedPolicy: ProtectedRootPolicy;
  readonly #now: () => number;
  readonly #approvals = new Map<string, PreparedRootApprovalV1>();
  #tail: Promise<void> = Promise.resolve();

  constructor(options: RootAdmissionCoordinatorOptions) {
    this.#oracle = options.identityOracle;
    this.#now = options.now ?? Date.now;
    this.#protectedPolicy = options.protectedPolicy ?? new ProtectedRootPolicy();
    this.#leases = options.leases ?? new FullAccessLeaseManager({ now: this.#now, randomBytes: options.randomBytes ?? nodeRandomBytes });
  }

  request(input: Parameters<typeof createStatFreeRootAdmissionRequest>[0]): RootAdmissionRequestPairV1 {
    return createStatFreeRootAdmissionRequest(input);
  }

  async prepareLocalApproval(localRequest: RootAdmissionRequestPairV1["localRequest"]): Promise<PreparedRootApprovalV1> {
    const expected = createStatFreeRootAdmissionRequest({
      root: localRequest.root,
      access: localRequest.access,
      leaseMs: localRequest.leaseMs,
      binding: localRequest.binding
    });
    if (
      expected.localRequest.requestFingerprint !== localRequest.requestFingerprint ||
      expected.localRequest.bindingFingerprint !== localRequest.bindingFingerprint
    ) throw new Error("Root admission request was modified before local review.");
    assertConfirmedRootPathInput(localRequest.root);
    const rootIdentity = stableRootIdentity(await this.#oracle.inspectRoot(localRequest.root));
    if (this.#protectedPolicy.classify(rootIdentity.canonicalRoot).blocked) {
      throw new Error("Protected roots cannot be admitted.");
    }
    const approvalId = `root_approval_${digest({ request: localRequest.requestFingerprint, rootIdentity }).slice(-32)}`;
    const approval: PreparedRootApprovalV1 = Object.freeze({
      schemaVersion: 1,
      approvalId,
      state: "prepared",
      access: localRequest.access,
      leaseMs: localRequest.leaseMs,
      rootIdentity,
      binding: structuredClone(localRequest.binding),
      bindingFingerprint: localRequest.bindingFingerprint,
      protectedPolicyRevision: this.#protectedPolicy.revision(),
      expiresAt: new Date(this.#now() + 2 * 60_000).toISOString()
    });
    const existing = this.#approvals.get(approvalId);
    if (existing && canonical(existing) !== canonical(approval)) throw new Error("Root approval identity collision.");
    this.#approvals.set(approvalId, approval);
    return structuredClone(approval);
  }

  consumeApproval(input: { approvalId: string; binding: RootAdmissionBindingV1; grantId?: string }): Promise<{ workspace: { id: string; root: string }; lease: FullAccessLeaseV1 }> {
    return this.#serialized(async () => {
      const approval = this.#approvals.get(input.approvalId);
      if (!approval) throw new Error("Root approval was already consumed or is unknown.");
      if (approval.state !== "prepared") throw new Error("Root approval was already consumed.");
      if (this.#now() >= Date.parse(approval.expiresAt)) {
        this.#approvals.delete(input.approvalId);
        throw new Error("Root approval expired.");
      }
      const binding = validateBinding(input.binding);
      if (digest(binding) !== approval.bindingFingerprint) throw new Error("Root approval binding is stale.");
      if (this.#protectedPolicy.revision() !== approval.protectedPolicyRevision) throw new Error("Root approval policy is stale.");
      const current = stableRootIdentity(await this.#oracle.inspectRoot(approval.rootIdentity.canonicalRoot));
      if (canonical(current) !== canonical(approval.rootIdentity)) throw new Error("Root approval is stale because root identity changed.");
      if (this.#protectedPolicy.classify(current.canonicalRoot).blocked) throw new Error("Root approval is stale because protection changed.");

      // Burn before any random public handle is created. A failed handle issue is
      // therefore fail-closed and cannot replay the one-use root approval.
      this.#approvals.delete(input.approvalId);
      const lease = this.#leases.create({
        rootIdentity: current,
        access: approval.access,
        requestedLeaseMs: approval.leaseMs,
        bindingFingerprint: approval.bindingFingerprint,
        approvalId: approval.approvalId,
        grantId: input.grantId ?? approval.approvalId
      });
      return { workspace: { id: lease.workspaceId, root: current.canonicalRoot }, lease };
    });
  }

  leases(): FullAccessLeaseManager {
    return this.#leases;
  }

  #serialized<T>(operation: () => Promise<T>): Promise<T> {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const result = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    this.#tail = this.#tail.then(async () => {
      try { resolve(await operation()); } catch (error) { reject(error); }
    });
    return result;
  }
}

export interface RootAdmissionRuntimeV3Options extends RootAdmissionCoordinatorOptions {
  currentBinding?: () => RootAdmissionBindingV1;
}

/**
 * Process-local bridge between generic V3 approval records and root-specific
 * local inspection. It never persists roots or changes configured allowedRoots.
 */
export class RootAdmissionRuntimeV3 implements ToolResourceResolver {
  readonly #coordinator: RootAdmissionCoordinator;
  readonly #currentBinding?: () => RootAdmissionBindingV1;
  readonly #pending = new Map<string, RootAdmissionRequestPairV1["localRequest"]>();
  readonly #preparedByRequest = new Map<string, {
    externalApprovalId: string;
    internalApprovalId: string;
    canonicalRoot: string;
    access: ConfirmedRootAccess;
    leaseMs: number;
  }>();

  constructor(options: RootAdmissionRuntimeV3Options) {
    this.#coordinator = new RootAdmissionCoordinator(options);
    this.#currentBinding = options.currentBinding;
  }

  describe(toolName: string, args: Record<string, unknown>): ResourceResolutionResult {
    if (toolName !== "open_full_access_workspace") throw new Error("Root admission resolver supports only open_full_access_workspace.");
    const parsed = this.#input(args);
    const binding = this.#currentBinding?.();
    const publicRequest = binding
      ? this.#coordinator.request({ root: parsed.root, access: parsed.access, leaseMs: parsed.lease_ms ?? 30 * 60_000, binding }).publicRequest
      : {
          schemaVersion: 1 as const,
          access: parsed.access,
          leaseMs: parsed.lease_ms ?? 30 * 60_000,
          requestFingerprint: semanticDigest({ lexicalRoot: parsed.root, access: parsed.access, leaseMs: parsed.lease_ms ?? 30 * 60_000 }),
          bindingFingerprint: semanticDigest({ binding: "resolved-after-context" })
        };
    const resource = describeProcessResource({
      operation: "inspect",
      workspaceId: null,
      processId: `root-admission-${publicRequest.requestFingerprint.replace(/^sha256:/, "").slice(0, 24)}`,
      persistence: false,
      executable: null
    });
    return {
      resource,
      requiredCapabilities: [
        { name: "filesystemReadBoundary", minimum: "brokered" },
        ...(parsed.access === "read_write" ? [{ name: "filesystemWriteBoundary" as const, minimum: "brokered" }] : [])
      ],
      requiredScopes: ["workspace:full-access"],
      semanticFactsDigest: semanticDigest(publicRequest),
      riskClass: "R3"
    };
  }

  registerPendingApproval(
    externalApprovalId: string,
    args: Record<string, unknown>,
    binding: RootAdmissionBindingV1
  ): void {
    const parsed = this.#input(args);
    const request = this.#coordinator.request({
      root: parsed.root,
      access: parsed.access,
      leaseMs: parsed.lease_ms ?? 30 * 60_000,
      binding
    });
    const existing = this.#pending.get(externalApprovalId);
    if (existing && existing.requestFingerprint !== request.localRequest.requestFingerprint) {
      throw new Error("Generic approval ID was rebound to a different root request.");
    }
    this.#pending.set(externalApprovalId, request.localRequest);
  }

  async prepareApproval(record: PendingApprovalV3): Promise<void> {
    if (record.facts.toolName !== "open_full_access_workspace") return;
    const request = this.#pending.get(record.approvalId);
    if (!request) throw new Error("Root admission details are unavailable for local review.");
    const already = this.#preparedByRequest.get(request.requestFingerprint);
    if (already?.externalApprovalId === record.approvalId) return;
    const prepared = await this.#coordinator.prepareLocalApproval(request);
    this.#preparedByRequest.set(request.requestFingerprint, {
      externalApprovalId: record.approvalId,
      internalApprovalId: prepared.approvalId,
      canonicalRoot: prepared.rootIdentity.canonicalRoot,
      access: prepared.access,
      leaseMs: prepared.leaseMs
    });
  }

  approvalDisplay(record: PendingApprovalV3): import("../policy/pendingApprovals.js").ApprovalDisplaySummaryV3 | null {
    if (record.facts.toolName !== "open_full_access_workspace") return null;
    const request = this.#pending.get(record.approvalId);
    const prepared = request ? this.#preparedByRequest.get(request.requestFingerprint) : undefined;
    if (!prepared) return null;
    return {
      ...record.summary,
      logicalScope: prepared.canonicalRoot,
      authoritySummary: `${prepared.access === "read_write" ? "read-write" : "read-only"} confirmed root for ${prepared.leaseMs} ms; file broker only, not a process sandbox`,
      revealArguments: [prepared.canonicalRoot]
    };
  }

  async open(args: Record<string, unknown>, binding?: RootAdmissionBindingV1): Promise<{
    workspace_id: string;
    root: string;
    access_class: "confirmed_root";
    access: ConfirmedRootAccess;
    lease_id: string;
    idle_expires_at: string;
    absolute_expires_at: string;
  }> {
    const parsed = this.#input(args);
    const activeBinding = binding ?? this.#currentBinding?.();
    if (!activeBinding) throw new Error("Root admission identity context is unavailable.");
    const request = this.#coordinator.request({
      root: parsed.root,
      access: parsed.access,
      leaseMs: parsed.lease_ms ?? 30 * 60_000,
      binding: activeBinding
    });
    const prepared = this.#preparedByRequest.get(request.localRequest.requestFingerprint);
    if (!prepared) throw new Error("The locally approved root admission is stale or unavailable.");
    const admitted = await this.#coordinator.consumeApproval({
      approvalId: prepared.internalApprovalId,
      binding: activeBinding,
      grantId: prepared.externalApprovalId
    });
    this.#preparedByRequest.delete(request.localRequest.requestFingerprint);
    this.#pending.delete(prepared.externalApprovalId);
    return {
      workspace_id: admitted.lease.workspaceId,
      root: admitted.workspace.root,
      access_class: "confirmed_root",
      access: admitted.lease.access,
      lease_id: admitted.lease.leaseId,
      idle_expires_at: admitted.lease.idleExpiresAt,
      absolute_expires_at: admitted.lease.absoluteExpiresAt
    };
  }

  leases(): FullAccessLeaseManager {
    return this.#coordinator.leases();
  }

  async close(): Promise<void> {
    for (const lease of this.#coordinator.leases().list()) this.#coordinator.leases().close(lease.workspaceId, "transport_closed");
    await this.#coordinator.leases().drainRevocations();
    this.#pending.clear();
    this.#preparedByRequest.clear();
  }

  getWorkspace(workspaceId: string): {
    id: string;
    root: string;
    openedAt: string;
    accessClass: "confirmed_root";
    access: ConfirmedRootAccess;
    leaseId: string;
    idleExpiresAt: string;
    absoluteExpiresAt: string;
  } {
    const lease = this.#coordinator.leases().get(workspaceId);
    const activeBinding = this.#currentBinding?.();
    if (activeBinding && digest(activeBinding) !== lease.bindingFingerprint) {
      this.#coordinator.leases().close(workspaceId, "policy_stale");
      throw new Error("Confirmed-root workspace identity is stale.");
    }
    return {
      id: lease.workspaceId,
      root: lease.rootIdentity.canonicalRoot,
      openedAt: lease.openedAt,
      accessClass: "confirmed_root",
      access: lease.access,
      leaseId: lease.leaseId,
      idleExpiresAt: lease.idleExpiresAt,
      absoluteExpiresAt: lease.absoluteExpiresAt
    };
  }

  listWorkspaces(): ReturnType<RootAdmissionRuntimeV3["getWorkspace"]>[] {
    const result: ReturnType<RootAdmissionRuntimeV3["getWorkspace"]>[] = [];
    for (const lease of this.#coordinator.leases().list()) {
      try { result.push(this.getWorkspace(lease.workspaceId)); } catch { }
    }
    return result;
  }

  closeWorkspace(workspaceId: string): { workspaceId: string; closedAt: string; state: "closed" } | null {
    try {
      this.getWorkspace(workspaceId);
    } catch {
      return null;
    }
    this.#coordinator.leases().close(workspaceId, "closed");
    return { workspaceId, closedAt: new Date().toISOString(), state: "closed" };
  }

  #input(args: Record<string, unknown>): OpenFullAccessWorkspaceInputV1 {
    const root = args.root;
    const access = args.access;
    const leaseMs = args.lease_ms;
    if (typeof root !== "string" || (access !== "read_only" && access !== "read_write")) {
      throw new Error("Invalid open_full_access_workspace input.");
    }
    if (leaseMs !== undefined && (!Number.isSafeInteger(leaseMs) || (leaseMs as number) < 60_000 || (leaseMs as number) > 30 * 60_000)) {
      throw new Error("Invalid confirmed-root lease duration.");
    }
    return { root, access, ...(leaseMs === undefined ? {} : { lease_ms: leaseMs as number }) };
  }
}
