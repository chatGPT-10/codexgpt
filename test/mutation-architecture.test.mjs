import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(repositoryRoot, "src");
const scriptsRoot = path.join(repositoryRoot, "scripts");

const FIXTURE_SCRIPTS = new Set([
  "analysis-cli-smoke.mjs",
  "analysis-smoke.mjs",
  "doctor-smoke.mjs",
  "execute-handoff-smoke-platform-compat.mjs",
  "execute-handoff-smoke.mjs",
  "http-smoke-compat.mjs",
  "http-smoke.mjs",
  "policy-windows-spike.mjs",
  "pro-smoke.mjs",
  "settings-smoke-platform-compat.mjs",
  "settings-smoke.mjs",
  "smoke-platform-compat.mjs",
  "smoke.mjs",
  "stress-contract-compat.mjs",
  "stress.mjs"
]);

const MUTATION_PRIMITIVES = new Set([
  "appendFile",
  "appendFileSync",
  "chmod",
  "chmodSync",
  "chown",
  "chownSync",
  "copyFile",
  "copyFileSync",
  "cp",
  "cpSync",
  "createWriteStream",
  "fchmod",
  "fchmodSync",
  "fchown",
  "fchownSync",
  "ftruncate",
  "ftruncateSync",
  "futimes",
  "futimesSync",
  "lchmod",
  "lchmodSync",
  "lchown",
  "lchownSync",
  "link",
  "linkSync",
  "lutimes",
  "lutimesSync",
  "mkdir",
  "mkdirSync",
  "mkdtemp",
  "mkdtempDisposable",
  "mkdtempDisposableSync",
  "mkdtempSync",
  "rename",
  "renameSync",
  "rm",
  "rmSync",
  "rmdir",
  "rmdirSync",
  "symlink",
  "symlinkSync",
  "truncate",
  "truncateSync",
  "unlink",
  "unlinkSync",
  "utimes",
  "utimesSync",
  "writeFile",
  "writeFileSync",
  "writeSync",
  "writev",
  "writevSync"
]);

const SPECIAL_MUTATION_PRIMITIVES = new Set(["open", "openSync", "write"]);
const FILESYSTEM_MODULES = new Set(["fs", "fs/promises", "node:fs", "node:fs/promises"]);

