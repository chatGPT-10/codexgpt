import fs from "node:fs/promises";
import path from "node:path";
import { detectCommands, type DetectedCommands, type DetectedValue } from "./commandDetector.js";

const MANIFESTS = [
  "package.json",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "CMakeLists.txt"
] as const;

const SUPPORT_FILES = [
  "tsconfig.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "uv.lock",
  "poetry.lock",
  "gradlew.bat"
] as const;

export interface ProjectDetectionIo {
  readText?: (relativePath: string, maxBytes: number) => Promise<string | null>;
  fileExists?: (relativePath: string) => Promise<boolean>;
}

export interface ProjectDetectionOptions extends ProjectDetectionIo {
  root: string;
}

export interface DetectedProject {
  manifests: string[];
  languages: DetectedValue[];
  packageManager: DetectedValue | null;
  commands: DetectedCommands;
}

function containedPath(root: string, relativePath: string): string {
  const canonicalRoot = path.resolve(root);
  const candidate = path.resolve(canonicalRoot, relativePath);
  const prefix = canonicalRoot.endsWith(path.sep) ? canonicalRoot : `${canonicalRoot}${path.sep}`;
  if (candidate !== canonicalRoot && !candidate.startsWith(prefix)) {
    throw new Error("Project detector path escaped the workspace root.");
  }
  return candidate;
}

async function defaultFileExists(root: string, relativePath: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(containedPath(root, relativePath));
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

async function defaultReadText(root: string, relativePath: string, maxBytes: number): Promise<string | null> {
  try {
    const target = containedPath(root, relativePath);
    const stat = await fs.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) return null;
    return await fs.readFile(target, "utf8");
  } catch {
    return null;
  }
}

function addLanguage(languages: DetectedValue[], value: string, source: string): void {
  if (languages.some((item) => item.value === value)) return;
  languages.push({ value, source, confidence: "confirmed" });
}

function parsePackageJson(text: string | null): Record<string, unknown> | null {
  if (text === null) return null;
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function dependencySource(packageJson: Record<string, unknown> | null, name: string): string | null {
  for (const key of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const section = packageJson?.[key];
    if (section && typeof section === "object" && !Array.isArray(section) && name in section) {
      return `package.json:${key}.${name}`;
    }
  }
  return null;
}

function packageManagerFromField(packageJson: Record<string, unknown> | null): DetectedValue | null {
  const raw = packageJson?.packageManager;
  if (typeof raw !== "string") return null;
  const manager = raw.trim().split("@")[0]?.toLowerCase();
  if (!manager || !["npm", "pnpm", "yarn", "bun"].includes(manager)) return null;
  return { value: manager, source: "package.json:packageManager", confidence: "confirmed" };
}

function inferPackageManager(files: ReadonlySet<string>, manifests: ReadonlySet<string>): DetectedValue | null {
  const candidates: Array<[string, string]> = [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["package-lock.json", "npm"]
  ];
  for (const [file, manager] of candidates) {
    if (files.has(file)) return { value: manager, source: file, confidence: "inferred" };
  }
  if (manifests.has("package.json")) return { value: "npm", source: "package.json", confidence: "inferred" };
  if (files.has("uv.lock")) return { value: "uv", source: "uv.lock", confidence: "inferred" };
  if (files.has("poetry.lock")) return { value: "poetry", source: "poetry.lock", confidence: "inferred" };
  if (manifests.has("Cargo.toml")) return { value: "cargo", source: "Cargo.toml", confidence: "inferred" };
  if (manifests.has("go.mod")) return { value: "go", source: "go.mod", confidence: "inferred" };
  if (manifests.has("pom.xml")) return { value: "maven", source: "pom.xml", confidence: "inferred" };
  if (manifests.has("build.gradle") || manifests.has("build.gradle.kts")) {
    return { value: "gradle", source: manifests.has("build.gradle.kts") ? "build.gradle.kts" : "build.gradle", confidence: "inferred" };
  }
  return null;
}

export async function detectProject(options: ProjectDetectionOptions): Promise<DetectedProject> {
  const exists = async (relativePath: string) => options.fileExists
    ? options.fileExists(relativePath)
    : defaultFileExists(options.root, relativePath);
  const readText = async (relativePath: string, maxBytes = 262_144) => options.readText
    ? options.readText(relativePath, maxBytes)
    : defaultReadText(options.root, relativePath, maxBytes);

  const present = new Set<string>();
  await Promise.all([...MANIFESTS, ...SUPPORT_FILES].map(async (file) => {
    if (await exists(file)) present.add(file);
  }));
  const manifests = MANIFESTS.filter((file) => present.has(file));
  const manifestSet = new Set<string>(manifests);
  const packageJson = manifestSet.has("package.json") ? parsePackageJson(await readText("package.json")) : null;
  const languages: DetectedValue[] = [];
  if (manifestSet.has("package.json")) addLanguage(languages, "javascript", "package.json");
  if (present.has("tsconfig.json")) addLanguage(languages, "typescript", "tsconfig.json");
  else {
    const typescriptSource = dependencySource(packageJson, "typescript");
    if (typescriptSource) addLanguage(languages, "typescript", typescriptSource);
  }
  if (manifestSet.has("pyproject.toml")) addLanguage(languages, "python", "pyproject.toml");
  if (manifestSet.has("Cargo.toml")) addLanguage(languages, "rust", "Cargo.toml");
  if (manifestSet.has("go.mod")) addLanguage(languages, "go", "go.mod");
  if (manifestSet.has("pom.xml") || manifestSet.has("build.gradle") || manifestSet.has("build.gradle.kts")) addLanguage(languages, "java", manifestSet.has("pom.xml") ? "pom.xml" : manifestSet.has("build.gradle.kts") ? "build.gradle.kts" : "build.gradle");
  if (manifestSet.has("CMakeLists.txt")) addLanguage(languages, "c-cpp", "CMakeLists.txt");

  const packageManager = packageManagerFromField(packageJson) ?? inferPackageManager(present, manifestSet);
  const commands = detectCommands({ manifests: [...manifests], packageJson, packageManager, files: present });
  return { manifests: [...manifests], languages, packageManager, commands };
}
