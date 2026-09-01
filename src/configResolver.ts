import { createHash } from "node:crypto";
import path from "node:path";
import { inspect } from "node:util";

export type ConfigOrigin =
  | { kind: "cli"; argument: string }
  | { kind: "environment"; variable: string; scope: "current-process" | "persisted-user" }
  | { kind: "profile"; file: string; jsonPath: string }
  | { kind: "default"; rule: string }
  | {
      kind: "compatibility";
      source: string;
      removeAfter: string;
      classification?: "mode-ambiguous";
      namedTunnelMode?: string;
      effectiveScope?: "all-tunnel-modes";
    };

export interface ConfigDiagnostic {
  readonly code: "CONFIG_COMPATIBILITY_INPUT";
  readonly severity: "warning";
  readonly key: string;
  readonly message: string;
  readonly origin: ConfigOrigin;
  readonly replacement: string;
  readonly remediation: string;
  readonly valueState?: "set" | "missing";
}

declare const RESOLVED_VALUE_BRAND: unique symbol;
const OWNED_RESOLVED_VALUES = new WeakSet<object>();

export interface ResolvedValue<T> {
  readonly value: T;
  readonly origin: ConfigOrigin;
  readonly restartRequired: boolean;
  readonly secret: boolean;
  readonly diagnostics: readonly ConfigDiagnostic[];
  readonly [RESOLVED_VALUE_BRAND]: true;
  toJSON(): Readonly<{
    value: T | "set" | "missing";
    origin: ConfigOrigin;
    restartRequired: boolean;
    secret: boolean;
    diagnostics: readonly ConfigDiagnostic[];
  }>;
}

export interface ResolvedConfig<T> {
  effective: T;
  origins: ReadonlyMap<string, ConfigOrigin>;
  publicFingerprint: string;
  diagnostics: readonly ConfigDiagnostic[];
  toJSON(): Readonly<{
    effective: Readonly<Record<string, unknown>>;
    origins: Readonly<Record<string, ConfigOrigin>>;
    publicFingerprint: string;
    diagnostics: readonly ConfigDiagnostic[];
  }>;
}

export interface RawConfigCandidate {
  value: unknown;
  origin: ConfigOrigin;
}

export interface ResolveConfigValueInput<T> {
  key: string;
  cli?: readonly RawConfigCandidate[];
  currentProcess?: readonly RawConfigCandidate[];
  persistedUser?: readonly RawConfigCandidate[];
  profile?: readonly RawConfigCandidate[];
  compatibility?: readonly RawConfigCandidate[];
  defaultValue: T;
  defaultRule: string;
  parse: (value: unknown, origin: ConfigOrigin) => T;
  restartRequired?: boolean;
  secret?: boolean;
  remediation?: string;
  compatibilityReplacement?: string;
  compatibilityRemediation?: string;
}

export interface ResolvedField<T> {
  key: string;
  resolved: ResolvedValue<T>;
}

export interface ConfigBootstrapInput {
  readonly argv: readonly string[];
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly cwd: string;
  readonly platform: NodeJS.Platform;
  readonly filesystemPlatform?: NodeJS.Platform;
}

type EffectiveFields<TFields extends Readonly<Record<string, ResolvedField<unknown>>>> = {
  readonly [TKey in keyof TFields]: TFields[TKey] extends ResolvedField<infer TValue> ? TValue : never;
};

export type ConfigResolutionErrorCode =
  | "CONFIG_SOURCE_CONFLICT"
  | "CONFIG_SOURCE_INVALID"
  | "CONFIG_VALUE_INVALID"
  | "CONFIG_FINGERPRINT_VALUE_INVALID";

function cloneOrigin(origin: ConfigOrigin): ConfigOrigin {
  return Object.freeze({ ...origin });
}

function cloneDiagnostic(diagnostic: ConfigDiagnostic): ConfigDiagnostic {
  return Object.freeze({
    ...diagnostic,
    origin: cloneOrigin(diagnostic.origin)
  });
}

