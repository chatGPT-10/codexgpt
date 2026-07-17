import { createHash, randomBytes } from "node:crypto";
import { auditEventV3Schema } from "../audit/schemas.js";
import type { ProcessLifecycleAuditEventV3 } from "../audit/types.js";

export interface ProcessAuditContextV3 {
  credentialRef: string | null;
  transportSessionId: string;
  policyRevision: string;
  subjectFingerprint: string;
  contextFingerprint: string;
}

export class ProcessAuditCoordinatorV3 {
  readonly #sink: (event: ProcessLifecycleAuditEventV3) => void | Promise<void>;
  readonly #context: () => ProcessAuditContextV3;
  readonly #now: () => number;

  constructor(options: {
    sink?: (event: ProcessLifecycleAuditEventV3) => void | Promise<void>;
    context?: () => ProcessAuditContextV3;
    now?: () => number;
  } = {}) {
    this.#sink = options.sink ?? (() => {});
    this.#context = options.context ?? (() => ({
      credentialRef: null,
      transportSessionId: "process-test-session",
      policyRevision: "policy-test",
      subjectFingerprint: createHash("sha256").update("process-test-subject").digest("hex"),
      contextFingerprint: createHash("sha256").update("process-test-context").digest("hex")
    }));
    this.#now = options.now ?? Date.now;
  }

  async record(
    processId: string,
    generation: number,
    transition: ProcessLifecycleAuditEventV3["transition"],
    reason: string
  ): Promise<void> {
    const context = this.#context();
    const event = auditEventV3Schema.parse({
      schemaVersion: 3,
      contractVersion: 3,
      eventId: `event_${randomBytes(16).toString("hex")}`,
      eventType: "process_lifecycle",
      transition,
      timestamp: new Date(this.#now()).toISOString(),
      requestId: null,
      authorizationEventId: null,
      decisionId: null,
      credentialRef: context.credentialRef,
      transportSessionId: context.transportSessionId,
      toolName: "process_lifecycle",
      canonicalAction: `process.${transition}`,
      workspaceId: null,
      workspaceRef: null,
      policyRevision: context.policyRevision,
      subjectFingerprint: context.subjectFingerprint,
      contextFingerprint: context.contextFingerprint,
      resultCode: reason,
      counts: { processGeneration: generation },
      processId,
      processGeneration: generation
    }) as ProcessLifecycleAuditEventV3;
    await this.#sink(event);
  }
}
