import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';
import {readFileSync} from 'node:fs';
import {
  auditLumiaV09Body,LumiaV09BodyPresence,
} from '../src/lib/livingPresence/lumiaV09BodyPresence.js';
import {MotionViewer} from '../src/lib/viewer.js';
import {describeLpCapabilities} from '../src/lib/livingPresence/lpCapabilities.js';

function makeV09({version='claude-v09',badParent=false}={}){
  const names=[
    'V8_root','V8_Bip001-Pelvis','V8_Bip001-Spine',
    'V8_Bip001-Spine1','V8_Bip001-Spine2',
    'J_Bip_C_Neck','J_Bip_C_Head',
    'V8_Bip001-L-UpperArm','V8_Bip001-L-Hand',
    'V8_Bip001-R-UpperArm','V8_Bip001-R-Hand',
    ...['L','R'].flatMap(side=>[0,1,2,3,4]
      .map(i=>'V8_Bip001-'+side+'-Finger'+i)),
  ];
  while(names.length<346)names.push('V09_Other_'+names.length);
  const bones=names.map(name=>{const b=new THREE.Bone();b.name=name;return b;});
  const map=new Map(bones.map(b=>[b.name,b]));
  const link=(child,parent)=>map.get(parent).add(map.get(child));
  link('V8_Bip001-Pelvis','V8_root');
  link('V8_Bip001-Spine','V8_Bip001-Pelvis');
  link('V8_Bip001-Spine1','V8_Bip001-Spine');
  link('V8_Bip001-Spine2','V8_Bip001-Spine1');
  link('J_Bip_C_Neck','V8_Bip001-Spine2');
  link('J_Bip_C_Head','J_Bip_C_Neck');
  for(const side of ['L','R']){
    link('V8_Bip001-'+side+'-UpperArm',
      badParent&&side==='R'?'V8_root':'V8_Bip001-Spine2');
    link('V8_Bip001-'+side+'-Hand','V8_Bip001-'+side+'-UpperArm');
    for(let i=0;i<5;i++)link('V8_Bip001-'+side+'-Finger'+i,
      'V8_Bip001-'+side+'-Hand');
  }
  for(const bone of bones)
    if(!bone.parent&&bone!==map.get('V8_root'))map.get('V8_root').add(bone);
  const y=version==='claude-v09'?{pelvis:.9432,head:1.4177}:
    {pelvis:1.0564,head:1.5835};
  const inverse=bones.map(b=>new THREE.Matrix4().makeTranslation(0,
    b.name==='V8_Bip001-Pelvis'?-y.pelvis:
    b.name==='J_Bip_C_Head'?-y.head:0,0));
  const skin=new THREE.Skeleton(bones,inverse);
  const mesh=new THREE.SkinnedMesh(
    new THREE.BoxGeometry(.1,.2,.1),new THREE.MeshBasicMaterial());
  mesh.name='V09 skin';mesh.skeleton=skin;
  const root=new THREE.Group();root.add(map.get('V8_root'),mesh);
  const geom=mesh.geometry;
  const vertices=geom.getAttribute('position').array.slice();
  root.updateMatrixWorld(true,true);
  return {root,bones:map,skin,mesh,vertices};
}

test('LP-04 exact V09 skeleton is eligible; other 346 bone rest profiles fail closed',()=>{
  const good=makeV09();
  const audit=auditLumiaV09Body(good.root);
  assert.equal(audit.ok,true);
  assert.equal(audit.bones,346);
  assert.equal(audit.fingerCount,10);
  assert.equal(audit.profile.version,'claude-v09');
  const other=auditLumiaV09Body(makeV09({version:'v06b'}).root);
  assert.equal(other.ok,false);
  assert.equal(other.profile.version,'v06b');
  assert.equal(auditLumiaV09Body(makeV09({badParent:true}).root).ok,false);
  assert.equal(auditLumiaV09Body(new THREE.Group()).ok,false);
});

test('LP-04 no bone changes before opt-in, breath and head reversible with default safe options',()=>{
  const {root,bones,mesh,skin,vertices}=makeV09();
  const motor=new LumiaV09BodyPresence(root);
  const head=bones.get('J_Bip_C_Head');
  const torso=bones.get('V8_Bip001-Spine2');
  const arm=bones.get('V8_Bip001-L-UpperArm');
  const finger=bones.get('V8_Bip001-L-Finger0');
  const baseline=new Map([head,torso,arm,finger].map(b=>[b,b.quaternion.clone()]));
  assert.equal(motor.update(.03,{clipSelected:false}),false);
  assert.equal(motor.setEnabled(true),true);
  assert.equal(motor.getStatus().options.arms,false);
  assert.equal(motor.getStatus().options.fingers,false);
  for(let i=0;i<30;i++){
    motor.beforeFrame();
    motor.update(1/60,{clipSelected:false});
  }
  assert.ok(head.quaternion.angleTo(baseline.get(head))>1e-7);
  assert.ok(torso.quaternion.angleTo(baseline.get(torso))>1e-7);
  assert.ok(arm.quaternion.angleTo(baseline.get(arm))<1e-8);
  assert.ok(finger.quaternion.angleTo(baseline.get(finger))<1e-8);
  motor.beforeFrame();
  for(const [bone,rest] of baseline)
    assert.ok(bone.quaternion.angleTo(rest)<1e-8);
  assert.deepEqual(mesh.geometry.getAttribute('position').array,vertices);
  assert.equal(mesh.skeleton,skin);
  assert.equal(motor.setEnabled(false),true);
  motor.dispose();
});

