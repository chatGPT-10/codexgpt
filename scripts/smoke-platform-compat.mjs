import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const previousBashEnv = process.env.BASH_ENV;
const previousInheritEnv = process.env.CODEXPRO_INHERIT_ENV;
const previousTemp = process.env.TEMP;
const previousTmp = process.env.TMP;
const previousPathext = process.env.PATHEXT;
let compatibilityDir;

function replaceExactCount(source, oldText, newText, expectedCount) {
  const actualCount = source.split(oldText).length - 1;
  if (actualCount !== expectedCount) {
    throw new Error(
      `Smoke compatibility replacement expected ${expectedCount} matches but found ${actualCount}: ${oldText}`
    );
  }
  return source.split(oldText).join(newText);
}

async function importMigratedSmokeSource() {
  const sourceUrl = new URL('./smoke.mjs', import.meta.url);
  let source = await fs.readFile(sourceUrl, 'utf8');
  source = replaceExactCount(
    source,
    'cardOpened.structuredContent.workspace_id',
    'cardOpened.structuredContent.data?.workspace_id',
    4
  );
  source = replaceExactCount(
    source,
    'opened.structuredContent.workspace_id',
    'opened.structuredContent.data?.workspace_id',
    1
  );
  source = replaceExactCount(
    source,
    'openedByPath.structuredContent.workspace_id',
    'openedByPath.structuredContent.data?.workspace_id',
    2
  );
  source = replaceExactCount(
    source,
    'snapshotAlias.structuredContent.tree',
    'snapshotAlias.structuredContent.data?.tree',
    1
  );
  source = replaceExactCount(
    source,
    'cardInspect.structuredContent.coverage',
    'cardInspect.structuredContent.data?.coverage',
    1
  );
  source = replaceExactCount(
    source,
    'workspaceAnalysis.structuredContent.languages',
    'workspaceAnalysis.structuredContent.data?.languages',
    1
  );
  source = replaceExactCount(
    source,
    'workspaceAnalysis.structuredContent.coverage',
    'workspaceAnalysis.structuredContent.data?.coverage',
    1
  );
  source = replaceExactCount(
    source,
    'inspectAfterWrite.structuredContent.cache',
    'inspectAfterWrite.structuredContent.data?.cache',
    2
  );
  source = replaceExactCount(
    source,
    'inspectAfterWrite.structuredContent.files',
    'inspectAfterWrite.structuredContent.data?.files',
    1
  );
  source = replaceExactCount(
    source,
    'inspectAfterEdit.structuredContent.cache',
    'inspectAfterEdit.structuredContent.data?.cache',
    2
  );
  source = replaceExactCount(
    source,
    'inspectAfterPatch.structuredContent.cache',
    'inspectAfterPatch.structuredContent.data?.cache',
    2
  );
  source = replaceExactCount(
    source,
    'loadedSkill.structuredContent.skill?.name',
    'loadedSkill.structuredContent.data?.skill?.name',
    1
  );
  source = replaceExactCount(
    source,
    'loadedSkill.structuredContent.text',
    'loadedSkill.structuredContent.data?.text',
    1
  );
  source = replaceExactCount(
    source,
    'metadataSessions.structuredContent.total_found',
    'metadataSessions.structuredContent.data?.total_found',
    1
  );
  source = replaceExactCount(
    source,
    'codexSessions.structuredContent.sessions',
    'codexSessions.structuredContent.data?.sessions',
    1
  );
  source = replaceExactCount(
    source,
    'topOneSessions.structuredContent.sessions',
    'topOneSessions.structuredContent.data?.sessions',
    1
  );
  source = replaceExactCount(
    source,
    'largeTailSessions.structuredContent.total_found',
    'largeTailSessions.structuredContent.data?.total_found',
    1
  );
  source = replaceExactCount(
    source,
    "JSON.stringify(metadataSessions.structuredContent).includes('Large tail summary')",
    "JSON.stringify(metadataSessions.structuredContent.data?.sessions ?? []).includes('Large tail summary')",
    1
  );
  source = replaceExactCount(
    source,
    "JSON.stringify(largeTailSessions.structuredContent).includes('Large tail summary')",
    "JSON.stringify(largeTailSessions.structuredContent.data?.sessions ?? []).includes('Large tail summary')",
    1
  );
  source = replaceExactCount(
    source,
    'handoffContext.structuredContent.files',
    'handoffContext.structuredContent.data?.files',
    1
  );
  source = replaceExactCount(
    source,
    'codexContext.structuredContent.agents_files',
    'codexContext.structuredContent.data?.agents_files',
    3
  );
  source = replaceExactCount(
    source,
    'lowerContext.structuredContent.agents_files',
    'lowerContext.structuredContent.data?.agents_files',
    2
  );
  source = replaceExactCount(
    source,
    'agentHandoff.structuredContent.agent',
    'agentHandoff.structuredContent.data?.agent',
    1
  );
  source = replaceExactCount(
    source,
    '}, /File is too large/);',
    '}, /EXISTING_PLAN_TOO_LARGE/);',
    1
  );
  source = replaceExactCount(
    source,
    'exported.structuredContent.path',
    'exported.structuredContent.data?.path',
    1
  );
  source = replaceExactCount(
    source,
    'exported.structuredContent.files_included',
    'exported.structuredContent.data?.files_included',
    2
  );
  source = replaceExactCount(
    source,
    'oneFileExport.structuredContent.files_included',
    'oneFileExport.structuredContent.data?.files_included',
    2
  );
  source = replaceExactCount(
    source,
    'exactExport.structuredContent.files_included',
    'exactExport.structuredContent.data?.files_included',
    4
  );
  const selfTestResultReplacements = [
    ['selfTest.structuredContent.status', 'selfTest.structuredContent.data?.status', 1],
    ['selfTest.structuredContent.expected_tools', 'selfTest.structuredContent.data?.expected_tools', 2],
    ['selfTest.structuredContent.registered_tools', 'selfTest.structuredContent.data?.registered_tools', 1],
    ['selfTest.structuredContent.files_touched', 'selfTest.structuredContent.data?.files_touched', 1],
    ['handoffSelfTest.structuredContent.status', 'handoffSelfTest.structuredContent.data?.status', 1],
    ['handoffSelfTest.structuredContent.expected_tools', 'handoffSelfTest.structuredContent.data?.expected_tools', 1],
    ['handoffSelfTest.structuredContent.registered_tools', 'handoffSelfTest.structuredContent.data?.registered_tools', 1],
    ['disabledSelfTest.structuredContent.status', 'disabledSelfTest.structuredContent.data?.status', 1],
    ['disabledSelfTest.structuredContent.expected_tools', 'disabledSelfTest.structuredContent.data?.expected_tools', 1],
    ['disabledSelfTest.structuredContent.registered_tools', 'disabledSelfTest.structuredContent.data?.registered_tools', 1],
    ['guardedSelfTest.structuredContent.status', 'guardedSelfTest.structuredContent.data?.status', 1],
    ['guardedSelfTest.structuredContent.checks', 'guardedSelfTest.structuredContent.data?.checks', 1]
  ];
  for (const [oldText, newText, expectedCount] of selfTestResultReplacements) {
    source = replaceExactCount(source, oldText, newText, expectedCount);
  }
  const waitResultReplacements = [
    ['waitCompleted.structuredContent.awaited_completed', 'waitCompleted.structuredContent.data?.awaited_completed'],
    ['waitCompleted.structuredContent.state', 'waitCompleted.structuredContent.data?.state'],
    ['waitCompleted.structuredContent.awaited_terminal', 'waitCompleted.structuredContent.data?.awaited_terminal'],
    ['waitCompleted.structuredContent.succeeded', 'waitCompleted.structuredContent.data?.succeeded'],
    ['waitCompleted.structuredContent.exit_code', 'waitCompleted.structuredContent.data?.run?.exit_code'],
    ['waitCompleted.structuredContent.status_file', 'waitCompleted.structuredContent.data?.artifact_paths?.status'],
    ['waitMismatch.structuredContent.awaited_completed', 'waitMismatch.structuredContent.data?.awaited_completed'],
    ['waitMismatch.structuredContent.state', 'waitMismatch.structuredContent.data?.state'],
    ['waitMismatch.structuredContent.plan_hash_mismatch', 'waitMismatch.structuredContent.data?.plan_hash_mismatch'],
    ['waitFailed.structuredContent.awaited_terminal', 'waitFailed.structuredContent.data?.awaited_terminal'],
    ['waitFailed.structuredContent.awaited_completed', 'waitFailed.structuredContent.data?.awaited_completed'],
    ['waitFailed.structuredContent.succeeded', 'waitFailed.structuredContent.data?.succeeded'],
    ['waitFailed.structuredContent.state', 'waitFailed.structuredContent.data?.state'],
    ['waitFailed.structuredContent.status_file', 'waitFailed.structuredContent.data?.artifact_paths?.status'],
    ['waitFailed.structuredContent.diff_file', 'waitFailed.structuredContent.data?.artifact_paths?.diff'],
    ['waitTimedOut.structuredContent.awaited_terminal', 'waitTimedOut.structuredContent.data?.awaited_terminal'],
    ['waitTimedOut.structuredContent.awaited_completed', 'waitTimedOut.structuredContent.data?.awaited_completed'],
    ['waitTimedOut.structuredContent.succeeded', 'waitTimedOut.structuredContent.data?.succeeded'],
    ['waitTimedOut.structuredContent.state', 'waitTimedOut.structuredContent.data?.state']
  ];
  for (const [oldText, newText] of waitResultReplacements) {
    source = replaceExactCount(source, oldText, newText, 1);
  }
  source = replaceExactCount(
    source,
    'superActions.structuredContent.actions',
    'superActions.structuredContent.data.actions',
    1
  );
  source += '\n//# sourceURL=codexpro-smoke-compat.mjs';
  const encoded = Buffer.from(source, 'utf8').toString('base64');
  await import(`data:text/javascript;base64,${encoded}`);
}