function originLabel(origin: ConfigOrigin): string {
  switch (origin.kind) {
    case "cli": return `CLI argument ${origin.argument}`;
    case "environment": return `${origin.scope} environment ${origin.variable}`;
    case "profile": return `profile ${origin.file} ${origin.jsonPath}`;
    case "default": return `default rule ${origin.rule}`;
    case "compatibility": return `compatibility source ${origin.source}`;
  }
}

export class ConfigResolutionError extends Error {
  readonly name = "ConfigResolutionError";
  readonly origins: readonly ConfigOrigin[];

  constructor(
    readonly code: ConfigResolutionErrorCode,
    readonly key: string,
    origins: readonly ConfigOrigin[],
    readonly remediation: string,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.origins = Object.freeze(origins.map(cloneOrigin));
  }

  get sources(): readonly string[] {
    return Object.freeze(this.origins.map(originLabel));
  }

  toJSON(): Readonly<{
    code: ConfigResolutionErrorCode;
    key: string;
    origins: readonly ConfigOrigin[];
    remediation: string;
  }> {
    return Object.freeze({
      code: this.code,
      key: this.key,
      origins: this.origins,
      remediation: this.remediation
    });
  }
}

type CandidateLayer = "CLI" | "current-process environment" | "persisted-user environment" | "profile" | "compatibility";

function originMatchesLayer(layer: CandidateLayer, origin: ConfigOrigin): boolean {
  if (layer === "CLI") return origin.kind === "cli";
  if (layer === "current-process environment") return origin.kind === "environment" && origin.scope === "current-process";
  if (layer === "persisted-user environment") return origin.kind === "environment" && origin.scope === "persisted-user";
  if (layer === "profile") return origin.kind === "profile";
  return origin.kind === "compatibility";
}

function assertCandidates(key: string, layer: CandidateLayer, candidates: readonly RawConfigCandidate[]): void {
  const invalid = candidates.find(({ origin }) => !originMatchesLayer(layer, origin));
  if (invalid) {
    const remediation = `Pass ${originLabel(invalid.origin)} through its matching configuration layer.`;
    throw new ConfigResolutionError(
      "CONFIG_SOURCE_INVALID",
      key,
      [invalid.origin],
      remediation,
      `Configuration ${key} has a source that does not belong to the ${layer} layer. ${remediation}`
    );
  }
  if (candidates.length <= 1) return;
  const origins = candidates.map(({ origin }) => origin);
  const sources = origins.map(originLabel);
  const remediation = `Remove all but one ${layer} source for ${key}.`;
  throw new ConfigResolutionError(
    "CONFIG_SOURCE_CONFLICT",
    key,
    origins,
    remediation,
    `Configuration ${key} is set more than once in the ${layer} layer: ${sources.join(", ")}. ${remediation}`
  );
}

function throwFingerprintValueError(key: string): never {
  const remediation = `Use only finite JSON-safe configuration values for ${key}.`;
  throw new ConfigResolutionError(
    "CONFIG_FINGERPRINT_VALUE_INVALID",
    key,
    [],
    remediation,
    `Configuration ${key} cannot be represented in the public fingerprint. ${remediation}`
  );
}

function cloneConfigValue(value: unknown, key: string, seen = new Set<object>()): unknown {
  if (value === undefined || value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    throwFingerprintValueError(key);
  }
  if (typeof value !== "object" || seen.has(value)) throwFingerprintValueError(key);
  seen.add(value);
  try {
    if (Array.isArray(value)) return Object.freeze(value.map((item) => cloneConfigValue(item, key, seen)));
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throwFingerprintValueError(key);
    return Object.freeze(Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([childKey, child]) => [childKey, cloneConfigValue(child, key, seen)])
    ));
  } finally {
    seen.delete(value);
  }
}

