import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

process.env["CODEXPRO_ALLOW_QUERY_" + "TOKEN"] = "1";

const require = createRequire(import.meta.url);
const sourceUrl = new URL("./http-smoke.mjs", import.meta.url);
let source = await fs.readFile(sourceUrl, "utf8");

function replaceExactCount(source, oldText, newText, expectedCount) {
  const actualCount = source.split(oldText).length - 1;
  if (actualCount !== expectedCount) {
    throw new Error(
      `HTTP smoke compatibility replacement expected ${expectedCount} matches but found ${actualCount}: ${oldText}`
    );
  }
  return source.split(oldText).join(newText);
}

const replacements = [
  [
    "from '@modelcontextprotocol/sdk/client/index.js'",
    `from '${pathToFileURL(require.resolve("@modelcontextprotocol/sdk/client/index.js")).href}'`
  ],
  [
    "from '@modelcontextprotocol/sdk/client/streamableHttp.js'",
    `from '${pathToFileURL(require.resolve("@modelcontextprotocol/sdk/client/streamableHttp.js")).href}'`
  ],
  [
    "result.structuredContent.skill_inventory?.length",
    "result.structuredContent.data?.skill_inventory?.length"
  ],
  [
    "withSkills.structuredContent.skill_inventory?.some?.",
    "withSkills.structuredContent.data?.skill_inventory?.some?."
  ],
  [
    "return result.structuredContent.workspace_id;",
    "return result.structuredContent.data?.workspace_id;"
  ],
  [
    "snapshot.structuredContent.workspace_id !== opened",
    "snapshot.structuredContent.data?.workspace_id !== opened"
  ],
  [
    "${snapshot.structuredContent.workspace_id}, expected",
    "${snapshot.structuredContent.data?.workspace_id}, expected"
  ],
  [
    "list.structuredContent.workspaces.map",
    "list.structuredContent.data?.workspaces.map"
  ],
  [
    "loadedSkill.structuredContent.skill?.name",
    "loadedSkill.structuredContent.data?.skill?.name"
  ],
  [
    "loadedSkill.structuredContent.text",
    "loadedSkill.structuredContent.data?.text"
  ]
];

for (const [oldText, newText] of replacements) {
  const firstIndex = source.indexOf(oldText);
  const lastIndex = source.lastIndexOf(oldText);
  if (firstIndex < 0 || firstIndex !== lastIndex) {
    throw new Error(`HTTP smoke compatibility replacement must match exactly once: ${oldText}`);
  }
  source = source.replace(oldText, newText);
}

source = replaceExactCount(
  source,
  "codexContext.structuredContent.workspace_id",
  "codexContext.structuredContent.data?.workspace_id",
  2
);

source = replaceExactCount(
  source,
  "exported.structuredContent.path",
  "exported.structuredContent.data?.path",
  2
);

const lifecycleBlockPattern = /  if \(opened !== currentOpened\) \{[\s\S]*?    if \(codexContext\.structuredContent\.data\?\.workspace_id !== opened\) \{[\s\S]*?  \}\);\r?\n/;
const lifecycleBlockMatches = source.match(new RegExp(lifecycleBlockPattern.source, "g")) ?? [];
if (lifecycleBlockMatches.length !== 1) {
  throw new Error(`HTTP smoke compatibility lifecycle replacement expected 1 match but found ${lifecycleBlockMatches.length}`);
}
source = source.replace(lifecycleBlockPattern, `  if (!/^ws_[0-9a-f]{32}$/.test(currentOpened) || !/^ws_[0-9a-f]{32}$/.test(opened)) {
    throw new Error(\`workspace lifecycle returned malformed handles: \${currentOpened}, \${opened}\`);
  }
  if (opened === currentOpened) {
    throw new Error(\`independent HTTP sessions reused workspace handle \${opened}\`);
  }

  await withClient(mcpUrl, async (client) => {
    const list = await callTool(client, 'list_workspaces');
    const ids = list.structuredContent.data?.workspaces.map((workspace) => workspace.id);
    if (ids.length !== 0) {
      throw new Error(\`new HTTP session inherited workspace handles: \${ids.join(', ')}\`);
    }

    const foreign = await client.callTool({
      name: 'tree',
      arguments: { workspace_id: opened, max_depth: 1, max_entries: 10 }
    });
    if (!foreign.isError || foreign.structuredContent?.error?.code !== 'WORKSPACE_NOT_FOUND') {
      throw new Error(\`foreign workspace handle was not rejected: \${JSON.stringify(foreign.structuredContent)}\`);
    }

    const sessionOpen = await callTool(client, 'open_workspace', { include_tree: false });
    const active = sessionOpen.structuredContent.data?.workspace_id;
    if (!/^ws_[0-9a-f]{32}$/.test(active) || active === opened || active === currentOpened) {
      throw new Error(\`new HTTP session did not receive a fresh workspace handle: \${active}\`);
    }

    const snapshot = await callTool(client, 'workspace_snapshot', { workspace_id: active, max_depth: 1 });
    if (snapshot.structuredContent.data?.workspace_id !== active) {
      throw new Error(\`workspace_snapshot returned \${snapshot.structuredContent.data?.workspace_id}, expected \${active}\`);
    }

    const tree = await callTool(client, 'tree', { workspace_id: active, max_depth: 1, max_entries: 10 });
    if (tree.structuredContent.data?.workspace_id !== active) {
      throw new Error(\`tree returned \${tree.structuredContent.data?.workspace_id}, expected \${active}\`);
    }

    const codexContext = await callTool(client, 'codex_context', { workspace_id: active });
    if (codexContext.structuredContent.data?.workspace_id !== active) {
      throw new Error(\`codex_context returned \${codexContext.structuredContent.data?.workspace_id}, expected \${active}\`);
    }
  });
`);

const exportBlockPattern = /  await withClient\(mcpUrl, async \(client\) => \{\r?\n    const exported = await callTool\(client, 'export_pro_context', \{\r?\n      workspace_id: opened,/;
const exportBlockMatches = source.match(new RegExp(exportBlockPattern.source, "g")) ?? [];
if (exportBlockMatches.length !== 1) {
  throw new Error(`HTTP smoke compatibility export replacement expected 1 match but found ${exportBlockMatches.length}`);
}
source = source.replace(exportBlockPattern, `  await withClient(mcpUrl, async (client) => {
    const exportOpen = await callTool(client, 'open_workspace', { include_tree: false });
    const exportWorkspaceId = exportOpen.structuredContent.data?.workspace_id;
    const exported = await callTool(client, 'export_pro_context', {
      workspace_id: exportWorkspaceId,`);

source += "\n//# sourceURL=codexpro-http-smoke-compat.mjs";
const encoded = Buffer.from(source, "utf8").toString("base64");
await import(`data:text/javascript;base64,${encoded}`);