// Every entry is exact: canonical path + reviewed purpose + line/column/call digest.
// Keep empty until the RED inventory has exposed every current direct writer.
const REVIEWED_ALLOWLIST = Object.freeze({
  "scripts/cloudflared-installer.mjs": Object.freeze({
    purpose: "Verified cloudflared installer staging, rollback, and replacement outside authorized workspaces.",
    occurrences: Object.freeze([
      "101:3:writeFileSync:c5387b4cef96",
      "109:3:mkdirSync:f52bfc6a75f1",
      "125:3:mkdirSync:448e9c9ba966",
      "128:3:rmSync:d209a92b89ab",
      "129:3:copyFileSync:774ed641145c",
      "130:37:chmodSync:d39506524132",
      "134:5:rmSync:d209a92b89ab",
      "141:3:rmSync:0e9fcffc4b03",
      "144:22:renameSync:13d3ad066d6e",
      "145:5:renameSync:a522aa5b3913",
      "146:5:rmSync:0e9fcffc4b03",
      "148:5:rmSync:d209a92b89ab",
      "150:7:renameSync:662f5f5db2f5",
      "166:20:mkdtempSync:770b4fe07a3d",
      "175:5:rmSync:d06563ffae4a"
    ])
  }),
  "scripts/codexpro.mjs": Object.freeze({
    purpose: "CLI profile, managed binary, runtime marker, and ephemeral tunnel state outside authorized workspaces.",
    occurrences: Object.freeze([
      "663:3:rmSync:67965deb6791",
      "670:3:mkdirSync:34a6fc7c372e",
      "677:3:writeFileSync:bb74df9726e3",
      "679:5:chmodSync:aa6e7b8892f6",
      "686:3:mkdirSync:744d9beff523",
      "706:3:writeFileSync:bb74df9726e3",
      "708:5:chmodSync:aa6e7b8892f6",
      "717:39:rmSync:67965deb6791",
      "870:3:writeFileSync:f733857bff12",
      "888:19:mkdtempSync:854634ec35e7",
      "891:3:mkdirSync:448e9c9ba966",
      "899:7:mkdirSync:f52bfc6a75f1",
      "911:7:copyFileSync:e37114b998cc",
      "915:7:copyFileSync:43e2f89e1c4b",
      "918:39:chmodSync:664326fc63fc",
      "923:5:rmSync:c71c3c0ebfea",
      "1227:19:mkdtempSync:9e1bf0ab89af",
      "1229:3:writeFileSync:8d3a7e6f2eb6",
      "4153:39:rmSync:c71c3c0ebfea"
    ])
  }),
  "src/audit/lock.ts": Object.freeze({
    purpose: "Persistent audit lock acquisition, recovery, and quarantine state outside authorized workspaces.",
    occurrences: Object.freeze([
      "45:10:openSync:743e6a357fc2",
      "46:5:writeFileSync:0bca2f9ccf85",
      "103:5:rmSync:fb9714acc0da",
      "149:7:mkdirSync:d6a78ac1533b",
      "152:9:renameSync:71916df4d5de",
      "167:9:rmSync:cf0008e967e4",
      "176:5:mkdirSync:618984dbe19f",
      "207:9:renameSync:7bfa23ef4832"
    ])
  }),
  "src/audit/store.ts": Object.freeze({
    purpose: "Persistent audit segment append, repair, quarantine, and retention maintenance outside authorized workspaces.",
    occurrences: Object.freeze([
      "182:5:mkdirSync:9dc3ef9c3484",
      "183:5:mkdirSync:670914dee074",
      "242:7:write:f755d1ec4f6b",
      "402:12:openSync:d2e2060c3ee7",
      "405:19:writeSync:a40584d153a8",
      "560:22:openSync:a17eaede88fa",
      "563:19:writeSync:93f2eb7c6129",
      "575:19:openSync:59de5fa72237",
      "576:7:ftruncateSync:2a87c094f9f8",
      "585:7:unlinkSync:5a3c43527031",
      "757:13:unlinkSync:05ecea30c390"
    ])
  }),
  "src/changesets/moveStore.ts": Object.freeze({
    purpose: "Authenticated zero-blob move change-set manifests outside authorized workspaces.",
    occurrences: Object.freeze([
      "76:9:mkdirSync:82dc4cd81c8a",
      "142:7:mkdirSync:82dc4cd81c8a",
      "150:7:write:a70e40f1b1d6",
      "154:9:rmSync:1ae2b3f771c9",
      "236:5:write:fb16f67735d8"
    ])
  }),
  "src/changesets/store.ts": Object.freeze({
    purpose: "Atomic application-state change-set manifests and encrypted blobs outside authorized workspaces.",
    occurrences: Object.freeze([
      "191:7:mkdirSync:008368be52af",
      "192:7:mkdirSync:adf695ffa063",
      "200:9:mkdirSync:0c40921f82f4",
      "239:7:write:fb609052e7fc",
      "364:12:openSync:743e6a357fc2",
      "365:7:writeFileSync:53437c2bd27c",
      "482:7:mkdirSync:82dc4cd81c8a",
      "484:7:mkdirSync:e46e2078e6ff",
      "488:11:rmSync:1ae2b3f771c9",
      "519:9:rmSync:1ae2b3f771c9",
      "582:9:unlinkSync:867142e079be",
      "671:7:rmdirSync:9ab32820e2eb",
      "672:7:unlinkSync:7e0feedf75c5",
      "673:7:rmdirSync:47f99c0d1368"
    ])
  }),
  "src/fsOps.ts": Object.freeze({
    purpose: "Legacy-mode-only workspace writers retained for the explicit fileTransactions=legacy compatibility path.",
    occurrences: Object.freeze([
      "667:11:mkdir:0405a74d1844",
      "671:9:writeFile:4617f635b0be",
      "719:9:writeFile:8875aefd5fc7",
      "729:13:mkdir:0405a74d1844",
      "730:13:writeFile:4617f635b0be"
    ])
  }),
  "src/handoffOps.ts": Object.freeze({
    purpose: "Legacy-mode-only handoff log appenders retained for the explicit fileTransactions=legacy compatibility path.",
    occurrences: Object.freeze([
      "527:11:appendFile:0857ba648d12",
      "528:11:appendFile:172739a6e349"
    ])
  }),
  "src/moves/engine.ts": Object.freeze({
    purpose: "Atomic same-volume move staging, installation, bounded backend retry, rollback, and cleanup inside authorized workspaces.",
    occurrences: Object.freeze([
      "644:15:mkdir:c34693a030c4",
      "691:15:link:e658cd7588fe",
      "725:15:unlink:01b2b4b052ca",
      "766:15:link:e3266b53bae4",
      "797:15:unlink:9ae293a598dc",
      "842:15:rmdir:f7455b6f1fd7",
      "909:13:link:759d678d36b8",
      "923:15:unlink:0df109c8d786",
      "946:15:link:e13c597bfcfe",
      "961:13:unlink:9ae293a598dc",
      "991:17:rmdir:f7455b6f1fd7",
      "1118:17:unlink:9ae293a598dc"
    ])
  }),
  "src/moves/recovery.ts": Object.freeze({
    purpose: "Authenticated V2 move recovery and rollback inside authorized workspaces.",
    occurrences: Object.freeze([
      "322:11:unlink:bb4861d11bcd",
      "345:15:rmdir:450993335dd4",
      "458:13:link:71ef7148dc02",
      "473:15:unlink:cd9cf88c25ef",
      "500:15:link:61a842ba953b",
      "527:15:rmdir:450993335dd4"
    ])
  }),
  "src/policy/identity.ts": Object.freeze({
    purpose: "Atomic application-state policy identity key outside authorized workspaces.",
    occurrences: Object.freeze([
      "53:3:mkdirSync:744d9beff523",
      "59:5:writeFileSync:91cd5401b478",
      "61:7:chmodSync:aa6e7b8892f6"
    ])
  }),
  "src/profileStore.ts": Object.freeze({
    purpose: "CLI application profile state outside authorized workspaces.",
    occurrences: Object.freeze([
      "112:3:mkdirSync:34a6fc7c372e",
      "119:3:writeFileSync:bb74df9726e3",
      "121:5:chmodSync:aa6e7b8892f6"
    ])
  }),
  "src/transactions/atomicFs.ts": Object.freeze({
    purpose: "Transaction filesystem backend staging, commit, rollback, and cleanup inside authorized workspaces.",
    occurrences: Object.freeze([
      "36:34:link:3aa590a2eeae",
      "37:36:rename:8b1d44720aa2",
      "38:21:unlink:842a64fcb00a",
      "201:26:open:77327b3b7898",
      "205:30:write:4f2d83339fe0",
      "211:17:chmod:7b8828566a69",
      "219:13:unlink:bb4861d11bcd",
      "225:13:unlink:bb4861d11bcd",
      "247:13:link:7df5f3c1d5e1",
      "256:13:unlink:cd9cf88c25ef",
      "264:11:writeFile:c6f0c09a72c1",
      "266:28:open:f90e43957f02",
      "271:13:unlink:d0c904cf6748",
      "272:13:unlink:bb4861d11bcd",
      "288:13:unlink:d0c904cf6748",
      "328:13:unlink:5de63dcdbf1e",
      "329:13:unlink:71aa80042ff6",
      "417:15:rename:e7c1387784ec",
      "424:15:unlink:9cba3d963025",
      "450:15:unlink:9cba3d963025",
      "455:17:rename:66540a75cb08",
      "490:15:unlink:3f3464009bc2"
    ])
  }),
  "src/transactions/atomicStateFile.ts": Object.freeze({
    purpose: "Atomic application-state writer for transaction and manifest files outside authorized workspaces.",
    occurrences: Object.freeze([
      "47:38:mkdirSync:c4f25b2136c9",
      "48:36:openSync:95da2c4abc0a",
      "49:42:writeFileSync:186e06036758",
      "52:29:renameSync:99965dbf3c8a",
      "53:25:unlinkSync:2722a9210b32",
      "109:5:mkdirSync:404972daee24",
      "122:12:openSync:ab0b14a61161",
      "123:7:writeFileSync:95862c292341",
      "127:7:renameSync:cda03767a310",
      "138:9:unlinkSync:61be211f161f",
      "195:12:write:7a85fd5df8d1",
      "222:12:write:b3e2829bf17d"
    ])
  }),
  "src/transactions/engine.ts": Object.freeze({
    purpose: "Transaction filesystem backend directory mutation inside authorized workspaces.",
    occurrences: Object.freeze([
      "433:17:mkdir:42f1c1952f6b",
      "601:17:rmdir:2aa41c85eef7"
    ])
  }),
  "src/transactions/installation.ts": Object.freeze({
    purpose: "Atomic application-state installation identity outside authorized workspaces.",
    occurrences: Object.freeze([
      "61:3:mkdirSync:8116ecc503d6",
      "70:5:mkdirSync:7dfb577930e9",
      "103:10:openSync:5abfb7e30626",
      "104:5:writeFileSync:91794f246ec4",
      "109:7:chmodSync:c54e608183a4",
      "114:7:linkSync:d2bc7f9d14b3",
      "138:7:unlinkSync:f3f741ed857d"
    ])
  }),
  "src/transactions/manifestV2Store.ts": Object.freeze({
    purpose: "Authenticated V2 transaction manifests outside authorized workspaces.",
    occurrences: Object.freeze([
      "55:12:write:24c79722626c",
      "74:12:write:b53cbb602090"
    ])
  }),
  "src/transactions/recovery.ts": Object.freeze({
    purpose: "Transaction filesystem backend recovery and rollback inside authorized workspaces.",
    occurrences: Object.freeze([
      "205:3:unlinkSync:476f406a7921",
      "404:9:unlinkSync:de4d6c476669",
      "419:11:renameSync:580bdad99e6c",
      "421:11:linkSync:ab8289d86c70",
      "443:9:linkSync:ab8289d86c70",
      "487:9:rmdirSync:47f99c0d1368"
    ])
  }),
  "src/transactions/workspaceLock.ts": Object.freeze({
    purpose: "Atomic application-state transaction ownership and workspace lock records outside authorized workspaces.",
    occurrences: Object.freeze([
      "38:10:openSync:743e6a357fc2",
      "39:5:writeFileSync:bf70d45a49ed",
      "61:5:mkdirSync:2c43234d1fc5",
      "98:9:unlinkSync:3ffee3f73f04",
      "144:7:renameSync:41567265102d",
      "148:5:rmSync:54b9218dbb59",
      "173:5:mkdirSync:618984dbe19f",
      "179:9:mkdirSync:373f6a9c39e4",
      "195:11:rmSync:2d8844e006c0",
      "227:9:renameSync:e184fd54b538"
    ])
  })
});