function parseCandidate<T>(input: ResolveConfigValueInput<T>, candidate: RawConfigCandidate): T {
  try {
    return cloneConfigValue(input.parse(candidate.value, candidate.origin), input.key) as T;
  } catch (cause) {
    const origin = cloneOrigin(candidate.origin);
    const source = originLabel(origin);
    const remediation = input.remediation ?? `Correct or remove ${source}.`;
    if (cause instanceof ConfigResolutionError && cause.code === "CONFIG_FINGERPRINT_VALUE_INVALID") {
      throw new ConfigResolutionError(
        cause.code,
        input.key,
        [origin],
        remediation,
        `Configuration ${input.key} is invalid at ${source}. ${remediation}`
      );
    }
    throw new ConfigResolutionError(
      "CONFIG_VALUE_INVALID",
      input.key,
      [origin],
      remediation,
      `Configuration ${input.key} is invalid at ${source}. ${remediation}`,
      input.secret ? undefined : { cause }
    );
  }
}

function makeResolvedValue<T>(input: {
  value: T;
  origin: ConfigOrigin;
  restartRequired: boolean;
  secret: boolean;
  diagnostics: readonly ConfigDiagnostic[];
}): ResolvedValue<T> {
  const origin = cloneOrigin(input.origin);
  const diagnostics = Object.freeze(input.diagnostics.map(cloneDiagnostic));
  const publicProjection = Object.freeze({
    value: input.secret
      ? input.value === undefined || input.value === null || input.value === "" ? "missing" as const : "set" as const
      : input.value,
    origin,
    restartRequired: input.restartRequired,
    secret: input.secret,
    diagnostics
  });
  const resolved = {
    value: input.value,
    origin,
    restartRequired: input.restartRequired,
    secret: input.secret,
    diagnostics,
    toJSON: () => publicProjection,
    [inspect.custom]: () => publicProjection
  };
  OWNED_RESOLVED_VALUES.add(resolved);
  return Object.freeze(resolved) as unknown as ResolvedValue<T>;
}

export function resolveConfigValue<T>(input: ResolveConfigValueInput<T>): ResolvedValue<T> {
  const canonicalLayers = [
    ["CLI", input.cli ?? []],
    ["current-process environment", input.currentProcess ?? []],
    ["persisted-user environment", input.persistedUser ?? []],
    ["profile", input.profile ?? []]
  ] as const satisfies readonly (readonly [CandidateLayer, readonly RawConfigCandidate[]])[];

  const parsedLayers = canonicalLayers.map(([label, candidates]) => {
    assertCandidates(input.key, label, candidates);
    return candidates.length === 0
      ? undefined
      : { origin: cloneOrigin(candidates[0].origin), value: parseCandidate(input, candidates[0]) };
  });
  const selected = parsedLayers.find((candidate) => candidate !== undefined);
  if (selected) {
    return makeResolvedValue({
      value: selected.value,
      origin: selected.origin,
      restartRequired: input.restartRequired ?? false,
      secret: input.secret ?? false,
      diagnostics: []
    });
  }

  const compatibility = input.compatibility ?? [];
  assertCandidates(input.key, "compatibility", compatibility);
  if (compatibility.length === 1) {
    const candidate = compatibility[0];
    const origin = cloneOrigin(candidate.origin);
    const value = parseCandidate(input, candidate);
    const replacement = input.compatibilityReplacement ?? input.key;
    const remediation = input.compatibilityRemediation ?? `Migrate ${input.key} to ${replacement}, then remove ${originLabel(origin)}.`;
    const diagnostic: ConfigDiagnostic = Object.freeze({
      code: "CONFIG_COMPATIBILITY_INPUT",
      severity: "warning",
      key: input.key,
      message: `Configuration ${input.key} uses ${originLabel(origin)}; migrate to ${replacement} before ${origin.kind === "compatibility" ? origin.removeAfter : "the compatibility window ends"}.`,
      origin,
      replacement,
      remediation,
      ...(input.secret ? { valueState: value === undefined || value === null || value === "" ? "missing" : "set" } : {})
    });
    return makeResolvedValue({
      value,
      origin,
      restartRequired: input.restartRequired ?? false,
      secret: input.secret ?? false,
      diagnostics: [diagnostic]
    });
  }

  return makeResolvedValue({
    value: cloneConfigValue(input.defaultValue, input.key) as T,
    origin: Object.freeze({ kind: "default" as const, rule: input.defaultRule }),
    restartRequired: input.restartRequired ?? false,
    secret: input.secret ?? false,
    diagnostics: []
  });
}

