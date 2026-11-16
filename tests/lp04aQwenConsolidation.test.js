import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';
import {readFileSync} from 'node:fs';
import {LumiaV09BodyPresence,auditLumiaV09Body} from
  '../src/lib/livingPresence/lumiaV09BodyPresence.js';
import {VoiceMotorBridge,bindMediaElementMotor} from
  '../src/lib/livingPresence/voiceMotorBridge.js';
import {validateMotorIntent,MOTOR_INTENT_SCHEMA} from
  '../src/lib/livingPresence/ollamaMotorIntent.js';
import {MotionViewer} from '../src/lib/viewer.js';

// Minimal synthetic 346-joint proxy for the *two* approved artistic masters.
// Both real GLBs were separately audited locally using their actual JSON/BIN.
function makeApprovedRig(){
  const names=[
    'V8_root','V8_Bip001-Pelvis','V8_Bip001-Spine',
    'V8_Bip001-Spine1','V8_Bip001-Spine2','J_Bip_C_Neck',
    'J_Bip_C_Head','V8_Bip001-L-UpperArm','V8_Bip001-R-UpperArm',
    'V8_Bip001-L-Hand','V8_Bip001-R-Hand',
    'V8_Bip001-L-Foot','V8_Bip001-R-Foot',
    ...['L','R'].flatMap(side=>[0,1,2,3,4]
      .map(n=>'V8_Bip001-'+side+'-Finger'+n)),
  ];
  while(names.length<346)names.push('Test_joint_'+names.length);
  const bones=names.map(name=>{const b=new THREE.Bone();b.name=name;return b;});
  const map=new Map(bones.map(b=>[b.name,b]));
  const add=(child,parent)=>map.get(parent).add(map.get(child));
  add('V8_Bip001-Pelvis','V8_root');
  add('V8_Bip001-Spine','V8_Bip001-Pelvis');
  add('V8_Bip001-Spine1','V8_Bip001-Spine');
  add('V8_Bip001-Spine2','V8_Bip001-Spine1');
  add('J_Bip_C_Neck','V8_Bip001-Spine2');
  add('J_Bip_C_Head','J_Bip_C_Neck');
  for(const side of ['L','R']){
    add('V8_Bip001-'+side+'-UpperArm','V8_Bip001-Spine2');
    add('V8_Bip001-'+side+'-Hand','V8_Bip001-'+side+'-UpperArm');
    for(let n=0;n<5;n++)add('V8_Bip001-'+side+'-Finger'+n,
      'V8_Bip001-'+side+'-Hand');
  }
  for(const bone of bones)
    if(!bone.parent&&bone!==map.get('V8_root'))map.get('V8_root').add(bone);
  const inverse=bones.map(b=>new THREE.Matrix4().makeTranslation(0,
    b.name==='V8_Bip001-Pelvis'?-.94325:
    b.name==='J_Bip_C_Head'?-1.4177:0,0));
  const root=new THREE.Group();
  const geometry=new THREE.BoxGeometry(.1,.3,.1);
  const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial());
  mesh.skeleton=new THREE.Skeleton(bones,inverse);
  root.add(map.get('V8_root'),mesh);
  return {root,map,mesh,geometry};
}
const intention=(patch={})=>validateMotorIntent({
  schema:MOTOR_INTENT_SCHEMA,
  dialogue:'LUMIA te escucha. Vamos a revisar juntos el movimiento.',
  motorMode:'explaining',gesture:'acknowledge',
  attentionTarget:'interlocutor',intensity:.35,...patch,
});
const v09Viewer=root=>{
  const viewer=Object.create(MotionViewer.prototype);
  viewer.model=root;viewer.vrm=null;viewer.presence=null;
  viewer.bodyPresence=new LumiaV09BodyPresence(root);
  viewer.fbxFace=null;viewer.lipSync=null;viewer.facial=null;
  viewer.current=null;viewer.mixer=null;viewer.playing=false;
  viewer.presenceSuspendCount=0;
  return viewer;
};

