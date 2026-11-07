import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AnimationClip, AnimationMixer, Bone, Group, Quaternion,
  QuaternionKeyframeTrack, VectorKeyframeTrack, Vector3
} from 'three';
import {MotionComposer,classifyIdleClip,analyzeQuaternionTrack}
  from '../src/lib/livingPresence/motionComposer.js';
import {LivingPresence} from '../src/lib/livingPresence/LivingPresence.js';

const fingerNames=['Thumb','Index','Middle','Ring','Little'];
const joints=finger=>finger==='Thumb'?
  ['Metacarpal','Proximal','Distal']:['Proximal','Intermediate','Distal'];
const qValues=(q0,q1)=>[...q0.toArray(),...q1.toArray()];
function syntheticVrm() {
  const scene=new Group(), nodes=new Map();
  const hips=new Bone();hips.name='hips';hips.position.set(0,1,0);
  scene.add(hips);nodes.set('hips',hips);
  const head=new Bone();head.name='head';head.position.set(0,0.75,0);
  hips.add(head);nodes.set('head',head);
  const torso=new Bone();torso.name='spine';hips.add(torso);nodes.set('spine',torso);
  for(const [side,sign] of [['left',1],['right',-1]]){
    const upper=new Bone();upper.name=side+'UpperArm';
    upper.position.set(sign*0.36,0.5,0);
    hips.add(upper);nodes.set(upper.name,upper);
    const lower=new Bone();lower.name=side+'LowerArm';
    lower.position.set(sign*0.38,0,0);
    upper.add(lower);nodes.set(lower.name,lower);
    const hand=new Bone();hand.name=side+'Hand';
    hand.position.set(sign*0.30,0,0);
    lower.add(hand);nodes.set(hand.name,hand);
    for(const [index,finger] of fingerNames.entries()){
      let parent=hand;
      for(let i=0;i<3;i++){
        const joint=new Bone();joint.name=side+finger+joints(finger)[i];
        joint.position.set(
          i===0?sign*(0.065+(index===0?0.05:0)):sign*0.06,
          i===0?(2-index)*0.027:0,
          i===0?(index===0?0.07:0.08):0.014);
        parent.add(joint);nodes.set(joint.name,joint);parent=joint;
      }
    }
  }
  scene.updateWorldMatrix(true,true);
  return {scene,nodes,humanoid:{getNormalizedBoneNode:role=>nodes.get(role)||null}};
}
const quatTrack=(name,q0,q1)=>
  new QuaternionKeyframeTrack(name+'.quaternion',[0,1],qValues(q0,q1));

