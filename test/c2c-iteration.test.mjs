import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { tsImport } from 'tsx/esm/api';
const { executeSessionRequest } = await tsImport('../src/c2c/cli.ts', import.meta.url);
const { C2CSessionStore } = await tsImport('../src/c2c/sessionStore.ts', import.meta.url);
const chatUrl='https://chatgpt.com/c/12345678-1234-1234-1234-123456789abc';
async function fixture(run) {
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'c2c-iteration-'));
  const root=path.join(base,'root'),home=path.join(base,'home');
  fs.mkdirSync(root); fs.mkdirSync(home); fs.mkdirSync(path.join(root,'.ai-bridge'));
  execFileSync('git',['init','--quiet',root],{windowsHide:true});
  const plan='Add a small local greeting fixture and run its check.\n';
  fs.writeFileSync(path.join(root,'.ai-bridge/current-plan.md'),plan);
  fs.writeFileSync(path.join(root,'existing.txt'),'preexisting work\n');
  const taskId='c2c_iteration';
  const call=request=>executeSessionRequest(root,Buffer.from(JSON.stringify(request)),{home});
  const sha=createHash('sha256').update(plan).digest('hex');
  const planWire=`[CODEXGPT-C2C]\nPROTOCOL: 1\nSTATE: PLAN\nTASK_ID: ${taskId}\nITERATION: 1\nPLAN_PATH: .ai-bridge/current-plan.md\nPLAN_SHA256: ${sha}\nPLAN_BYTES: ${Buffer.byteLength(plan)}`;
  try {
    await call({action:'begin',expectedRevision:null,input:{taskId,workspaceId:'workspace',originalGoal:'Add greeting',conversation:{mode:'chat',projectUrl:null,chatUrl,connectorName:'CodexGPT'}}});
    await call({action:'prepare-init',taskId,revision:1});
    assert.equal((await call({action:'receive',taskId,revision:2,wire:planWire})).ok,true);
    await run({root,home,call,taskId,sha,planWire});
  } finally { fs.rmSync(base,{recursive:true,force:true}); }
}
test('single iteration persists real baseline and checks, reserves EXECUTED once and accepts attributed DONE',()=>fixture(async f=>{
  const start=await f.call({action:'execution-start',taskId:f.taskId,revision:3});
  assert.equal(start.ok,true); assert.equal(start.session.task.state,'EXECUTING');
  assert.equal(start.planSnapshot.sha256,f.sha); assert.equal(start.session.executionRecord.baseline.preexistingDirty,true);
  assert.equal((await f.call({action:'execution-start',taskId:f.taskId,revision:4})).ok,false);
  fs.writeFileSync(path.join(f.root,'greeting.txt'),'hello\n');
  assert.equal(fs.readFileSync(path.join(f.root,'greeting.txt'),'utf8'),'hello\n');
  const checks=[{name:'greeting check',status:'passed',summary:'Actual fixture content equals hello.'}];
  const finish=await f.call({action:'execution-finish',taskId:f.taskId,revision:4,checks});
  assert.equal(finish.ok,true); assert.equal(finish.session.task.execution.changedFiles,1);
  assert.deepEqual(finish.session.executionRecord.changedPaths,['greeting.txt']);
  assert.deepEqual(finish.session.executionRecord.checks,checks);
  assert.equal((await f.call({action:'prepare-executed',taskId:f.taskId,revision:5})).ok,false);
  fs.writeFileSync(path.join(f.root,'.ai-bridge/agent-status.md'),finish.report);
  const prepared=await f.call({action:'prepare-executed',taskId:f.taskId,revision:5});
  assert.equal(prepared.ok,true); assert.match(prepared.wire,/STATE: EXECUTED/);
  assert.equal((await f.call({action:'prepare-executed',taskId:f.taskId,revision:6})).ok,false);
  const second=f.planWire.replace('ITERATION: 1','ITERATION: 2');
  assert.equal((await f.call({action:'receive',taskId:f.taskId,revision:6,wire:second})).ok,false);
  const baseline={tabId:'tab',providerId:'iab',chatUrl,lastAssistantId:'plan',userMessageId:'executed'};
  const snapshot={...baseline,generating:true,error:false,messages:[{id:'executed',role:'user',text:prepared.wire}]};
  delete snapshot.lastAssistantId; delete snapshot.userMessageId;
  assert.equal((await f.call({action:'observe',taskId:f.taskId,revision:6,baseline,snapshot})).observation,'waiting');
  snapshot.generating=false; snapshot.messages.push({id:'review',role:'assistant',text:`[CODEXGPT-C2C]\nPROTOCOL: 1\nSTATE: DONE\nTASK_ID: ${f.taskId}\nITERATION: 1\nSUMMARY:\nVerified the greeting.`});
  assert.equal((await f.call({action:'observe',taskId:f.taskId,revision:6,baseline,snapshot})).session.task.state,'DONE');
}));
test('tampered plan never starts and invalid or empty checks never finish',()=>fixture(async f=>{
  fs.appendFileSync(path.join(f.root,'.ai-bridge/current-plan.md'),'changed');
  assert.equal((await f.call({action:'execution-start',taskId:f.taskId,revision:3})).ok,false);
  assert.equal((await f.call({action:'status'})).session.task.state,'PLAN_RECEIVED');
  assert.equal((await f.call({action:'execution-finish',taskId:f.taskId,revision:3,checks:[]})).ok,false);
}));
test('interrupted execution is observational and concurrent starts reserve only once',()=>fixture(async f=>{
  const starts=await Promise.all([1,2].map(()=>f.call({action:'execution-start',taskId:f.taskId,revision:3})));
  assert.equal(starts.filter(s=>s.ok).length,1);
  assert.equal((await f.call({action:'status'})).session.task.state,'EXECUTING');
  assert.equal((await f.call({action:'execution-start',taskId:f.taskId,revision:4})).ok,false);
  assert.equal((await f.call({action:'execution-finish',taskId:f.taskId,revision:4,checks:[]})).ok,false);
}));
test('failed checks remain reportable but cannot produce DONE; second PLAN rejected through observation too',()=>fixture(async f=>{
  assert.equal((await f.call({action:'execution-start',taskId:f.taskId,revision:3})).ok,true);
  const finish=await f.call({action:'execution-finish',taskId:f.taskId,revision:4,checks:[{name:'actual failure',status:'failed',summary:'Assertion failed.'}]});
  assert.equal(finish.ok,true);
  fs.writeFileSync(path.join(f.root,'.ai-bridge/agent-status.md'),finish.report);
  assert.equal((await f.call({action:'prepare-executed',taskId:f.taskId,revision:5})).ok,true);
  const done=`[CODEXGPT-C2C]\nPROTOCOL: 1\nSTATE: DONE\nTASK_ID: ${f.taskId}\nITERATION: 1\nSUMMARY:\nClaimed done.`;
  assert.equal((await f.call({action:'receive',taskId:f.taskId,revision:6,wire:done})).error,'CHECKS_NOT_PASSED');
  const baseline={tabId:'tab',providerId:'iab',chatUrl,lastAssistantId:'plan',userMessageId:'executed'};
  const snapshot={tabId:'tab',providerId:'iab',chatUrl,generating:false,error:false,messages:[{id:'executed',role:'user',text:'sent'},{id:'review',role:'assistant',text:f.planWire.replace('ITERATION: 1','ITERATION: 2')}]};
  assert.equal((await f.call({action:'observe',taskId:f.taskId,revision:6,baseline,snapshot})).ok,false);
  const blocked=`[CODEXGPT-C2C]\nPROTOCOL: 1\nSTATE: BLOCKED\nTASK_ID: ${f.taskId}\nITERATION: 1\nREASON:\nCheck failed.\nNEEDS:\nResolve the failed assertion.`;
  assert.equal((await f.call({action:'receive',taskId:f.taskId,revision:6,wire:blocked})).session.task.state,'BLOCKED');
}));
test('workspace drift and altered report do not reserve a send',()=>fixture(async f=>{
  await f.call({action:'execution-start',taskId:f.taskId,revision:3});
  const finish=await f.call({action:'execution-finish',taskId:f.taskId,revision:4,checks:[{name:'read check',status:'passed',summary:'Verified contents.'}]});
  fs.writeFileSync(path.join(f.root,'.ai-bridge/agent-status.md'),finish.report+'altered');
  assert.equal((await f.call({action:'prepare-executed',taskId:f.taskId,revision:5})).error,'EXECUTION_REPORT_REQUIRED');
  fs.writeFileSync(path.join(f.root,'.ai-bridge/agent-status.md'),finish.report);
  fs.appendFileSync(path.join(f.root,'existing.txt'),'later change');
  assert.equal((await f.call({action:'prepare-executed',taskId:f.taskId,revision:5})).error,'EXECUTION_DRIFT');
  assert.equal((await f.call({action:'status'})).session.task.state,'EXECUTED_LOCAL');
}));
test('wide evidence reloads and store API cannot bypass report verification',()=>fixture(async f=>{
  for(let n=0;n<20;n++) fs.writeFileSync(path.join(f.root,`file-${n}.txt`),'existing');
  const start=await f.call({action:'execution-start',taskId:f.taskId,revision:3});
  assert.equal(start.ok,true);
  const checks=Array.from({length:32},(_,n)=>({name:`check ${n}`,status:'passed',summary:'Observed success.'}));
  const finish=await f.call({action:'execution-finish',taskId:f.taskId,revision:4,checks});
  assert.equal(finish.ok,true);
  assert.equal((await f.call({action:'status'})).session.executionRecord.checks.length,32);
  const store=new C2CSessionStore(f.root,{home:f.home});
  await assert.rejects(store.advance(5,f.taskId,{type:'SEND_EXECUTED',message:finish.session.task.execution}),{code:'EXECUTION_REPORT_REQUIRED'});
  fs.writeFileSync(path.join(f.root,'.ai-bridge/agent-status.md'),finish.report);
  assert.equal((await f.call({action:'prepare-executed',taskId:f.taskId,revision:5})).ok,true);
}));
test('public CLI persists execution across processes and never returns a second send reservation',()=>fixture(async f=>{
  const call=request=>{
    const child=spawnSync(process.execPath,['scripts/codexgpt-entry.mjs','c2c','session','--root',f.root],{input:JSON.stringify(request),encoding:'utf8',windowsHide:true,env:{...process.env,CODEXGPT_HOME:f.home}});
    assert.equal(child.stderr,'');
    return JSON.parse(child.stdout);
  };
  assert.equal(call({action:'execution-start',taskId:f.taskId,revision:3}).ok,true);
  assert.equal(call({action:'execution-start',taskId:f.taskId,revision:4}).ok,false);
  fs.writeFileSync(path.join(f.root,'actual.txt'),'checked\n');
  assert.equal(fs.readFileSync(path.join(f.root,'actual.txt'),'utf8'),'checked\n');
  const finish=call({action:'execution-finish',taskId:f.taskId,revision:4,checks:[{name:'fixture content equality',status:'passed',summary:'Read actual.txt and verified checked line.'}]});
  assert.equal(finish.ok,true);
  fs.writeFileSync(path.join(f.root,'.ai-bridge/agent-status.md'),finish.report);
  assert.equal(call({action:'prepare-executed',taskId:f.taskId,revision:5}).ok,true);
  const duplicate=call({action:'prepare-executed',taskId:f.taskId,revision:6});
  assert.equal(duplicate.ok,false); assert.equal(duplicate.wire,undefined);
}));
