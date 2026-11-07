import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AnimationClip,AnimationMixer,Bone,Group,Quaternion,
  QuaternionKeyframeTrack,Vector3,
} from 'three';
import {
  GestureDirector,GESTURE_CATALOG,gestureEnvelope,
} from '../src/lib/livingPresence/gestureDirector.js';
import {LivingPresence} from '../src/lib/livingPresence/LivingPresence.js';
import {MotionComposer} from '../src/lib/livingPresence/motionComposer.js';
import {MotionViewer} from '../src/lib/viewer.js';
const rad=degrees=>degrees*Math.PI/180;
function syntheticRig(){
  const scene=new Group(),nodes=new Map();
  function add(name,parent,x=0,y=0,z=0){
    const v=new Bone();v.name=name;v.position.set(x,y,z);parent.add(v);nodes.set(name,v);return v;
  }
  const hips=add('hips',scene,0,1,0),spine=add('spine',hips,0,0.2,0);
  const chest=add('chest',spine,0,0.3,0);
  const upperChest=add('upperChest',chest,0,0.15,0);
  const neck=add('neck',upperChest,0,0.10,0);
  add('head',neck,0,0.15,0);
  for(const [side,sign] of [['left',1],['right',-1]]){
    const shoulder=add(side+'Shoulder',upperChest,0.23*sign,0,0);
    const upper=add(side+'UpperArm',shoulder,0.08*sign,0,0);
    const lower=add(side+'LowerArm',upper,0.32*sign,0,0);
    add(side+'Hand',lower,0.28*sign,0,0);
    const thigh=add(side+'UpperLeg',hips,0.16*sign,-0.10,0);
    const knee=add(side+'LowerLeg',thigh,0,-0.45,0);
    add(side+'Foot',knee,0,-0.48,0);
  }
  scene.updateWorldMatrix(true,true);
  return {scene,nodes,humanoid:{getNormalizedBoneNode:role=>nodes.get(role)||null}};
}
test('LP-03B gesture catalog is fixed, safe and never owns the lower body',()=>{
  assert.deepEqual(Object.keys(GESTURE_CATALOG),['acknowledge','curious','emphasize']);
  const forbidden=/^(hips|root|leftUpperLeg|rightUpperLeg|leftLowerLeg|rightLowerLeg|leftFoot|rightFoot)$/;
  for(const spec of Object.values(GESTURE_CATALOG)){
    assert.ok(spec.phases.every(s=>s>0));
    for(const [role,eulers] of Object.entries(spec.joints)){
      assert.equal(forbidden.test(role),false);
      assert.ok(eulers.every(x=>Math.abs(x)<=rad(5)));
    }
  }
});
test('LP-03B anticipation/action/hold/recovery preserve phase boundaries',()=>{
  const phases=[0.3,0.6,0.2,0.8];
  const [a,b,c,d]=phases;
  assert.deepEqual(gestureEnvelope(0,phases),{phase:'anticipation',weight:0});
  const pre=gestureEnvelope(a-0.00001,phases).weight;
  const act=gestureEnvelope(a,phases).weight;
  assert.ok(Math.abs(pre-act)<0.00001,'preparation/action must connect');
  const actionFinish=gestureEnvelope(a+b-0.00001,phases).weight;
  const holdStart=gestureEnvelope(a+b,phases).weight;
  assert.ok(Math.abs(actionFinish-holdStart)<0.00001);
  const recoverBefore=gestureEnvelope(a+b+c+d-0.00001,phases).weight;
  assert.ok(Math.abs(recoverBefore)<0.00001);
  assert.equal(gestureEnvelope(100,phases).phase,'idle');
});
test('LP-03B is opt-in, only one gesture at a time and releases automatically',()=>{
  const g=new GestureDirector();
  assert.equal(g.trigger('acknowledge'),false);
  g.setEnabled(true);
  assert.equal(g.trigger('does_not_exist'),false);
  assert.equal(g.trigger('acknowledge'),true);
  assert.equal(g.trigger('curious'),false,'no overlapping gestures');
  let sawAction=false,sawRecovery=false;
  for(let i=0;i<350;i++){
    const x=g.update(1/60);
    if(x.phase==='action')sawAction=true;
    if(x.phase==='recovery')sawRecovery=true;
    assert.ok(x.lookWeight>=0&&x.lookWeight<=1);
    for(const angles of Object.values(x.pose))
      assert.ok(angles.every(a=>Math.abs(a)<rad(5)));
  }
  assert.ok(sawAction&&sawRecovery);
  assert.equal(g.getStatus().current,null);
  assert.equal(g.getStatus().lastCompleted,'acknowledge');
  assert.equal(g.trigger('curious'),true);
  g.setEnabled(false);
  assert.equal(g.getStatus().current,null);
  assert.equal(g.update(1/60).phase,'idle');
});
test('LP-03B produces identical gestures for identical frame streams',()=>{
  const a=new GestureDirector(),b=new GestureDirector();
  a.setEnabled(true);b.setEnabled(true);
  a.trigger('emphasize');b.trigger('emphasize');
  for(let i=0;i<250;i++)assert.deepEqual(a.update(1/60),b.update(1/60));
});
test('LP-03B visually measurable but small; toggling restores old idle exactly',()=>{
  const vrmOld=syntheticRig(),vrmNew=syntheticRig();
  const old=new LivingPresence(vrmOld,{sourceName:'Vita.vrm',randomSeed:55});
  const evolved=new LivingPresence(vrmNew,{sourceName:'Vita.vrm',randomSeed:55});
  old.setEnabled(true);evolved.setEnabled(true);
  evolved.setGestureEnabled(true);
  assert.equal(evolved.triggerGesture('acknowledge'),true);
  let changed=false;
  for(let i=0;i<150;i++){
    old.beforeFrame();evolved.beforeFrame();
    old.update(1/60);evolved.update(1/60);
    if(vrmOld.nodes.get('head').quaternion.angleTo(vrmNew.nodes.get('head').quaternion)>rad(0.2))
      changed=true;
    assert.ok(vrmOld.nodes.get('hips').position.equals(vrmNew.nodes.get('hips').position));
    assert.ok(vrmOld.nodes.get('leftFoot').quaternion.equals(vrmNew.nodes.get('leftFoot').quaternion));
  }
  assert.ok(changed,'nod visible beyond baseline movement');
  evolved.setGestureEnabled(false);
  old.beforeFrame();evolved.beforeFrame();
  old.update(1/60);evolved.update(1/60);
  for(const role of ['spine','chest','upperChest','neck','head','leftHand','rightHand']){
    assert.ok(vrmOld.nodes.get(role).quaternion.angleTo(vrmNew.nodes.get(role).quaternion)<1e-6,role);
  }
  old.dispose();evolved.dispose();
});
test('LP-03B can compose on Mixamo idle but cannot interfere with non-idle action',()=>{
  const vrm=syntheticRig();
  const track=new QuaternionKeyframeTrack('chest.quaternion',[0,1],[
    0,0,0,1,0,Math.sin(0.06),0,Math.cos(0.06),
  ]);
  const idle=new AnimationClip('Standing Idle',1,[track]);
  const mixer=new AnimationMixer(vrm.scene);
  mixer.clipAction(idle).play();
  const composer=new MotionComposer(vrm);
  composer.selectClip(idle,{source:'VRM / Mixamo (experimental)'});
  composer.setEnabled(true);
  const presence=new LivingPresence(vrm,{randomSeed:85});
  presence.setEnabled(true);presence.setGestureEnabled(true);
  assert.equal(presence.triggerGesture('curious'),true);
  let changed=false;
  const hips=vrm.nodes.get('hips').position.clone();
  for(let i=0;i<160;i++){
    presence.beforeFrame();mixer.update(1/60);
    const headBefore=vrm.nodes.get('head').quaternion.clone();
    presence.update(1/60,{clipPlaying:true,composition:composer});
    if(vrm.nodes.get('head').quaternion.angleTo(headBefore)>rad(0.25))changed=true;
    assert.ok(vrm.nodes.get('hips').position.equals(hips));
  }
  assert.equal(changed,true);
  // Switching to an action removes the gesture; the mixer owns the bone.
  const action=new AnimationClip('Clapping',1,[track]);
  composer.selectClip(action,{source:'VRM / Mixamo (experimental)'});
  mixer.stopAllAction();mixer.clipAction(action).play();
  assert.equal(presence.triggerGesture('emphasize'),true);
  presence.beforeFrame();mixer.update(1/60);
  const authored=vrm.nodes.get('chest').quaternion.clone();
  presence.update(1/60,{clipPlaying:true,composition:composer});
  assert.ok(vrm.nodes.get('chest').quaternion.equals(authored));
  assert.equal(presence.getGestureStatus().current,null);
  presence.dispose();composer.dispose();
});
test('LP-03B viewer API refuses direct gesture requests over any FBX without authorized compositor',()=>{
  let called=0;
  const fake={
    presence:{enabled:true,triggerGesture:()=>{called++;return true;}},
    mixer:{},current:0,motionComposer:{active:false},
  };
  assert.equal(MotionViewer.prototype.triggerLivingGesture.call(fake,'acknowledge'),false);
  assert.equal(called,0);
  fake.motionComposer.active=true;
  assert.equal(MotionViewer.prototype.triggerLivingGesture.call(fake,'acknowledge'),true);
  assert.equal(called,1);
  fake.current=null;
  fake.motionComposer.active=false;
  assert.equal(MotionViewer.prototype.triggerLivingGesture.call(fake,'acknowledge'),true);
  assert.equal(called,2);
  fake.presence.enabled=false;
  assert.equal(MotionViewer.prototype.triggerLivingGesture.call(fake,'acknowledge'),false);
});
