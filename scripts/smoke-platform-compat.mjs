import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const previousBashEnv = process.env.BASH_ENV;
const previousInheritEnv = process.env.CODEXPRO_INHERIT_ENV;
const previousTemp = process.env.TEMP;
const previousTmp = process.env.TMP;
let compatibilityDir;

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
  }

  await import('./smoke.mjs');
} finally {
  if (previousBashEnv === undefined) delete process.env.BASH_ENV;
  else process.env.BASH_ENV = previousBashEnv;

  if (previousInheritEnv === undefined) delete process.env.CODEXPRO_INHERIT_ENV;
  else process.env.CODEXPRO_INHERIT_ENV = previousInheritEnv;

  if (previousTemp === undefined) delete process.env.TEMP;
  else process.env.TEMP = previousTemp;
  if (previousTmp === undefined) delete process.env.TMP;
  else process.env.TMP = previousTmp;

  if (compatibilityDir) {
    await fs.rm(compatibilityDir, { recursive: true, force: true });
  }
}