function canonicalRelativePath(file) {
  return path.relative(repositoryRoot, file).split(path.sep).join("/");
}

async function enumerateSourceFiles() {
  const files = [];
  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(target);
    }
  }
  await visit(sourceRoot);

  const scripts = await fs.readdir(scriptsRoot, { withFileTypes: true });
  for (const entry of scripts.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".mjs") && !entry.name.endsWith(".cjs")) continue;
    if (FIXTURE_SCRIPTS.has(entry.name)) continue;
    files.push(path.join(scriptsRoot, entry.name));
  }
  return files.sort((left, right) => canonicalRelativePath(left).localeCompare(canonicalRelativePath(right)));
}

function callDigest(call, sourceFile) {
  return createHash("sha256")
    .update(call.getText(sourceFile).replace(/\r\n/g, "\n"))
    .digest("hex")
    .slice(0, 12);
}

function literalText(node) {
  return ts.isStringLiteralLike(node) ? node.text : undefined;
}

function filesystemBindings(sourceFile) {
  const namespaces = new Set();
  const named = new Map();
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const moduleName = literalText(statement.moduleSpecifier);
      if (!moduleName || !FILESYSTEM_MODULES.has(moduleName)) continue;
      const clause = statement.importClause;
      if (!clause) continue;
      if (clause.name) namespaces.add(clause.name.text);
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        namespaces.add(clause.namedBindings.name.text);
      }
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          named.set(element.name.text, element.propertyName?.text ?? element.name.text);
        }
      }
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const initializer = declaration.initializer;
      if (!initializer || !ts.isCallExpression(initializer)) continue;
      if (!ts.isIdentifier(initializer.expression) || initializer.expression.text !== "require") continue;
      const moduleName = initializer.arguments[0] ? literalText(initializer.arguments[0]) : undefined;
      if (!moduleName || !FILESYSTEM_MODULES.has(moduleName)) continue;
      if (ts.isIdentifier(declaration.name)) {
        namespaces.add(declaration.name.text);
      } else if (ts.isObjectBindingPattern(declaration.name)) {
        for (const element of declaration.name.elements) {
          if (!ts.isIdentifier(element.name)) continue;
          const imported = element.propertyName && ts.isIdentifier(element.propertyName)
            ? element.propertyName.text
            : element.name.text;
          named.set(element.name.text, imported);
        }
      }
    }
  }
  return { named, namespaces };
}

