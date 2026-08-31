function cloneSource(source) {
  return Object.freeze({ ...source });
}

function redactValue(value, secret) {
  if (!secret) return value;
  return value === undefined || value === null || value === ""
    ? "missing"
    : "set";
}

function completeJsonValue(value) {
  if (value === undefined) return null;
  if (Array.isArray(value)) return Object.freeze(value.map(completeJsonValue));
  if (value && typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, completeJsonValue(nested)]))
    );
  }
  return value;
}

export function sourceLabel(source) {
  if (source.kind === "cli") return `CLI ${source.argument}`;
  if (source.kind === "environment") return `environment ${source.variable}`;
  if (source.kind === "profile") return `profile ${source.file} ${source.jsonPath}`;
  if (source.kind === "default") return `default (${source.rule})`;
  if (source.kind === "derived") return `derived (${source.rule})`;
  if (source.kind === "compatibility" && source.classification === "mode-ambiguous") {
    return `mode-ambiguous compatibility source ${source.source} (named for ${source.namedTunnelMode}; effective across all tunnel modes)`;
  }
  if (source.kind === "compatibility") return `compatibility source ${source.source}`;
  return "unknown source";
}

export function explainInput(input) {
  const present = input.candidates.filter((candidate) => candidate.present);
  const selectedCandidate = present[0];
  const selected = selectedCandidate?.source ?? input.fallback;
  if (!selected) throw new Error(`Config explanation for ${input.key} has no selected source.`);
  const selectedLabel = sourceLabel(selected);
  const diagnostics = selected.kind === "compatibility" && selectedCandidate?.compatibility
    ? [Object.freeze({
        code: "CONFIG_COMPATIBILITY_INPUT",
        severity: "warning",
        key: input.key,
        message: `Configuration ${input.key} uses ${selectedLabel}; migrate to ${selectedCandidate.compatibility.replacement} before ${selected.removeAfter}.`,
        origin: cloneSource(selected),
        replacement: selectedCandidate.compatibility.replacement,
        remediation: selectedCandidate.compatibility.remediation,
        ...(input.secret ? { valueState: redactValue(input.value, true) } : {})
      })]
    : [];
  return Object.freeze({
    key: input.key,
    value: redactValue(input.value, Boolean(input.secret)),
    secret: Boolean(input.secret),
    restartRequired: input.restartRequired !== false,
    source: cloneSource(selected),
    overridden: Object.freeze(present.slice(1).map((candidate) => Object.freeze({
      source: cloneSource(candidate.source),
      reason: `Lower precedence than ${selectedLabel}.`
    }))),
    diagnostics: Object.freeze(diagnostics)
  });
}

export function createConfigExplanation(snapshot, inputs, options = {}) {
  const publicSnapshot = snapshot.toJSON();
  const diagnostics = Object.freeze(inputs.flatMap((input) => input.diagnostics ?? []));
  return Object.freeze({
    schemaVersion: 1,
    command: "config explain",
    publicFingerprint: publicSnapshot.publicFingerprint,
    runtime: completeJsonValue(publicSnapshot.effective),
    inputs: Object.freeze(inputs),
    diagnostics,
    next: Object.freeze({
      effect: "after-restart",
      command: options.restartCommand ?? "codexgpt start"
    })
  });
}

function safeTerminalText(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu, "?")
    .replace(/[\r\n\t]/gu, " ");
}

function displayValue(value) {
  if (typeof value === "string") return safeTerminalText(value || "(empty)");
  return safeTerminalText(JSON.stringify(value));
}

export function formatConfigExplanationText(explanation) {
  const lines = [
    "CodexGPT config explain",
    `Fingerprint: ${explanation.publicFingerprint}`,
    "",
    "Why public configuration inputs won:"
  ];
  for (const input of explanation.inputs) {
    lines.push(`${input.key} = ${displayValue(input.value)}`);
    lines.push(`  selected: ${safeTerminalText(sourceLabel(input.source))}`);
    lines.push(`  effective: ${input.restartRequired ? "after restart" : "immediately"}`);
    for (const overridden of input.overridden) {
      lines.push(
        `  overrides: ${safeTerminalText(sourceLabel(overridden.source))} - ${safeTerminalText(overridden.reason)}`
      );
    }
  }
  if (explanation.diagnostics.length) {
    lines.push("", "Compatibility warnings:");
    for (const diagnostic of explanation.diagnostics) {
      lines.push(`${diagnostic.code}: ${safeTerminalText(diagnostic.message)}`);
      lines.push(`  fix: ${safeTerminalText(diagnostic.remediation)}`);
    }
  }
  lines.push(
    "",
    "Next: stop the foreground server if it is running, then run:",
    `  ${safeTerminalText(explanation.next.command)}`,
    "",
    "Use --json for the complete secret-redacted runtime snapshot and structured override chain."
  );
  return `${lines.join("\n")}\n`;
}