function makeIdleClip() {
  const identity=new Quaternion();
  return new AnimationClip('Standing Idle',1,[
    // Author has animated one arm. It must NOT be replaced by our T-to-A rest.
    quatTrack('leftUpperArm',identity,new Quaternion().setFromAxisAngle(new Vector3(0,0,1),0.22)),
    // Dead finger track: legacy Mixamo holds straight digits for entire clip.
    quatTrack('leftIndexProximal',identity,identity),
    // Already animated finger: preserve this motion (low procedural authority).
    quatTrack('rightIndexProximal',identity,
      new Quaternion().setFromAxisAngle(new Vector3(0,0,1),0.43)),
    new VectorKeyframeTrack('hips.position',[0,1],[0,1,0,0.04,1,0]),
  ]);
}
test('LP-02C.1 only known idle clip names are eligible',()=>{
  for(const name of ['Idle','Standing Idle','Relaxed_01','Breathing Idle','reposo.fbx','waiting'])
    assert.equal(classifyIdleClip(name),true,name);
  for(const name of ['Walking','Standing Jump','Run Idle','Clapping','Talk','Dance','Attack'])
    assert.equal(classifyIdleClip(name),false,name);
  assert.equal(classifyIdleClip(''),false);
});
test('LP-02C.1 quaternion detection ignores q/-q double cover',()=>{
  const q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),0.2);
  const minus=new Quaternion(-q.x,-q.y,-q.z,-q.w);
  const stable=quatTrack('a',q,minus);
  assert.equal(analyzeQuaternionTrack(stable).kind,'static');
  const moving=quatTrack('b',q,new Quaternion());
  assert.equal(analyzeQuaternionTrack(moving).kind,'animated');
});
test('LP-02C.1 conservative role authority protects dynamic hands and lower body',()=>{
  const vrm=syntheticVrm(),composer=new MotionComposer(vrm);
  composer.selectClip(makeIdleClip());
  assert.equal(composer.getStatus().eligible,true);
  assert.equal(composer.getStatus().fingerTracks.static,1);
  assert.equal(composer.getStatus().fingerTracks.animated,1);
  assert.equal(composer.getStatus().fingerTracks.missing,28);
  assert.equal(composer.active,false,'default opt-out required');
  composer.setEnabled(true);
  assert.ok(composer.weightForRole('leftIndexProximal')>composer.weightForRole('rightIndexProximal')*7);
  assert.ok(composer.weightForRole('leftMiddleIntermediate')>0.4);
  assert.equal(composer.weightForRole('hips'),0);
  assert.equal(composer.weightForRole('leftUpperLeg'),0);
  assert.equal(composer.weightForRole('rightFoot'),0);
  assert.ok(composer.weightForRole('leftUpperArm')<0.1);
  composer.setIntensity(0);
  assert.equal(composer.active,false);
  composer.selectClip(new AnimationClip('Walking',1,[]));
  composer.setIntensity(1);composer.setEnabled(true);
  assert.equal(composer.active,false);
  assert.equal(composer.weightForRole('leftIndexProximal'),0);
});
test('LP-02C.1 real mixer: frozen fingers gain life, arm and root retain authored motion',()=>{
  const vrm=syntheticVrm(),clip=makeIdleClip(),mixer=new AnimationMixer(vrm.scene);
  const action=mixer.clipAction(clip);action.play();
  const composer=new MotionComposer(vrm);composer.selectClip(clip);
  const presence=new LivingPresence(vrm,{sourceName:'Vita.vrm',randomSeed:42});
  presence.setEnabled(true);
  composer.setEnabled(true);
  composer.setIntensity(0.8);
  let naturalFinger=false;
  for(let i=0;i<160;i++){
    presence.beforeFrame();mixer.update(1/60);
    const hipBaseline=vrm.nodes.get('hips').position.clone();
    const armBaseline=vrm.nodes.get('leftUpperArm').quaternion.clone();
    const fingerBaseline=vrm.nodes.get('leftIndexProximal').quaternion.clone();
    presence.update(1/60,{clipPlaying:true,composition:composer});
    if(vrm.nodes.get('leftIndexProximal').quaternion.angleTo(fingerBaseline)>0.10)
      naturalFinger=true;
    assert.ok(vrm.nodes.get('hips').position.distanceTo(hipBaseline)<1e-12);
    assert.ok(vrm.nodes.get('leftUpperArm').quaternion.angleTo(armBaseline)<0.015,
      'never overlay the 72-degree relaxed arm offset on Mixamo');
  }
  assert.equal(naturalFinger,true,'static Mixamo fingers get relaxed procedural bend');
  // No residual overlay after A/B off even if mixer remains paused.
  const baseStatic=new Quaternion();
  composer.setEnabled(false);
  presence.beforeFrame();
  presence.update(1/60,{clipPlaying:true,composition:composer});
  assert.ok(vrm.nodes.get('leftIndexProximal').quaternion.angleTo(baseStatic)<1e-8);
  presence.setEnabled(false);
});
test('LP-02C.1 paused FBX can overlay then undo without changing the frozen pose',()=>{
  const vrm=syntheticVrm(),clip=makeIdleClip(),mixer=new AnimationMixer(vrm.scene);
  mixer.clipAction(clip).play();mixer.update(0.35);
  const composer=new MotionComposer(vrm);composer.selectClip(clip);
  composer.setEnabled(true);
  const motor=new LivingPresence(vrm,{sourceName:'Vita.vrm',randomSeed:12});
  motor.setEnabled(true);
  const authored=vrm.nodes.get('leftUpperArm').quaternion.clone();
  for(let i=0;i<200;i++){motor.beforeFrame();motor.update(1/60,{clipPlaying:true,composition:composer});}
  assert.ok(vrm.nodes.get('leftIndexProximal').quaternion.angleTo(new Quaternion())>0.05);
  assert.ok(vrm.nodes.get('leftUpperArm').quaternion.angleTo(authored)<0.015);
  composer.setEnabled(false);motor.resetOverlay();
  assert.ok(vrm.nodes.get('leftIndexProximal').quaternion.angleTo(new Quaternion())<1e-8);
  assert.ok(vrm.nodes.get('leftUpperArm').quaternion.equals(authored),
    'paused clip arm quaternion must be restored component-by-component');
  assert.equal(motor.appliedPositions.size,0);
  motor.dispose();
});
test('LP-02C.1 action clips stay fully under mixer authority even when user opted in',()=>{
  const vrm=syntheticVrm(),clip=new AnimationClip('Clapping',1,[
    quatTrack('leftIndexProximal',new Quaternion(),
      new Quaternion().setFromAxisAngle(new Vector3(1,0,0),0.36)),
  ]);
  const mixer=new AnimationMixer(vrm.scene);mixer.clipAction(clip).play();
  const composer=new MotionComposer(vrm);composer.selectClip(clip);composer.setEnabled(true);
  const motor=new LivingPresence(vrm,{sourceName:'Vita.vrm',randomSeed:1});motor.setEnabled(true);
  for(let i=0;i<120;i++){
    motor.beforeFrame();mixer.update(1/60);
    const before=vrm.nodes.get('leftIndexProximal').quaternion.clone();
    motor.update(1/60,{clipPlaying:true,composition:composer});
    assert.ok(vrm.nodes.get('leftIndexProximal').quaternion.equals(before),
      'active action clip quaternion must remain byte-identical to mixer output');
  }
  assert.equal(composer.getStatus().eligible,false);
});