test('LP-04 arms and fingers remain separate and stop completely for ANY selected animation',()=>{
  const {root,bones}=makeV09();
  const motor=new LumiaV09BodyPresence(root);
  motor.setEnabled(true);
  motor.setOptions({arms:true,fingers:true});
  for(let i=0;i<20;i++){motor.beforeFrame();motor.update(1/60);}
  const finger=bones.get('V8_Bip001-L-Finger0');
  assert.ok(finger.quaternion.angleTo(new THREE.Quaternion())>0);
  const restored=motor.update(.02,{clipSelected:true});
  assert.equal(restored,false);
  assert.equal(motor.getStatus().suspendedForClip,true);
  assert.ok(finger.quaternion.angleTo(new THREE.Quaternion())<1e-8);
  motor.update(.02,{clipSelected:true});
  assert.equal(motor.applied.size,0);
  motor.setEnabled(false);motor.dispose();
});

test('LP-04 prevents destructive restoration if external editing changed a preview bone',()=>{
  const {root,bones}=makeV09();
  const motor=new LumiaV09BodyPresence(root);
  motor.setEnabled(true);
  motor.update(.08);
  const head=bones.get('J_Bip_C_Head');
  const userEdit=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.2);
  head.quaternion.copy(userEdit);
  motor.release();
  assert.ok(head.quaternion.angleTo(userEdit)<1e-8);
  assert.equal(motor.applied.size,0);
  motor.dispose();
});

test('LP-04 export-suspension restores raw pose without committing any changes',async()=>{
  const {root,bones,mesh,vertices}=makeV09();
  const motor=new LumiaV09BodyPresence(root);
  motor.setEnabled(true);motor.update(.07);
  assert.ok(motor.applied.size>0);
  const viewer=Object.create(MotionViewer.prototype);
  viewer.model=root;viewer.vrm=null;viewer.bodyPresence=motor;
  viewer.presenceSuspendCount=0;
  let measured=0;
  await viewer.withPresenceSuspended(async()=>{
    measured++;
    assert.equal(viewer.presenceSuspendCount,1);
    assert.equal(motor.applied.size,0);
    assert.ok(bones.get('J_Bip_C_Head').quaternion.angleTo(
      new THREE.Quaternion())<1e-8);
    assert.deepEqual(mesh.geometry.getAttribute('position').array,vertices);
  });
  assert.equal(measured,1);
  assert.equal(viewer.presenceSuspendCount,0);
  motor.dispose();
});

test('LP-04 capability remains partial and truthful for GLB, full LP-01 remains VRM-only',()=>{
  const {root}=makeV09();
  const motor=new LumiaV09BodyPresence(root);
  const facade={
    model:root,vrm:null,getLumiaV09BodyStatus:()=>motor.getStatus(),
    getLivingFacialDiagnostics:()=>({supported:true}),
    getLivingLipDiagnostics:()=>({supported:true}),
    getLivingComposerStatus:()=>null,
  };
  const statuses=Object.fromEntries(describeLpCapabilities({
    format:'GLB',bones:346},facade).map(x=>[x.id,x]));
  assert.equal(statuses.lp01.state,'requires-vrm');
  assert.equal(statuses.lp04.state,'partial');
  assert.equal(statuses.lp03d.state,'available');
  assert.equal(statuses.lp03c.state,'available');
  motor.dispose();
});

test('LP-04 safe body panel renders in Studio-09 without replacing main viewer or VRM panels',async()=>{
  const vite=await createServer({
    server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'silent',
  });
  try{
    const {default:LumiaV09BodyLab}=await vite.ssrLoadModule(
      '/src/LumiaV09BodyLab.jsx');
    const {root}=makeV09();
    const motor=new LumiaV09BodyPresence(root);
    const model={format:'GLB',bones:346,filename:'LUMIA_CLAUDE_MAESTRA_346.glb'};
    const getViewer=()=>({getLumiaV09BodyStatus:()=>motor.getStatus()});
    const html=renderToString(React.createElement(LumiaV09BodyLab,{
      model,getViewer,generation:1,
    }));
    assert.match(html,/LP-04/);
    assert.match(html,/Respiración suave/);
    assert.match(html,/Cabeza y cuello/);
    assert.match(html,/Dedos · experimental/);
    assert.match(html,/346 huesos/);
    assert.ok(!html.includes('disabled=""')||html.includes('experimental'));
    assert.equal(renderToString(React.createElement(LumiaV09BodyLab,{
      model:{format:'VRM'},getViewer,generation:1,
    })),'');
    motor.dispose();
  }finally{await vite.close();}
  const viewer=readFileSync(new URL('../src/lib/viewer.js',import.meta.url),'utf8');
  const lp=readFileSync(new URL('../src/LivingPresenceLab.jsx',import.meta.url),'utf8');
  assert.match(viewer,/new LumiaV09BodyPresence\(this\.model\)/);
  assert.match(viewer,/this\.bodyPresence\?\.beforeFrame\(\)/);
  assert.match(viewer,/clipSelected:this\.current !== null/);
  assert.match(lp,/<LumiaV09BodyLab/);
  assert.match(lp,/disabled=\{!canUse\}/);
});