function receiverRoot(expression) {
  let current = expression;
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    current = current.expression;
  }
  return ts.isIdentifier(current) ? current.text : undefined;
}

function isFilesystemReceiver(expression, bindings) {
  const root = receiverRoot(expression);
  if (root && bindings.namespaces.has(root)) return true;
  const text = expression.getText();
  return /(?:^|\.)(?:dependencies|atomic|indexStore)$/.test(text) ||
    /(?:^|\.)(?:handle|fileHandle)$/.test(text);
}

function isMutationOpen(call) {
  if (call.arguments.length < 2) return false;
  const flags = call.arguments[1] ? literalText(call.arguments[1]) : undefined;
  return flags !== "r";
}

function primitiveForCall(call, bindings) {
  const expression = call.expression;
  if (ts.isPropertyAccessExpression(expression)) {
    const primitive = expression.name.text;
    if (MUTATION_PRIMITIVES.has(primitive)) return primitive;
    if ((primitive === "open" || primitive === "openSync") && isMutationOpen(call)) {
      return primitive;
    }
    if (
      primitive === "write" &&
      (isFilesystemReceiver(expression.expression, bindings) || call.arguments.length >= 4)
    ) return primitive;
    return undefined;
  }
  if (!ts.isIdentifier(expression)) return undefined;
  const imported = bindings.named.get(expression.text);
  if (!imported) return undefined;
  if (MUTATION_PRIMITIVES.has(imported)) return imported;
  if ((imported === "open" || imported === "openSync") && literalText(call.arguments[1]) !== "r") return imported;
  if (imported === "write") return imported;
  return undefined;
}

