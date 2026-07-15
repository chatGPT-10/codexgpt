import fs from "node:fs";
import path from "node:path";
import {
  createHash,
  createHmac,
  randomBytes as nodeRandomBytes,
  timingSafeEqual
} from "node:crypto";
import { AtomicJsonFileStore } from "../transactions/atomicStateFile.js";
import {
  installationMasterKey,
  loadOrCreateInstallationState
} from "../transactions/installation.js";
import { transactionStateDirectories } from "../transactions/stateRoot.js";
import type { ProcessInstanceRegistry } from "../transactions/workspaceLock.js";
import {
  auditRecordMac,
  canonicalJson,
  deriveAuditCursorKey,
  deriveAuditRecordKey
} from "./canonicalJson.js";
import { AuditWriterLock } from "./lock.js";
import { auditQueryFilterDigest } from "./queryTool.js";
import {
  auditEnvelopeV1Schema,
  auditEventV2Schema,
  auditIndexV1Schema,
  queryAuditEventsInputV2Schema
} from "./schemas.js";
import {
  AuditError,
  type AdministrativeAuditEventV2,
  type AuditEnvelopeV1,
  type AuditEventV2,
  type AuditIndexV1,
  type AuditSegmentMetadataV1,
  type AuditStoreDiagnostics,
  type QueryAuditEventsInputV2,
  type QueryAuditEventsResultV2,
  type RecoveryAuditEventV2
} from "./types.js";

const ZERO_MAC = "0".repeat(64);
const DEFAULT_SEGMENT_BYTES = 10 * 1024 * 1024;

export interface PersistentAuditStoreOptions {
  stateRoot: string;
  registry: ProcessInstanceRegistry;
  retention: {
    maxAgeDays: number;
    maxClosedBytes: number;
  };
  now?: () => number;
  randomBytes?: (size: number) => Buffer;
  maxSegmentBytes?: number;
  lockRetryCount?: number;
}

interface IncompleteTail {
  file: string;
  segmentId: string;
  prefixByteLength: number;
  bytes: Buffer;
}

interface ScanResult {
  envelopes: AuditEnvelopeV1[];
  segments: AuditSegmentMetadataV1[];
  incompleteTail: IncompleteTail | null;
}

interface VerifiedState {
  index: AuditIndexV1;
  scan: ScanResult;
}

function syncDirectoryBestEffort(directory: string): void {
  let fd: number | undefined;
  try {
    fd = fs.openSync(directory, "r");
    fs.fsyncSync(fd);
  } catch {
    // Directory fsync is not portable on Windows. File fsync remains mandatory.
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new AuditError("AUDIT_RECORD_INVALID", "Audit record is not valid JSON.");
  }
}

function segmentDate(segmentId: string): string {
  return segmentId.slice(6, 16);
}

function segmentFileName(segmentId: string): string {
  return `${segmentId}.jsonl`;
}

function compareIndexWithScan(index: AuditIndexV1, scan: ScanResult): void {
  if (index.state === "integrity_failed") {
    throw new AuditError("AUDIT_INTEGRITY_FAILURE", "Audit store is in integrity-failed state.");
  }
  if (index.chainAnchorSequence > index.lastSequence) {
    throw new AuditError("AUDIT_INTEGRITY_FAILURE", "Audit chain anchor is beyond the index tail.");
  }
  if (index.chainAnchorSequence === 0 && index.chainAnchorMac !== ZERO_MAC) {
    throw new AuditError("AUDIT_INTEGRITY_FAILURE", "Initial audit chain anchor is invalid.");
  }
  const last = scan.envelopes.at(-1);
  const scannedLastSequence = last?.sequence ?? index.chainAnchorSequence;
  if (index.lastSequence > scannedLastSequence) {
    throw new AuditError("AUDIT_INTEGRITY_FAILURE", "Audit index claims records that are not present.");
  }
  if (index.lastSequence === index.chainAnchorSequence) {
    if (index.lastMac !== index.chainAnchorMac) {
      throw new AuditError("AUDIT_INTEGRITY_FAILURE", "Audit index chain anchor conflicts with its tail.");
    }
    return;
  }
  const indexed = scan.envelopes.find((envelope) => envelope.sequence === index.lastSequence);
  if (!indexed || indexed.recordMac !== index.lastMac) {
    throw new AuditError("AUDIT_INTEGRITY_FAILURE", "Audit index conflicts with persisted records.");
  }
}

export class PersistentAuditStore {
  private readonly stateRoot: string;
  private readonly auditDirectory: string;
  private readonly segmentsDirectory: string;
  private readonly quarantineDirectory: string;
  private readonly indexFile: string;
  private readonly recordKey: Buffer;
  private readonly cursorKey: Buffer;
  private readonly indexStore: AtomicJsonFileStore<AuditIndexV1>;
  private readonly writerLock: AuditWriterLock;
  private readonly now: () => number;
  private readonly randomBytes: (size: number) => Buffer;
  private readonly maxSegmentBytes: number;
  private readonly lockRetryCount: number;
  private readonly retention: { maxAgeDays: number; maxClosedBytes: number };