test('LP-04A integrates into the EXISTING LP-04 director, no parallel skeleton motor',()=>{
  const {root}=makeApprovedRig();
  assert.equal(auditLumiaV09Body(root).ok,true);
  const viewer=v09Viewer(root);
  assert.equal(viewer.bodyPresence.getStatus().supported,true);
  assert.equal(viewer.getLivingSpeechMotorAvailability().available,false);
  assert.equal(viewer.setLumiaV09BodyEnabled(true),true);
  assert.equal(viewer.getLivingSpeechMotorAvailability().available,true);
  assert.equal(viewer.bodyPresence.getStatus().motor.enabled,false);
  assert.equal(viewer.getLivingMotorStatus().mode,'resting');
  assert.ok(viewer.bodyPresence.coordinator);
  assert.ok(viewer.bodyPresence.gestures);
  assert.equal(viewer.glbAutonomy,undefined,
    'No duplicate GlbAutonomyDirector may control the same bones');
  viewer.bodyPresence.dispose();
});

test('LP-04A intent cannot move the body before real voice start; audio starts one gesture',()=>{
  const {root,map,mesh}=makeApprovedRig();
  const viewer=v09Viewer(root);
  viewer.setLumiaV09BodyEnabled(true);
  viewer.setLivingMotorIntensity(.21);
  const bridge=new VoiceMotorBridge(()=>viewer);
  const head=map.get('J_Bip_C_Head');
  const foot=map.get('V8_Bip001-L-Foot');
  const rootBone=map.get('V8_root');
  const pelvis=map.get('V8_Bip001-Pelvis');
  const headRest=head.quaternion.clone(),footRest=foot.quaternion.clone();
  const geo=mesh.geometry.getAttribute('position').array.slice();
  const token=bridge.prepare(intention(),{lipSource:'browser'});
  assert.equal(bridge.getStatus().status,'prepared');
  assert.equal(viewer.getLivingGestureStatus().current,null);
  assert.equal(viewer.getLivingMotorStatus().enabled,false);
  assert.equal(head.quaternion.angleTo(headRest),0);
  assert.equal(bridge.start(token),true);
  assert.equal(bridge.start(token),false);
  assert.equal(viewer.getLivingMotorStatus().mode,'explaining');
  assert.equal(viewer.getLivingMotorStatus().intensity,.35);
  assert.equal(viewer.getLivingGestureStatus().current,'acknowledge');
  for(let i=0;i<12;i++){
    viewer.bodyPresence.beforeFrame();
    viewer.bodyPresence.update(1/60,{clipSelected:false});
  }
  assert.ok(head.quaternion.angleTo(headRest)>0);
  assert.equal(foot.quaternion.angleTo(footRest),0);
  assert.equal(rootBone.quaternion.angleTo(new THREE.Quaternion()),0);
  assert.equal(pelvis.quaternion.angleTo(new THREE.Quaternion()),0);
  assert.deepEqual(mesh.geometry.getAttribute('position').array,geo);
  viewer.bodyPresence.beforeFrame();
  assert.ok(head.quaternion.angleTo(headRest)<1e-6);
  assert.equal(bridge.end(token,'ended'),true);
  assert.equal(viewer.getLivingGestureStatus().current,null);
  assert.equal(viewer.getLivingMotorStatus().mode,'resting');
  assert.equal(viewer.getLivingMotorStatus().enabled,false);
  assert.equal(viewer.getLivingMotorStatus().intensity,.21,
    'User-owned GLB motor strength must be restored after speech');
  assert.equal(viewer.getLumiaV09BodyStatus().enabled,true,
    'User consent and idle breathing survive a completed utterance');
  viewer.bodyPresence.dispose();
});

