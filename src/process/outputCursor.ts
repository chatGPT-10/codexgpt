import { createCipheriv, createDecipheriv, randomBytes as nodeRandomBytes } from "node:crypto";

export interface OutputCursorStateV1 {
  processId: string;
  generation: number;
  sequence: number;
  offset: number;
  contextFingerprint: string;
  expiresAt: number;
}

export interface OutputCursorCodecOptions {
  key: Buffer;
  now?: () => number;
  randomBytes?: (size: number) => Buffer;
}

const AAD = Buffer.from("codexpro-output-cursor-v1", "utf8");

function safeState(value: OutputCursorStateV1): OutputCursorStateV1 {
  if (!/^process_[a-f0-9]{32}$/.test(value.processId)) throw new Error("Output cursor process is invalid.");
  if (![value.generation, value.sequence, value.offset, value.expiresAt].every(Number.isSafeInteger)) throw new Error("Output cursor numeric state is invalid.");
  if (value.generation < 0 || value.sequence < 0 || value.offset < 0 || value.expiresAt < 0) throw new Error("Output cursor numeric state is invalid.");
  if (!value.contextFingerprint || value.contextFingerprint.length > 256) throw new Error("Output cursor context is invalid.");
  return value;
}

export class OutputCursorCodec {
  readonly #key: Buffer;
  readonly #now: () => number;
  readonly #randomBytes: (size: number) => Buffer;

  constructor(options: OutputCursorCodecOptions) {
    if (!Buffer.isBuffer(options.key) || options.key.length !== 32) throw new Error("Output cursor requires a 256-bit key.");
    this.#key = Buffer.from(options.key);
    this.#now = options.now ?? Date.now;
    this.#randomBytes = options.randomBytes ?? nodeRandomBytes;
  }

  encode(state: OutputCursorStateV1): string {
    const checked = safeState(state);
    const nonce = this.#randomBytes(12);
    if (!Buffer.isBuffer(nonce) || nonce.length !== 12) throw new Error("Output cursor nonce source is invalid.");
    const cipher = createCipheriv("aes-256-gcm", this.#key, nonce);
    cipher.setAAD(AAD);
    const plaintext = Buffer.from(JSON.stringify({ v: 1, ...checked }), "utf8");
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64url");
  }

  decode(cursor: string, expected: Pick<OutputCursorStateV1, "processId" | "generation" | "contextFingerprint">): OutputCursorStateV1 {
    try {
      if (typeof cursor !== "string" || cursor.length < 40 || cursor.length > 2048) throw new Error();
      const packed = Buffer.from(cursor, "base64url");
      if (packed.length < 29) throw new Error();
      const decipher = createDecipheriv("aes-256-gcm", this.#key, packed.subarray(0, 12));
      decipher.setAAD(AAD);
      decipher.setAuthTag(packed.subarray(12, 28));
      const decoded = JSON.parse(Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf8"));
      if (decoded.v !== 1) throw new Error("Output cursor version is invalid.");
      const state = safeState(decoded);
      if (state.processId !== expected.processId || state.generation !== expected.generation || state.contextFingerprint !== expected.contextFingerprint) {
        throw new Error("Output cursor context does not match.");
      }
      if (this.#now() >= state.expiresAt) throw new Error("Output cursor expired.");
      return { processId: state.processId, generation: state.generation, sequence: state.sequence, offset: state.offset, contextFingerprint: state.contextFingerprint, expiresAt: state.expiresAt };
    } catch (error) {
      if (error instanceof Error && /context|expired|version/.test(error.message)) throw error;
      throw new Error("Output cursor is invalid.");
    }
  }

  dispose(): void {
    this.#key.fill(0);
  }
}
