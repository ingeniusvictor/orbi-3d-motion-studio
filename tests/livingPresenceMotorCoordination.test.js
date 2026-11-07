import test from 'node:test';
import assert from 'node:assert/strict';
import {Bone,Group,Quaternion,Vector3,AnimationMixer,AnimationClip,QuaternionKeyframeTrack} from 'three';
import {MotorCoordinator,MOTOR_MODES} from '../src/lib/livingPresence/motorCoordinator.js';
import {LivingPresence} from '../src/lib/livingPresence/LivingPresence.js';
import {MotionComposer} from '../src/lib/livingPresence/motionComposer.js';

const rad=degrees=>degrees*Math.PI/180;
function skeleton(){
  const scene=new Group(),nodes=new Map();
  const add=(name,parent,x=0,y=0,z=0)=>{
    const bone=new Bone();bone.name=name;bone.position.set(x,y,z);
    parent.add(bone);nodes.set(name,bone);return bone;
  };
  const hips=add('hips',scene,0,1,0);
  const spine=add('spine',hips,0,0.15,0);
  const chest=add('chest',spine,0,0.25,0);
  const upperChest=add('upperChest',chest,0,0.18,0);
  const neck=add('neck',upperChest,0,0.12,0);
  add('head',neck,0,0.16,0);
  for(const [side,sign] of [['left',1],['right',-1]]){
    const shoulder=add(side+'Shoulder',upperChest,sign*0.2,0,0);
    const upper=add(side+'UpperArm',shoulder,sign*0.11,0,0);
    const lower=add(side+'LowerArm',upper,sign*0.34,0,0);
    add(side+'Hand',lower,sign*0.27,0,0);
    const leg=add(side+'UpperLeg',hips,sign*0.15,-0.05,0);
    const knee=add(side+'LowerLeg',leg,0,-0.48,0);
    add(side+'Foot',knee,0,-0.48,0);
  }
  scene.updateWorldMatrix(true,true);
  return {scene,nodes,humanoid:{getNormalizedBoneNode:role=>nodes.get(role)||null}};
}
test('LP-03A cerebellum is opt-in, finite and anatomically small',()=>{
  const motor=new MotorCoordinator();
  assert.equal(motor.enabled,false);
  assert.equal(motor.getStatus().intensity,0.42);
  motor.setEnabled(true);
  motor.setIntensity(0.8);
  let maxDegrees=0,active=false;
  for(let i=0;i<750;i++){
    const out=motor.update(1/60,{
      roll:rad(1.2)*Math.sin(i/250),yaw:rad(0.6),
      headYaw:rad(5),wristLeft:0.9,wristRight:-0.4,activity:1,
    });
    maxDegrees=Math.max(maxDegrees,out.maxDegrees);
    assert.ok(Number.isFinite(out.maxDegrees));
    assert.ok(out.maxDegrees<1.5,'no uncontrolled joint excursions');
    for(const angles of Object.values(out.euler)){
      assert.equal(angles.length,3);
      assert.ok(angles.every(a=>Number.isFinite(a)));
    }
    if(i>100&&out.elbow.left>0.01)active=true;
  }
  assert.ok(active,'wrist motion should trigger delayed elbow response');
  assert.ok(maxDegrees>0.06,'coupled motion must be measurable');
  assert.ok(!('hips' in motor.last.euler));
  assert.ok(!('leftFoot' in motor.last.euler));
  motor.reset();
  assert.equal(motor.last.maxDegrees,0);
});
test('LP-03A only permits named states with slow interpolation',()=>{
  const motor=new MotorCoordinator();
  motor.setEnabled(true);
  assert.equal(motor.setMode('not_a_mode'),false);
  assert.equal(motor.getStatus().mode,'resting');
  assert.deepEqual(Object.keys(MOTOR_MODES),['resting','attentive','thinking','explaining']);
  for(let i=0;i<90;i++)motor.update(1/60,{headYaw:rad(8),wristLeft:1});
  const before=motor.last.euler.chest[1];
  assert.equal(motor.setMode('attentive'),true);
  const immediate=motor.update(1/60,{headYaw:rad(8),wristLeft:1}).euler.chest[1];
  assert.ok(Math.abs(immediate-before)<rad(0.04),'mode changes must not snap');
  for(let i=0;i<90;i++)motor.update(1/60,{headYaw:rad(8),wristLeft:1});
  assert.equal(motor.getStatus().mode,'attentive');
  assert.equal(motor.setMode('explaining'),true);
});
test('LP-03A comparison preserves existing idle when disabled, yet responds to cues',()=>{
  const oldRig=skeleton(),newRig=skeleton();
  const old=new LivingPresence(oldRig,{sourceName:'Vita.vrm',randomSeed:551});
  const evolved=new LivingPresence(newRig,{sourceName:'Vita.vrm',randomSeed:551});
  old.setEnabled(true);evolved.setEnabled(true);
  evolved.setMotorCoordination(true);
  evolved.setMotorIntensity(0.70);
  let change=false;
  for(let i=0;i<850;i++){
    old.beforeFrame();evolved.beforeFrame();
    old.update(1/60);evolved.update(1/60);
    const a=oldRig.nodes.get('chest').quaternion;
    const b=newRig.nodes.get('chest').quaternion;
    if(a.angleTo(b)>rad(0.04))change=true;
    assert.ok(oldRig.nodes.get('hips').position.equals(newRig.nodes.get('hips').position));
    assert.ok(oldRig.nodes.get('leftFoot').quaternion.equals(newRig.nodes.get('leftFoot').quaternion));
  }
  assert.ok(change,'new coordination influences the torso');
  evolved.setMotorCoordination(false);
  // Same seeded original score, same runtime: compare after new frame.
  old.beforeFrame();evolved.beforeFrame();
  old.update(1/60);evolved.update(1/60);
  for(const role of ['spine','chest','upperChest','neck','leftShoulder','rightShoulder','leftHand','rightHand']){
    assert.ok(oldRig.nodes.get(role).quaternion.angleTo(newRig.nodes.get(role).quaternion)<1e-6,role);
  }
  old.dispose();evolved.dispose();
});
test('LP-03A idle coordination yields to action FBX and opt-in-only Mixamo blend',()=>{
  const rig=skeleton();
  const source=new AnimationClip('Clapping',1,[
    new QuaternionKeyframeTrack('chest.quaternion',[0,1],[
      0,0,0,1,0,Math.sin(0.13),0,Math.cos(0.13),
    ]),
  ]);
  const mixer=new AnimationMixer(rig.scene);mixer.clipAction(source).play();
  const presence=new LivingPresence(rig,{randomSeed:77,sourceName:'Vita.vrm'});
  presence.setEnabled(true);presence.setMotorCoordination(true);
  const composer=new MotionComposer(rig);
  composer.selectClip(source,{source:'VRM / Mixamo (experimental)'});
  composer.setEnabled(true);
  for(let i=0;i<150;i++){
    presence.beforeFrame();mixer.update(1/60);
    const base=rig.nodes.get('chest').quaternion.clone();
    presence.update(1/60,{clipPlaying:true,composition:composer});
    assert.ok(rig.nodes.get('chest').quaternion.equals(base),
      'a non-idle action owns the chest, no LP-03A overlay');
  }
  presence.setEnabled(false);composer.dispose();
});
test('LP-03A A/B toggle does not drift after repeated cycles',()=>{
  const rig=skeleton(),motor=new LivingPresence(rig,{randomSeed:97});
  motor.setEnabled(true);
  for(let cycle=0;cycle<7;cycle++){
    motor.setMotorCoordination(true);
    for(let i=0;i<80;i++){motor.beforeFrame();motor.update(1/60);}
    motor.setMotorCoordination(false);
    motor.beforeFrame();
    for(const role of ['spine','chest','neck','head','leftShoulder','rightHand']){
      assert.ok(rig.nodes.get(role).quaternion.equals(new Quaternion()),role);
    }
  }
  motor.dispose();
});