  private constructor(options: PersistentAuditStoreOptions) {
    this.stateRoot = path.resolve(options.stateRoot);
    const directories = transactionStateDirectories(this.stateRoot);
    this.auditDirectory = directories.audit;
    this.segmentsDirectory = path.join(this.auditDirectory, "segments");
    this.quarantineDirectory = path.join(this.auditDirectory, "quarantine");
    this.indexFile = path.join(this.auditDirectory, "index.json");
    this.now = options.now ?? Date.now;
    this.randomBytes = options.randomBytes ?? nodeRandomBytes;
    this.maxSegmentBytes = options.maxSegmentBytes ?? DEFAULT_SEGMENT_BYTES;
    this.lockRetryCount = options.lockRetryCount ?? 500;
    this.retention = {
      maxAgeDays: Math.max(1, Math.min(365, Math.floor(options.retention.maxAgeDays))),
      maxClosedBytes: Math.max(1, Math.min(2 * 1024 * 1024 * 1024, Math.floor(options.retention.maxClosedBytes)))
    };
    if (!Number.isSafeInteger(this.maxSegmentBytes) || this.maxSegmentBytes < 4096) {
      throw new AuditError("AUDIT_UNAVAILABLE", "Audit segment size limit is invalid.");
    }
    const installation = loadOrCreateInstallationState({
      stateRoot: this.stateRoot,
      randomBytes: this.randomBytes,
      now: this.now
    });
    const masterKey = installationMasterKey(installation);
    try {
      this.recordKey = deriveAuditRecordKey(masterKey);
      this.cursorKey = deriveAuditCursorKey(masterKey);
    } finally {
      masterKey.fill(0);
    }
    fs.mkdirSync(this.segmentsDirectory, { recursive: true, mode: 0o700 });
    fs.mkdirSync(this.quarantineDirectory, { recursive: true, mode: 0o700 });
    this.indexStore = new AtomicJsonFileStore(this.stateRoot, auditIndexV1Schema);
    this.writerLock = new AuditWriterLock(this.stateRoot, options.registry, {
      randomBytes: this.randomBytes,
      now: this.now
    });
  }

  static open(options: PersistentAuditStoreOptions): PersistentAuditStore {
    return new PersistentAuditStore(options);
  }

  dispose(): void {
    this.recordKey.fill(0);
    this.cursorKey.fill(0);
  }

  private randomHex(bytes: number): string {
    const value = this.randomBytes(bytes);
    if (!Buffer.isBuffer(value) || value.length !== bytes) {
      throw new AuditError("AUDIT_UNAVAILABLE", "Audit random source returned an invalid value.");
    }
    return value.toString("hex");
  }

  private eventId(): string {
    return `event_${this.randomHex(16)}`;
  }

  private timestamp(): string {
    return new Date(this.now()).toISOString();
  }

  private emptyIndex(): AuditIndexV1 {
    return {
      storeVersion: 1,
      state: "healthy",
      activeSegmentId: null,
      chainAnchorSequence: 0,
      chainAnchorMac: ZERO_MAC,
      lastSequence: 0,
      lastMac: ZERO_MAC,
      lastAppendAt: null,
      failureCode: null,
      segments: []
    };
  }

  private readIndex(): AuditIndexV1 {
    if (!fs.existsSync(this.indexFile)) return this.emptyIndex();
    try {
      return this.indexStore.read(this.indexFile);
    } catch {
      throw new AuditError("AUDIT_INTEGRITY_FAILURE", "Audit index is missing or invalid.");
    }
  }

  private writeIndex(index: AuditIndexV1): void {
    try {
      this.indexStore.write(this.indexFile, auditIndexV1Schema.parse(index));
    } catch (error) {
      if (error instanceof AuditError) throw error;
      throw new AuditError("AUDIT_UNAVAILABLE", "Audit index could not be persisted.");
    }
  }

  private markIntegrityFailure(): void {
    try {
      const previous = this.readIndex();
      this.writeIndex({
        ...previous,
        state: "integrity_failed",
        failureCode: "AUDIT_INTEGRITY_FAILURE"
      });
    } catch {
      // Preserve original evidence if bounded degraded metadata cannot be written.
    }
  }

  private scanSegments(
    chainAnchorSequence: number,
    chainAnchorMac: string,
    allowIncompleteTail: boolean
  ): ScanResult {
    const names = fs.readdirSync(this.segmentsDirectory)
      .filter((name) => /^audit-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}\.jsonl$/.test(name))
      .sort();
    const envelopes: AuditEnvelopeV1[] = [];
    const segments: AuditSegmentMetadataV1[] = [];
    let expectedSequence = chainAnchorSequence + 1;
    let expectedPreviousMac = chainAnchorMac;
    const eventIds = new Set<string>();
    let incompleteTail: IncompleteTail | null = null;

