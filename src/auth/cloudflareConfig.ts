import { createHash } from "node:crypto";
import path from "node:path";
import { parse, stringify } from "yaml";
import { normalizeOAuthHostname } from "./configuration.js";

const TUNNEL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface DedicatedTunnelConfigInput {
  tunnelId: string;
  credentialsFile: string;
  hostname: string;
  publicPort: number;
}

export interface DedicatedTunnelValidationInput {
  tunnelId?: string;
  hostname: string;
  publicPort: number;
  localAdminPort: number;
}

export interface DedicatedTunnelValidationResult {
  ok: true;
  tunnelId: string;
  credentialsFile: string;
  hostname: string;
  publicPort: number;
  digest: string;
}

function tunnelError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}

function exactPort(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw tunnelError("AUTH_TUNNEL_INGRESS_INVALID", `${label} must be an integer from 1 to 65535.`);
  }
  return value;
}

function exactTunnelId(value: string): string {
  const normalized = value.trim().toLocaleLowerCase("en-US");
  if (!TUNNEL_ID_PATTERN.test(normalized)) {
    throw tunnelError("AUTH_TUNNEL_ID_INVALID", "Cloudflare tunnel id is invalid.");
  }
  return normalized;
}

function exactCredentialsFile(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 32768 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw tunnelError("AUTH_TUNNEL_CREDENTIALS_INVALID", "Cloudflare credentials-file path is invalid.");
  }
  return normalized;
}

export function createDedicatedTunnelConfig(input: DedicatedTunnelConfigInput): string {
  const tunnelId = exactTunnelId(input.tunnelId);
  const credentialsFile = exactCredentialsFile(input.credentialsFile);
  const hostname = normalizeOAuthHostname(input.hostname);
  const publicPort = exactPort(input.publicPort, "Public port");
  return stringify({
    tunnel: tunnelId,
    "credentials-file": credentialsFile,
    ingress: [
      { hostname, service: `http://127.0.0.1:${publicPort}` },
      { service: "http_status:404" }
    ]
  }, { lineWidth: 0 });
}

export function validateDedicatedTunnelConfig(
  text: string,
  input: DedicatedTunnelValidationInput
): DedicatedTunnelValidationResult {
  if (!text || Buffer.byteLength(text, "utf8") > 64 * 1024) {
    throw tunnelError("AUTH_TUNNEL_CONFIG_INVALID", "Cloudflare config is empty or too large.");
  }
  let parsed: unknown;
  try {
    parsed = parse(text, { maxAliasCount: 0, uniqueKeys: true });
  } catch {
    throw tunnelError("AUTH_TUNNEL_CONFIG_INVALID", "Cloudflare config is not valid YAML.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw tunnelError("AUTH_TUNNEL_CONFIG_INVALID", "Cloudflare config must be one mapping.");
  }
  const record = parsed as Record<string, unknown>;
  const allowedKeys = new Set(["tunnel", "credentials-file", "ingress", "no-autoupdate"]);
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
    throw tunnelError("AUTH_TUNNEL_SHARED_CONFIG", "Cloudflare config contains unreviewed shared-service settings.");
  }
  const tunnelId = exactTunnelId(String(record.tunnel ?? ""));
  if (input.tunnelId && tunnelId !== exactTunnelId(input.tunnelId)) {
    throw tunnelError("AUTH_TUNNEL_ID_MISMATCH", "Cloudflare config belongs to another tunnel.");
  }
  const credentialsFile = exactCredentialsFile(String(record["credentials-file"] ?? ""));
  const credentialBasename = path.win32.basename(credentialsFile).toLocaleLowerCase("en-US");
  if (credentialBasename !== `${tunnelId}.json`) {
    throw tunnelError("AUTH_TUNNEL_CREDENTIALS_INVALID", "Cloudflare credentials-file must match the exact tunnel id.");
  }
  if ("no-autoupdate" in record && record["no-autoupdate"] !== true) {
    throw tunnelError("AUTH_TUNNEL_CONFIG_INVALID", "Cloudflare no-autoupdate must be true when present.");
  }
  const hostname = normalizeOAuthHostname(input.hostname);
  const publicPort = exactPort(input.publicPort, "Public port");
  const localAdminPort = exactPort(input.localAdminPort, "Local-admin port");
  if (publicPort === localAdminPort) {
    throw tunnelError("AUTH_TUNNEL_ADMIN_EXPOSED", "Public and local-admin ports must be distinct.");
  }
  if (!Array.isArray(record.ingress) || record.ingress.length !== 2) {
    throw tunnelError("AUTH_TUNNEL_SHARED_CONFIG", "OAuth requires one dedicated hostname route and one final 404 route.");
  }
  const first = record.ingress[0];
  const second = record.ingress[1];
  if (!first || typeof first !== "object" || Array.isArray(first) || !second || typeof second !== "object" || Array.isArray(second)) {
    throw tunnelError("AUTH_TUNNEL_INGRESS_INVALID", "Cloudflare ingress entries are invalid.");
  }
  const firstRecord = first as Record<string, unknown>;
  const secondRecord = second as Record<string, unknown>;
  if (
    Object.keys(firstRecord).some((key) => key !== "hostname" && key !== "service") ||
    Object.keys(secondRecord).some((key) => key !== "service")
  ) {
    throw tunnelError("AUTH_TUNNEL_SHARED_CONFIG", "Cloudflare ingress contains unreviewed fields.");
  }
  const service = String(firstRecord.service ?? "");
  if (service === `http://127.0.0.1:${localAdminPort}` || service.endsWith(`:${localAdminPort}`)) {
    throw tunnelError("AUTH_TUNNEL_ADMIN_EXPOSED", "Cloudflare ingress must never target the local-admin port.");
  }
  if (
    firstRecord.hostname !== hostname ||
    service !== `http://127.0.0.1:${publicPort}` ||
    secondRecord.service !== "http_status:404"
  ) {
    throw tunnelError("AUTH_TUNNEL_INGRESS_INVALID", "Cloudflare ingress does not match the exact OAuth listener contract.");
  }
  return Object.freeze({
    ok: true as const,
    tunnelId,
    credentialsFile,
    hostname,
    publicPort,
    digest: `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`
  });
}
