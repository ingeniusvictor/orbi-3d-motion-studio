import test from 'node:test';
import assert from 'node:assert/strict';
import {AnimationClip,AnimationMixer,Bone,Group,Quaternion,QuaternionKeyframeTrack,Vector3,VectorKeyframeTrack} from 'three';
import {SlowBodySway} from '../src/lib/livingPresence/slowBodySway.js';
import {quaternionTrackMean,reduceLateralRoll} from '../src/lib/livingPresence/clipSwayReducer.js';
import {MotionComposer} from '../src/lib/livingPresence/motionComposer.js';
import {LivingPresence} from '../src/lib/livingPresence/LivingPresence.js';
const rad=degrees=>degrees*Math.PI/180;
const roll=degrees=>new Quaternion().setFromAxisAngle(new Vector3(0,0,1),rad(degrees));
const rollAngle=q=>new Vector3(1,0,0).applyQuaternion(q).angleTo(new Vector3(1,0,0)) / (Math.PI/180);
function rig(){
  const scene=new Group(),nodes=new Map();
  const hips=new Bone();hips.name='hips';hips.position.y=1;scene.add(hips);nodes.set('hips',hips);
  const spine=new Bone();spine.name='spine';hips.add(spine);nodes.set('spine',spine);
  const chest=new Bone();chest.name='chest';spine.add(chest);nodes.set('chest',chest);
  const upperChest=new Bone();upperChest.name='upperChest';chest.add(upperChest);nodes.set('upperChest',upperChest);
  const neck=new Bone();neck.name='neck';upperChest.add(neck);nodes.set('neck',neck);
  const head=new Bone();head.name='head';neck.add(head);nodes.set('head',head);
  for(const side of ['left','right']){
    const upper=new Bone();upper.name=side+'UpperLeg';hips.add(upper);nodes.set(upper.name,upper);
    const lower=new Bone();lower.name=side+'LowerLeg';upper.add(lower);nodes.set(lower.name,lower);
    const foot=new Bone();foot.name=side+'Foot';lower.add(foot);nodes.set(foot.name,foot);
  }
  scene.updateWorldMatrix(true,true);
  return {scene,nodes,humanoid:{getNormalizedBoneNode:role=>nodes.get(role)||null}};
}
function clip(name='Standing Idle'){
  return new AnimationClip(name,1,[
    new QuaternionKeyframeTrack('spine.quaternion',[0,0.5,1],[
      ...roll(-16).toArray(),...roll(0).toArray(),...roll(16).toArray(),
    ]),
    new QuaternionKeyframeTrack('chest.quaternion',[0,0.5,1],[
      ...roll(-5).toArray(),...roll(0).toArray(),...roll(5).toArray(),
    ]),
    new VectorKeyframeTrack('hips.position',[0,1],[0,1,0,0.04,1,0]),
  ]);
}
test('LP-02C.2 slow body sway is aperiodic, gentle and reproducible',()=>{
  const a=new SlowBodySway(900),b=new SlowBodySway(900),values=[];
  let max=0,maxJump=0,previous=0;
  for(let i=0;i<1800;i++){
    const current=a.sample(i/60,1/60,{intensity:0.35,speed:0.65});
    assert.deepEqual(current,b.sample(i/60,1/60,{intensity:0.35,speed:0.65}));
    max=Math.max(max,Math.abs(current.roll));
    maxJump=Math.max(maxJump,Math.abs(current.roll-previous));
    values.push(current.roll);previous=current.roll;
  }
  assert.ok(max>0.0001,'slight motion should be visible on a full 30-second view');
  assert.ok(max<rad(1.66*0.35)+1e-8,'never exceed maximum configured inclination');
  assert.ok(maxJump<rad(0.035),'no jerky frame-to-frame roll');
  assert.ok(Math.abs(values[0]-values[600])>1e-5,'posture must evolve slowly');
});
test('LP-02C.2 temporal controls slow motion and do not create lingering oscillation on zero',()=>{
  const slow=new SlowBodySway(12),fast=new SlowBodySway(12);
  let divergence=false;
  for(let i=0;i<900;i++){
    const t=i/60,low=slow.sample(t,1/60,{intensity:0.75,speed:0.2});
    const high=fast.sample(t,1/60,{intensity:0.75,speed:1.4});
    if(Math.abs(low.roll-high.roll)>0.0003)divergence=true;
  }
  assert.equal(divergence,true);
  for(let i=0;i<900;i++)slow.sample(15+i/60,1/60,{intensity:0});
  assert.ok(Math.abs(slow.state.roll.x)<1e-7);
  slow.reset();
  assert.equal(slow.state.roll.x,0);
});
test('LP-02C.2 quaternion mean respects negative quaternion representations',()=>{
  const q=roll(13),n=new Quaternion(-q.x,-q.y,-q.z,-q.w);
  const track=new QuaternionKeyframeTrack('spine.quaternion',[0,1],[...q.toArray(),...n.toArray()]);
  assert.ok(quaternionTrackMean(track).angleTo(q)<1e-6);
});
test('LP-02C.2 local twist attenuation reduces roll, preserves yaw and never flips a pose',()=>{
  const center=new Quaternion();
  const yaw=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),rad(12));
  const pose=yaw.clone().multiply(roll(18));
  const corrected=reduceLateralRoll(pose,center,0.6,{maxCorrection:rad(3)});
  assert.ok(corrected.angleTo(pose)<rad(3.1));
  assert.ok(corrected.angleTo(pose)>rad(2.8));
  const restored=reduceLateralRoll(pose,center,0);
  assert.ok(restored.equals(pose));
});
test('LP-02C.2 actual mixer keeps hips and ankles untouched while softening roll',()=>{
  const vrm=rig(),source=clip(),mixer=new AnimationMixer(vrm.scene);
  mixer.clipAction(source).play();mixer.update(0.125);
  const composer=new MotionComposer(vrm);
  composer.selectClip(source,{source:'VRM / Mixamo (experimental)'});
  composer.setEnabled(true);
  const hipBaseline=vrm.nodes.get('hips').position.clone();
  const hipQuaternion=vrm.nodes.get('hips').quaternion.clone();
  const footBaseline=vrm.nodes.get('leftFoot').quaternion.clone();
  const authored=vrm.nodes.get('spine').quaternion.clone();
  let reduced=0;
  for(let i=0;i<100;i++){
    composer.beforeFrame();
    // frozen FBX pose: testing no frame-over-frame accumulation
    reduced=composer.applyTorsoSoftening(1/60);
  }
  assert.ok(reduced>0.5);
  const after=vrm.nodes.get('spine').quaternion.clone();
  assert.ok(after.angleTo(authored)>rad(2.8));
  assert.ok(after.angleTo(authored)<rad(3.1));
  assert.ok(vrm.nodes.get('hips').position.equals(hipBaseline));
  assert.ok(vrm.nodes.get('hips').quaternion.equals(hipQuaternion));
  assert.ok(vrm.nodes.get('leftFoot').quaternion.equals(footBaseline));
  composer.beforeFrame();
  assert.ok(vrm.nodes.get('spine').quaternion.equals(authored),'restored EXACT source pose');
  // No mutation of original keyframe values (source may be exported unchanged).
  assert.equal(source.tracks.find(t=>t.name==='spine.quaternion').values.length,12);
  composer.dispose();
});
test('LP-02C.2 source action and unsupported FBX never receive torso softening',()=>{
  const vrm=rig(),composer=new MotionComposer(vrm);
  const source=clip('Walking');
  composer.selectClip(source,{source:'VRM / Mixamo (experimental)'});
  composer.setEnabled(true);
  assert.equal(composer.applyTorsoSoftening(1/60),0);
  composer.selectClip(clip(),{source:'Original'});
  assert.equal(composer.applyTorsoSoftening(1/60),0);
  assert.equal(composer.getStatus().torsoSoftening.controlledBones.length,0);
});
test('LP-02C.2 procedural body sway does not own hips or feet',()=>{
  const vrm=rig(),motor=new LivingPresence(vrm,{randomSeed:453});
  motor.setEnabled(true);
  motor.setOptions({legs:false});
  const hips=vrm.nodes.get('hips'),root=hips.position.clone();
  const shoe=vrm.nodes.get('rightFoot'),shoeOrigin=shoe.position.clone();
  for(let i=0;i<400;i++){motor.beforeFrame();motor.update(1/60);}
  assert.ok(hips.position.equals(root));
  assert.ok(shoe.position.equals(shoeOrigin));
  motor.setEnabled(false);
  assert.ok(vrm.nodes.get('spine').quaternion.equals(new Quaternion()));
  motor.dispose();
});
