export type OutputStreamV1 = "stdout" | "stderr" | "terminal";

interface RetainedChunk {
  start: number;
  stream: OutputStreamV1;
  bytes: Buffer;
}

interface OutputWaiter {
  sequence: number;
  resolve: (value: { sequence: number; eof: boolean }) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  abort?: () => void;
}

export interface OutputRingCursor {
  sequence: number;
  offset: number;
}

export interface OutputRingPage {
  chunks: Array<{ stream: OutputStreamV1; text: string; bytes: number }>;
  next: OutputRingCursor;
  truncated: boolean;
  eof: boolean;
  returnedBytes: number;
}

export class OutputRing {
  readonly #capacity: number;
  readonly #chunks: RetainedChunk[] = [];
  readonly #waiters = new Set<OutputWaiter>();
  #next = 0;
  #retained = 0;
  #eof = false;

  constructor(options: { capacityBytes?: number } = {}) {
    this.#capacity = options.capacityBytes ?? 1024 * 1024;
    if (!Number.isSafeInteger(this.#capacity) || this.#capacity < 1 || this.#capacity > 8 * 1024 * 1024) throw new Error("Output ring capacity is invalid.");
  }

  append(stream: OutputStreamV1, value: string | Buffer): number {
    if (this.#eof) throw new Error("Output ring is closed.");
    if (!(["stdout", "stderr", "terminal"] as string[]).includes(stream)) throw new Error("Output stream is invalid.");
    const bytes = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value, "utf8");
    if (!bytes.length) return this.#next;
    this.#chunks.push({ start: this.#next, stream, bytes });
    this.#next += bytes.length;
    this.#retained += bytes.length;
    this.#evict();
    this.#wake();
    return this.#next;
  }

  appendRedacted(
    stream: OutputStreamV1,
    redactor: { write(bytes: Buffer | Uint8Array): Buffer },
    bytes: Buffer | Uint8Array
  ): number {
    return this.append(stream, redactor.write(bytes));
  }

  read(input: OutputRingCursor & { maxBytes: number }): OutputRingPage {
    if (!Number.isSafeInteger(input.maxBytes) || input.maxBytes < 1 || input.maxBytes > 262_144) throw new Error("Output page limit is invalid.");
    const requested = input.sequence + input.offset;
    const earliest = this.earliestSequence();
    let position = Math.max(requested, earliest);
    let remaining = input.maxBytes;
    const chunks: OutputRingPage["chunks"] = [];
    for (const chunk of this.#chunks) {
      const end = chunk.start + chunk.bytes.length;
      if (end <= position || remaining === 0) continue;
      const from = Math.max(0, position - chunk.start);
      const available = chunk.bytes.subarray(from);
      const take = utf8TakeLength(available, remaining);
      const selected = available.subarray(0, take);
      if (!selected.length) continue;
      const text = selected.toString("utf8");
      chunks.push({ stream: chunk.stream, text, bytes: selected.length });
      position += selected.length;
      remaining -= selected.length;
    }
    const returnedBytes = input.maxBytes - remaining;
    return {
      chunks,
      next: { sequence: position, offset: 0 },
      truncated: requested < earliest,
      eof: this.#eof && position >= this.#next,
      returnedBytes
    };
  }

  close(): void {
    if (this.#eof) return;
    this.#eof = true;
    this.#wake();
  }

  earliestSequence(): number {
    return this.#chunks[0]?.start ?? this.#next;
  }

  latestSequence(): number {
    return this.#next;
  }

  waiterCount(): number {
    return this.#waiters.size;
  }

  waitForChange(input: { sequence: number; signal?: AbortSignal }): Promise<{ sequence: number; eof: boolean }> {
    if (this.#next > input.sequence || this.#eof) return Promise.resolve({ sequence: this.#next, eof: this.#eof });
    return new Promise((resolve, reject) => {
      const waiter: OutputWaiter = { sequence: input.sequence, resolve, reject, signal: input.signal };
      waiter.abort = () => {
        this.#waiters.delete(waiter);
        reject(new Error("Output wait aborted."));
      };
      if (input.signal?.aborted) return waiter.abort();
      input.signal?.addEventListener("abort", waiter.abort, { once: true });
      this.#waiters.add(waiter);
    });
  }

  #evict(): void {
    while (this.#retained > this.#capacity && this.#chunks.length) {
      const first = this.#chunks[0];
      const excess = this.#retained - this.#capacity;
      if (first.bytes.length <= excess) {
        this.#chunks.shift();
        this.#retained -= first.bytes.length;
      } else {
        const drop = utf8DropLength(first.bytes, excess);
        first.start += drop;
        first.bytes = first.bytes.subarray(drop);
        this.#retained -= drop;
      }
    }
  }

  #wake(): void {
    for (const waiter of [...this.#waiters]) {
      if (this.#next <= waiter.sequence && !this.#eof) continue;
      this.#waiters.delete(waiter);
      waiter.signal?.removeEventListener("abort", waiter.abort!);
      waiter.resolve({ sequence: this.#next, eof: this.#eof });
    }
  }
}

function utf8DropLength(bytes: Buffer, minimum: number): number {
  let offset = Math.min(bytes.length, minimum);
  while (offset < bytes.length && (bytes[offset] & 0xc0) === 0x80) offset += 1;
  return offset;
}

function utf8TakeLength(bytes: Buffer, maximum: number): number {
  if (!bytes.length) return 0;
  let end = Math.min(bytes.length, maximum);
  while (end > 0 && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
  if (end > 0) return end;
  end = 1;
  while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end += 1;
  return end;
}
