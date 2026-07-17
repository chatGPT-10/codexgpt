export const OUTPUT_REDACTION_CAPABILITY = "best_effort_known_patterns" as const;
const REPLACEMENT = "[REDACTED_SECRET]";

interface SecretMatch {
  index: number;
  length: number;
  replacement: string;
  continues: (character: string) => boolean;
}

const TOKEN_CHARACTER = (character: string) => /^[A-Za-z0-9._~+/=_-]$/.test(character);
const QUERY_CHARACTER = (character: string) => !/[\s&"'`<>]/.test(character);

function firstMatch(value: string): SecretMatch | null {
  const candidates: SecretMatch[] = [];
  const specs: Array<{ pattern: RegExp; prefixGroup?: number; continues: (character: string) => boolean }> = [
    { pattern: /\bsk-[A-Za-z0-9_-]{10}/, continues: TOKEN_CHARACTER },
    { pattern: /\bsk-ant-[A-Za-z0-9_-]{10}/, continues: TOKEN_CHARACTER },
    { pattern: /\bgh[opsru]_[A-Za-z0-9_]{20}/, continues: TOKEN_CHARACTER },
    { pattern: /\bgithub_pat_[A-Za-z0-9_]{20}/, continues: TOKEN_CHARACTER },
    { pattern: /\bnpm_[A-Za-z0-9_-]{20}/, continues: TOKEN_CHARACTER },
    { pattern: /(Authorization\s*:\s*Bearer\s+)[A-Za-z0-9._~+/=-]{12}/i, prefixGroup: 1, continues: TOKEN_CHARACTER },
    { pattern: /([?&](?:codexpro_token|token|access_token|auth_token|api[_-]?key)=)[^&\s"'`<>]{8}/i, prefixGroup: 1, continues: QUERY_CHARACTER }
  ];
  for (const spec of specs) {
    const match = spec.pattern.exec(value);
    if (!match || match.index === undefined) continue;
    const prefix = spec.prefixGroup ? match[spec.prefixGroup] : "";
    candidates.push({
      index: match.index,
      length: match[0].length,
      replacement: `${prefix}${REPLACEMENT}`,
      continues: spec.continues
    });
  }
  candidates.sort((left, right) => left.index - right.index || right.length - left.length);
  return candidates[0] ?? null;
}

export class StreamingRedactor {
  readonly #decoder = new TextDecoder("utf-8", { fatal: false });
  readonly #candidateLimit: number;
  #pending = "";
  #suppress?: (character: string) => boolean;
  #ansi = false;

  constructor(options: { candidateLimit?: number } = {}) {
    this.#candidateLimit = Math.max(64, Math.min(4096, options.candidateLimit ?? 256));
  }

  write(bytes: Buffer | Uint8Array): Buffer {
    return Buffer.from(this.#consume(this.#decoder.decode(bytes, { stream: true })), "utf8");
  }

  end(): Buffer {
    let output = this.#consume(this.#decoder.decode());
    this.#suppress = undefined;
    output += this.#pending;
    this.#pending = "";
    return Buffer.from(output, "utf8");
  }

  bufferedBytes(): number {
    return Buffer.byteLength(this.#pending, "utf8");
  }

  #consume(value: string): string {
    let output = "";
    for (const rawCharacter of value) {
      const character = this.#sanitize(rawCharacter);
      if (character === "") continue;
      if (this.#suppress) {
        if (this.#suppress(character)) continue;
        this.#suppress = undefined;
      }
      this.#pending += character;
      const match = firstMatch(this.#pending);
      if (match) {
        output += this.#pending.slice(0, match.index) + match.replacement;
        this.#pending = this.#pending.slice(match.index + match.length);
        this.#suppress = match.continues;
      }
      while (Buffer.byteLength(this.#pending, "utf8") > this.#candidateLimit) {
        output += this.#pending[0];
        this.#pending = this.#pending.slice(1);
      }
    }
    if (!this.#suppress) {
      const lineBoundary = this.#pending.lastIndexOf("\n");
      if (lineBoundary >= 0) {
        output += this.#pending.slice(0, lineBoundary + 1);
        this.#pending = this.#pending.slice(lineBoundary + 1);
      }
    }
    return output;
  }

  #sanitize(character: string): string {
    if (this.#ansi) {
      if (/[@-~]/.test(character) && character !== "[") this.#ansi = false;
      return "";
    }
    if (character === "\u001b") { this.#ansi = true; return ""; }
    if (character === "\r" || character === "\0") return "";
    const code = character.codePointAt(0)!;
    if (code < 0x20 && character !== "\n" && character !== "\t") return "";
    if (code === 0x7f) return "";
    return character;
  }
}