export function environmentCandidates(
  environment: Readonly<Record<string, string | undefined>>,
  variable: string,
  scope: "current-process" | "persisted-user",
  platform: NodeJS.Platform
): readonly RawConfigCandidate[] {
  const expected = platform === "win32" ? variable.toLocaleLowerCase("en-US") : variable;
  return Object.freeze(
    Object.entries(environment)
      .filter(([name, value]) => {
        if (value === undefined) return false;
        const comparable = platform === "win32" ? name.toLocaleLowerCase("en-US") : name;
        return comparable === expected;
      })
      .map(([name, value]) => Object.freeze({
        value,
        origin: Object.freeze({ kind: "environment" as const, variable: name, scope })
      }))
  );
}

function argumentCandidates(argv: readonly string[], name: string): readonly RawConfigCandidate[] {
  const candidates: RawConfigCandidate[] = [];
  const argument = `--${name}`;
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (raw === argument) {
      const next = argv[index + 1];
      candidates.push(Object.freeze({
        value: next && !next.startsWith("--") ? next : undefined,
        origin: Object.freeze({ kind: "cli" as const, argument })
      }));
      if (next && !next.startsWith("--")) index += 1;
    } else if (raw.startsWith(`${argument}=`)) {
      candidates.push(Object.freeze({
        value: raw.slice(argument.length + 1),
        origin: Object.freeze({ kind: "cli" as const, argument })
      }));
    }
  }
  return Object.freeze(candidates);
}

function flagCandidates(argv: readonly string[], name: string): readonly RawConfigCandidate[] {
  const argument = `--${name}`;
  const candidates: RawConfigCandidate[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (raw === argument) {
      const next = argv[index + 1];
      candidates.push(Object.freeze({
        value: next && !next.startsWith("--") ? next : true,
        origin: Object.freeze({ kind: "cli" as const, argument })
      }));
      if (next && !next.startsWith("--")) index += 1;
    } else if (raw.startsWith(`${argument}=`)) {
      candidates.push(Object.freeze({
        value: raw.slice(argument.length + 1),
        origin: Object.freeze({ kind: "cli" as const, argument })
      }));
    }
  }
  return Object.freeze(candidates);
}

function compatibilityEnvironmentCandidates(
  environment: Readonly<Record<string, string | undefined>>,
  variable: string,
  platform: NodeJS.Platform
): readonly RawConfigCandidate[] {
  return Object.freeze(environmentCandidates(environment, variable, "current-process", platform).map((candidate) => {
    const variableName = candidate.origin.kind === "environment" ? candidate.origin.variable : variable;
    return Object.freeze({
      value: candidate.value,
      origin: Object.freeze({
        kind: "compatibility" as const,
        source: `current-process environment ${variableName}`,
        removeAfter: "the configuration resolver migration window"
      })
    });
  }));
}

