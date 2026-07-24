import { createHash } from "node:crypto";
import { parentPort } from "node:worker_threads";
import path from "node:path";
import ts from "typescript";

interface WorkerFile {
  path: string;
  text: string;
  asset?: boolean;
}

interface WorkerRequest {
  id: number;
  operation: "definition" | "references" | "diagnostics" | "rename_preview";
  files: WorkerFile[];
  target: { path: string; line: number; column: number };
  includeDeclaration?: boolean;
  newName?: string;
}

function virtualPath(file: Pick<WorkerFile, "path" | "asset">): string {
  const base = file.asset === true ? "/typescript" : "/workspace";
  return `${base}/${file.path.replace(/\\/gu, "/").replace(/^\/+/u, "")}`;
}

function relativePath(fileName: string): string {
  return fileName.replace(/^\/workspace\//u, "");
}

function lineStartOffsets(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 0x0a) starts.push(index + 1);
  }
  return starts;
}

function publicOffset(text: string, line: number, column: number): number {
  if (!Number.isSafeInteger(line) || !Number.isSafeInteger(column) || line < 1 || column < 1) {
    throw new Error("Invalid public position.");
  }
  const starts = lineStartOffsets(text);
  const start = starts[line - 1];
  if (start === undefined) throw new Error("Invalid public position.");
  const rawEnd = starts[line] ?? text.length;
  let end = rawEnd;
  if (end > start && text.charCodeAt(end - 1) === 0x0a) end -= 1;
  if (end > start && text.charCodeAt(end - 1) === 0x0d) end -= 1;
  const bom = line === 1 && text.charCodeAt(start) === 0xfeff ? 1 : 0;
  const visible = text.slice(start + bom, end);
  const points = [...visible];
  if (column > points.length + 1) throw new Error("Invalid public position.");
  return start + bom + points.slice(0, column - 1).join("").length;
}

function publicPosition(text: string, offset: number): { line: number; column: number } {
  const starts = lineStartOffsets(text);
  let lineIndex = 0;
  for (let index = 1; index < starts.length && starts[index] <= offset; index += 1) lineIndex = index;
  const start = starts[lineIndex];
  const bom = lineIndex === 0 && text.charCodeAt(start) === 0xfeff ? 1 : 0;
  return {
    line: lineIndex + 1,
    column: [...text.slice(start + bom, Math.max(start + bom, offset))].length + 1
  };
}

function createService(files: WorkerFile[]) {
  const snapshots = new Map(files.map((file) => [virtualPath(file), file.text]));
  const hasLibraryAssets = files.some((file) => file.asset === true);
  const rootNames = files
    .filter((file) => file.asset !== true && !file.path.toLowerCase().endsWith(".json"))
    .map((file) => virtualPath(file));
  const defaultCompilerOptions: ts.CompilerOptions = {
    allowJs: true,
    checkJs: false,
    strict: true,
    noEmit: true,
    noLib: !hasLibraryAssets,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    jsx: ts.JsxEmit.ReactJSX,
    allowImportingTsExtensions: true
  };
  const configFile = files.find((file) => /(?:^|\/)(?:tsconfig|jsconfig)\.json$/iu.test(file.path));
  let compilerOptions = defaultCompilerOptions;
  if (configFile) {
    const configs = new Map(
      files
        .filter((file) => file.path.toLowerCase().endsWith(".json"))
        .map((file) => [virtualPath(file), file.text])
    );
    const mergeConfig = (fileName: string, seen = new Set<string>()): Record<string, any> => {
      if (seen.has(fileName)) return {};
      seen.add(fileName);
      const text = configs.get(fileName);
      if (text === undefined) return {};
      const parsed = ts.parseConfigFileTextToJson(fileName, text);
      if (parsed.error || !parsed.config || typeof parsed.config !== "object") return {};
      const extendValues = Array.isArray(parsed.config.extends)
        ? parsed.config.extends
        : typeof parsed.config.extends === "string"
          ? [parsed.config.extends]
          : [];
      let inherited: Record<string, any> = {};
      for (const extended of extendValues) {
        const candidate = extended.startsWith(".")
          ? path.posix.resolve(path.posix.dirname(fileName), extended.endsWith(".json") ? extended : `${extended}.json`)
          : `/workspace/node_modules/${extended.replace(/\\/gu, "/")}${extended.endsWith(".json") ? "" : "/tsconfig.json"}`;
        const base = mergeConfig(candidate, seen);
        inherited = {
          ...inherited,
          ...base,
          compilerOptions: {
            ...(inherited.compilerOptions ?? {}),
            ...(base.compilerOptions ?? {})
          }
        };
      }
      return {
        ...inherited,
        ...parsed.config,
        compilerOptions: {
          ...(inherited.compilerOptions ?? {}),
          ...(parsed.config.compilerOptions ?? {})
        }
      };
    };
    const parsed = { config: mergeConfig(virtualPath(configFile)), error: undefined };
    if (!parsed.error) {
      const converted = ts.convertCompilerOptionsFromJson(
        parsed.config?.compilerOptions ?? {},
        "/workspace",
        virtualPath(configFile)
      );
      if (!converted.errors.length) {
        compilerOptions = {
          ...defaultCompilerOptions,
          ...converted.options,
          noEmit: true,
          noLib: !hasLibraryAssets,
          skipLibCheck: true
        };
      }
    }
  }
  const directories = new Set<string>(["/workspace"]);
  for (const fileName of snapshots.keys()) {
    const parts = fileName.split("/");
    for (let index = 2; index < parts.length; index += 1) {
      directories.add(parts.slice(0, index).join("/") || "/");
    }
  }
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => compilerOptions,
    getScriptFileNames: () => rootNames,
    getScriptVersion: () => "1",
    getScriptSnapshot: (fileName) => {
      const text = snapshots.get(fileName.replace(/\\/gu, "/"));
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => "/workspace",
    getDefaultLibFileName: () => "/typescript/lib.es2022.full.d.ts",
    useCaseSensitiveFileNames: () => true,
    fileExists: (fileName) => snapshots.has(fileName.replace(/\\/gu, "/")),
    readFile: (fileName) => snapshots.get(fileName.replace(/\\/gu, "/")),
    directoryExists: (directoryName) => directories.has(directoryName.replace(/\\/gu, "/")),
    getDirectories: (directoryName) => {
      const prefix = `${directoryName.replace(/\\/gu, "/").replace(/\/$/u, "")}/`;
      return [...directories]
        .filter((candidate) => candidate.startsWith(prefix))
        .map((candidate) => candidate.slice(prefix.length).split("/")[0])
        .filter((value, index, all) => value && all.indexOf(value) === index);
    },
    readDirectory: (rootDir, extensions) => {
      const prefix = `${rootDir.replace(/\\/gu, "/").replace(/\/$/u, "")}/`;
      return [...snapshots.keys()].filter((candidate) =>
        candidate.startsWith(prefix) &&
        (!extensions?.length || extensions.some((extension) => candidate.endsWith(extension)))
      );
    }
  };
  return { service: ts.createLanguageService(host, ts.createDocumentRegistry()), snapshots };
}

