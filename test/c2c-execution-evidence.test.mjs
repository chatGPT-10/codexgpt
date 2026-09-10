import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tsImport } from 'tsx/esm/api';
const {captureGitBaseline,changedPaths,checkSummarySchema}=await tsImport('../src/c2c/executionEvidence.ts',import.meta.url);
const config={maxReadBytes:250000,blockedGlobs:['**/.env']};
async function fixture(run) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'c2c-evidence-'));
  const git=(...args)=>execFileSync('git',['-C',root,...args],{windowsHide:true,stdio:'pipe'});
  try { git('init','--quiet'); fs.writeFileSync(path.join(root,'tracked.txt'),'base\n'); git('add','tracked.txt'); git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','core.hooksPath=/dev/null','commit','-qm','fixture'); await run({root,git}); }
  finally { fs.rmSync(root,{recursive:true,force:true}); }
}
test('baseline distinguishes old dirty content, new changes, staging and bridge artifacts',()=>fixture(async ({root,git})=>{
  fs.writeFileSync(path.join(root,'old.txt'),'old user work');
  const before=await captureGitBaseline(root,config);
  assert.equal(before.preexistingDirty,true);
  fs.writeFileSync(path.join(root,'tracked.txt'),'changed\n');
  fs.mkdirSync(path.join(root,'.ai-bridge')); fs.writeFileSync(path.join(root,'.ai-bridge/agent-status.md'),'status');
  const after=await captureGitBaseline(root,config);
  assert.deepEqual(changedPaths(before,after),['tracked.txt']);
  git('add','tracked.txt');
  const staged=await captureGitBaseline(root,config);
  assert.deepEqual(changedPaths(after,staged),['tracked.txt']);
  assert.notEqual(staged.diffSha256,after.diffSha256);
}));
test('baseline attributes a mode-only change on an already-dirty path', { skip: process.platform === 'win32' }, ()=>fixture(async ({root,git})=>{
  git('config','core.filemode','true');
  const file=path.join(root,'tracked.txt');
  fs.writeFileSync(file,'dirty content\n');
  fs.chmodSync(file,0o644);
  const before=await captureGitBaseline(root,config);
  fs.chmodSync(file,0o755);
  const after=await captureGitBaseline(root,config);
  assert.deepEqual(changedPaths(before,after),['tracked.txt']);
  assert.notEqual(before.files.find(entry=>entry.path==='tracked.txt').worktreeDiffSha256,after.files.find(entry=>entry.path==='tracked.txt').worktreeDiffSha256);
}));
test('blocked files, binary data, hardlinks and oversized content fail closed',()=>fixture(async ({root})=>{
  const file=path.join(root,'item.txt');
  fs.writeFileSync(path.join(root,'.env'),'PRIVATE=value');
  await assert.rejects(captureGitBaseline(root,config)); fs.unlinkSync(path.join(root,'.env'));
  fs.writeFileSync(file,Buffer.from([0,255])); await assert.rejects(captureGitBaseline(root,config));
  fs.writeFileSync(file,'data'); fs.linkSync(file,path.join(root,'linked.txt')); await assert.rejects(captureGitBaseline(root,config)); fs.unlinkSync(path.join(root,'linked.txt'));
  fs.writeFileSync(file,'a'.repeat(524289)); await assert.rejects(captureGitBaseline(root,config));
}));
test('repository environment injection is ignored and nested roots are refused',()=>fixture(async ({root})=>{
  const previous=process.env.GIT_DIR;
  const previousPath=process.env.PATH;
  process.env.GIT_DIR=path.join(root,'missing-git');
  process.env.PATH=path.join(root,'missing-executables');
  try { assert.equal((await captureGitBaseline(root,config)).preexistingDirty,false); }
  finally { if(previous===undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR=previous; if(previousPath===undefined) delete process.env.PATH; else process.env.PATH=previousPath; }
  fs.mkdirSync(path.join(root,'nested')); await assert.rejects(captureGitBaseline(path.join(root,'nested'),config));
}));
test('check summaries reject unknown outcomes, fields and credentials',()=>{
  assert.equal(checkSummarySchema.safeParse({name:'test',status:'passed',summary:'Exit 0'}).success,true);
  for(const value of [{name:'test',status:'success',summary:'ok'},{name:'test',status:'passed',summary:'ok',extra:true},{name:'test',status:'passed',summary:'npm'+'_'+'a'.repeat(30)}]) assert.equal(checkSummarySchema.safeParse(value).success,false);
});
test('configured clean filters and include directives are rejected before status can execute them',()=>fixture(async ({root,git})=>{
  fs.writeFileSync(path.join(root,'.gitattributes'),'*.txt filter=hostile\n');
  git('config','filter.hostile.clean','echo launched > marker.txt');
  fs.writeFileSync(path.join(root,'tracked.txt'),'trigger\n');
  await assert.rejects(captureGitBaseline(root,config),{code:'GIT_INTEGRATION_REQUIRED'});
  assert.equal(fs.existsSync(path.join(root,'marker.txt')),false);
  git('config','--remove-section','filter.hostile');
  git('config','include.path','missing-config');
  await assert.rejects(captureGitBaseline(root,config),{code:'GIT_INTEGRATION_REQUIRED'});
}));
