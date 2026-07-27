import { authConfigurationError } from "./errors.js";

export const OAUTH_CREDENTIAL_PROVIDER = "windows-dpapi-current-user" as const;
export const MAX_CREDENTIAL_PAYLOAD_BYTES = 64 * 1024;

export type CredentialPurpose =
  | "codexgpt-owner-v1"
  | `codexgpt-deployment-v1:${string}:${string}:${"signing-key" | "refresh-pepper"}`;

export interface CredentialStore {
  readonly provider: typeof OAUTH_CREDENTIAL_PROVIDER;
  probe(): Promise<void>;
  protect(plaintext: Uint8Array, purpose: CredentialPurpose): Promise<string>;
  unprotect(protectedValue: string, purpose: CredentialPurpose): Promise<Uint8Array>;
}

const DEPLOYMENT_PURPOSE = /^codexgpt-deployment-v1:binding_[a-f0-9]{32}:incarnation_[a-f0-9]{32}:(?:signing-key|refresh-pepper)$/;

export function assertCredentialPurpose(value: string): asserts value is CredentialPurpose {
  if (value !== "codexgpt-owner-v1" && !DEPLOYMENT_PURPOSE.test(value)) {
    throw authConfigurationError(
      "OAUTH_CREDENTIAL_PROVIDER_FAILURE",
      "OAuth credential purpose is invalid."
    );
  }
}

export function assertCredentialPayload(value: Uint8Array): void {
  if (!(value instanceof Uint8Array) || value.byteLength < 1 || value.byteLength > MAX_CREDENTIAL_PAYLOAD_BYTES) {
    throw authConfigurationError(
      "OAUTH_CREDENTIAL_PROVIDER_FAILURE",
      "OAuth credential payload is outside the supported bounds."
    );
  }
}

export function assertProtectedCredential(value: string): void {
  if (
    value.length < 4 ||
    value.length > Math.ceil(MAX_CREDENTIAL_PAYLOAD_BYTES * 2) ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw authConfigurationError(
      "OAUTH_CREDENTIAL_PROVIDER_FAILURE",
      "Protected OAuth credential is malformed."
    );
  }
}

export class MemoryCredentialStore implements CredentialStore {
  readonly provider = OAUTH_CREDENTIAL_PROVIDER;
  readonly #key: Buffer;

  constructor(key = Buffer.alloc(32, 0x5a)) {
    if (!Buffer.isBuffer(key) || key.length !== 32) {
      throw authConfigurationError("OAUTH_CREDENTIAL_PROVIDER_FAILURE", "Memory credential key is invalid.");
    }
    this.#key = Buffer.from(key);
  }

  async probe(): Promise<void> {}

  async protect(plaintext: Uint8Array, purpose: CredentialPurpose): Promise<string> {
    assertCredentialPurpose(purpose);
    assertCredentialPayload(plaintext);
    const input = Buffer.from(plaintext);
    const purposeBytes = Buffer.from(purpose, "utf8");
    const output = Buffer.alloc(input.length + 1);
    output[0] = purposeBytes.reduce((sum, byte) => (sum + byte) & 0xff, 0);
    for (let index = 0; index < input.length; index += 1) {
      output[index + 1] = input[index] ^ this.#key[index % this.#key.length] ^ output[0];
    }
    input.fill(0);
    return output.toString("base64");
  }

  async unprotect(protectedValue: string, purpose: CredentialPurpose): Promise<Uint8Array> {
    assertCredentialPurpose(purpose);
    assertProtectedCredential(protectedValue);
    const input = Buffer.from(protectedValue, "base64");
    if (input.length < 2) {
      throw authConfigurationError("OAUTH_CREDENTIAL_PROVIDER_FAILURE", "Protected OAuth credential is invalid.");
    }
    const expectedPurpose = Buffer.from(purpose, "utf8").reduce((sum, byte) => (sum + byte) & 0xff, 0);
    if (input[0] !== expectedPurpose) {
      throw authConfigurationError("OAUTH_CREDENTIAL_PROVIDER_FAILURE", "Protected OAuth credential purpose does not match.");
    }
    const output = Buffer.alloc(input.length - 1);
    for (let index = 1; index < input.length; index += 1) {
      output[index - 1] = input[index] ^ this.#key[(index - 1) % this.#key.length] ^ input[0];
    }
    input.fill(0);
    return output;
  }
}