    for (let fileIndex = 0; fileIndex < names.length; fileIndex += 1) {
      const name = names[fileIndex];
      const file = path.join(this.segmentsDirectory, name);
      const bytes = fs.readFileSync(file);
      const isLastFile = fileIndex === names.length - 1;
      let completeBytes = bytes;
      if (bytes.length === 0 || bytes[bytes.length - 1] !== 0x0a) {
        if (!allowIncompleteTail || !isLastFile) {
          throw new AuditError("AUDIT_RECORD_INVALID", "Audit segment has an incomplete final record.");
        }
        const lastNewline = bytes.lastIndexOf(0x0a);
        const prefixByteLength = lastNewline < 0 ? 0 : lastNewline + 1;
        const tail = Buffer.from(bytes.subarray(prefixByteLength));
        incompleteTail = {
          file,
          segmentId: name.slice(0, -6),
          prefixByteLength,
          bytes: tail
        };
        completeBytes = bytes.subarray(0, prefixByteLength);
      }
      const text = completeBytes.toString("utf8");
      const lines = text.length === 0 ? [] : text.slice(0, -1).split("\n").filter((line) => line.length > 0);
      if (lines.length === 0) {
        if (incompleteTail?.file === file) continue;
        throw new AuditError("AUDIT_RECORD_INVALID", "Audit segment is empty.");
      }
      const segmentId = name.slice(0, -6);
      let first: AuditEnvelopeV1 | undefined;
      let last: AuditEnvelopeV1 | undefined;
      for (const line of lines) {
        let envelope: AuditEnvelopeV1;
        try {
          envelope = auditEnvelopeV1Schema.parse(safeParseJson(line));
        } catch (error) {
          if (error instanceof AuditError) throw error;
          throw new AuditError("AUDIT_RECORD_INVALID", "Audit record violates its strict schema.");
        }
        if (canonicalJson(envelope) !== line) {
          throw new AuditError("AUDIT_INTEGRITY_FAILURE", "Audit record is not canonically encoded.");
        }
        if (envelope.segmentId !== segmentId) {
          throw new AuditError("AUDIT_INTEGRITY_FAILURE", "Audit record segment identity is inconsistent.");
        }
        if (envelope.sequence !== expectedSequence || envelope.previousMac !== expectedPreviousMac) {
          throw new AuditError("AUDIT_INTEGRITY_FAILURE", "Audit sequence or chain continuity is invalid.");
        }
        const { recordMac, ...withoutMac } = envelope;
        if (auditRecordMac(this.recordKey, withoutMac) !== recordMac) {
          throw new AuditError("AUDIT_INTEGRITY_FAILURE", "Audit record authentication failed.");
        }
        if (eventIds.has(envelope.event.eventId)) {
          throw new AuditError("AUDIT_INTEGRITY_FAILURE", "Audit event identity is duplicated.");
        }
        eventIds.add(envelope.event.eventId);
        envelopes.push(envelope);
        first ??= envelope;
        last = envelope;
        expectedSequence += 1;
        expectedPreviousMac = recordMac;
      }
      if (!first || !last) {
        throw new AuditError("AUDIT_RECORD_INVALID", "Audit segment contains no records.");
      }
      segments.push({
        segmentId,
        fileName: name,
        state: "closed",
        firstSequence: first.sequence,
        lastSequence: last.sequence,
        firstTimestamp: first.event.timestamp,
        lastTimestamp: last.event.timestamp,
        firstMac: first.recordMac,
        lastMac: last.recordMac,
        recordCount: lines.length,
        byteSize: completeBytes.length
      });
    }
    if (segments.length > 0) segments[segments.length - 1].state = "active";
    return { envelopes, segments, incompleteTail };
  }

  private indexFromScan(scan: ScanResult, previous: AuditIndexV1): AuditIndexV1 {
    const previousStates = new Map(previous.segments.map((segment) => [segment.segmentId, segment.state]));
    const segments = scan.segments.map((segment, index) => ({
      ...segment,
      state: previousStates.get(segment.segmentId) === "delete_pending"
        ? "delete_pending" as const
        : index === scan.segments.length - 1
          ? "active" as const
          : "closed" as const
    }));
    const last = scan.envelopes.at(-1);
    const active = [...segments].reverse().find((segment) => segment.state === "active");
    return {
      storeVersion: 1,
      state: "healthy",
      activeSegmentId: active?.segmentId ?? null,
      chainAnchorSequence: previous.chainAnchorSequence,
      chainAnchorMac: previous.chainAnchorMac,
      lastSequence: last?.sequence ?? previous.chainAnchorSequence,
      lastMac: last?.recordMac ?? previous.chainAnchorMac,
      lastAppendAt: previous.lastAppendAt,
      failureCode: null,
      segments
    };
  }

  private nextSegmentId(date: string): string {
    const prefix = `audit-${date}-`;
    const serials = fs.readdirSync(this.segmentsDirectory)
      .filter((name) => name.startsWith(prefix) && name.endsWith(".jsonl"))
      .map((name) => Number(name.slice(prefix.length, prefix.length + 6)))
      .filter((value) => Number.isInteger(value));
    const next = (serials.length === 0 ? 0 : Math.max(...serials)) + 1;
    if (next > 999999) {
      throw new AuditError("AUDIT_UNAVAILABLE", "Audit segment sequence is exhausted for the UTC day.");
    }
    return `${prefix}${String(next).padStart(6, "0")}`;
  }

  private appendLine(file: string, line: string, create: boolean): void {
    const bytes = Buffer.from(`${line}\n`, "utf8");
    let fd: number | undefined;
    try {
      fd = fs.openSync(file, create ? "wx" : "a", 0o600);
      let offset = 0;
      while (offset < bytes.length) {
        offset += fs.writeSync(fd, bytes, offset, bytes.length - offset, null);
      }
      fs.fsyncSync(fd);
    } catch {
      throw new AuditError("AUDIT_UNAVAILABLE", "Audit record append could not be made durable.");
    } finally {
      bytes.fill(0);
      if (fd !== undefined) fs.closeSync(fd);
    }
    if (create) syncDirectoryBestEffort(this.segmentsDirectory);
  }

  private envelopeFor(index: AuditIndexV1, event: AuditEventV2, segmentId: string): AuditEnvelopeV1 {
    const withoutMac = {
      storeVersion: 1 as const,
      sequence: index.lastSequence + 1,
      segmentId,
      previousMac: index.lastMac,
      event: auditEventV2Schema.parse(event)
    };
    return auditEnvelopeV1Schema.parse({
      ...withoutMac,
      recordMac: auditRecordMac(this.recordKey, withoutMac)
    });
  }

  private appendEnvelope(
    index: AuditIndexV1,
    event: AuditEventV2,
    segmentId: string,
    create: boolean
  ): { envelope: AuditEnvelopeV1; index: AuditIndexV1; scan: ScanResult } {
    const envelope = this.envelopeFor(index, event, segmentId);
    this.appendLine(
      path.join(this.segmentsDirectory, segmentFileName(segmentId)),
      canonicalJson(envelope),
      create
    );
    const scan = this.scanSegments(index.chainAnchorSequence, index.chainAnchorMac, false);
    compareIndexWithScan(index, scan);
    const nextIndex = this.indexFromScan(scan, index);
    nextIndex.lastAppendAt = this.timestamp();
    this.writeIndex(nextIndex);
    return { envelope, index: nextIndex, scan };
  }

  private estimateEnvelopeBytes(index: AuditIndexV1, event: AuditEventV2, segmentId: string): number {
    return Buffer.byteLength(canonicalJson(this.envelopeFor(index, event, segmentId)), "utf8") + 1;
  }

  private commonAdministrative(
    action: AdministrativeAuditEventV2["administrativeAction"],
    canonicalAction: string
  ): AdministrativeAuditEventV2 {
    return {
      schemaVersion: 2,
      eventId: this.eventId(),
      eventType: "administrative",
      timestamp: this.timestamp(),
      requestId: null,
      authorizationEventId: null,
      decisionId: null,
      credentialRef: null,
      transportSessionId: null,
      toolName: null,
      canonicalAction,
      workspaceId: null,
      workspaceRef: null,
      policyRevision: null,
      administrativeAction: action,
      filterDigest: null,
      resultCount: null,
      segmentIds: [],
      firstSequence: null,
      lastSequence: null,
      firstTimestamp: null,
      lastTimestamp: null,
      recordCount: null,
      firstMac: null,
      lastMac: null,
      policyReason: null,
      resultCode: null
    };
  }

  private rotationEvent(segment: AuditSegmentMetadataV1, reason: "utc_date" | "size_limit"): AdministrativeAuditEventV2 {
    return {
      ...this.commonAdministrative("segment_rotation", "audit_segment_rotation"),
      segmentIds: [segment.segmentId],
      firstSequence: segment.firstSequence,
      lastSequence: segment.lastSequence,
      firstTimestamp: segment.firstTimestamp,
      lastTimestamp: segment.lastTimestamp,
      recordCount: segment.recordCount,
      firstMac: segment.firstMac,
      lastMac: segment.lastMac,
      policyReason: reason,
      resultCode: "ROTATED"
    };
  }

  private recoveryEvent(): RecoveryAuditEventV2 {
    return {
      schemaVersion: 2,
      eventId: this.eventId(),
      eventType: "recovery",
      timestamp: this.timestamp(),
      requestId: null,
      authorizationEventId: null,
      decisionId: null,
      credentialRef: null,
      transportSessionId: null,
      toolName: null,
      canonicalAction: "audit_tail_recovery",
      workspaceId: null,
      workspaceRef: null,
      policyRevision: null,
      recoveryAction: "tail_quarantined",
      transactionId: null,
      changeSetId: null,
      operationCount: 0,
      resultCode: "TAIL_QUARANTINED"
    };
  }

  private reconcilePendingDeletion(index: AuditIndexV1): AuditIndexV1 {
    let anchorSequence = index.chainAnchorSequence;
    let anchorMac = index.chainAnchorMac;
    let removed = 0;
    for (const segment of index.segments) {
      if (segment.state !== "delete_pending") break;
      const file = path.join(this.segmentsDirectory, segment.fileName);
      if (fs.existsSync(file)) break;
      anchorSequence = segment.lastSequence;
      anchorMac = segment.lastMac;
      removed += 1;
    }
    if (removed === 0) return index;
    const next = {
      ...index,
      chainAnchorSequence: anchorSequence,
      chainAnchorMac: anchorMac,
      segments: index.segments.slice(removed)
    };
    this.writeIndex(next);
    return next;
  }

  private quarantineTail(tail: IncompleteTail): void {
    const quarantineFile = path.join(
      this.quarantineDirectory,
      `tail-${this.timestamp().replace(/[^0-9]/g, "").slice(0, 17)}-${this.randomHex(8)}.bin`
    );
    let quarantineFd: number | undefined;
    try {
      quarantineFd = fs.openSync(quarantineFile, "wx", 0o600);
      let offset = 0;
      while (offset < tail.bytes.length) {
        offset += fs.writeSync(quarantineFd, tail.bytes, offset, tail.bytes.length - offset, null);
      }
      fs.fsyncSync(quarantineFd);
    } catch {
      throw new AuditError("AUDIT_UNAVAILABLE", "Incomplete audit tail could not be quarantined durably.");
    } finally {
      if (quarantineFd !== undefined) fs.closeSync(quarantineFd);
    }
    syncDirectoryBestEffort(this.quarantineDirectory);

    let segmentFd: number | undefined;
    try {
      segmentFd = fs.openSync(tail.file, "r+");
      fs.ftruncateSync(segmentFd, tail.prefixByteLength);
      fs.fsyncSync(segmentFd);
    } catch {
      throw new AuditError("AUDIT_UNAVAILABLE", "Incomplete audit tail could not be truncated safely.");
    } finally {
      if (segmentFd !== undefined) fs.closeSync(segmentFd);
      tail.bytes.fill(0);
    }
    if (tail.prefixByteLength === 0) {
      fs.unlinkSync(tail.file);
      syncDirectoryBestEffort(this.segmentsDirectory);
    }
  }

  private loadVerifiedState(recoverTail: boolean): VerifiedState {
    let index = this.reconcilePendingDeletion(this.readIndex());
    let scan = this.scanSegments(index.chainAnchorSequence, index.chainAnchorMac, recoverTail);
    compareIndexWithScan(index, scan);
    if (scan.incompleteTail) {
      if (!recoverTail) {
        throw new AuditError("AUDIT_INTEGRITY_FAILURE", "Audit evidence contains an incomplete final record.");
      }
      this.quarantineTail(scan.incompleteTail);
      scan = this.scanSegments(index.chainAnchorSequence, index.chainAnchorMac, false);
      index = this.indexFromScan(scan, index);
      this.writeIndex(index);
      const date = this.timestamp().slice(0, 10);
      const segmentId = index.activeSegmentId ?? this.nextSegmentId(date);
      const recovered = this.appendEnvelope(index, this.recoveryEvent(), segmentId, index.activeSegmentId === null);
      return { index: recovered.index, scan: recovered.scan };
    }
    const current = this.indexFromScan(scan, index);
    if (canonicalJson(current) !== canonicalJson(index)) this.writeIndex(current);
    return { index: current, scan };
  }

  private async withWriterLock<T>(action: () => T | Promise<T>): Promise<T> {
    for (let attempt = 0; attempt <= this.lockRetryCount; attempt += 1) {
      let handle;
      try {
        handle = this.writerLock.acquire();
      } catch (error) {
        if (error instanceof AuditError && error.code === "AUDIT_BUSY" && attempt < this.lockRetryCount) {
          await delay(Math.min(20, 1 + Math.floor(attempt / 20)));
          continue;
        }
        throw error;
      }
      try {
        return await action();
      } finally {
        handle.release();
      }
    }
    throw new AuditError("AUDIT_BUSY", "Audit writer lock remained unavailable.");
  }

  async append(event: AuditEventV2): Promise<AuditEnvelopeV1> {
    const parsedEvent = auditEventV2Schema.parse(event);
    return this.withWriterLock(() => {
      try {
        let { index, scan } = this.loadVerifiedState(true);
        const identicalEvent = scan.envelopes.find((envelope) => envelope.event.eventId === parsedEvent.eventId);
        if (identicalEvent) {
          if (canonicalJson(identicalEvent.event) === canonicalJson(parsedEvent)) return identicalEvent;
          throw new AuditError("AUDIT_INTEGRITY_FAILURE", "Audit event identity was reused with conflicting facts.");
        }
        if (parsedEvent.eventType === "execution") {
          const existingTerminal = scan.envelopes.find((envelope) => (
            envelope.event.eventType === "execution" &&
            envelope.event.authorizationEventId === parsedEvent.authorizationEventId
          ));
          if (existingTerminal) {
            if (canonicalJson(existingTerminal.event) === canonicalJson(parsedEvent)) return existingTerminal;
            throw new AuditError("AUDIT_INTEGRITY_FAILURE", "Authorization already has a conflicting terminal audit event.");
          }
        }
        const date = this.timestamp().slice(0, 10);
        let segmentId = index.activeSegmentId;
        let create = segmentId === null;
        if (!segmentId) segmentId = this.nextSegmentId(date);

        if (!create) {
          const active = index.segments.find((segment) => segment.segmentId === segmentId);
          if (!active) {
            throw new AuditError("AUDIT_INTEGRITY_FAILURE", "Audit active segment metadata is missing.");
          }
          const activeFile = path.join(this.segmentsDirectory, active.fileName);
          const dateRotation = segmentDate(segmentId) !== date;
          const sizeRotation = fs.statSync(activeFile).size + this.estimateEnvelopeBytes(index, parsedEvent, segmentId) > this.maxSegmentBytes;
          if (dateRotation || sizeRotation) {
            const rotation = this.appendEnvelope(
              index,
              this.rotationEvent(active, dateRotation ? "utc_date" : "size_limit"),
              segmentId,
              false
            );
            index = rotation.index;
            segmentId = this.nextSegmentId(date);
            create = true;
          }
        }

        return this.appendEnvelope(index, parsedEvent, segmentId, create).envelope;
      } catch (error) {
        if (error instanceof AuditError && (
          error.code === "AUDIT_INTEGRITY_FAILURE" || error.code === "AUDIT_RECORD_INVALID"
        )) {
          this.markIntegrityFailure();
          throw new AuditError("AUDIT_INTEGRITY_FAILURE", "Audit evidence failed integrity verification.");
        }
        if (error instanceof AuditError) throw error;
        throw new AuditError("AUDIT_UNAVAILABLE", "Audit append failed safely.");
      }
    });
  }

  async verify(): Promise<AuditEnvelopeV1[]> {
    return this.withWriterLock(() => {
      try {
        return this.loadVerifiedState(true).scan.envelopes;
      } catch (error) {
        if (error instanceof AuditError && (
          error.code === "AUDIT_INTEGRITY_FAILURE" || error.code === "AUDIT_RECORD_INVALID"
        )) {
          this.markIntegrityFailure();
          throw new AuditError("AUDIT_INTEGRITY_FAILURE", "Audit evidence failed integrity verification.");
        }
        throw error;
      }
    });
  }

  async runRetention(): Promise<string[]> {
    return this.withWriterLock(() => {
      try {
        let { index } = this.loadVerifiedState(true);
        const closed = index.segments.filter((segment) => segment.state === "closed");
        if (closed.length === 0 || !index.activeSegmentId) return [];
        const cutoff = this.now() - this.retention.maxAgeDays * 24 * 60 * 60 * 1000;
        let ageCount = 0;
        while (ageCount < closed.length && Date.parse(closed[ageCount].lastTimestamp) < cutoff) ageCount += 1;
        let totalClosedBytes = closed.reduce((total, segment) => total + segment.byteSize, 0);
        let sizeCount = 0;
        while (sizeCount < closed.length && totalClosedBytes > this.retention.maxClosedBytes) {
          totalClosedBytes -= closed[sizeCount].byteSize;
          sizeCount += 1;
        }
        const selected = closed.slice(0, Math.max(ageCount, sizeCount));
        if (selected.length === 0) return [];

        const tombstone: AdministrativeAuditEventV2 = {
          ...this.commonAdministrative("retention_prune", "audit_retention_prune"),
          segmentIds: selected.map((segment) => segment.segmentId),
          firstSequence: selected[0].firstSequence,
          lastSequence: selected.at(-1)!.lastSequence,
          firstTimestamp: selected[0].firstTimestamp,
          lastTimestamp: selected.at(-1)!.lastTimestamp,
          recordCount: selected.reduce((total, segment) => total + segment.recordCount, 0),
          firstMac: selected[0].firstMac,
          lastMac: selected.at(-1)!.lastMac,
          policyReason: ageCount > 0 && sizeCount > 0
            ? "age_and_size"
            : ageCount > 0
              ? "age"
              : "size",
          resultCode: "PRUNE_AUTHORIZED"
        };
        index = this.appendEnvelope(index, tombstone, index.activeSegmentId, false).index;
        const selectedIds = new Set(selected.map((segment) => segment.segmentId));
        index = {
          ...index,
          segments: index.segments.map((segment) => selectedIds.has(segment.segmentId)
            ? { ...segment, state: "delete_pending" as const }
            : segment)
        };
        this.writeIndex(index);

        const deleted: string[] = [];
        for (const segment of selected) {
          try {
            fs.unlinkSync(path.join(this.segmentsDirectory, segment.fileName));
            syncDirectoryBestEffort(this.segmentsDirectory);
            deleted.push(segment.segmentId);
          } catch {
            break;
          }
        }
        index = this.reconcilePendingDeletion(index);
        const scan = this.scanSegments(index.chainAnchorSequence, index.chainAnchorMac, false);
        compareIndexWithScan(index, scan);
        const current = this.indexFromScan(scan, index);
        this.writeIndex(current);
        if (deleted.length !== selected.length) {
          throw new AuditError("AUDIT_UNAVAILABLE", "Audit retention deletion remains pending.");
        }
        return deleted;
      } catch (error) {
        if (error instanceof AuditError && (
          error.code === "AUDIT_INTEGRITY_FAILURE" || error.code === "AUDIT_RECORD_INVALID"
        )) {
          this.markIntegrityFailure();
          throw new AuditError("AUDIT_INTEGRITY_FAILURE", "Audit evidence failed integrity verification.");
        }
        if (error instanceof AuditError) throw error;
        throw new AuditError("AUDIT_UNAVAILABLE", "Audit retention failed safely.");
      }
    });
  }

  private encodeCursor(filterDigest: string, lastSequence: number): string {
    const payload = {
      version: 1,
      filterDigest,
      lastSequence,
      expiresAt: new Date(this.now() + 15 * 60 * 1000).toISOString()
    };
    const encoded = Buffer.from(canonicalJson(payload), "utf8").toString("base64url");
    const mac = createHmac("sha256", this.cursorKey).update(encoded, "utf8").digest("hex");
    return `${encoded}.${mac}`;
  }

  private decodeCursor(cursor: string, filterDigest: string): number {
    try {
      const [encoded, suppliedMac, extra] = cursor.split(".");
      if (!encoded || !suppliedMac || extra !== undefined || !/^[a-f0-9]{64}$/.test(suppliedMac)) {
        throw new Error("invalid shape");
      }
      const expectedMac = createHmac("sha256", this.cursorKey).update(encoded, "utf8").digest("hex");
      const supplied = Buffer.from(suppliedMac, "hex");
      const expected = Buffer.from(expectedMac, "hex");
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        throw new Error("invalid mac");
      }
      const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<string, unknown>;
      if (
        payload.version !== 1 ||
        payload.filterDigest !== filterDigest ||
        !Number.isSafeInteger(payload.lastSequence) ||
        Number(payload.lastSequence) < 1 ||
        typeof payload.expiresAt !== "string" ||
        !Number.isFinite(Date.parse(payload.expiresAt)) ||
        Date.parse(payload.expiresAt) < this.now() ||
        Object.keys(payload).sort().join(",") !== "expiresAt,filterDigest,lastSequence,version"
      ) {
        throw new Error("invalid payload");
      }
      return Number(payload.lastSequence);
    } catch {
      throw new AuditError("AUDIT_CURSOR_INVALID", "Audit query cursor is invalid or expired.");
    }
  }

  async probeIntegrity(): Promise<void> {
    await this.withWriterLock(() => {
      try {
        const index = this.readIndex();
        const scan = this.scanSegments(index.chainAnchorSequence, index.chainAnchorMac, false);
        compareIndexWithScan(index, scan);
      } catch (error) {
        if (error instanceof AuditError && error.code === "AUDIT_RECORD_INVALID") {
          throw new AuditError("AUDIT_INTEGRITY_FAILURE", "Audit tail verification failed.");
        }
        throw error;
      }
    });
  }

  async query(input: QueryAuditEventsInputV2): Promise<QueryAuditEventsResultV2> {
    const parsedResult = queryAuditEventsInputV2Schema.safeParse(input);
    if (!parsedResult.success) {
      throw new AuditError(
        input && typeof input === "object" && "cursor" in input
          ? "AUDIT_CURSOR_INVALID"
          : "AUDIT_RANGE_INVALID",
        "Audit query input is invalid."
      );
    }
    const parsed = parsedResult.data;
    const limit = parsed.limit ?? 50;
    const endMs = parsed.endTime === undefined ? this.now() : Date.parse(parsed.endTime);
    const startMs = parsed.startTime === undefined
      ? endMs - 24 * 60 * 60 * 1000
      : Date.parse(parsed.startTime);
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      startMs > endMs ||
      endMs - startMs > 7 * 24 * 60 * 60 * 1000
    ) {
      throw new AuditError("AUDIT_RANGE_INVALID", "Audit query range is invalid or exceeds seven days.");
    }
    const filterDigest = auditQueryFilterDigest({ ...parsed, limit });
    const beforeSequence = parsed.cursor === undefined
      ? Number.POSITIVE_INFINITY
      : this.decodeCursor(parsed.cursor, filterDigest);
    const eventTypes = parsed.eventTypes ? new Set(parsed.eventTypes) : null;
    const toolNames = parsed.toolNames ? new Set(parsed.toolNames) : null;
    const requestIds = parsed.requestIds ? new Set(parsed.requestIds) : null;
    const changeSetIds = parsed.changeSetIds ? new Set(parsed.changeSetIds) : null;
    const workspaceRefs = parsed.workspaceRefs ? new Set(parsed.workspaceRefs) : null;
    const statuses = parsed.statuses ? new Set(parsed.statuses) : null;

    return this.withWriterLock(() => {
      try {
        const { index, scan } = this.loadVerifiedState(true);
        const matched = scan.envelopes
          .filter((envelope) => {
            const event = envelope.event;
            const timestamp = Date.parse(event.timestamp);
            if (envelope.sequence >= beforeSequence || timestamp < startMs || timestamp > endMs) return false;
            if (eventTypes && !eventTypes.has(event.eventType)) return false;
            if (toolNames && (event.toolName === null || !toolNames.has(event.toolName))) return false;
            if (requestIds && (event.requestId === null || !requestIds.has(event.requestId))) return false;
            if (workspaceRefs && (event.workspaceRef === null || !workspaceRefs.has(event.workspaceRef))) return false;
            if (changeSetIds) {
              if (event.eventType !== "execution" && event.eventType !== "recovery") return false;
              if (event.changeSetId === null || !changeSetIds.has(event.changeSetId)) return false;
            }
            if (statuses) {
              if (event.eventType !== "execution" || !statuses.has(event.status)) return false;
            }
            return true;
          })
          .sort((left, right) => right.sequence - left.sequence);
        const page = matched.slice(0, limit);
        const nextCursor = matched.length > limit && page.length > 0
          ? this.encodeCursor(filterDigest, page.at(-1)!.sequence)
          : null;
        return {
          schemaVersion: 2,
          records: page.map((envelope) => ({ sequence: envelope.sequence, event: envelope.event })),
          nextCursor,
          filterDigest,
          startTime: new Date(startMs).toISOString(),
          endTime: new Date(endMs).toISOString(),
          limit,
          integrityState: index.state
        };
      } catch (error) {
        if (error instanceof AuditError && (
          error.code === "AUDIT_INTEGRITY_FAILURE" || error.code === "AUDIT_RECORD_INVALID"
        )) {
          this.markIntegrityFailure();
          throw new AuditError("AUDIT_INTEGRITY_FAILURE", "Audit evidence failed integrity verification.");
        }
        throw error;
      }
    });
  }

  async probeExecutionParticipant(changeSetId: string): Promise<"present" | "absent" | "unknown"> {
    if (!/^cs_[a-f0-9]{32}$/.test(changeSetId)) return "unknown";
    try {
      const records = await this.verify();
      return records.some((envelope) =>
        envelope.event.eventType === "execution" &&
        envelope.event.changeSetId === changeSetId &&
        envelope.event.status === "succeeded"
      ) ? "present" : "absent";
    } catch {
      return "unknown";
    }
  }

  async recordTransactionRecovery(input: {
    action: "rollback_completed" | "cleanup_completed" | "workspace_frozen";
    transactionId: string;
    changeSetId: string;
    operationCount: number;
    resultCode: string;
    timestamp: string;
  }): Promise<void> {
    const eventId = `event_${createHash("sha256").update(
      `${input.transactionId}\0${input.action}\0${input.resultCode}`,
      "utf8"
    ).digest("hex").slice(0, 32)}`;
    await this.append({
      schemaVersion: 2,
      eventId,
      eventType: "recovery",
      timestamp: input.timestamp,
      requestId: null,
      authorizationEventId: null,
      decisionId: null,
      credentialRef: null,
      transportSessionId: null,
      toolName: null,
      canonicalAction: "transaction_recovery",
      workspaceId: null,
      workspaceRef: null,
      policyRevision: null,
      recoveryAction: input.action,
      transactionId: input.transactionId,
      changeSetId: input.changeSetId,
      operationCount: input.operationCount,
      resultCode: input.resultCode
    });
  }

  async recordQuery(filterDigest: string, resultCount: number): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(filterDigest) || !Number.isSafeInteger(resultCount) || resultCount < 0 || resultCount > 100) {
      throw new AuditError("AUDIT_RECORD_INVALID", "Audit query summary is invalid.");
    }
    await this.append({
      ...this.commonAdministrative("audit_query", "audit_query_events"),
      filterDigest,
      resultCount,
      resultCode: "OK"
    });
  }

  diagnostics(): AuditStoreDiagnostics {
    try {
      const index = this.readIndex();
      return {
        state: index.state,
        activeSegmentId: index.activeSegmentId,
        lastCommittedSequence: index.lastSequence,
        lastSuccessfulAppendTime: index.lastAppendAt,
        retention: { ...this.retention },
        failureCode: index.failureCode
      };
    } catch {
      return {
        state: "integrity_failed",
        activeSegmentId: null,
        lastCommittedSequence: 0,
        lastSuccessfulAppendTime: null,
        retention: { ...this.retention },
        failureCode: "AUDIT_INTEGRITY_FAILURE"
      };
    }
  }
}
