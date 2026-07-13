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
