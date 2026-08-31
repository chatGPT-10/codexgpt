export type DetectionConfidence = "confirmed" | "inferred";

export interface DetectedValue {
  value: string;
  source: string;
  confidence: DetectionConfidence;
}

export interface DetectedCommands {
  build: DetectedValue[];
  test: DetectedValue[];
  lint: DetectedValue[];
  typecheck: DetectedValue[];
}

export interface CommandDetectionInput {
  manifests: string[];
  packageJson?: Record<string, unknown> | null;
  packageManager?: DetectedValue | null;
  files?: ReadonlySet<string>;
}

type CommandKind = keyof DetectedCommands;

function emptyCommands(): DetectedCommands {
  return { build: [], test: [], lint: [], typecheck: [] };
}

function add(
  commands: DetectedCommands,
  kind: CommandKind,
  value: string,
  source: string,
  confidence: DetectionConfidence
): void {
  if (commands[kind].some((item) => item.value === value && item.source === source)) return;
  commands[kind].push({ value, source, confidence });
}

function packageRunCommand(manager: string, script: string): string {
  if (manager === "yarn") return `yarn ${script}`;
  if (manager === "pnpm") return `pnpm run ${script}`;
  if (manager === "bun") return `bun run ${script}`;
  return `npm run ${script}`;
}

function packageScripts(input: CommandDetectionInput, commands: DetectedCommands): void {
  const raw = input.packageJson?.scripts;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const scripts = raw as Record<string, unknown>;
  const manager = input.packageManager?.value ?? "npm";
  const mappings: Array<[CommandKind, string[]]> = [
    ["build", ["build"]],
    ["test", ["test"]],
    ["lint", ["lint"]],
    ["typecheck", ["typecheck", "type-check", "check:types"]]
  ];
  for (const [kind, candidates] of mappings) {
    const script = candidates.find((name) => typeof scripts[name] === "string" && scripts[name].trim());
    if (!script) continue;
    add(commands, kind, packageRunCommand(manager, script), `package.json:scripts.${script}`, "confirmed");
  }
}

function inferredEcosystemCommands(input: CommandDetectionInput, commands: DetectedCommands): void {
  const manifests = new Set(input.manifests);
  if (manifests.has("Cargo.toml")) {
    add(commands, "build", "cargo build", "Cargo.toml", "inferred");
    add(commands, "test", "cargo test", "Cargo.toml", "inferred");
  }
  if (manifests.has("go.mod")) {
    add(commands, "build", "go build ./...", "go.mod", "inferred");
    add(commands, "test", "go test ./...", "go.mod", "inferred");
  }
  if (manifests.has("pom.xml")) {
    add(commands, "build", "mvn package", "pom.xml", "inferred");
    add(commands, "test", "mvn test", "pom.xml", "inferred");
  }
  const gradleManifest = manifests.has("build.gradle.kts") ? "build.gradle.kts" : manifests.has("build.gradle") ? "build.gradle" : null;
  if (gradleManifest) {
    const wrapper = input.files?.has("gradlew.bat") ? ".\\gradlew.bat" : "gradle";
    add(commands, "build", `${wrapper} build`, gradleManifest, "inferred");
    add(commands, "test", `${wrapper} test`, gradleManifest, "inferred");
  }
  if (manifests.has("CMakeLists.txt")) {
    add(commands, "build", "cmake --build build", "CMakeLists.txt", "inferred");
    add(commands, "test", "ctest --test-dir build", "CMakeLists.txt", "inferred");
  }
  if (manifests.has("pyproject.toml")) {
    add(commands, "build", "python -m build", "pyproject.toml", "inferred");
  }
}

export function detectCommands(input: CommandDetectionInput): DetectedCommands {
  const commands = emptyCommands();
  packageScripts(input, commands);
  inferredEcosystemCommands(input, commands);
  return commands;
}
