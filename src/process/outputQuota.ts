export interface OutputQuotaOptions {
  maxServerProcesses?: number;
  maxSessionProcesses?: number;
  maxServerRecords?: number;
  maxSessionRecords?: number;
  maxServerOutputBytes?: number;
  maxProcessOutputBytes?: number;
  sessionOutputReservationBytes?: number;
  onOutputOverflow?: (processId: string) => void | Promise<void>;
}

interface ProcessReservation {
  sessionId: string;
  outputBytes: number;
  terminal: boolean;
}

export class OutputQuotaManager {
  readonly #processes = new Map<string, ProcessReservation>();
  readonly #limits: Required<Omit<OutputQuotaOptions, "onOutputOverflow" | "sessionOutputReservationBytes">>;
  readonly #sessionReservation: number;
  readonly #overflow?: OutputQuotaOptions["onOutputOverflow"];
  #serverOutputBytes = 0;

  constructor(options: OutputQuotaOptions = {}) {
    this.#limits = {
      maxServerProcesses: options.maxServerProcesses ?? 8,
      maxSessionProcesses: options.maxSessionProcesses ?? 4,
      maxServerRecords: options.maxServerRecords ?? 32,
      maxSessionRecords: options.maxSessionRecords ?? 8,
      maxServerOutputBytes: options.maxServerOutputBytes ?? 16 * 1024 * 1024,
      maxProcessOutputBytes: options.maxProcessOutputBytes ?? 1024 * 1024
    };
    this.#overflow = options.onOutputOverflow;
    this.#sessionReservation = options.sessionOutputReservationBytes ?? Math.min(
      1024 * 1024,
      Math.floor(this.#limits.maxServerOutputBytes / this.#limits.maxServerProcesses)
    );
    for (const value of Object.values(this.#limits)) if (!Number.isSafeInteger(value) || value < 1) throw new Error("Output quota limit is invalid.");
    if (!Number.isSafeInteger(this.#sessionReservation) || this.#sessionReservation < 0) throw new Error("Session output reservation is invalid.");
    if (this.#limits.maxProcessOutputBytes > 8 * 1024 * 1024) throw new Error("Per-process output hard limit is 8 MiB.");
  }

  reserveProcess(sessionId: string, processId: string): { release(): void } {
    if (this.#processes.has(processId)) throw new Error("Process quota reservation already exists.");
    const sessionCount = [...this.#processes.values()].filter((value) => value.sessionId === sessionId && !value.terminal).length;
    if (sessionCount >= this.#limits.maxSessionProcesses) throw new Error("Transport session active-process quota exceeded.");
    if ([...this.#processes.values()].filter((value) => !value.terminal).length >= this.#limits.maxServerProcesses) throw new Error("Server active-process quota exceeded.");
    this.#processes.set(processId, { sessionId, outputBytes: 0, terminal: false });
    let released = false;
    return { release: () => { if (!released) { released = true; this.#release(processId); } } };
  }

  reserveTerminal(processId: string): void {
    const record = this.#required(processId);
    if (record.terminal) return;
    const server = [...this.#processes.values()].filter((value) => value.terminal).length;
    const session = [...this.#processes.values()].filter((value) => value.terminal && value.sessionId === record.sessionId).length;
    if (session >= this.#limits.maxSessionRecords) throw new Error("Transport session terminal-record quota exceeded.");
    if (server >= this.#limits.maxServerRecords) throw new Error("Server terminal-record quota exceeded.");
    record.terminal = true;
  }

  claimOutput(processId: string, byteCount: number): boolean {
    if (!Number.isSafeInteger(byteCount) || byteCount < 0) throw new Error("Output byte count is invalid.");
    const record = this.#required(processId);
    const sessionUsage = new Map<string, number>();
    for (const candidate of this.#processes.values()) {
      sessionUsage.set(candidate.sessionId, (sessionUsage.get(candidate.sessionId) ?? 0) + candidate.outputBytes);
    }
    const reservedForOthers = [...sessionUsage.entries()]
      .filter(([sessionId]) => sessionId !== record.sessionId)
      .reduce((sum, [, used]) => sum + Math.max(0, this.#sessionReservation - used), 0);
    const availableForCaller = Math.max(0, this.#limits.maxServerOutputBytes - reservedForOthers);
    if (record.outputBytes + byteCount > this.#limits.maxProcessOutputBytes || this.#serverOutputBytes + byteCount > availableForCaller) {
      void this.#overflow?.(processId);
      return false;
    }
    record.outputBytes += byteCount;
    this.#serverOutputBytes += byteCount;
    return true;
  }

  snapshot(): { processCount: number; terminalCount: number; outputBytes: number } {
    return {
      processCount: this.#processes.size,
      terminalCount: [...this.#processes.values()].filter((value) => value.terminal).length,
      outputBytes: this.#serverOutputBytes
    };
  }

  #required(processId: string): ProcessReservation {
    const record = this.#processes.get(processId);
    if (!record) throw new Error("Unknown output quota process.");
    return record;
  }

  #release(processId: string): void {
    const record = this.#processes.get(processId);
    if (!record) return;
    this.#serverOutputBytes -= record.outputBytes;
    this.#processes.delete(processId);
  }
}
