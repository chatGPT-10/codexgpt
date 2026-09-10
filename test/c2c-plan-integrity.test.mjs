import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import test from "node:test";
import {tsImport} from "tsx/esm/api";
const {readPlanSnapshot}=await tsImport('../src/c2c/planSnapshot.ts',import.meta.url);
const config={blockedGlobs:[],maxReadBytes:250000};
async function fixture(run){const root=fs.mkdtempSync(path.join(os.tmpdir(),'c2c-plan-'));fs.mkdirSync(path.join(root,'.ai-bridge'));const file=path.join(root,'.ai-bridge/current-plan.md');const text='\ufeff# Plan\r\n实现并验证。\r\n';fs.writeFileSync(file,text);const plan={protocol:1,state:'PLAN',taskId:'c2c_test',iteration:1,planPath:'.ai-bridge/current-plan.md',planSha256:createHash('sha256').update(text).digest('hex'),planBytes:Buffer.byteLength(text)};try{await run({root,file,text,plan});}finally{fs.rmSync(root,{recursive:true,force:true});}}
test('same-handle snapshot verifies raw BOM/CRLF bytes and hash',()=>fixture(async f=>{const s=await readPlanSnapshot(f.root,f.plan,config);assert.equal(s.text,f.text);assert.equal(s.sha256,f.plan.planSha256);assert.equal(s.bytes,f.plan.planBytes);assert.ok(Object.isFrozen(s));}));
test('hash/size mismatch, missing, binary, oversized and blocked plans fail closed',()=>fixture(async f=>{
 for(const plan of [{...f.plan,planSha256:'0'.repeat(64)},{...f.plan,planBytes:1}])await assert.rejects(readPlanSnapshot(f.root,plan,config),{code:'PLAN_MISMATCH'});
 await assert.rejects(readPlanSnapshot(f.root,f.plan,{...config,maxReadBytes:1}),{code:'PLAN_READ_FAILED'});
 await assert.rejects(readPlanSnapshot(f.root,f.plan,{...config,blockedGlobs:['**/current-plan.md']}),{code:'PLAN_READ_FAILED'});
 fs.writeFileSync(f.file,Buffer.from([0,255]));await assert.rejects(readPlanSnapshot(f.root,f.plan,config),{code:'PLAN_READ_FAILED'});
 fs.unlinkSync(f.file);await assert.rejects(readPlanSnapshot(f.root,f.plan,config),{code:'PLAN_READ_FAILED'});
}));
test('hardlinks, symlinks and known secret values cannot become an executable snapshot',()=>fixture(async f=>{
 fs.linkSync(f.file,path.join(f.root,'second'));await assert.rejects(readPlanSnapshot(f.root,f.plan,config),{code:'PLAN_READ_FAILED'});fs.unlinkSync(path.join(f.root,'second'));
 const text='npm'+'_'+'a'.repeat(30);fs.writeFileSync(f.file,text);await assert.rejects(readPlanSnapshot(f.root,{...f.plan,planSha256:createHash('sha256').update(text).digest('hex'),planBytes:Buffer.byteLength(text)},config),{code:'SECRET_BLOCKED'});
}));
test('junctioned plan parent is rejected even when it points inside the workspace',()=>fixture(async f=>{
 const parent=path.join(f.root,'.ai-bridge'),other=path.join(f.root,'other');fs.renameSync(parent,other);fs.symlinkSync(other,parent,process.platform==='win32'?'junction':'dir');
 await assert.rejects(readPlanSnapshot(f.root,f.plan,config),{code:'PLAN_READ_FAILED'});
}));