test('LP-04A pause stops Qwen movement, resume without duplicate gesture, error ends cleanly',()=>{
  const {root}=makeApprovedRig(),viewer=v09Viewer(root);
  viewer.setLumiaV09BodyEnabled(true);
  const bridge=new VoiceMotorBridge(()=>viewer);
  const token=bridge.prepare(intention({gesture:'curious',motorMode:'thinking'}));
  assert.equal(bridge.start(token),true);
  assert.equal(viewer.getLivingGestureStatus().current,'curious');
  assert.equal(bridge.pause(token),true);
  assert.equal(viewer.getLivingMotorStatus().enabled,false);
  assert.equal(viewer.getLivingGestureStatus().current,null);
  assert.equal(bridge.resume(token),true);
  assert.equal(viewer.getLivingMotorStatus().enabled,true);
  assert.equal(viewer.getLivingGestureStatus().current,null);
  assert.equal(bridge.end(token,'error'),true);
  assert.equal(viewer.getLivingMotorStatus().enabled,false);
  assert.equal(viewer.getLivingMotorStatus().mode,'resting');
  viewer.bodyPresence.dispose();
});

test('LP-04A selected Mixamo clip wins even when PAUSED; voice still allowed without motor',()=>{
  const {root,map}=makeApprovedRig(),viewer=v09Viewer(root);
  viewer.setLumiaV09BodyEnabled(true);
  viewer.current=0;viewer.playing=false;viewer.mixer={};
  assert.equal(viewer.getLivingSpeechMotorAvailability().available,false);
  const bridge=new VoiceMotorBridge(()=>viewer);
  const token=bridge.prepare(intention({gesture:'emphasize'}));
  assert.equal(bridge.start(token),true);
  assert.equal(bridge.getStatus().motorApplied,false);
  assert.equal(viewer.triggerLivingGesture('emphasize'),false);
  const head=map.get('J_Bip_C_Head'),base=head.quaternion.clone();
  const changed=viewer.bodyPresence.update(.05,{clipSelected:true});
  assert.equal(changed,false);
  assert.ok(head.quaternion.angleTo(base)<1e-7);
  assert.equal(viewer.bodyPresence.getStatus().suspendedForClip,true);
  bridge.end(token,'ended');
  viewer.bodyPresence.dispose();
});

test('LP-04A stale queued/playing audio cannot affect a different GLB in SAME viewer',()=>{
  const {root}=makeApprovedRig(),viewer=v09Viewer(root);
  viewer.setLumiaV09BodyEnabled(true);
  const bridge=new VoiceMotorBridge(()=>viewer);
  const stale=bridge.prepare(intention());
  const second=makeApprovedRig();
  viewer.model=second.root;
  viewer.bodyPresence.dispose();
  viewer.bodyPresence=new LumiaV09BodyPresence(second.root);
  viewer.bodyPresence.setEnabled(true);
  assert.equal(bridge.start(stale),false,'queued TTS belongs to previous rig');
  assert.equal(viewer.getLivingMotorStatus().enabled,false);
  const fresh=bridge.prepare(intention({gesture:'curious'}));
  assert.equal(bridge.start(fresh),true);
  assert.equal(viewer.getLivingGestureStatus().current,'curious');
  viewer.model=root; // move again while speech is underway
  const preserve=viewer.getLivingMotorStatus().mode;
  assert.equal(bridge.pause(fresh),false);
  assert.equal(viewer.getLivingMotorStatus().mode,preserve,
    'stale session cannot revert settings after model identity changes');
  viewer.bodyPresence.dispose();
});

test('LP-04A rejects arbitrary commands, over-intensity and unaudited gesture names',()=>{
  const {root}=makeApprovedRig(),viewer=v09Viewer(root);
  viewer.setLumiaV09BodyEnabled(true);
  for(const invalid of ['executeJavascript','twist_pelvis','move_finger_180'])
    assert.equal(viewer.triggerLivingGesture(invalid),false);
  assert.equal(viewer.setLivingMotorMode('run_shell'),false);
  assert.equal(viewer.setLivingMotorIntensity(999),true);
  assert.equal(viewer.getLivingMotorStatus().intensity,.65);
  assert.equal(viewer.setLivingMotorIntensity(Infinity),false);
  assert.equal(viewer.setLivingAttentionTarget('https://example.org'),false);
  assert.throws(()=>intention({gesture:'arbitraryBone'}));
  assert.throws(()=>intention({motorMode:'eval()'}));
  const malicious=intention({execute:'remove files',intensity:99});
  assert.equal(malicious.execute,undefined);
  assert.equal(malicious.intensity,.75);
  viewer.bodyPresence.dispose();
});

