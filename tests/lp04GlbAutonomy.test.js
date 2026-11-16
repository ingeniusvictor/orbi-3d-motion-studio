import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GlbAutonomyDirector} from '../src/lib/livingPresence/glbAutonomyDirector.js';
import {VoiceMotorBridge} from '../src/lib/livingPresence/voiceMotorBridge.js';
import {MOTOR_INTENT_SCHEMA} from '../src/lib/livingPresence/ollamaMotorIntent.js';

function lumiaFixture(){
  const root=new THREE.Group(),body=new THREE.Bone();body.name='V8_root';root.add(body);
  const names=[
    'V8_root','V8_Bip001-Pelvis','V8_Bip001-Spine1','V8_Bip001-Spine2',
    'V8_Bip001-Neck','J_Bip_C_Head','V8_Bip001-L-UpperArm',
    'V8_Bip001-R-UpperArm','V8_Bip001-L-Hand','V8_Bip001-R-Hand',
    'V8_Bip001-L-Foot','V8_Bip001-R-Foot',
    'V8_Bip001-L-Toe0','V8_Bip001-R-Toe0',
  ];
  const bones=[body];
  for(const name of names.slice(1)){
    const bone=new THREE.Bone();bone.name=name;
    bone.position.y=0.01;body.add(bone);bones.push(bone);
  }
  while(bones.length<346){
    const bone=new THREE.Bone();
    bone.name='fixture_joint_'+bones.length;
    body.add(bone);bones.push(bone);
  }
  const geometry=new THREE.BoxGeometry(0.2,0.2,0.2);
  const indices=new Uint16Array(geometry.attributes.position.count*4);
  const weights=new Float32Array(indices.length);
  for(let i=0;i<weights.length;i+=4)weights[i]=1;
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const material=new THREE.MeshBasicMaterial();
  const mesh=new THREE.SkinnedMesh(geometry,material);
  root.add(mesh);root.updateWorldMatrix(true,true);
  mesh.bind(new THREE.Skeleton(bones));
  return {root,bones,mesh,geometry};
}
const get=(root,name)=>root.getObjectByName(name);

test('LP-04A refuses unknown or incomplete GLB rigs without adjusting a bone',()=>{
  const root=new THREE.Group();
  const d=new GlbAutonomyDirector(root);
  assert.equal(d.eligible,false);
  assert.equal(d.setEnabled(true),false);
  assert.equal(d.triggerGesture('acknowledge'),false);
  assert.equal(d.update(.016).applied,false);
  const {root:full}=lumiaFixture();
  get(full,'J_Bip_C_Head').name='missing_head';
  const missing=new GlbAutonomyDirector(full);
  assert.equal(missing.eligible,false);
  assert.equal(missing.setEnabled(true),false);
});

test('LP-04A opt-in idle adds small, reversible GLB overlays without touching rig or skin',()=>{
  const {root,geometry,bones}=lumiaFixture();
  const director=new GlbAutonomyDirector(root);
  assert.equal(director.eligible,true);
  assert.equal(director.enabled,false);
  assert.equal(director.update(.016).applied,false);
  const head=get(root,'J_Bip_C_Head'),toe=get(root,'V8_Bip001-L-Toe0');
  const headRest=head.quaternion.clone(),toeRest=toe.quaternion.clone();
  const nodePositions=bones.map(b=>b.position.toArray());
  const skinIndices=geometry.attributes.skinIndex.array.slice();
  const skinWeights=geometry.attributes.skinWeight.array.slice();
  assert.equal(director.setEnabled(true),true);
  const status=director.update(.05);
  assert.equal(status.applied,true);
  assert.ok(status.maxDegrees<5);
  assert.ok(head.quaternion.angleTo(headRest)>0);
  assert.ok(toe.quaternion.equals(toeRest),'Feet must never be animated by LP-04A');
  director.beforeFrame();
  assert.ok(head.quaternion.equals(headRest),'All local quaternions must restore exactly');
  director.update(.05);
  director.setEnabled(false);
  assert.ok(head.quaternion.equals(headRest),'Disabling must restore source pose');
  assert.deepEqual(bones.map(b=>b.position.toArray()),nodePositions);
  assert.deepEqual(geometry.attributes.skinIndex.array,skinIndices);
  assert.deepEqual(geometry.attributes.skinWeight.array,skinWeights);
  director.dispose();
});

test('LP-04A refuses invalid intents and never overlays a playing Mixamo dance',()=>{
  const {root}=lumiaFixture(),d=new GlbAutonomyDirector(root);
  d.setEnabled(true);
  assert.equal(d.setMotorMode('run-arbitrary-code'),false);
  d.setGestureEnabled(true);
  assert.equal(d.triggerGesture('unknown'),false);
  assert.equal(d.triggerGesture('acknowledge'),true);
  const head=get(root,'J_Bip_C_Head'),initial=head.quaternion.clone();
  assert.equal(d.update(.08,{clipPlaying:true}).applied,false);
  assert.ok(head.quaternion.equals(initial));
  assert.equal(d.getGestureStatus().current,null);
  assert.equal(d.update(.08,{clipPlaying:false}).applied,true);
  d.beforeFrame();assert.ok(head.quaternion.equals(initial));
});

test('LP-04A only executes validated Qwen intentions after audible playback begins',()=>{
  const {root}=lumiaFixture(),d=new GlbAutonomyDirector(root);
  d.setEnabled(true);
  const viewer={
    presence:{},
    getLivingSpeechMotorAvailability:()=>({available:true}),
    getLivingMotorStatus:()=>d.getMotorStatus(),
    getLivingGestureStatus:()=>d.getGestureStatus(),
    setLivingMotorCoordination:v=>d.setMotorEnabled(v),
    setLivingGestureEnabled:v=>d.setGestureEnabled(v),
    setLivingMotorMode:v=>d.setMotorMode(v),
    setLivingGestureIntensity:v=>d.setGestureIntensity(v),
    triggerLivingGesture:v=>d.triggerGesture(v),
    startLivingLipSync:()=>false,
    startLivingFaceSpeech:()=>false,
  };
  const bridge=new VoiceMotorBridge(()=>viewer);
  const token=bridge.prepare({
    schema:MOTOR_INTENT_SCHEMA,dialogue:'Te escucho.',
    motorMode:'attentive',gesture:'acknowledge',
    attentionTarget:'interlocutor',intensity:0.35,
  });
  assert.equal(d.getGestureStatus().current,null);
  assert.equal(bridge.getStatus().status,'prepared');
  assert.equal(bridge.start(token),true);
  assert.equal(d.getGestureStatus().current,'acknowledge');
  assert.equal(d.getMotorStatus().mode,'attentive');
  assert.equal(bridge.end(token,'ended'),true);
  assert.equal(d.getMotorStatus().mode,'resting');
  assert.equal(d.getGestureStatus().current,null);
  assert.equal(d.getMotorStatus().enabled,true,'Resting remains enabled by user consent');
});
