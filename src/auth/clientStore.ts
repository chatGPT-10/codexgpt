import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";
import { TextDecoder } from "node:util";
import { OAuthProtocolError, authConfigurationError } from "./errors.js";
import { AuthStateLock, type AuthStateLockHandle } from "./deploymentLock.js";
import {
  AuthStateStore,
  type DeploymentStateV1,
  type RegisteredOAuthClientV1
} from "./stateStore.js";
import {
  KNOWN_OAUTH_SCOPES,
  type OAuthScope,
  type SdkOAuthClientInformation
} from "./types.js";

export const DCR_BODY_MAX_BYTES = 16 * 1024;
export const DCR_MAX_PROPERTIES = 32;
export const DCR_MAX_DEPTH = 4;
export const DCR_UNAPPROVED_LIMIT = 32;
export const DCR_APPROVED_LIMIT = 16;
export const DCR_UNAPPROVED_LIFETIME_MS = 24 * 60 * 60 * 1000;

const LEGACY_CHATGPT_REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";
const CURRENT_CHATGPT_REDIRECT = /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{8,160}$/;
const FORBIDDEN_DISPLAY_PATTERN = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const FORBIDDEN_DCR_FIELDS = new Set([
  "client_id",
  "client_secret",
  "client_secret_expires_at",
  "jwks",
  "jwks_uri",
  "software_statement",
  "registration_access_token",
  "registration_client_uri",
  "token_endpoint_auth_signing_alg",
  "request_uris"
]);

export interface SanitizedClientRegistration {
  redirectUri: string;
  clientName: string | null;
  clientUri: string | null;
  logoUri: string | null;
  tosUri: string | null;
  policyUri: string | null;
  contacts: readonly string[];
  softwareId: string | null;
  softwareVersion: string | null;
  requestedScopes: readonly OAuthScope[];
}

export interface OAuthClientStoreOptions {
  store: AuthStateStore;
  locks: AuthStateLock;
  bindingId: string;
  incarnationId: string;
  now?: () => number;
  randomBytes?: (size: number) => Buffer;
}

export interface SafeOAuthClientView {
  clientId: string;
  clientRef: string;
  label: string;
  redirectHost: string;
  redirectPath: string;
  status: RegisteredOAuthClientV1["status"];
  createdAt: string;
  expiresAt: string | null;
  approvedAt: string | null;
}

class BoundedJsonParser {
  #index = 0;
  #properties = 0;

  constructor(readonly text: string) {}

  parseObjectRoot(): Record<string, unknown> {
    this.#skipWhitespace();
    const value = this.#parseValue(1);
    this.#skipWhitespace();
    if (this.#index !== this.text.length || !value || Array.isArray(value) || typeof value !== "object") {
      throw invalidRegistration("Registration body must be one JSON object.");
    }
    return value as Record<string, unknown>;
  }

