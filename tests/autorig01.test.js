import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {autoRigEligibility} from '../src/lib/autoRig/eligibility.js';

const preset=JSON.parse(readFileSync(new URL('../public/autorig01/humanoid_tpose.json',import.meta.url),'utf-8'));
const py=readFileSync(new URL('../tools/autorig01_blender.py',import.meta.url),'utf-8');
const ps1=readFileSync(new URL('../tools/autorig01_windows.ps1',import.meta.url),'utf-8');

test('AUTORIG-01 preset has normalized, finite, unique humanoid landmarks',()=>{
  assert.equal(preset.schemaVersion,1);
  assert.equal(preset.axes.vertical,'Z');
  assert.equal(preset.coordinateSystem,'normalized-imported-bounds');
  const names=Object.keys(preset.markers);
  assert.equal(names.length,22);
  assert.equal(new Set(names).size,names.length);
  for(const coords of Object.values(preset.markers)){
    assert.equal(coords.length,3);
    assert.ok(coords.every(x=>Number.isFinite(x)&&x>=0&&x<=1));
  }
});
test('AUTORIG-01 default T-Pose is anatomically ordered (reference only)',()=>{
  const m=preset.markers;
  for(const [a,b] of [['headTop','head'],['head','neck'],['neck','chest'],
    ['chest','spine'],['spine','pelvis'],
    ['leftHip','leftKnee'],['leftKnee','leftAnkle'],
    ['rightHip','rightKnee'],['rightKnee','rightAnkle']])
    assert.ok(m[a][2]>m[b][2],a+' must be higher than '+b);
  for(const side of ['left','right']){
    const sign=side==='left'?-1:1;
    const arm=['Shoulder','Elbow','Wrist','Hand'].map(part=>m[side+part]);
    for(let i=0;i<3;i++)
      assert.ok((arm[i+1][0]-arm[i][0])*sign>0,'arm chain goes outward');
    assert.ok(Math.max(...arm.map(p=>p[2]))-Math.min(...arm.map(p=>p[2]))<.05);
  }
});
test('AUTORIG-01 rejects rigs or animations at the UI gate',()=>{
  assert.equal(autoRigEligibility(null).ok,false);
  assert.equal(autoRigEligibility({format:'FBX',bones:0,animations:0,meshes:1}).ok,false);
  assert.equal(autoRigEligibility({format:'VRM',bones:488,animations:1,meshes:1}).ok,false);
  assert.equal(autoRigEligibility({format:'GLB',bones:19,animations:0,meshes:1}).ok,false);
  assert.equal(autoRigEligibility({format:'GLB',bones:0,animations:1,meshes:1}).ok,false);
  assert.equal(autoRigEligibility({format:'GLB',bones:0,animations:0,meshes:0}).ok,false);
  assert.equal(autoRigEligibility({format:'GLB',bones:0,animations:0,meshes:1}).ok,true);
});
test('AUTORIG-01 Python module parses with Blender-independent Python AST when installed',t=>{
  const cmd=process.platform==='win32'?'python':'python3';
  const result=spawnSync(cmd,['-c','import ast,sys;ast.parse(open(sys.argv[1],encoding="utf-8").read())',
    fileURLToPath(new URL('../tools/autorig01_blender.py',import.meta.url))],{encoding:'utf8'});
  if(result.error?.code==='ENOENT'){t.diagnostic('Python not installed; syntax smoke test deferred to CI.');return;}
  assert.equal(result.status,0,result.stderr);
});
test('AUTORIG-01 runner preserves original and uses two-stage explicit operations',()=>{
  assert.match(py,/--mode/);
  assert.match(py,/ARMATURE_AUTO/);
  assert.match(py,/MARKERS_PENDING_USER_REVIEW/);
  assert.match(py,/sha256\(source\)==source_hash/);
  assert.match(py,/CANDIDATE_REQUIRES_VISUAL_QA/);
  assert.match(ps1,/\[ValidateSet\("prepare","rig"\)\]/);
  assert.match(ps1,/--workspace/);
  assert.match(ps1,/\$BlenderExe --background/);
});
