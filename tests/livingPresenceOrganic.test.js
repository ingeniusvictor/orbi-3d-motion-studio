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

test('LP-02B.1 resting human hand has independent MCP, PIP and DIP flexion',async()=>{
  const {relaxedHandProfile,relaxedFingerAngleDegrees}=await import('../src/lib/livingPresence/relaxedHandPose.js');
  const index=relaxedHandProfile('Index');
  const ring=relaxedHandProfile('Ring');
  assert.ok(index[0]>=18 && index[1]>index[2]);
  assert.ok(ring[0]>index[0]);
  for(const finger of ['Thumb','Index','Middle','Ring','Little']){
    const target=relaxedHandProfile(finger);
    assert.equal(target.length,3);
    for(let i=0;i<3;i++){
      const rest=relaxedFingerAngleDegrees({finger,jointIndex:i,relaxation:0.88,blend:1});
      const zero=relaxedFingerAngleDegrees({finger,jointIndex:i,relaxation:0,blend:1});
      assert.ok(rest>0&&rest<48);
      assert.equal(zero,0);
    }
  }
});
test('LP-02B.1 30 joints rest in a natural curve, and A/B restores exactly',()=>{
  const rig=makeAvatar(),presence=new LivingPresence(rig);
  presence.setIntensity(0);
  presence.setHandRelaxation(1);
  presence.setEnabled(true);
  for(let i=0;i<150;i++){presence.beforeFrame();presence.update(1/60);}
  const index=rig.nodes.get('leftIndexProximal');
  const middle=rig.nodes.get('leftMiddleIntermediate');
  const little=rig.nodes.get('rightLittleProximal');
  assert.ok(index.quaternion.angleTo(new index.quaternion.constructor())>0.2);
  assert.ok(middle.quaternion.angleTo(new middle.quaternion.constructor())>0.3);
  assert.ok(little.quaternion.angleTo(new little.quaternion.constructor())>0.4);
  presence.setEnabled(false);
  assert.ok(index.quaternion.angleTo(new index.quaternion.constructor())<1e-10);
  assert.ok(middle.quaternion.angleTo(new middle.quaternion.constructor())<1e-10);
  assert.ok(little.quaternion.angleTo(new little.quaternion.constructor())<1e-10);
});
test('LP-02B.1 hand curl direction can be reversed per side without affecting the other',()=>{
  const vrm=makeAvatar(),presence=new LivingPresence(vrm);
  presence.setIntensity(0);
  presence.setEnabled(true);
  for(let i=0;i<160;i++){presence.beforeFrame();presence.update(1/60);}
  const left=vrm.nodes.get('leftIndexProximal');
  const right=vrm.nodes.get('rightIndexProximal');
  const qLeft=left.quaternion.clone();
  const qRight=right.quaternion.clone();
  presence.setFingerDirection('left',true);
  for(let i=0;i<160;i++){presence.beforeFrame();presence.update(1/60);}
  const flipped=left.quaternion.clone();
  const vectorDot=qLeft.x*flipped.x+qLeft.y*flipped.y+qLeft.z*flipped.z;
  assert.ok(vectorDot<-0.001,'left must turn opposite around the same hinge');
  assert.ok(right.quaternion.angleTo(qRight)<0.0001,'right hand unchanged');
  presence.setEnabled(false);
  presence.setEnabled(true);
  presence.setHandRelaxation(0);
  for(let i=0;i<160;i++){presence.beforeFrame();presence.update(1/60);}
  assert.ok(left.quaternion.angleTo(new left.quaternion.constructor())<1e-4);
  presence.dispose();
});
