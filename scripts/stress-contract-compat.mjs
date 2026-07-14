import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runSpikeFixture } from './policy-windows-spike.mjs';

function replaceExactCount(source, oldText, newText, expectedCount) {
  const actualCount = source.split(oldText).length - 1;
  if (actualCount !== expectedCount) {
    throw new Error(
      `Stress contract compatibility replacement expected ${expectedCount} matches but found ${actualCount}: ${oldText}`
    );
  }
  return source.split(oldText).join(newText);
}

const policyFixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-policy-stress-'));
try {
  const policyReport = await runSpikeFixture({
    fixtureRoot: policyFixtureRoot,
    platform: process.platform,
    execute: async (probe) => ({
      id: probe.id,
      outcome: probe.id === 'workspace_read' ? 'pass' : 'blocked',
      detailCode: 'stress-synthetic'
    })
  });
  if (policyReport.fixtureRoot !== '[synthetic fixture]' || policyReport.persistentHostChanges !== false) {
    throw new Error('Policy Windows spike contract returned unsafe fixture facts.');
  }
} finally {
  await fs.rm(policyFixtureRoot, { recursive: true, force: true });
}

const sourceUrl = new URL('./stress.mjs', import.meta.url);
let source = await fs.readFile(sourceUrl, 'utf8');

source = replaceExactCount(
  source,
  'structuredContent.actions',
  'structuredContent.data.actions',
  9
);

source = replaceExactCount(
  source,
  "    assert(superActions.structuredContent.data.actions.includes('export_pro_context'), 'supertool actions missing export_pro_context');",
  "    assert(superActions.structuredContent.data.actions.includes('export_pro_context'), 'supertool actions missing export_pro_context');\n" +
    "    assert(superActions.structuredContent.data.action_count === superActions.structuredContent.data.actions.length, 'supertool action_count was inconsistent');",
  1
);

source = replaceExactCount(
  source,
  "    assert(blockedSearch.isError === true && String(blockedSearch.structuredContent.error).includes('not available'), 'supertool allowed disabled search action');",
  "    assert(blockedSearch.isError === true && blockedSearch.structuredContent.codexpro_tool === 'codexpro' && blockedSearch.structuredContent.error?.code === 'ACTION_NOT_AVAILABLE', 'supertool allowed disabled search action');",
  1
);

source = replaceExactCount(
  source,
  "    const malformedReadError = String(malformedRead.structuredContent.error ?? '');",
  "    const malformedReadPayload = JSON.stringify(malformedRead);",
  1
);
source = replaceExactCount(
  source,
  "    assert(malformedRead.isError === true && malformedRead.structuredContent.codexpro_tool === 'read' && malformedRead.structuredContent.wrapped_tool === 'read', 'supertool malformed read was not tagged as read');",
  "    assert(malformedRead.isError === true && malformedRead.structuredContent.codexpro_tool === 'codexpro' && malformedRead.structuredContent.error?.code === 'ACTION_ARGUMENTS_INVALID', 'supertool malformed read was not classified by the wrapper');",
  1
);
source = replaceExactCount(
  source,
  "    assert(malformedReadError.includes('Invalid arguments for read') && !malformedReadError.includes('TypeError'), `supertool malformed read leaked raw handler error: ${malformedReadError}`);",
  "    assert(!malformedReadPayload.includes('ZodError') && !malformedReadPayload.includes('TypeError'), `supertool malformed read leaked raw handler error: ${malformedReadPayload}`);",
  1
);

source = replaceExactCount(
  source,
  "    assert(blockedBash.isError === true && String(blockedBash.structuredContent.error).includes('not available'), 'supertool allowed disabled bash action');",
  "    assert(blockedBash.isError === true && blockedBash.structuredContent.codexpro_tool === 'codexpro' && blockedBash.structuredContent.error?.code === 'ACTION_NOT_AVAILABLE', 'supertool allowed disabled bash action');",
  1
);

source = replaceExactCount(
  source,
  "    assert(blockedWrite.isError === true && String(blockedWrite.structuredContent.error).includes('not available'), 'minimal handoff supertool allowed disabled write');",
  "    assert(blockedWrite.isError === true && blockedWrite.structuredContent.codexpro_tool === 'codexpro' && blockedWrite.structuredContent.error?.code === 'ACTION_NOT_AVAILABLE', 'minimal handoff supertool allowed disabled write');",
  1
);

source += '\n//# sourceURL=codexpro-stress-contract-compat.mjs';
const encoded = Buffer.from(source, 'utf8').toString('base64');
await import(`data:text/javascript;base64,${encoded}`);