export function resolveConfigBootstrap(
  input: ConfigBootstrapInput
): ResolvedConfig<Readonly<{ rootInput: string; noProfile: boolean }>> {
  const filesystemPlatform = input.filesystemPlatform ?? input.platform;
  const pathApi = filesystemPlatform === "win32" ? path.win32 : path.posix;
  const validWindowsCwd = filesystemPlatform !== "win32" || /^[a-zA-Z]:[\\/]/u.test(input.cwd);
  if (
    typeof input.cwd !== "string" ||
    input.cwd.length === 0 ||
    !pathApi.isAbsolute(input.cwd) ||
    !validWindowsCwd
  ) {
    const origin = Object.freeze({
      kind: "default" as const,
      rule: "use the caller current working directory"
    });
    throw new ConfigResolutionError(
      "CONFIG_VALUE_INVALID",
      "root",
      [origin],
      filesystemPlatform === "win32"
        ? "Supply a drive-qualified local path such as D:\\workspace; root-relative, drive-relative, UNC, and device paths are not supported."
        : "Supply an absolute, non-empty caller current working directory.",
      filesystemPlatform === "win32"
        ? "Configuration root cannot use this caller current working directory. Supply a drive-qualified local path such as D:\\workspace; root-relative, drive-relative, UNC, and device paths are not supported."
        : "Configuration root cannot use an invalid caller current working directory. Supply an absolute, non-empty caller current working directory."
    );
  }
  const cliRoots = argumentCandidates(input.argv, "root");
  const environmentRoots = environmentCandidates(
    input.environment,
    "CODEXGPT_ROOT",
    "current-process",
    input.platform
  );
  const compatibilityRoots = compatibilityEnvironmentCandidates(
    input.environment,
    "CODEBASE_BRIDGE_REPO_ROOT",
    input.platform
  );
  const root = resolveConfigValue({
    key: "root",
    ...(cliRoots.length > 0
      ? { cli: cliRoots }
      : environmentRoots.length > 0
        ? { currentProcess: environmentRoots }
        : compatibilityRoots.length > 0
          ? { compatibility: compatibilityRoots }
          : {}),
    defaultValue: input.cwd,
    defaultRule: "use the caller current working directory",
    parse: (value) => {
      if (typeof value !== "string" || value.length === 0) throw new Error("root must be a non-empty path");
      return value;
    },
    remediation: "Set one non-empty --root path or CODEXGPT_ROOT value.",
    compatibilityReplacement: "--root or CODEXGPT_ROOT",
    compatibilityRemediation: "$env:CODEXGPT_ROOT = $env:CODEBASE_BRIDGE_REPO_ROOT; Remove-Item Env:CODEBASE_BRIDGE_REPO_ROOT"
  });
  const noProfile = resolveConfigValue({
    key: "profile.disabled",
    cli: flagCandidates(input.argv, "no-profile"),
    defaultValue: false,
    defaultRule: "load the canonical-root profile unless --no-profile is present",
    parse: (value) => {
      if (value !== true) throw new Error("--no-profile does not accept a value");
      return true;
    },
    remediation: "Use --no-profile without a value, or remove the flag."
  });
  return buildResolvedConfig({
    rootInput: { key: "root", resolved: root },
    noProfile: { key: "profile.disabled", resolved: noProfile }
  });
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalEncoding(value: unknown, key: string, seen = new Set<object>()): unknown {
  if (value === undefined) return ["undefined"];
  if (value === null) return ["null"];
  if (typeof value === "string") return ["string", value];
  if (typeof value === "boolean") return ["boolean", value];
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throwFingerprintValueError(key);
    return ["number", Object.is(value, -0) ? "-0" : value];
  }
  if (typeof value !== "object" || seen.has(value)) throwFingerprintValueError(key);
  seen.add(value);
  try {
    if (Array.isArray(value)) return ["array", value.map((item) => canonicalEncoding(item, key, seen))];
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throwFingerprintValueError(key);
    return [
      "object",
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([childKey, child]) => [childKey, canonicalEncoding(child, key, seen)])
    ];
  } finally {
    seen.delete(value);
  }
}

class ReadonlyMapSnapshot<TKey, TValue> implements ReadonlyMap<TKey, TValue> {
  readonly #map: Map<TKey, TValue>;

  constructor(entries: readonly (readonly [TKey, TValue])[]) {
    this.#map = new Map(entries);
    Object.freeze(this);
  }

