import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { C2CSessionStore } = await tsImport("../src/c2c/sessionStore.ts", import.meta.url);
const { buildHandoff } = await tsImport("../src/c2c/handoff.ts", import.meta.url);
const { profileIdForRoot } = await tsImport("../src/profileStore.ts", import.meta.url);
const input = { taskId: "c2c_test", workspaceId: "opaque_workspace", originalGoal: "实现功能", conversation: { mode: "chat", projectUrl: null, chatUrl: "https://chatgpt.com/c/12345678-1234-1234-1234-123456789abc", connectorName: "CodexGPT" } };
const init = { protocol: 1, state: "INIT", taskId: input.taskId, iteration: 0, workspaceId: input.workspaceId, goal: input.originalGoal };
const config = { blockedGlobs: ["**/.env"], maxReadBytes: 250000 };
function fixture(run) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "c2c-session-"));
  const root = path.join(base, "workspace"), home = path.join(base, "home");
  fs.mkdirSync(root); fs.mkdirSync(home);
  return Promise.resolve().then(()=>run({ base, root, home, store: new C2CSessionStore(root, { home }) })).finally(()=>fs.rmSync(base,{recursive:true,force:true}));
}
function planFile(root) {
  const content = "# Plan\nImplement the requested change.\n";
  fs.mkdirSync(path.join(root,".ai-bridge"),{recursive:true});
  fs.writeFileSync(path.join(root,".ai-bridge/current-plan.md"),content);
  return { protocol: 1, state:"PLAN", taskId:input.taskId, iteration:1, planPath:".ai-bridge/current-plan.md", planSha256:createHash("sha256").update(content).digest("hex"), planBytes:Buffer.byteLength(content) };
}
function childSource(source,args=[]) {
  return new Promise((resolve,reject)=>{let out='';const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',source,...args],{stdio:['ignore','pipe','pipe'],windowsHide:true});child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>out+=b);child.on('error',reject);child.on('close',code=>resolve({code,out}));});
}
async function toPlan(f) {
  let s=await f.store.begin(input);
  s=await f.store.advance(s.revision,input.taskId,{type:"SEND_INIT",message:init});
  return f.store.advance(s.revision,input.taskId,{type:"RECEIVE",message:planFile(f.root)});
}
test("independent state path, strict create, load, revision and profile preservation",()=>fixture(async f=>{
  fs.mkdirSync(path.join(f.home,"profiles"));fs.writeFileSync(path.join(f.home,"profiles","keep.json"),'{}');
  assert.equal(f.store.load(),null);
  const s=await f.store.begin(input);
  assert.equal(s.version,1);assert.equal(s.revision,1);assert.equal(s.task.state,"IDLE");
  assert.match(f.store.filePath, /c2c[\\/]sessions[\\/][a-f0-9]{24}\.json$/u);
  assert.equal(path.basename(f.store.filePath),profileIdForRoot(fs.realpathSync.native(f.root))+'.json');
  if(process.platform==='win32')assert.equal(new C2CSessionStore(f.root.toUpperCase(),{home:f.home}).filePath,f.store.filePath);
  assert.deepEqual(new C2CSessionStore(f.root,{home:f.home}).load(),s);
  assert.equal(fs.readFileSync(path.join(f.home,"profiles","keep.json"),'utf8'),'{}');
  await assert.rejects(f.store.begin(input),{code:"SESSION_CONFLICT"});
  await assert.rejects(f.store.advance(0,input.taskId,{type:"SEND_INIT",message:init}),{code:"REVISION_CONFLICT"});
  await assert.rejects(f.store.advance(1,"c2c_wrong",{type:"SEND_INIT",message:init}),{code:"TASK_MISMATCH"});
  assert.equal(f.store.load().revision,1);
}));
for(const state of ['BLOCKED','ERROR','RECOVERY_REQUIRED'])test(`fresh process preserves ${state} checkpoint`,()=>fixture(async f=>{
 let s=await f.store.begin(input);s=await f.store.advance(s.revision,input.taskId,{type:'SEND_INIT',message:init});
 const event=state==='RECOVERY_REQUIRED'?{type:'REQUIRE_RECOVERY'}:{type:'RECEIVE',message:{protocol:1,state,taskId:input.taskId,iteration:0,reason:'Stopped',...(state==='BLOCKED'?{needs:'User decision'}:{})}};
 s=await f.store.advance(s.revision,input.taskId,event);
 const source=`import {C2CSessionStore} from ${JSON.stringify(new URL('../src/c2c/sessionStore.ts',import.meta.url).href)};console.log(JSON.stringify(new C2CSessionStore(process.argv[1],{home:process.argv[2]}).resume('c2c_test')));`;
 const result=await childSource(source,[f.root,f.home]);assert.equal(result.code,0,result.out);assert.deepEqual(JSON.parse(result.out),s);
}));
test("INIT cannot change workspace/goal; checkpoint cannot carry an arbitrary task or log",()=>fixture(async f=>{
 const s=await f.store.begin(input);
 for(const patch of [{workspaceId:'other'},{goal:'Other goal'}])await assert.rejects(f.store.advance(1,input.taskId,{type:'SEND_INIT',message:{...init,...patch}}),{code:'INVALID_TRANSITION'});
 for(const patch of [{task:{state:'DONE'}},{transcript:[]},{knownIssues:'x'.repeat(2049)}])await assert.rejects(f.store.checkpoint(1,input.taskId,patch),{code:'SESSION_INVALID'});
 await assert.rejects(f.store.checkpoint(1,input.taskId,{knownIssues:'Authorization: Bearer '+'a'.repeat(32)}),{code:'SECRET_BLOCKED'});
 assert.deepEqual(f.store.load(),s);
}));
test("restart at every checkpoint preserves state and never reruns EXECUTING",()=>fixture(async f=>{
  let s=await f.store.begin(input);
  const reload=async()=>{const fresh=new C2CSessionStore(f.root,{home:f.home});assert.deepEqual(fresh.resume(input.taskId),s);const r=await childSource(`import {C2CSessionStore} from ${JSON.stringify(new URL('../src/c2c/sessionStore.ts',import.meta.url).href)};console.log(JSON.stringify(new C2CSessionStore(process.argv[1],{home:process.argv[2]}).resume('c2c_test')));`,[f.root,f.home]);assert.equal(r.code,0,r.out);assert.deepEqual(JSON.parse(r.out),s);return fresh;};
  await reload();s=await f.store.advance(s.revision,input.taskId,{type:"SEND_INIT",message:init});await reload();
  s=await f.store.advance(s.revision,input.taskId,{type:"RECEIVE",message:planFile(f.root)});await reload();
  await assert.rejects(f.store.advance(s.revision,input.taskId,{type:"START_EXECUTION"}),{code:"PLAN_VERIFICATION_REQUIRED"});
  const started=await f.store.startExecution(s.revision,input.taskId,config,false);s=started.session;
  assert.match(started.planSnapshot.text,/# Plan/u);const restored=await reload();
  assert.equal(restored.resume(input.taskId).task.state,"EXECUTING");
  await assert.rejects(restored.startExecution(s.revision,input.taskId,config,false),{code:"INVALID_TRANSITION"});
  const executed={protocol:1,state:"EXECUTED",taskId:input.taskId,iteration:1,executionId:"exec_test",planSha256:s.task.plan.planSha256,changedFiles:1,checks:"recorded"};
  s=await f.store.advance(s.revision,input.taskId,{type:"COMPLETE_EXECUTION",message:executed});await reload();
  s=await f.store.advance(s.revision,input.taskId,{type:"SEND_EXECUTED",message:executed});await reload();
  s=await f.store.advance(s.revision,input.taskId,{type:"RECEIVE",message:{protocol:1,state:"DONE",taskId:input.taskId,iteration:1,summary:"Verified"}});await reload();
  const next=await f.store.begin({...input,taskId:"c2c_next"},s.revision);
  assert.equal(next.revision,s.revision+1);assert.equal(next.task.taskId,"c2c_next");
}));
test("active/stopped tasks conflict until an exact explicit end; checkpoint and HANDOFF stay bounded",()=>fixture(async f=>{
  let s=await toPlan(f);
  s=await f.store.checkpoint(s.revision,input.taskId,{completedSubtasks:"Plan accepted",knownIssues:"None",nextExpectedStep:"Implement"});
  assert.equal(buildHandoff(s).currentState,"PLAN_RECEIVED");
  assert.equal(buildHandoff(s).originalGoal,input.originalGoal);
  for(const stateEvent of [{type:"REQUIRE_RECOVERY"},{type:"FAIL"}]) {
    if(s.task.state==="PLAN_RECEIVED")s=await f.store.advance(s.revision,input.taskId,stateEvent);
    await assert.rejects(f.store.begin({...input,taskId:"c2c_other"},s.revision),{code:"TASK_CONFLICT"});
  }
  await assert.rejects(f.store.endTask(s.revision,input.taskId,"c2c_wrong"),{code:"CONFIRMATION_REQUIRED"});
  s=await f.store.endTask(s.revision,input.taskId,input.taskId);
  await assert.rejects(f.store.checkpoint(s.revision,input.taskId,{knownIssues:"changed"}),{code:"TASK_ENDED"});
  assert.equal((await f.store.begin({...input,taskId:"c2c_other"},s.revision)).task.taskId,"c2c_other");
}));
test("corrupt/oversized JSON, unsafe schema and wrong workspace fail without overwrite",()=>fixture(async f=>{
  const s=await f.store.begin(input),original=fs.readFileSync(f.store.filePath);
  const other=path.join(f.base,"other");fs.mkdirSync(other);const otherStore=new C2CSessionStore(other,{home:f.home});
  fs.writeFileSync(otherStore.filePath,original);
  assert.throws(()=>otherStore.load(),{code:"WORKSPACE_MISMATCH"});
  for(const bad of ['{broken', ' '.repeat(65537),JSON.stringify(s).replace('"version":1','"version":1,"version":1'),JSON.stringify({...s,version:2}),JSON.stringify({...s,transcript:[]}),JSON.stringify({...s,task:{...s.task,waitingFor:"USER"}})]) {
    fs.writeFileSync(f.store.filePath,bad);
    assert.throws(()=>f.store.load(),{name:"C2CSessionError"});
    await assert.rejects(f.store.begin(input),{name:"C2CSessionError"});
    assert.equal(fs.readFileSync(f.store.filePath,'utf8'),bad);
  }
}));
test("failed PLAN verification leaves revision/state intact",()=>fixture(async f=>{
  const s=await toPlan(f);fs.appendFileSync(path.join(f.root,'.ai-bridge/current-plan.md'),'changed');
  await assert.rejects(f.store.startExecution(s.revision,input.taskId,config,false),{code:'PLAN_MISMATCH'});
  assert.deepEqual(f.store.load(),s);
}));
test("lock replacement and noncooperating revision changes abort before rename",()=>fixture(async f=>{
  const s=await f.store.begin(input);
  const rival={...s,revision:2,checkpoint:{...s.checkpoint,knownIssues:'External update'}};
  const store=new C2CSessionStore(f.root,{home:f.home,testHooks:{beforeCommit(){fs.writeFileSync(f.store.filePath,JSON.stringify(rival));}}});
  await assert.rejects(store.checkpoint(1,input.taskId,{knownIssues:'Must not win'}),{code:'REVISION_CONFLICT'});
  assert.deepEqual(f.store.load(),rival);
  const changedLock=new C2CSessionStore(f.root,{home:f.home,testHooks:{beforeCommit(){fs.writeFileSync(f.store.filePath+'.lock','foreign');}}});
  await assert.rejects(changedLock.checkpoint(2,input.taskId,{knownIssues:'Must not win'}),{code:'SESSION_LOCK_CHANGED'});
  assert.deepEqual(f.store.load(),rival);assert.equal(fs.readFileSync(f.store.filePath+'.lock','utf8'),'foreign');
}));
test("directory sync failure reports uncertain commit; retry cannot replay the revision",()=>fixture(async f=>{
  const s=await f.store.begin(input);
  const uncertain=new C2CSessionStore(f.root,{home:f.home,testHooks:{syncDirectory:()=>"failed"}});
  await assert.rejects(uncertain.checkpoint(s.revision,input.taskId,{knownIssues:'Committed'}),{code:'COMMIT_UNCERTAIN'});
  assert.equal(f.store.load().revision,2);
  await assert.rejects(f.store.checkpoint(1,input.taskId,{knownIssues:'Replay'}),{code:'REVISION_CONFLICT'});
}));
test("process exit after temp fsync preserves old JSON and leaves the orphan lock fail-closed",()=>fixture(async f=>{
  const s=await f.store.begin(input);
  const source=`import {C2CSessionStore} from ${JSON.stringify(new URL('../src/c2c/sessionStore.ts',import.meta.url).href)};const store=new C2CSessionStore(process.argv[1],{home:process.argv[2],testHooks:{beforeCommit(){process.exit(73);}}});await store.checkpoint(1,'c2c_test',{knownIssues:'Interrupted'});`;
  const result=await childSource(source,[f.root,f.home]);assert.equal(result.code,73,result.out);
  assert.deepEqual(new C2CSessionStore(f.root,{home:f.home}).resume(input.taskId),s);
  await assert.rejects(f.store.checkpoint(1,input.taskId,{knownIssues:'Unsafe retry'}),{code:'SESSION_LOCKED'});
  assert.ok(fs.readdirSync(path.dirname(f.store.filePath)).some(n=>n.includes('.tmp-')));
}));
test("project bindings roundtrip and state-directory junctions are rejected",()=>fixture(async f=>{
  const conversation={mode:'project',projectUrl:'https://chatgpt.com/g/g-p-example/project',chatUrl:null,connectorName:'CodexGPT'};
  for(const patch of [{projectUrl:'https://evil.test/g/g-p-example/project'},{projectUrl:conversation.projectUrl+'?tracking=1'},{chatUrl:'https://chatgpt.com/g/g-p-other/c/12345678-1234-1234-1234-123456789abc'}])await assert.rejects(f.store.begin({...input,conversation:{...conversation,...patch}}),{code:'SESSION_INVALID'});
  await assert.rejects(f.store.begin({...input,taskId:'invalid'}),{code:'SESSION_INVALID'});
  const s=await f.store.begin({...input,conversation});assert.deepEqual(f.store.load().conversation,conversation);
  const directory=path.dirname(f.store.filePath),moved=path.join(f.base,'moved');fs.renameSync(directory,moved);fs.symlinkSync(moved,directory,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>f.store.load(),{code:'STATE_PATH_UNSAFE'});
  await assert.rejects(f.store.checkpoint(s.revision,input.taskId,{knownIssues:'Must not write'}),{code:'STATE_PATH_UNSAFE'});
}));
test("pre-rename failure retains previous revision and cleans only owned temp/lock",()=>fixture(async f=>{
  const s=await f.store.begin(input);const before=fs.readFileSync(f.store.filePath);
  const failed=new C2CSessionStore(f.root,{home:f.home,testHooks:{beforeCommit(){throw Error('injected');}}});
  await assert.rejects(failed.checkpoint(s.revision,input.taskId,{knownIssues:"changed"}),{code:"SESSION_WRITE_FAILED"});
  assert.deepEqual(fs.readFileSync(f.store.filePath),before);
  assert.deepEqual(fs.readdirSync(path.dirname(f.store.filePath)),[path.basename(f.store.filePath)]);
  assert.equal((await f.store.checkpoint(s.revision,input.taskId,{knownIssues:"Next"})).revision,2);
}));
test("another process or instance cannot overwrite the same revision",()=>fixture(async f=>{
  const s=await f.store.begin(input);
  const source=`import {C2CSessionStore} from ${JSON.stringify(new URL('../src/c2c/sessionStore.ts',import.meta.url).href)};const s=new C2CSessionStore(process.argv[1],{home:process.argv[2]});try{await s.checkpoint(1,'c2c_test',{knownIssues:'Concurrent'});console.log('COMMITTED');}catch(e){console.log(e.code);}`;
  const child=()=>new Promise((resolve,reject)=>{let out='';const p=spawn(process.execPath,['--import','tsx','--input-type=module','-e',source,f.root,f.home],{stdio:['ignore','pipe','pipe'],windowsHide:true});p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>out+=b);p.on('error',reject);p.on('close',code=>code===0?resolve(out.trim()):reject(Error(out)));});
  const results=await Promise.all([child(),child()]);
  assert.equal(results.filter(r=>r==='COMMITTED').length,1);
  assert.ok(results.every(r=>['COMMITTED','SESSION_LOCKED','REVISION_CONFLICT'].includes(r)),results.join(','));
  assert.equal(f.store.load().revision,s.revision+1);
}));
test("URLs, secrets, cross-workspace state homes and links are refused",()=>fixture(async f=>{
  for(const url of ['http://chatgpt.com/c/x','https://evil.test/c/x',input.conversation.chatUrl+'?token=example',input.conversation.chatUrl+'#fragment','https://user@chatgpt.com/c/x','https://chatgpt.com:443/c/12345678-1234-1234-1234-123456789abc','https://chatgpt.com/c/../c/12345678-1234-1234-1234-123456789abc']) {
    await assert.rejects(f.store.begin({...input,conversation:{...input.conversation,chatUrl:url}}),{code:"SESSION_INVALID"});
  }
  await assert.rejects(f.store.begin({...input,originalGoal:'gh'+'p_'+'a'.repeat(30)}),{code:"SECRET_BLOCKED"});
  assert.throws(()=>new C2CSessionStore(f.root,{home:path.join(f.root,'state')}),{code:"STATE_PATH_UNSAFE"});
  const s=await f.store.begin(input);fs.linkSync(f.store.filePath,path.join(f.base,'hardlink.json'));
  assert.throws(()=>f.store.load(),{code:"STATE_PATH_UNSAFE"});
  await assert.rejects(f.store.checkpoint(s.revision,input.taskId,{knownIssues:"Next"}),{code:"STATE_PATH_UNSAFE"});
}));