try {
  if (process.platform === 'win32') {
    const canonicalTemp = await fs.realpath(os.tmpdir());
    process.env.TEMP = canonicalTemp;
    process.env.TMP = canonicalTemp;
    compatibilityDir = await fs.mkdtemp(path.join(canonicalTemp, 'codexpro-smoke-bash-env-'));
    const bashEnvPath = path.join(compatibilityDir, 'bash-env.sh');
    await fs.writeFile(
      bashEnvPath,
      'pwd() {\n  cygpath -w "$PWD"\n}\n',
      'utf8'
    );
    process.env.BASH_ENV = bashEnvPath;
    process.env.CODEXPRO_INHERIT_ENV = '1';
    if (!process.env.PATHEXT) {
      process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD';
    }
  }

  await importMigratedSmokeSource();
} finally {
  if (previousBashEnv === undefined) delete process.env.BASH_ENV;
  else process.env.BASH_ENV = previousBashEnv;

  if (previousInheritEnv === undefined) delete process.env.CODEXPRO_INHERIT_ENV;
  else process.env.CODEXPRO_INHERIT_ENV = previousInheritEnv;

  if (previousTemp === undefined) delete process.env.TEMP;
  else process.env.TEMP = previousTemp;
  if (previousTmp === undefined) delete process.env.TMP;
  else process.env.TMP = previousTmp;
  if (previousPathext === undefined) delete process.env.PATHEXT;
  else process.env.PATHEXT = previousPathext;

  if (compatibilityDir) {
    await fs.rm(compatibilityDir, { recursive: true, force: true });
  }
}
