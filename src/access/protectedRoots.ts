import path from "node:path";
import { createHash } from "node:crypto";

export interface ProtectedPathClassification {
  blocked: boolean;
  ruleId: string | null;
  pathFingerprint: string;
}

export interface ProtectedRootPolicyOptions {
  platform?: NodeJS.Platform;
  protectedRoots?: readonly string[];
}

function comparisonPath(value: string, platform: NodeJS.Platform): string {
  const normalized = path.win32.normalize(value.replaceAll("/", "\\")).replace(/\\+$/, "");
  return platform === "win32" ? normalized.toLocaleLowerCase("en-US") : path.resolve(value);
}

function fingerprint(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export function assertConfirmedRootPathInput(value: string, platform: NodeJS.Platform = process.platform): void {
  if (value.includes("\0")) throw new Error("Path contains a null byte.");
  if (platform === "win32") {
    const normalized = value.replace(/\//g, "\\");
    if (/^\\\\[?.]\\/.test(normalized)) throw new Error("Windows device paths are not allowed.");
    if (/^\\\\/.test(normalized)) throw new Error("UNC paths are not allowed.");
    if (/^[A-Za-z]:(?!\\)/.test(normalized)) throw new Error("Drive-relative paths are not allowed.");
    const withoutDrive = /^[A-Za-z]:/.test(normalized) ? normalized.slice(2) : normalized;
    if (withoutDrive.includes(":")) throw new Error("NTFS alternate data streams are not allowed.");
    for (const segment of withoutDrive.split(/\\+/).filter(Boolean)) {
      if (segment.endsWith(".") || segment.endsWith(" ")) throw new Error("Trailing dot or space path segments are not allowed.");
      if (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(segment)) throw new Error("Windows reserved device names are not allowed.");
    }
  }
  if (platform === "win32" && !/^[A-Za-z]:[\\/]/.test(value)) {
    throw new Error("Confirmed roots require an absolute local drive path.");
  }
}

export class ProtectedRootPolicy {
  readonly #platform: NodeJS.Platform;
  readonly #roots: readonly string[];

  constructor(options: ProtectedRootPolicyOptions = {}) {
    this.#platform = options.platform ?? process.platform;
    this.#roots = Object.freeze((options.protectedRoots ?? []).map((value) => {
      assertConfirmedRootPathInput(value, this.#platform);
      return comparisonPath(value, this.#platform);
    }));
  }

  revision(): string {
    return fingerprint(JSON.stringify({ platform: this.#platform, roots: this.#roots }));
  }

  classify(inputPath: string): ProtectedPathClassification {
    assertConfirmedRootPathInput(inputPath, this.#platform);
    const compared = comparisonPath(inputPath, this.#platform);
    const segments = compared.split(/[\\/]+/).filter(Boolean);
    let ruleId: string | null = null;

    if (this.#roots.some((root) => compared === root || compared.startsWith(`${root}\\`))) {
      ruleId = "protected.explicit-root";
    } else if (segments.some((segment) => segment === ".ssh")) {
      ruleId = "protected.ssh";
    } else if (segments.some((segment) => segment === ".git")) {
      ruleId = "protected.git-control";
    } else if (segments.some((segment) => [".codex", ".aws", ".azure", ".gnupg", ".kube"].includes(segment))) {
      ruleId = "protected.codex-auth";
    } else if (/^[a-z]:\\windows\\system32\\config(?:\\|$)/i.test(compared)) {
      ruleId = "protected.windows-credentials";
    } else if (/\\appdata\\(?:local|roaming)\\(?:google\\chrome|microsoft\\(?:edge|credentials|vault)|mozilla|codex|codexgpt)(?:\\|$)/i.test(compared)) {
      ruleId = "protected.browser-or-codex-store";
    }

    return Object.freeze({
      blocked: ruleId !== null,
      ruleId,
      pathFingerprint: fingerprint(compared)
    });
  }
}

export interface StableFileIdentityV1 {
  volumeSerial: string;
  fileId: string;
  numberOfLinks: number;
  kind: "file" | "directory" | "other";
}

export interface ConfirmedRootFileGuardOptions {
  inspectFile(path: string): StableFileIdentityV1 | Promise<StableFileIdentityV1>;
  protectedPolicy?: ProtectedRootPolicy;
}

export interface StableFileBindingV1 extends StableFileIdentityV1 {
  canonicalPath: string;
  pathFingerprint: string;
}

function validateFileFacts(facts: StableFileIdentityV1): StableFileIdentityV1 {
  if (!facts.volumeSerial || !facts.fileId || !Number.isSafeInteger(facts.numberOfLinks) || facts.numberOfLinks < 1) {
    throw new Error("Stable file identity is unavailable.");
  }
  return Object.freeze({ ...facts });
}

export class ConfirmedRootFileGuard {
  readonly #inspect: ConfirmedRootFileGuardOptions["inspectFile"];
  readonly #protected?: ProtectedRootPolicy;

  constructor(options: ConfirmedRootFileGuardOptions) {
    this.#inspect = options.inspectFile;
    this.#protected = options.protectedPolicy;
  }

  async inspectForRead(inputPath: string): Promise<
    | { allowed: true; binding: StableFileBindingV1 }
    | { allowed: false; omissionCode: "PROTECTED_OR_LINKED_ENTRY"; omitted: 1 }
  > {
    if (this.#protected?.classify(inputPath).blocked) {
      return { allowed: false, omissionCode: "PROTECTED_OR_LINKED_ENTRY", omitted: 1 };
    }
    const facts = validateFileFacts(await this.#inspect(inputPath));
    if (facts.kind === "file" && facts.numberOfLinks !== 1) {
      return { allowed: false, omissionCode: "PROTECTED_OR_LINKED_ENTRY", omitted: 1 };
    }
    return { allowed: true, binding: this.#binding(inputPath, facts) };
  }

  async bindForMutation(inputPath: string): Promise<StableFileBindingV1> {
    if (this.#protected?.classify(inputPath).blocked) throw new Error("Protected paths cannot be mutated.");
    const facts = validateFileFacts(await this.#inspect(inputPath));
    if (facts.kind === "file" && facts.numberOfLinks !== 1) {
      throw new Error("Confirmed-root mutations reject hard links.");
    }
    return this.#binding(inputPath, facts);
  }

  async revalidate(binding: StableFileBindingV1): Promise<void> {
    const facts = validateFileFacts(await this.#inspect(binding.canonicalPath));
    if (
      facts.volumeSerial !== binding.volumeSerial ||
      facts.fileId !== binding.fileId ||
      facts.numberOfLinks !== binding.numberOfLinks ||
      facts.kind !== binding.kind
    ) throw new Error("Confirmed-root file identity drift detected.");
  }

  #binding(inputPath: string, facts: StableFileIdentityV1): StableFileBindingV1 {
    return Object.freeze({ ...facts, canonicalPath: inputPath, pathFingerprint: fingerprint(comparisonPath(inputPath, process.platform)) });
  }
}
