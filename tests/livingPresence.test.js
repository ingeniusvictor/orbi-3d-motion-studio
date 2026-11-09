import test from 'node:test';
import assert from 'node:assert/strict';
import {smoothNoise,springStep,sampleIdlePose} from '../src/lib/livingPresence/motionPrimitives.js';
import {auditVrmRig,CRITICAL_ROLES} from '../src/lib/livingPresence/rigAudit.js';

test('LP-01 value noise is bounded, deterministic and locally continuous',()=>{
  for(let i=0;i<200;i++){
    const t=i*0.057;
    const a=smoothNoise(t,11);
    assert.equal(a,smoothNoise(t,11));
    assert.ok(Number.isFinite(a)&&a>=-1&&a<=1);
    assert.ok(Math.abs(smoothNoise(t+0.00001,11)-a)<0.001);
  }
});
test('LP-01 spring converges at variable frame intervals',()=>{
  for(const dt of [1/120,1/60,1/30,0.1]){
    let state={x:0,v:0};
    for(let i=0;i<100;i++)state=springStep(state,0.5,dt,1.25);
    assert.ok(Number.isFinite(state.x)&&Number.isFinite(state.v));
    assert.ok(Math.abs(state.x-0.5)<0.025);
  }
});
test('LP-01 idle is low-amplitude and disabled at zero',()=>{
  const active=sampleIdlePose(10.23,1);
  const off=sampleIdlePose(10.23,0);
  assert.equal(Object.keys(active).length,11);
  for(const [role,axes] of Object.entries(active)){
    assert.equal(axes.length,3,role);
    assert.ok(axes.every(x=>Number.isFinite(x)&&Math.abs(x)<0.04),role);
    assert.deepEqual(off[role],[0,0,0]);
  }
});
test('LP-01 rig audit observes bones without altering scene or VRM',()=>{
  const bones=Array.from({length:154},(_,i)=>({isBone:true,name:'bone_'+i}));
  const scene={traverse(fn){for(const node of bones)fn(node);}};
  const mapped=new Set(CRITICAL_ROLES);
  const humanoid={getNormalizedBoneNode:role=>mapped.has(role)?{name:role}:null};
  const vrm={scene,humanoid,meta:{metaVersion:'0'},springBoneManager:{}};
  const a=auditVrmRig(vrm);
  assert.equal(a.ok,true);
  assert.equal(a.totalBones,154);
  assert.equal(a.mappedHumanoidRoles,CRITICAL_ROLES.length);
  assert.equal(a.springBonesAvailable,true);
  assert.equal(bones[0].name,'bone_0');
});
test('LP-01 rig audit reports missing critical roles and unsupported inputs',()=>{
  assert.equal(auditVrmRig(null).ok,false);
  const scene={traverse(){}};
  const a=auditVrmRig({scene,humanoid:{getNormalizedBoneNode:()=>null}});
  assert.equal(a.ok,false);
  assert.equal(a.missingCritical.length,CRITICAL_ROLES.length);
});