function scanFile(relativePath, source) {
  const scriptKind = relativePath.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, scriptKind);
  const bindings = filesystemBindings(sourceFile);
  const occurrences = [];

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const primitive = primitiveForCall(node, bindings);
      if (primitive && (MUTATION_PRIMITIVES.has(primitive) || SPECIAL_MUTATION_PRIMITIVES.has(primitive))) {
        const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        occurrences.push({
          key: `${location.line + 1}:${location.character + 1}:${primitive}:${callDigest(node, sourceFile)}`,
          line: location.line + 1,
          primitive,
          source: node.getText(sourceFile).replace(/\s+/g, " ")
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return occurrences;
}

function formatOccurrence(relativePath, occurrence) {
  return `${relativePath}:${occurrence.key} ${occurrence.source}`;
}

test("the scanner detects CommonJS filesystem aliases and ignores read-only opens", () => {
  const source = [
    'const fs = require("node:fs");',
    'const { writeFileSync: persist } = require("fs");',
    'fs.openSync("input.txt", "r");',
    'fs.openSync("output.txt", "a");',
    'fs.writeFileSync("one.txt", "one");',
    'persist("two.txt", "two");',
    'const io = require("node:fs").promises;',
    'io.open("three.txt", "w");',
    'const output = {};',
    'output.write(Buffer.from("four"), 0, 4, 0);',
    'fs.cpSync("from", "to");',
    'fs.writevSync(1, []);',
    'fs.ftruncateSync(1, 0);',
    'const indexStore = {};',
    'indexStore.write("index.json", {});'
  ].join("\n");

  assert.deepEqual(
    scanFile("scripts/example.cjs", source).map(({ primitive }) => primitive),
    [
      "openSync",
      "writeFileSync",
      "writeFileSync",
      "open",
      "write",
      "cpSync",
      "writevSync",
      "ftruncateSync",
      "write"
    ]
  );
});

test("legacy workspace writers are unreachable from the atomic default server path", async () => {
  const server = (await fs.readFile(path.join(sourceRoot, "server.ts"), "utf8")).replace(/\r\n/g, "\n");
  const count = (needle) => server.split(needle).length - 1;

  for (const [prepare, provider] of [
    ["prepareWriteTextFile", "writeResultProvider"],
    ["prepareEditTextFile", "editResultProvider"],
    ["prepareWorkspacePatch", "applyPatchResultProvider"]
  ]) {
    assert.equal(count(`prepared?.result ?? await ${provider}`), 1, `${provider} must have one default call site`);
    assert.match(
      server,
      new RegExp(
        `const prepared = config\\.fileTransactions === "atomic"[\\s\\S]{0,1200}` +
        `\\? await ${prepare}\\([\\s\\S]{0,1200}: null;[\\s\\S]{0,400}` +
        `prepared\\?\\.result \\?\\? await ${provider}\\(`
      ),
      `${provider} must be selected only after the atomic preparation branch has produced no result`
    );
  }

  assert.equal(count("return exportPreparedProContext("), 1);
  assert.match(
    server,
    /if \(config\.fileTransactions !== "atomic"\) \{\s+return exportPreparedProContext\(/
  );
  assert.equal(count('if (config.fileTransactions !== "atomic") return writePreparedAgentHandoff(context);'), 2);
  assert.match(
    server,
    /config\.fileTransactions !== "atomic"\s+\? defaultCodexProSelfTestProvider\s+: async/
  );

  assert.match(REVIEWED_ALLOWLIST["src/fsOps.ts"].purpose, /^Legacy-mode-only /);
  assert.match(REVIEWED_ALLOWLIST["src/handoffOps.ts"].purpose, /^Legacy-mode-only /);
});

test("all shipped mutation primitives have an exact reviewed classification", async () => {
  const actual = new Map();
  for (const file of await enumerateSourceFiles()) {
    const relativePath = canonicalRelativePath(file);
    const source = (await fs.readFile(file, "utf8")).replace(/\r\n/g, "\n");
    const occurrences = scanFile(relativePath, source);
    if (occurrences.length > 0) actual.set(relativePath, occurrences);
  }

  const unreviewed = [];
  const stale = [];
  for (const [relativePath, occurrences] of actual) {
    const reviewed = REVIEWED_ALLOWLIST[relativePath];
    const reviewedKeys = new Set(reviewed?.occurrences ?? []);
    for (const occurrence of occurrences) {
      if (!reviewed?.purpose || !reviewedKeys.has(occurrence.key)) {
        unreviewed.push(formatOccurrence(relativePath, occurrence));
      }
    }
  }
  for (const [relativePath, reviewed] of Object.entries(REVIEWED_ALLOWLIST)) {
    assert.equal(typeof reviewed.purpose, "string", `${relativePath} must have a reviewed purpose`);
    assert.ok(reviewed.purpose.length > 0, `${relativePath} must have a reviewed purpose`);
    const actualKeys = new Set((actual.get(relativePath) ?? []).map((occurrence) => occurrence.key));
    for (const key of reviewed.occurrences) {
      if (!actualKeys.has(key)) stale.push(`${relativePath}:${key} (${reviewed.purpose})`);
    }
  }

  assert.deepEqual(unreviewed, [], `Unreviewed mutation primitives:\n${unreviewed.join("\n")}`);
  assert.deepEqual(stale, [], `Stale mutation allowlist entries (line/call drift):\n${stale.join("\n")}`);
});
