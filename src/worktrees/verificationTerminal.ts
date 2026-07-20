export interface PersistedTerminalAuditEvidenceV4 {
  eventId: string;
  timestamp: string;
}

export interface PendingVerificationReceiptV4 {
  finalize(audit: PersistedTerminalAuditEvidenceV4): string;
  attach(receipt: string): void;
}

const PENDING_VERIFICATION_RECEIPT = Symbol("codexgpt.pending-verification-receipt.v4");

export function attachPendingVerificationReceipt<T extends object>(
  value: T,
  pending: PendingVerificationReceiptV4
): T {
  Object.defineProperty(value, PENDING_VERIFICATION_RECEIPT, {
    value: pending,
    enumerable: false,
    configurable: false,
    writable: false
  });
  return value;
}

export function pendingVerificationReceipt(value: unknown): PendingVerificationReceiptV4 | null {
  if (!value || typeof value !== "object") return null;
  const direct = (value as Record<symbol, unknown>)[PENDING_VERIFICATION_RECEIPT];
  if (direct && typeof direct === "object") return direct as PendingVerificationReceiptV4;
  const structured = (value as { structuredContent?: unknown }).structuredContent;
  if (!structured || typeof structured !== "object") return null;
  const nested = (structured as Record<symbol, unknown>)[PENDING_VERIFICATION_RECEIPT];
  return nested && typeof nested === "object" ? nested as PendingVerificationReceiptV4 : null;
}