  #parseValue(depth: number): unknown {
    if (depth > DCR_MAX_DEPTH) throw invalidRegistration("Registration JSON nesting is too deep.");
    this.#skipWhitespace();
    const character = this.text[this.#index];
    if (character === "{") return this.#parseObject(depth);
    if (character === "[") return this.#parseArray(depth);
    if (character === '"') return this.#parseString();
    if (character === "t" && this.text.startsWith("true", this.#index)) {
      this.#index += 4;
      return true;
    }
    if (character === "f" && this.text.startsWith("false", this.#index)) {
      this.#index += 5;
      return false;
    }
    if (character === "n" && this.text.startsWith("null", this.#index)) {
      this.#index += 4;
      return null;
    }
    return this.#parseNumber();
  }

  #parseObject(depth: number): Record<string, unknown> {
    this.#index += 1;
    const output = Object.create(null) as Record<string, unknown>;
    const keys = new Set<string>();
    this.#skipWhitespace();
    if (this.text[this.#index] === "}") {
      this.#index += 1;
      return output;
    }
    while (true) {
      this.#skipWhitespace();
      if (this.text[this.#index] !== '"') throw invalidRegistration("Registration JSON object key is invalid.");
      const key = this.#parseString();
      this.#properties += 1;
      if (this.#properties > DCR_MAX_PROPERTIES) throw invalidRegistration("Registration JSON has too many properties.");
      if (keys.has(key)) throw invalidRegistration("Registration JSON contains duplicate fields.");
      keys.add(key);
      this.#skipWhitespace();
      if (this.text[this.#index] !== ":") throw invalidRegistration("Registration JSON object is malformed.");
      this.#index += 1;
      output[key] = this.#parseValue(depth + 1);
      this.#skipWhitespace();
      const separator = this.text[this.#index];
      if (separator === "}") {
        this.#index += 1;
        return output;
      }
      if (separator !== ",") throw invalidRegistration("Registration JSON object is malformed.");
      this.#index += 1;
    }
  }

  #parseArray(depth: number): unknown[] {
    this.#index += 1;
    const output: unknown[] = [];
    this.#skipWhitespace();
    if (this.text[this.#index] === "]") {
      this.#index += 1;
      return output;
    }
    while (true) {
      output.push(this.#parseValue(depth + 1));
      this.#skipWhitespace();
      const separator = this.text[this.#index];
      if (separator === "]") {
        this.#index += 1;
        return output;
      }
      if (separator !== ",") throw invalidRegistration("Registration JSON array is malformed.");
      this.#index += 1;
    }
  }

  #parseString(): string {
    const start = this.#index;
    this.#index += 1;
    let escaped = false;
    while (this.#index < this.text.length) {
      const character = this.text[this.#index];
      if (!escaped && character === '"') {
        this.#index += 1;
        try {
          return JSON.parse(this.text.slice(start, this.#index)) as string;
        } catch {
          throw invalidRegistration("Registration JSON string is invalid.");
        }
      }
      if (!escaped && character === "\\") escaped = true;
      else escaped = false;
      this.#index += 1;
    }
    throw invalidRegistration("Registration JSON string is unterminated.");
  }

  #parseNumber(): number {
    const remainder = this.text.slice(this.#index);
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(remainder);
    if (!match) throw invalidRegistration("Registration JSON value is invalid.");
    this.#index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) throw invalidRegistration("Registration JSON number is invalid.");
    return value;
  }

  #skipWhitespace(): void {
    while (this.#index < this.text.length && /[\t\n\r ]/.test(this.text[this.#index])) this.#index += 1;
  }
}

function invalidRegistration(message: string): OAuthProtocolError {
  return new OAuthProtocolError("invalid_client_metadata", message);
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function boundedString(value: unknown, label: string, maximumBytes: number, nullable = false): string | null {
  if (value === undefined && nullable) return null;
  if (typeof value !== "string" || value.length === 0 || utf8Bytes(value) > maximumBytes || FORBIDDEN_DISPLAY_PATTERN.test(value)) {
    throw invalidRegistration(`${label} is invalid.`);
  }
  return value;
}

function optionalHttpsUrl(value: unknown, label: string): string | null {
  if (value === undefined || value === "") return null;
  const text = boundedString(value, label, 2048)!;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw invalidRegistration(`${label} is invalid.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw invalidRegistration(`${label} is invalid.`);
  }
  return text;
}

function exactStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw invalidRegistration(`${label} is invalid.`);
  }
  return [...value] as string[];
}

function parseScopes(value: unknown): readonly OAuthScope[] {
  if (value === undefined) return Object.freeze([...KNOWN_OAUTH_SCOPES]);
  if (typeof value !== "string" || value.length === 0 || utf8Bytes(value) > 256 || /\s{2,}|[^\x20-\x7e]/.test(value)) {
    throw new OAuthProtocolError("invalid_scope", "Registration scope is invalid.");
  }
  const requested = value.split(" ");
  const unique = new Set(requested);
  if (unique.size !== requested.length || requested.some((scope) => !KNOWN_OAUTH_SCOPES.includes(scope as OAuthScope))) {
    throw new OAuthProtocolError("invalid_scope", "Registration scope is invalid.");
  }
  return Object.freeze(KNOWN_OAUTH_SCOPES.filter((scope) => unique.has(scope)));
}

export function parseDynamicClientRegistration(raw: Buffer | string): SanitizedClientRegistration {
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, "utf8");
  if (bytes.length < 2 || bytes.length > DCR_BODY_MAX_BYTES) {
    throw invalidRegistration("Registration body size is invalid.");
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw invalidRegistration("Registration body must be valid UTF-8.");
  }
  const input = new BoundedJsonParser(text).parseObjectRoot();
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_DCR_FIELDS.has(key)) throw invalidRegistration(`${key} is not accepted.`);
  }

  const redirectUris = exactStringArray(input.redirect_uris, "redirect_uris");
  if (redirectUris.length !== 1) {
    throw new OAuthProtocolError("invalid_redirect_uri", "Exactly one ChatGPT redirect URI is required.");
  }
  const redirectUri = redirectUris[0];
  if (utf8Bytes(redirectUri) > 2048 || (redirectUri !== LEGACY_CHATGPT_REDIRECT && !CURRENT_CHATGPT_REDIRECT.test(redirectUri))) {
    throw new OAuthProtocolError("invalid_redirect_uri", "The redirect URI is not an accepted ChatGPT callback.");
  }

  if (input.response_types !== undefined) {
    const values = exactStringArray(input.response_types, "response_types");
    if (values.length !== 1 || values[0] !== "code") throw invalidRegistration("response_types must be exactly code.");
  }
  if (input.grant_types !== undefined) {
    const values = exactStringArray(input.grant_types, "grant_types");
    const set = new Set(values);
    if (values.length !== 2 || set.size !== 2 || !set.has("authorization_code") || !set.has("refresh_token")) {
      throw invalidRegistration("grant_types must contain authorization_code and refresh_token.");
    }
  }
  if (input.token_endpoint_auth_method !== undefined && input.token_endpoint_auth_method !== "none") {
    throw invalidRegistration("token_endpoint_auth_method must be none.");
  }

  const contacts = input.contacts === undefined ? [] : exactStringArray(input.contacts, "contacts");
  if (contacts.length > 8 || contacts.some((entry) => entry.length === 0 || utf8Bytes(entry) > 128 || FORBIDDEN_DISPLAY_PATTERN.test(entry))) {
    throw invalidRegistration("contacts is invalid.");
  }

  return Object.freeze({
    redirectUri,
    clientName: boundedString(input.client_name, "client_name", 128, true),
    clientUri: optionalHttpsUrl(input.client_uri, "client_uri"),
    logoUri: optionalHttpsUrl(input.logo_uri, "logo_uri"),
    tosUri: optionalHttpsUrl(input.tos_uri, "tos_uri"),
    policyUri: optionalHttpsUrl(input.policy_uri, "policy_uri"),
    contacts: Object.freeze([...contacts]),
    softwareId: boundedString(input.software_id, "software_id", 128, true),
    softwareVersion: boundedString(input.software_version, "software_version", 128, true),
    requestedScopes: parseScopes(input.scope)
  });
}

export function clientRefForId(clientId: string): string {
  if (!/^client_[A-Za-z0-9_-]{43}$/.test(clientId)) {
    throw new OAuthProtocolError("invalid_client", "The OAuth client is invalid.");
  }
  return `clientref_${createHash("sha256").update(clientId, "utf8").digest("hex").slice(0, 32)}`;
}

function deploymentLockName(bindingId: string): `deployment_binding_${string}` {
  if (!/^binding_[a-f0-9]{32}$/.test(bindingId)) {
    throw authConfigurationError("OAUTH_STATE_INVALID", "OAuth deployment binding identifier is invalid.");
  }
  return `deployment_${bindingId}` as `deployment_binding_${string}`;
}

function clientInformation(record: RegisteredOAuthClientV1): SdkOAuthClientInformation {
  return {
    redirect_uris: [record.redirectUri],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: KNOWN_OAUTH_SCOPES.join(" "),
    ...(record.clientName ? { client_name: record.clientName } : {}),
    ...(record.clientUri ? { client_uri: record.clientUri } : {}),
    ...(record.logoUri ? { logo_uri: record.logoUri } : {}),
    ...(record.contacts.length > 0 ? { contacts: [...record.contacts] } : {}),
    ...(record.tosUri ? { tos_uri: record.tosUri } : {}),
    ...(record.policyUri ? { policy_uri: record.policyUri } : {}),
    ...(record.softwareId ? { software_id: record.softwareId } : {}),
    ...(record.softwareVersion ? { software_version: record.softwareVersion } : {}),
    client_id: record.clientId,
    client_id_issued_at: record.issuedAt
  };
}

export class OAuthClientStore {
  readonly #store: AuthStateStore;
  readonly #locks: AuthStateLock;
  readonly #bindingId: string;
  readonly #incarnationId: string;
  readonly #now: () => number;
  readonly #randomBytes: (size: number) => Buffer;

  constructor(options: OAuthClientStoreOptions) {
    this.#store = options.store;
    this.#locks = options.locks;
    this.#bindingId = options.bindingId;
    this.#incarnationId = options.incarnationId;
    this.#now = options.now ?? Date.now;
    this.#randomBytes = options.randomBytes ?? nodeRandomBytes;
  }

  async getClient(clientId: string): Promise<SdkOAuthClientInformation | undefined> {
    if (!/^client_[A-Za-z0-9_-]{43}$/.test(clientId)) return undefined;
    const state = this.#readState();
    const record = (state.clients ?? []).find((entry) => entry.clientId === clientId);
    if (!record || record.status === "revoked") return undefined;
    if (record.status === "unapproved" && Date.parse(record.expiresAt ?? "") <= this.#now()) return undefined;
    return clientInformation(record);
  }

  getRecord(clientId: string): RegisteredOAuthClientV1 | undefined {
    const state = this.#readState();
    const record = (state.clients ?? []).find((entry) => entry.clientId === clientId);
    if (!record || record.status === "revoked") return undefined;
    if (record.status === "unapproved" && Date.parse(record.expiresAt ?? "") <= this.#now()) return undefined;
    return structuredClone(record);
  }

  async register(input: SanitizedClientRegistration): Promise<SdkOAuthClientInformation> {
    return await this.#mutate("client_registered", async (state, now) => {
      const active = (state.clients ?? []).filter((record) =>
        record.status === "approved" || (record.status === "unapproved" && Date.parse(record.expiresAt ?? "") > now)
      );
      const unapproved = active.filter((record) => record.status === "unapproved").length;
      if (unapproved >= DCR_UNAPPROVED_LIMIT) {
        throw new OAuthProtocolError(
          "temporarily_unavailable",
          "Client registration capacity is full.",
          503,
          "Run `codexgpt oauth-clients list --server <server_id>`, revoke an unused client, and retry."
        );
      }
      const random = this.#random(32);
      const clientId = `client_${random.toString("base64url")}`;
      const clientRef = clientRefForId(clientId);
      const createdAt = new Date(now).toISOString();
      const record: RegisteredOAuthClientV1 = {
        clientId,
        clientRef,
        redirectUri: input.redirectUri,
        clientName: input.clientName,
        clientUri: input.clientUri,
        logoUri: input.logoUri,
        tosUri: input.tosUri,
        policyUri: input.policyUri,
        contacts: [...input.contacts],
        softwareId: input.softwareId,
        softwareVersion: input.softwareVersion,
        issuedAt: Math.floor(now / 1000),
        status: "unapproved",
        createdAt,
        expiresAt: new Date(now + DCR_UNAPPROVED_LIFETIME_MS).toISOString(),
        approvedAt: null
      };
      return {
        clients: [...active, record],
        result: clientInformation(record)
      };
    });
  }

  async markApproved(clientId: string): Promise<RegisteredOAuthClientV1> {
    return await this.#mutate("client_approved", async (state, now) => {
      const clients = [...(state.clients ?? [])];
      const index = clients.findIndex((record) => record.clientId === clientId);
      if (index < 0 || clients[index].status === "revoked" || (clients[index].status === "unapproved" && Date.parse(clients[index].expiresAt ?? "") <= now)) {
        throw new OAuthProtocolError("invalid_client", "The OAuth client is unavailable.");
      }
      if (clients[index].status === "approved") return { clients, result: structuredClone(clients[index]), changed: false };
      if (clients.filter((record) => record.status === "approved").length >= DCR_APPROVED_LIMIT) {
        throw new OAuthProtocolError(
          "temporarily_unavailable",
          "Approved client capacity is full.",
          503,
          "Run `codexgpt oauth-clients list --server <server_id>`, revoke an unused approved client, and retry."
        );
      }
      clients[index] = {
        ...clients[index],
        status: "approved",
        expiresAt: null,
        approvedAt: new Date(now).toISOString()
      };
      return { clients, result: structuredClone(clients[index]) };
    });
  }

  async revoke(clientId: string): Promise<boolean> {
    return await this.#mutate("client_revoked", (state) => {
      const clients = [...(state.clients ?? [])];
      const index = clients.findIndex((record) => record.clientId === clientId);
      if (index < 0 || clients[index].status === "revoked") {
        return { clients, result: false, changed: false };
      }
      clients[index] = { ...clients[index], status: "revoked", expiresAt: null, approvedAt: null };
      return { clients, result: true };
    });
  }

  async pruneUnapproved(): Promise<number> {
    return await this.#mutate("client_revoked", (state) => {
      const previous = state.clients ?? [];
      const clients = previous.filter((record) => record.status !== "unapproved");
      const removed = previous.length - clients.length;
      return { clients, result: removed, changed: removed > 0 };
    });
  }

  listSafe(): SafeOAuthClientView[] {
    const now = this.#now();
    return (this.#readState().clients ?? [])
      .filter((record) => record.status !== "unapproved" || Date.parse(record.expiresAt ?? "") > now)
      .map((record) => {
        const redirect = new URL(record.redirectUri);
        return {
          clientId: record.clientId,
          clientRef: record.clientRef,
          label: record.clientName ?? "ChatGPT",
          redirectHost: redirect.host,
          redirectPath: redirect.pathname,
          status: record.status,
          createdAt: record.createdAt,
          expiresAt: record.expiresAt,
          approvedAt: record.approvedAt
        };
      });
  }

  generation(): number {
    return this.#readState().generation;
  }

  #readState(): DeploymentStateV1 {
    const state = this.#store.readDeployment(this.#bindingId, this.#incarnationId);
    if (state.bindingId !== this.#bindingId || state.incarnationId !== this.#incarnationId) {
      throw authConfigurationError("OAUTH_STATE_RECOVERY_REQUIRED", "OAuth client store identity changed.");
    }
    return state;
  }

  async #mutate<T>(
    transition: "client_registered" | "client_approved" | "client_revoked",
    action: (state: DeploymentStateV1, now: number) => Promise<{ clients: RegisteredOAuthClientV1[]; result: T; changed?: boolean }> | { clients: RegisteredOAuthClientV1[]; result: T; changed?: boolean }
  ): Promise<T> {
    let handle: AuthStateLockHandle | null = null;
    try {
      handle = this.#locks.acquire(deploymentLockName(this.#bindingId));
      const current = this.#readState();
      const now = this.#now();
      const mutation = await action(current, now);
      if (mutation.changed === false) return mutation.result;
      const { integrity: _integrity, ...withoutIntegrity } = current;
      await this.#store.writeDeployment({
        ...withoutIntegrity,
        generation: current.generation + 1,
        clients: mutation.clients,
        updatedAt: new Date(now).toISOString()
      }, transition);
      return mutation.result;
    } finally {
      handle?.release();
    }
  }

  #random(size: number): Buffer {
    const value = this.#randomBytes(size);
    if (!Buffer.isBuffer(value) || value.length !== size) {
      throw authConfigurationError("OAUTH_STATE_INVALID", "OAuth client random source is invalid.");
    }
    return value;
  }
}
