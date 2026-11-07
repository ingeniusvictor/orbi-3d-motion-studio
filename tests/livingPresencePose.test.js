import test from 'node:test';
import assert from 'node:assert/strict';
import { Bone, Group, Vector3 } from 'three';
import { buildRelaxedArmOffsets } from '../src/lib/livingPresence/neutralPose.js';
import { LivingPresence } from '../src/lib/livingPresence/LivingPresence.js';

function makeRig({missingHand=false}={}) {
  const scene=new Group();
  const nodes=new Map();
  for(const [side,sign] of [['left',1],['right',-1]]) {
    const upper=new Bone();upper.name=side+'UpperArm';
    upper.position.set(sign*0.35,1.5,0);
    scene.add(upper);nodes.set(side+'UpperArm',upper);
    const lower=new Bone();lower.name=side+'LowerArm';
    lower.position.set(sign*0.40,0,0);
    upper.add(lower);nodes.set(side+'LowerArm',lower);
    if(!missingHand) {
      const hand=new Bone();hand.name=side+'Hand';
      hand.position.set(sign*0.32,0,0);
      lower.add(hand);nodes.set(side+'Hand',hand);
    }
  }
  scene.updateWorldMatrix(true,true);
  return {scene,humanoid:{getNormalizedBoneNode:role=>nodes.get(role)||null},nodes};
}
function elbowHeight(vrm,side) {
  vrm.scene.updateWorldMatrix(true,true);
  return vrm.nodes.get(side+'LowerArm').getWorldPosition(new Vector3()).y;
}

test('LP-02A identifies both arms, lowers from T-pose and bends forearms',()=>{
  const vrm=makeRig();
  const startL=elbowHeight(vrm,'left'),startR=elbowHeight(vrm,'right');
  const calibrated=buildRelaxedArmOffsets(vrm);
  for(const side of ['left','right']) {
    assert.ok(calibrated.offsets.has(side+'UpperArm'));
    assert.ok(calibrated.offsets.has(side+'LowerArm'));
    vrm.nodes.get(side+'UpperArm').quaternion.multiply(calibrated.offsets.get(side+'UpperArm'));
    vrm.nodes.get(side+'LowerArm').quaternion.multiply(calibrated.offsets.get(side+'LowerArm'));
  }
  assert.ok(elbowHeight(vrm,'left')<startL-0.30);
  assert.ok(elbowHeight(vrm,'right')<startR-0.30);
});

test('LP-02A reversible A/B returns precisely to T-pose without rotation drift',()=>{
  const vrm=makeRig();
  const presence=new LivingPresence(vrm);
  const startL=elbowHeight(vrm,'left'),startR=elbowHeight(vrm,'right');
  for(let cycle=0;cycle<5;cycle++){
    presence.setEnabled(true);
    for(let i=0;i<110;i++){
      presence.beforeFrame();
      presence.update(1/60,{clipPlaying:false});
    }
    assert.ok(elbowHeight(vrm,'left')<startL-0.2);
    assert.ok(elbowHeight(vrm,'right')<startR-0.2);
    presence.setEnabled(false);
    assert.ok(Math.abs(elbowHeight(vrm,'left')-startL)<1e-8);
    assert.ok(Math.abs(elbowHeight(vrm,'right')-startR)<1e-8);
    for(const side of ['left','right']){
      const q=vrm.nodes.get(side+'UpperArm').quaternion;
      assert.ok(Math.abs(q.x)+Math.abs(q.y)+Math.abs(q.z)<1e-10);
      assert.ok(Math.abs(q.w-1)<1e-10);
    }
  }
  presence.dispose();
});

test('LP-02A clip ownership yields exact original pose even when FBX is paused',()=>{
  const vrm=makeRig(),presence=new LivingPresence(vrm);
  presence.setEnabled(true);
  for(let i=0;i<160;i++){presence.beforeFrame();presence.update(1/60);}
  assert.ok(elbowHeight(vrm,'left')<1.5);
  presence.beforeFrame();
  presence.update(1/60,{clipPlaying:true});
  assert.ok(Math.abs(elbowHeight(vrm,'left')-1.5)<1e-8);
  assert.equal(presence.fade.x,0);
});

test('LP-02A tolerates missing optional hands without throwing',()=>{
  const vrm=makeRig({missingHand:true});
  const result=buildRelaxedArmOffsets(vrm);
  assert.equal(result.offsets.size,2);
  const presence=new LivingPresence(vrm);
  presence.setEnabled(true);
  for(let i=0;i<100;i++){presence.beforeFrame();presence.update(1/60);}
  assert.ok(elbowHeight(vrm,'left')<1.2);
  presence.dispose();
});
