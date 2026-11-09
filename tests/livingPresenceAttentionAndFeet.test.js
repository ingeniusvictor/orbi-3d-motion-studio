import test from 'node:test';
import assert from 'node:assert/strict';
import {Bone,Group,Vector3,Quaternion} from 'three';
import {AttentionDirector} from '../src/lib/livingPresence/attentionDirector.js';
import {PlantedLegs} from '../src/lib/livingPresence/plantedLegs.js';
import {LivingPresence} from '../src/lib/livingPresence/LivingPresence.js';

function b(name,x=0,y=0,z=0){
  const joint=new Bone();joint.name=name;joint.position.set(x,y,z);return joint;
}
function simpleRig({missingRight=false}={}){
  const scene=new Group(),nodes=new Map();
  const hips=b('hips',0,1,0);scene.add(hips);nodes.set('hips',hips);
  const head=b('head',0,0.65,0);hips.add(head);nodes.set('head',head);
  const neck=b('neck',0,0.55,0);hips.add(neck);nodes.set('neck',neck);
  for(const [side,x] of [['left',0.15],['right',-0.15]]){
    if(missingRight&&side==='right')continue;
    const upper=b(side+'UpperLeg',x,0,0);
    const lower=b(side+'LowerLeg',0,-0.48,0);
    const foot=b(side+'Foot',0,-0.48,0);
    hips.add(upper);upper.add(lower);lower.add(foot);
    for(const [role,node] of [
      [side+'UpperLeg',upper],[side+'LowerLeg',lower],[side+'Foot',foot]
    ])nodes.set(role,node);
  }
  const humanoid={getNormalizedBoneNode:role=>nodes.get(role)||null};
  scene.updateWorldMatrix(true,true);
  return {scene,humanoid,nodes};
}
const point=(node)=>node.getWorldPosition(new Vector3());

test('LP-02D attention is bounded, seeded, returns to camera and holds fixations',()=>{
  const a=new AttentionDirector(19),b=new AttentionDirector(19);
  let changes=0,holds=0,camera=0;
  let last={yaw:0,pitch:0};
  for(let i=0;i<3600;i++){
    const t=i/60;
    const cur=a.sample(t);
    assert.deepEqual(cur,b.sample(t));
    assert.ok(Math.abs(cur.yaw)<=12*Math.PI/180+1e-9);
    assert.ok(Math.abs(cur.pitch)<=6*Math.PI/180+1e-9);
    if(Math.abs(cur.yaw-last.yaw)+Math.abs(cur.pitch-last.pitch)>0.00005)changes++;
    else holds++;
    if(cur.yaw===0&&cur.pitch===0)camera++;
    last=cur;
  }
  assert.ok(a.events>=7);
  assert.ok(changes>10);
  assert.ok(holds>changes,'fixations must contain actual non-moving holds');
  assert.ok(camera>20,'intermittent attention must return toward interlocutor');
});
test('LP-02D anchored IK preserves both feet despite random knee bends',()=>{
  const rig=simpleRig(),ik=new PlantedLegs(rig);
  assert.equal(ik.getDiagnostics().available,true);
  const original=Object.fromEntries(['left','right'].map(side=>
    [side,point(rig.nodes.get(side+'Foot'))]));
  const hips=rig.nodes.get('hips'),root=hips.position.clone();
  for(let i=0;i<20;i++){
    const oldRot=new Map(),oldPos=new Map();
    const ok=ik.apply({bend:(i%5)/5,lift:0,blend:1},oldRot,oldPos);
    assert.equal(ok,true,ik.failureReason);
    assert.equal(oldRot.size,6);
    assert.equal(oldPos.size,1);
    for(const side of ['left','right']){
      const now=point(rig.nodes.get(side+'Foot'));
      assert.ok(now.distanceTo(original[side])<0.00005,'grounded foot drifted');
    }
    for(const {node,base} of oldRot.values())node.quaternion.copy(base);
    for(const {node,base} of oldPos.values())node.position.copy(base);
    rig.scene.updateWorldMatrix(true,true);
  }
  assert.ok(hips.position.distanceTo(root)<1e-12);
});
test('LP-02D single-foot reposition keeps stance ankle anchored and restores lift',()=>{
  const rig=simpleRig(),ik=new PlantedLegs(rig);
  const left=point(rig.nodes.get('leftFoot'));
  const right=point(rig.nodes.get('rightFoot'));
  const oldRot=new Map(),oldPos=new Map();
  assert.equal(ik.apply({bend:0.25,lift:0.8,liftSide:'left'},oldRot,oldPos),true);
  const leftRaised=point(rig.nodes.get('leftFoot'));
  const rightPlanted=point(rig.nodes.get('rightFoot'));
  assert.ok(leftRaised.y>left.y+0.003);
  assert.ok(rightPlanted.distanceTo(right)<0.00005);
  for(const {node,base} of oldRot.values())node.quaternion.copy(base);
  for(const {node,base} of oldPos.values())node.position.copy(base);
  rig.scene.updateWorldMatrix(true,true);
  assert.ok(point(rig.nodes.get('leftFoot')).distanceTo(left)<1e-10);
  assert.ok(point(rig.nodes.get('rightFoot')).distanceTo(right)<1e-10);
});
test('LP-02D skips lower body entirely if essential leg roles are missing',()=>{
  const rig=simpleRig({missingRight:true}),ik=new PlantedLegs(rig);
  assert.equal(ik.enabled,false);
  assert.equal(ik.apply({bend:1},new Map(),new Map()),false);
});
test('LP-02D integrated motor preserves planted feet and restores original posture',()=>{
  const rig=simpleRig(),motor=new LivingPresence(rig);
  motor.setIntensity(0.7);
  motor.setLegIntensity(0.65);
  motor.setOptions({legs:true});
  motor.setEnabled(true);
  const left=point(rig.nodes.get('leftFoot'));
  const right=point(rig.nodes.get('rightFoot'));
  const hips=rig.nodes.get('hips'),rest=hips.position.clone();
  let displaced=false;
  for(let i=0;i<1000;i++){
    motor.beforeFrame();
    motor.update(1/60,{clipPlaying:false});
    if(hips.position.distanceTo(rest)>0.0001)displaced=true;
    assert.ok(point(rig.nodes.get('leftFoot')).distanceTo(left)<0.015);
    assert.ok(point(rig.nodes.get('rightFoot')).distanceTo(right)<0.015);
  }
  assert.ok(displaced);
  motor.setEnabled(false);
  assert.ok(hips.position.distanceTo(rest)<1e-10);
  assert.ok(point(rig.nodes.get('leftFoot')).distanceTo(left)<1e-8);
  assert.ok(point(rig.nodes.get('rightFoot')).distanceTo(right)<1e-8);
  assert.ok(rig.nodes.get('leftUpperLeg').quaternion.angleTo(new Quaternion())<1e-10);
  motor.dispose();
});
test('LP-02D an imported/paused FBX keeps sole ownership of the legs',()=>{
  const rig=simpleRig(),motor=new LivingPresence(rig);
  motor.setOptions({legs:true});
  motor.setEnabled(true);
  for(let i=0;i<70;i++){motor.beforeFrame();motor.update(1/60);}
  motor.beforeFrame();motor.update(1/60,{clipPlaying:true});
  assert.equal(motor.applied.size,0);
  assert.equal(motor.appliedPositions.size,0);
  assert.ok(rig.nodes.get('hips').position.distanceTo(new Vector3(0,1,0))<1e-10);
  motor.dispose();
});
