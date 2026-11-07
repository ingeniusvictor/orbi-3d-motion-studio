import test from 'node:test';
import assert from 'node:assert/strict';
import { Bone, Group, Vector3 } from 'three';
import { OrganicIdleScore, SparseMotionLane, NaturalBlink } from '../src/lib/livingPresence/organicIdle.js';
import { buildFingerCurlAxes } from '../src/lib/livingPresence/fingerPose.js';
import { LivingPresence } from '../src/lib/livingPresence/LivingPresence.js';

function makeAvatar() {
  const scene=new Group(), nodes=new Map();
  const torso=new Bone();torso.name='spine';scene.add(torso);nodes.set('spine',torso);
  const head=new Bone();head.name='head';head.position.set(0,1.65,0);scene.add(head);nodes.set('head',head);
  for(const [side,sign] of [['left',1],['right',-1]]) {
    const upper=new Bone();upper.position.set(sign*0.36,1.5,0);
    scene.add(upper);nodes.set(side+'UpperArm',upper);
    const lower=new Bone();lower.position.set(sign*0.40,0,0);
    upper.add(lower);nodes.set(side+'LowerArm',lower);
    const hand=new Bone();hand.position.set(sign*0.30,0,0);
    lower.add(hand);nodes.set(side+'Hand',hand);
    for(const [index,finger] of ['Thumb','Index','Middle','Ring','Little'].entries()) {
      const joints=finger==='Thumb'?['Metacarpal','Proximal','Distal']:
        ['Proximal','Intermediate','Distal'];
      let parent=hand;
      for(let i=0;i<3;i++) {
        const joint=new Bone();
        joint.position.set(i===0?sign*(0.065+(index===0?0.05:0)):sign*0.06,
          i===0?(2-index)*0.027:0,
          i===0?(index===0?0.07:0.08):0.014);
        parent.add(joint);nodes.set(side+finger+joints[i],joint);
        parent=joint;
      }
    }
  }
  scene.updateWorldMatrix(true,true);
  const expressions=new Map([['blink',0]]);
  const expressionManager={
    getValue:name=>expressions.has(name)?expressions.get(name):null,
    setValue:(name,value)=>expressions.set(name,value),
  };
  const lookAt={
    autoUpdate:true,target:null,
    getLookAtWorldPosition:out=>head.getWorldPosition(out),
    getLookAtWorldDirection:out=>out.set(0,0,1),
  };
  return {scene,nodes,expressionManager,lookAt,
    humanoid:{getNormalizedBoneNode:role=>nodes.get(role)||null}};
}

test('LP-02B asynchronous channels are reproducible but not in lockstep',()=>{
  const a=new OrganicIdleScore(88),b=new OrganicIdleScore(88);
  let differs=false,pauses=0;
  for(let i=0;i<1200;i++){
    const t=i/60, v=a.sample(t),w=b.sample(t);
    assert.deepEqual(v,w);
    if(Math.abs(v.leftWrist-v.rightWrist)>0.02)differs=true;
    if(v.leftWrist===0&&v.rightWrist===0)pauses++;
  }
  assert.ok(differs);
  assert.ok(pauses>30,'idle must include actual pauses, not constant movement');
});
test('LP-02B sparse channel has smooth onset and release',()=>{
  const l=new SparseMotionLane(17,{gap:[0.2,0.2],duration:[1.2,1.2]});
  let last=0;
  for(let i=0;i<250;i++){
    const v=l.sample(i/60);
    assert.ok(Number.isFinite(v)&&Math.abs(v)<=1);
    assert.ok(Math.abs(v-last)<0.03,'no harsh jump at 60 FPS');
    last=v;
  }
});
test('LP-02B natural blink has distinct openings and closures',()=>{
  const blink=new NaturalBlink(22);
  let peak=0,zeros=0;
  for(let i=0;i<1800;i++){
    const value=blink.sample(i/120);
    assert.ok(value>=0&&value<=1);
    peak=Math.max(peak,value);
    if(value===0)zeros++;
  }
  assert.ok(peak>0.9);
  assert.ok(zeros>150);
});
test('LP-02B calibrates 30 normalized finger joints without modifying source',()=>{
  const rig=makeAvatar(),finger=rig.nodes.get('leftIndexProximal');
  const original=finger.quaternion.clone();
  const result=buildFingerCurlAxes(rig);
  assert.equal(result.axes.size,30);
  assert.ok(finger.quaternion.angleTo(original)<1e-10);
});
test('LP-02B organic overlay moves fingers, restores blink and external gaze ownership',()=>{
  const vrm=makeAvatar(),presence=new LivingPresence(vrm);
  const finger=vrm.nodes.get('leftMiddleIntermediate');
  const initial=finger.quaternion.clone();
  const abilities=presence.getCapabilities();
  assert.equal(abilities.calibratedFingers,30);
  assert.equal(abilities.blinking,true);
  assert.equal(abilities.lookAt,true);
  presence.setEnabled(true);
  let blinkSeen=false;
  for(let i=0;i<800;i++){
    presence.beforeFrame();
    presence.update(1/120);
    if(vrm.expressionManager.getValue('blink')>0.3)blinkSeen=true;
  }
  assert.ok(finger.quaternion.angleTo(initial)>0.01);
  assert.ok(blinkSeen,'natural blinking should be observable');
  assert.equal(vrm.lookAt.target,presence.gazeTarget);
  presence.setEnabled(false);
  assert.ok(finger.quaternion.angleTo(initial)<1e-10);
  assert.equal(vrm.expressionManager.getValue('blink'),0);
  assert.equal(vrm.lookAt.target,null);
});
test('LP-02B respects imported clip even when paused',()=>{
  const vrm=makeAvatar(),presence=new LivingPresence(vrm);
  presence.setEnabled(true);
  for(let i=0;i<100;i++){presence.beforeFrame();presence.update(1/60);}
  presence.beforeFrame();
  presence.update(1/60,{clipPlaying:true});
  assert.equal(presence.applied.size,0);
  assert.equal(vrm.lookAt.target,null);
  assert.equal(vrm.expressionManager.getValue('blink'),0);
  presence.dispose();
});
test('LP-02B does not claim gaze ownership when external target exists',()=>{
  const vrm=makeAvatar(),external=new Group();
  vrm.lookAt.target=external;
  const presence=new LivingPresence(vrm);
  presence.setEnabled(true);
  for(let i=0;i<200;i++){presence.beforeFrame();presence.update(1/60);}
  assert.equal(vrm.lookAt.target,external);
  presence.setEnabled(false);
  assert.equal(vrm.lookAt.target,external);
});

test('LP-02B gaze A/B restores the original lookAt angles',()=>{
  const vrm=makeAvatar();
  vrm.lookAt.yaw=4;
  vrm.lookAt.pitch=-2;
  const presence=new LivingPresence(vrm);
  presence.setEnabled(true);
  for(let i=0;i<140;i++){presence.beforeFrame();presence.update(1/60);}
  assert.equal(vrm.lookAt.target,presence.gazeTarget);
  vrm.lookAt.yaw=8;
  vrm.lookAt.pitch=6;
  presence.setEnabled(false);
  assert.equal(vrm.lookAt.target,null);
  assert.equal(vrm.lookAt.yaw,4);
  assert.equal(vrm.lookAt.pitch,-2);
});