test('LP-04A ending or aborting real audio restores session and invalidates late events',()=>{
  const {root}=makeApprovedRig(),viewer=v09Viewer(root);
  viewer.setLumiaV09BodyEnabled(true);
  const bridge=new VoiceMotorBridge(()=>viewer);
  const listeners=new Map();
  const audio={ended:false,
    addEventListener(name,fn){listeners.set(name,fn);},
    removeEventListener(name,fn){if(listeners.get(name)===fn)listeners.delete(name);},
  };
  const token=bridge.prepare(intention());
  const detach=bindMediaElementMotor(audio,bridge,token);
  assert.equal(bridge.getStatus().status,'prepared');
  listeners.get('playing')();
  assert.equal(bridge.getStatus().status,'speaking');
  listeners.get('pause')();
  assert.equal(bridge.getStatus().status,'paused');
  listeners.get('playing')();
  assert.equal(bridge.getStatus().status,'speaking');
  listeners.get('abort')();
  assert.equal(bridge.getStatus().status,'cancelled');
  assert.equal(viewer.getLivingMotorStatus().enabled,false);
  listeners.get('playing')();
  assert.equal(viewer.getLivingMotorStatus().enabled,false);
  detach();assert.equal(listeners.size,0);
  viewer.bodyPresence.dispose();
});

test('LP-04A export releases Qwen speech and gesture preview without baking animation',async()=>{
  const {root,map}=makeApprovedRig(),viewer=v09Viewer(root);
  viewer.setLumiaV09BodyEnabled(true);
  const bridge=new VoiceMotorBridge(()=>viewer);
  const token=bridge.prepare(intention({gesture:'emphasize'}));
  bridge.start(token);
  viewer.bodyPresence.update(.07,{clipSelected:false});
  assert.ok(viewer.bodyPresence.applied.size>0);
  await viewer.withPresenceSuspended(async()=>{
    assert.equal(viewer.bodyPresence.applied.size,0);
    assert.equal(map.get('J_Bip_C_Head').quaternion.angleTo(
      new THREE.Quaternion()),0);
    assert.equal(viewer.presenceSuspendCount,1);
  });
  bridge.end(token);viewer.bodyPresence.dispose();
});

test('LP-04A voice permission and existing LP-04 body panel share one viewer motor',async()=>{
  const vite=await createServer({appType:'custom',
    server:{middlewareMode:true,hmr:false},logLevel:'silent'});
  try{
    const {default:VoiceMotorLab}=await vite.ssrLoadModule('/src/VoiceMotorLab.jsx');
    const {root}=makeApprovedRig(),viewer=v09Viewer(root);
    const model={format:'GLB',filename:'LUMIA_CUERPO_BASE.glb',bones:346};
    const html=renderToString(React.createElement(VoiceMotorLab,{
      model,getViewer:()=>viewer,generation:1,activeClip:null,
      voiceQARef:{current:null},onVoiceQAState:()=>{},
    }));
    assert.match(html,/LP-04A/);
    assert.match(html,/MISMO motor LP-04/);
    assert.match(html,/Autorizar movimiento y reproducción de voz/);
    assert.equal(html.includes('GlbAutonomyDirector'),false);
    const bodySource=readFileSync(new URL('../src/LumiaV09BodyLab.jsx',
      import.meta.url),'utf8');
    assert.match(bodySource,/checked=\{Boolean\(status\.enabled\)\}/);
    const viewerSource=readFileSync(new URL('../src/lib/viewer.js',
      import.meta.url),'utf8');
    assert.doesNotMatch(viewerSource,/new GlbAutonomyDirector/);
    assert.match(viewerSource,/new LumiaV09BodyPresence/);
    assert.match(viewerSource,/this\.current!==null/);
    viewer.bodyPresence.dispose();
  }finally{await vite.close();}
});
