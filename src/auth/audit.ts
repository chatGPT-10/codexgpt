import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";
import type { PersistentAuditStore } from "../audit/store.js";
import type { AuthStateAuditEventV5 } from "../audit/types.js";
import { authConfigurationError } from "./errors.js";
import type { AuthStateAuditAppender, AuthStateAuditEvent } from "./stateStore.js";

export interface PersistentAuthStateAuditDependencies {
  randomBytes?: (size: number) => Buffer;
  now?: () => number;
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export class PersistentAuthStateAuditAppender implements AuthStateAuditAppender {
  readonly #audit: PersistentAuditStore;
  readonly #randomBytes: (size: number) => Buffer;
  readonly #now: () => number;

  constructor(audit: PersistentAuditStore, dependencies: PersistentAuthStateAuditDependencies = {}) {
    this.#audit = audit;
    this.#randomBytes = dependencies.randomBytes ?? nodeRandomBytes;
    this.#now = dependencies.now ?? Date.now;
  }

  async append(event: AuthStateAuditEvent): Promise<void> {
    const random = this.#randomBytes(16);
    if (!Buffer.isBuffer(random) || random.length !== 16) {
      throw authConfigurationError("OAUTH_AUDIT_FAILURE", "OAuth audit random source is invalid.");
    }
    const binding = event.bindingId ?? "installation";
    const incarnation = event.incarnationId ?? "none";
    const persisted: AuthStateAuditEventV5 = {
      schemaVersion: 5,
      contractVersion: 5,
      eventId: `event_${random.toString("hex")}`,
      eventType: "auth_state",
      timestamp: new Date(this.#now()).toISOString(),
      requestId: null,
      toolName: null,
      canonicalAction: `auth_state.${event.transition}`,
      bindingId: event.bindingId,
      incarnationId: event.incarnationId,
      transition: event.transition,
      generation: event.generation,
      stateDigest: event.stateDigest,
      subjectFingerprint: fingerprint(`auth-owner:${binding}`),
      contextFingerprint: fingerprint(`auth-deployment:${binding}:${incarnation}`),
      resultCode: null,
      counts: { generation: event.generation }
    };
    await this.#audit.append(persisted);
  }
}