let cachedService: {
  key: string;
  service: ts.LanguageService;
  snapshots: Map<string, string>;
} | null = null;

function serviceKey(files: readonly WorkerFile[]): string {
  const hash = createHash("sha256");
  for (const file of files) {
    const normalizedPath = file.path.replace(/\\/gu, "/");
    hash.update(file.asset === true ? "1" : "0", "utf8");
    hash.update(String(Buffer.byteLength(normalizedPath, "utf8")), "utf8");
    hash.update(":", "utf8");
    hash.update(normalizedPath, "utf8");
    hash.update(String(Buffer.byteLength(file.text, "utf8")), "utf8");
    hash.update(":", "utf8");
    hash.update(file.text, "utf8");
  }
  return hash.digest("hex");
}

function serviceForFiles(files: WorkerFile[]) {
  const key = serviceKey(files);
  if (cachedService?.key === key) {
    return { service: cachedService.service, snapshots: cachedService.snapshots, cacheHit: true };
  }
  cachedService?.service.dispose();
  const created = createService(files);
  cachedService = { key, ...created };
  return { ...created, cacheHit: false };
}

function range(text: string, start: number, length: number) {
  return {
    start: publicPosition(text, start),
    end: publicPosition(text, start + length)
  };
}

function preview(text: string, start: number): string {
  const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const next = text.indexOf("\n", start);
  return text.slice(lineStart, next === -1 ? text.length : next).replace(/\r$/u, "").trim().slice(0, 400);
}

function severity(category: ts.DiagnosticCategory): "error" | "warning" | "information" | "hint" {
  if (category === ts.DiagnosticCategory.Error) return "error";
  if (category === ts.DiagnosticCategory.Warning) return "warning";
  if (category === ts.DiagnosticCategory.Suggestion) return "hint";
  return "information";
}

function validIdentifier(value: string): boolean {
  if (!/^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(value)) return false;
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    value
  );
  return scanner.scan() === ts.SyntaxKind.Identifier &&
    scanner.getTokenText() === value &&
    scanner.scan() === ts.SyntaxKind.EndOfFileToken;
}

