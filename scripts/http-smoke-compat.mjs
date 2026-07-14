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

source += "\n//# sourceURL=codexpro-http-smoke-compat.mjs";
const encoded = Buffer.from(source, "utf8").toString("base64");
await import(`data:text/javascript;base64,${encoded}`);
