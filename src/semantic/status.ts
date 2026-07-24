import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { SemanticProviderSelection } from "../config.js";
import { DEFAULT_SEMANTIC_BUDGETS } from "./budgets.js";

export interface SemanticCoreStatus {
  configuredProvider: SemanticProviderSelection;
  actualProvider: "builtin-typescript" | "none";
  state: "ready" | "disabled" | "unavailable";
  resultQuality: "semantic" | "lexical";
  engineVersion: string | null;
  nextAction: string;
  budgets: typeof DEFAULT_SEMANTIC_BUDGETS;
}

export function semanticCoreStatus(
  configuredProvider: SemanticProviderSelection,
  baseUrl: string = import.meta.url
): SemanticCoreStatus {
  if (configuredProvider === "none") {
    return {
      configuredProvider,
      actualProvider: "none",
      state: "disabled",
      resultQuality: "lexical",
      engineVersion: null,
      nextAction: "Run `codexgpt semantic use builtin` and restart to restore semantic navigation.",
      budgets: DEFAULT_SEMANTIC_BUDGETS
    };
  }
  try {
    const require = createRequire(baseUrl);
    const packagePath = require.resolve("typescript/package.json");
    const parsed = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { version?: unknown };
    const enginePath = path.join(path.dirname(packagePath), "lib", "typescript.js");
    if (typeof parsed.version !== "string" || !fs.existsSync(enginePath)) throw new Error("missing engine");
    return {
      configuredProvider,
      actualProvider: "builtin-typescript",
      state: "ready",
      resultQuality: "semantic",
      engineVersion: parsed.version,
      nextAction: "No setup is required.",
      budgets: DEFAULT_SEMANTIC_BUDGETS
    };
  } catch {
    return {
      configuredProvider,
      actualProvider: "none",
      state: "unavailable",
      resultQuality: "lexical",
      engineVersion: null,
      nextAction: "Run `npm install` in the CodexGPT package, then restart.",
      budgets: DEFAULT_SEMANTIC_BUDGETS
    };
  }
}