function execute(request: WorkerRequest) {
  const { service, snapshots, cacheHit } = serviceForFiles(request.files);
  const targetName = virtualPath({ path: request.target.path });
  const targetText = snapshots.get(targetName);
  if (targetText === undefined) throw new Error("Target source is unavailable.");
  const position = publicOffset(targetText, request.target.line, request.target.column);
  if (request.operation === "definition") {
    const definitions = [
      ...(service.getDefinitionAtPosition(targetName, position) ?? []),
      ...(service.getTypeDefinitionAtPosition(targetName, position) ?? [])
    ];
    const unique = new Map(definitions.map((definition) => [
      `${definition.fileName}:${definition.textSpan.start}:${definition.textSpan.length}`,
      definition
    ]));
    return {
      provider: "builtin-typescript",
      engineVersion: ts.version,
      cacheHit,
      locations: [...unique.values()].map((definition) => {
        const text = snapshots.get(definition.fileName);
        if (text === undefined) throw new Error("TypeScript returned a source outside the virtual project.");
        return {
          path: relativePath(definition.fileName),
          range: range(text, definition.textSpan.start, definition.textSpan.length),
          preview: preview(text, definition.textSpan.start),
          declaration: true
        };
      })
    };
  }
  if (request.operation === "references") {
    const references = service.getReferencesAtPosition(targetName, position) ?? [];
    return {
      provider: "builtin-typescript",
      engineVersion: ts.version,
      cacheHit,
      locations: references
        .filter((reference) => request.includeDeclaration !== false || !(reference as ts.ReferenceEntry & { isDefinition?: boolean }).isDefinition)
        .map((reference) => {
          const text = snapshots.get(reference.fileName);
          if (text === undefined) throw new Error("TypeScript returned a source outside the virtual project.");
          const isDefinition = Boolean((reference as ts.ReferenceEntry & { isDefinition?: boolean }).isDefinition);
          return {
            path: relativePath(reference.fileName),
            range: range(text, reference.textSpan.start, reference.textSpan.length),
            preview: preview(text, reference.textSpan.start),
            declaration: isDefinition
          };
        })
    };
  }
  if (request.operation === "diagnostics") {
    const diagnostics = [
      ...service.getSyntacticDiagnostics(targetName),
      ...service.getSemanticDiagnostics(targetName)
    ];
    return {
      provider: "builtin-typescript",
      engineVersion: ts.version,
      cacheHit,
      diagnostics: diagnostics.map((diagnostic) => {
        const start = diagnostic.start ?? 0;
        const length = diagnostic.length ?? 0;
        return {
          path: request.target.path,
          range: range(targetText, start, length),
          severity: severity(diagnostic.category),
          code: String(diagnostic.code),
          message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " ").slice(0, 1_000)
        };
      })
    };
  }
  const newName = request.newName ?? "";
  if (!validIdentifier(newName)) {
    throw new Error("The requested TypeScript identifier is invalid.");
  }
  const renameInfo = service.getRenameInfo(targetName, position, { allowRenameOfImportPath: false });
  if (!renameInfo.canRename) throw new Error("The selected symbol cannot be renamed.");
  const locations = service.findRenameLocations(targetName, position, false, false, true) ?? [];
  const edits = locations.map((location) => {
    const text = snapshots.get(location.fileName);
    if (text === undefined) throw new Error("TypeScript returned a rename outside the virtual project.");
    return {
      path: relativePath(location.fileName),
      start: location.textSpan.start,
      length: location.textSpan.length,
      newText: `${location.prefixText ?? ""}${newName}${location.suffixText ?? ""}`
    };
  });
  const editsByPath = new Map<string, typeof edits>();
  for (const edit of edits) {
    const current = editsByPath.get(edit.path) ?? [];
    current.push(edit);
    editsByPath.set(edit.path, current);
  }
  for (const [relative, fileEdits] of editsByPath) {
    const virtual = `/workspace/${relative}`;
    const source = snapshots.get(virtual);
    if (source === undefined) throw new Error("TypeScript returned a rename outside the virtual project.");
    let resulting = source;
    for (const edit of [...fileEdits].sort((left, right) => right.start - left.start)) {
      resulting = `${resulting.slice(0, edit.start)}${edit.newText}${resulting.slice(edit.start + edit.length)}`;
    }
    const kind = relative.endsWith(".tsx")
      ? ts.ScriptKind.TSX
      : relative.endsWith(".jsx")
        ? ts.ScriptKind.JSX
        : relative.match(/\.[cm]?js$/u)
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS;
    const parsed = ts.createSourceFile(relative, resulting, ts.ScriptTarget.Latest, true, kind) as ts.SourceFile & {
      parseDiagnostics?: readonly ts.Diagnostic[];
    };
    if ((parsed.parseDiagnostics?.length ?? 0) > 0) {
      throw new Error("The requested rename would create invalid TypeScript or JavaScript syntax.");
    }
  }
  return {
    provider: "builtin-typescript",
    engineVersion: ts.version,
    cacheHit,
    oldName: renameInfo.displayName,
    edits
  };
}

if (!parentPort) throw new Error("TypeScript semantic worker requires a parent port.");

parentPort.on("message", (request: WorkerRequest) => {
  try {
    parentPort?.postMessage({ id: request.id, ok: true, result: execute(request) });
  } catch (error) {
    parentPort?.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 1_000) : "Semantic worker failed."
    });
  }
});
