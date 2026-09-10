import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tsImport } from 'tsx/esm/api';
import { spawnSync } from 'node:child_process';
const { executeSessionRequest } = await tsImport('../src/c2c/cli.ts', import.meta.url);
const input = { taskId:'c2c_cli', workspaceId:'workspace', originalGoal:'Implement feature', conversation:{mode:'chat',projectUrl:null,chatUrl:'https://chatgpt.com/c/12345678-1234-1234-1234-123456789abc',connectorName:'CodexGPT'} };
test('session bridge reserves INIT once, accepts next PLAN and rejects stale/extra input', async () => {
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'c2c-cli-'));
  const root=path.join(base,'root'),home=path.join(base,'home');fs.mkdirSync(root);fs.mkdirSync(home);
  const call=request=>executeSessionRequest(root,Buffer.from(typeof request==='string'?request:JSON.stringify(request)),{home});
  try {
    assert.deepEqual(await call({action:'status'}),{ok:true,session:null});
    assert.equal((await call({action:'begin',input,expectedRevision:null})).session.revision,1);
    const prepared=await call({action:'prepare-init',taskId:input.taskId,revision:1});
    assert.equal(prepared.session.task.state,'INIT_SENT');assert.match(prepared.wire,/STATE: INIT/);
    assert.equal((await call({action:'prepare-init',taskId:input.taskId,revision:1})).ok,false);
    assert.equal((await call({action:'prepare-init',taskId:input.taskId,revision:2})).ok,false);
    const wire=`[CODEXGPT-C2C]\nPROTOCOL: 1\nSTATE: PLAN\nTASK_ID: ${input.taskId}\nITERATION: 1\nPLAN_PATH: .ai-bridge/current-plan.md\nPLAN_SHA256: ${'a'.repeat(64)}\nPLAN_BYTES: 10`;
    const baseline={tabId:'tab',providerId:'browser',chatUrl:input.conversation.chatUrl,lastAssistantId:null,userMessageId:'sent'};
    const snapshot={tabId:'tab',providerId:'browser',chatUrl:input.conversation.chatUrl,generating:true,error:false,messages:[{id:'sent',role:'user',text:'init'}]};
    const observe={action:'observe',taskId:input.taskId,revision:2,baseline,snapshot};
    assert.equal((await call(observe)).observation,'waiting');
    snapshot.generating=false;snapshot.messages.push({id:'reply',role:'assistant',text:wire});
    assert.equal((await call({...observe,baseline:{...baseline,tabId:'wrong'}})).ok,false);
    assert.equal((await call(observe)).session.task.state,'PLAN_RECEIVED');
    assert.equal((await call({action:'receive',taskId:input.taskId,revision:2,wire})).ok,false);
    assert.equal((await call({action:'status',extra:true})).ok,false);
    assert.equal((await call('{"action":"status","action":"status"}')).ok,false);
    assert.equal((await call({action:'execute'})).ok,false);
    assert.equal((await call(' '.repeat(65537))).ok,false);
  } finally { fs.rmSync(base,{recursive:true,force:true}); }
});
test('compiled public entry routes session without launching runtime or exposing bad input',()=>{
  const child=spawnSync(process.execPath,['scripts/codexgpt-entry.mjs','c2c','session','--root',process.cwd()],{input:'{"action":"unsupported","secret":"never-echo-me"}',encoding:'utf8',windowsHide:true});
  assert.equal(child.status,1);assert.equal(child.stderr,'');
  assert.deepEqual(JSON.parse(child.stdout),{ok:false,error:'INVALID_REQUEST'});
  assert.ok(!child.stdout.includes('never-echo-me'));
});
test('public CLI persists reservation across processes and never returns a second wire', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'c2c-cli-process-'));
  const root = path.join(base, 'root'), home = path.join(base, 'home');
  fs.mkdirSync(root); fs.mkdirSync(home);
  const call = request => {
    const child = spawnSync(process.execPath, ['scripts/codexgpt-entry.mjs', 'c2c', 'session', '--root', root], {
      input: JSON.stringify(request), encoding: 'utf8', windowsHide: true,
      env: { ...process.env, CODEXGPT_HOME: home }
    });
    assert.equal(child.stderr, '');
    return JSON.parse(child.stdout);
  };
  try {
    assert.equal(call({ action: 'begin', input, expectedRevision: null }).ok, true);
    const prepared = call({ action: 'prepare-init', taskId: input.taskId, revision: 1 });
    assert.equal(prepared.ok, true); assert.match(prepared.wire, /STATE: INIT/);
    assert.equal(call({ action: 'status' }).session.revision, 2);
    const replay = call({ action: 'prepare-init', taskId: input.taskId, revision: 2 });
    assert.equal(replay.ok, false); assert.equal(replay.wire, undefined);
    assert.equal(call({ action: 'status' }).session.task.state, 'INIT_SENT');
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});