  get size(): number { return this.#map.size; }
  get(key: TKey): TValue | undefined { return this.#map.get(key); }
  has(key: TKey): boolean { return this.#map.has(key); }
  entries(): MapIterator<[TKey, TValue]> { return this.#map.entries(); }
  keys(): MapIterator<TKey> { return this.#map.keys(); }
  values(): MapIterator<TValue> { return this.#map.values(); }
  forEach(callbackfn: (value: TValue, key: TKey, map: ReadonlyMap<TKey, TValue>) => void, thisArg?: unknown): void {
    for (const [key, value] of this.#map) callbackfn.call(thisArg, value, key, this);
  }
  [Symbol.iterator](): MapIterator<[TKey, TValue]> { return this.#map[Symbol.iterator](); }
  get [Symbol.toStringTag](): string { return "ReadonlyMap"; }
}

export function buildResolvedConfig<
  TFields extends Readonly<Record<string, ResolvedField<unknown>>>
>(fields: TFields): ResolvedConfig<EffectiveFields<TFields>> {
  const orderedFields = Object.entries(fields).sort(([, left], [, right]) => compareCodeUnits(left.key, right.key));
  const seenKeys = new Set<string>();
  const origins: [string, ConfigOrigin][] = [];
  const publicOrigins: Record<string, ConfigOrigin> = {};
  const effective: Record<string, unknown> = {};
  const publicEffective: Record<string, unknown> = {};
  const fingerprintValues: unknown[] = [];
  const diagnostics: ConfigDiagnostic[] = [];

  for (const [property, field] of orderedFields) {
    if (!OWNED_RESOLVED_VALUES.has(field.resolved)) {
      const remediation = `Resolve ${field.key} with resolveConfigValue before building the configuration snapshot.`;
      throw new ConfigResolutionError(
        "CONFIG_SOURCE_INVALID",
        field.key,
        [],
        remediation,
        `Resolved configuration field ${field.key} is not an owned resolver result. ${remediation}`
      );
    }
    if (seenKeys.has(field.key)) {
      const remediation = `Use one effective field for ${field.key}.`;
      throw new ConfigResolutionError(
        "CONFIG_SOURCE_CONFLICT",
        field.key,
        [field.resolved.origin],
        remediation,
        `Resolved configuration contains duplicate field ${field.key}. ${remediation}`
      );
    }
    seenKeys.add(field.key);
    const origin = cloneOrigin(field.resolved.origin);
    const value = cloneConfigValue(field.resolved.value, field.key);
    const publicValue = field.resolved.secret
      ? value === undefined || value === null || value === "" ? "missing" : "set"
      : value;
    origins.push([field.key, origin]);
    publicOrigins[field.key] = origin;
    effective[property] = value;
    publicEffective[property] = publicValue;
    fingerprintValues.push([
      field.key,
      property,
      field.resolved.secret ? ["secret", publicValue] : canonicalEncoding(value, field.key)
    ]);
    diagnostics.push(...field.resolved.diagnostics.map(cloneDiagnostic));
  }

  const frozenEffective = Object.freeze(effective) as EffectiveFields<TFields>;
  const frozenPublicEffective = Object.freeze(publicEffective);
  const frozenPublicOrigins = Object.freeze(publicOrigins);
  const frozenDiagnostics = Object.freeze([...diagnostics]);
  const publicFingerprint = createHash("sha256").update(JSON.stringify(fingerprintValues)).digest("hex");
  const publicProjection = Object.freeze({
    effective: frozenPublicEffective,
    origins: frozenPublicOrigins,
    publicFingerprint,
    diagnostics: frozenDiagnostics
  });
  const result = {
    effective: frozenEffective,
    origins: new ReadonlyMapSnapshot(origins),
    publicFingerprint,
    diagnostics: frozenDiagnostics,
    toJSON: () => publicProjection,
    [inspect.custom]: () => publicProjection
  };
  return Object.freeze(result);
}
