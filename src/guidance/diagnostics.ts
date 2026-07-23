import type { InstructionDiagnostic } from "./instructions.js";

export interface GuidanceDiagnosticSummary {
  status: "ok" | "warning" | "unavailable";
  count: number;
  first: InstructionDiagnostic | null;
  action: string;
}

export function summarizeGuidanceDiagnostics(diagnostics: InstructionDiagnostic[]): GuidanceDiagnosticSummary {
  const first = diagnostics[0] ?? null;
  return {
    status: diagnostics.some((item) => item.status === "unavailable")
      ? "unavailable"
      : diagnostics.length
        ? "warning"
        : "ok",
    count: diagnostics.reduce((total, item) => total + item.count, 0),
    first,
    action: first?.action ?? "No guidance action is required."
  };
}
