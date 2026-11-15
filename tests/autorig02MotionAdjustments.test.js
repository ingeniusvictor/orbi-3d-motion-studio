import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {
  DEFAULT_MOTION_ADJUSTMENTS, normalizeMotionAdjustments,
  adjustHumanoidMotionClip,
} from '../src/lib/autoRig/motionAdjustments.js';
import {createOrbiMotionSamples} from '../src/lib/autoRig/fullBodyMotion.js';
import {buildBoneSkeleton} from '../src/lib/autoRig/nativeSkinPreview.js';
import {initialMarkers,skeletonDraft} from '../src/lib/autoRig/nativeRig.js';

const q=(x,y,z,angle)=>new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(x,y,z),angle);
const clip=()=>{
  const qa=q(1,0,0,.8),qb=q(0,1,0,-.65),qc=q(0,0,1,.4);
  return new THREE.AnimationClip('Sample Mixamo',2,[
    new THREE.QuaternionKeyframeTrack('leftUpperArm.quaternion',[0,2],
      [0,0,0,1,...qa.toArray()]),
    new THREE.QuaternionKeyframeTrack('rightUpperArm.quaternion',[0,2],
      [0,0,0,1,...qb.toArray()]),
    new THREE.QuaternionKeyframeTrack('rightUpperLeg.quaternion',[0,2],
      [0,0,0,1,...qc.toArray()]),
    new THREE.QuaternionKeyframeTrack('head.quaternion',[0,2],
      [0,0,0,1,0,0,0,1]),
  ]);
};
const track=(c,role)=>c.tracks.find(t=>t.name===role+'.quaternion');
const getQ=(t,i=0)=>new THREE.Quaternion().fromArray(t.values,i*4);

test('02C.4 defaults are exact Mixamo-style neutral and source clips stay unmodified',()=>{
  const source=clip(),values=source.tracks.map(t=>Array.from(t.values));
  const out=adjustHumanoidMotionClip(source);
  assert.equal(out.clip,source);
  assert.equal(out.adjusted,false);
  assert.deepEqual(out.settings,DEFAULT_MOTION_ADJUSTMENTS);
  assert.deepEqual(source.tracks.map(t=>Array.from(t.values)),values);
});

test('02C.4 arm space opens both arms in opposite Z directions, not legs',()=>{
  const source=clip();
  const out=adjustHumanoidMotionClip(source,{armSpace:80});
  const rad=THREE.MathUtils.degToRad(21);
  assert.ok(getQ(track(out.clip,'leftUpperArm')).angleTo(q(0,0,1,-rad))<.0001);
  assert.ok(getQ(track(out.clip,'rightUpperArm')).angleTo(q(0,0,1,rad))<.0001);
  assert.ok(getQ(track(out.clip,'rightUpperLeg')).angleTo(new THREE.Quaternion())<.0001);
  // Original remains unchanged even when adjusted data is used by the mixer.
  assert.ok(getQ(track(source,'leftUpperArm'))
    .angleTo(new THREE.Quaternion())<.0001);
});

test('02C.4 arm swing scales tracked motion, including 0 and 150%',()=>{
  const source=clip(),endOriginal=getQ(track(source,'leftUpperArm'),1);
  const zero=adjustHumanoidMotionClip(source,{armSwing:0}).clip;
  const half=adjustHumanoidMotionClip(source,{armSwing:50}).clip;
  const more=adjustHumanoidMotionClip(source,{armSwing:150}).clip;
  assert.ok(getQ(track(zero,'leftUpperArm'),60).angleTo(new THREE.Quaternion())<1e-6);
  assert.ok(Math.abs(getQ(track(half,'leftUpperArm'),60).angleTo(
    new THREE.Quaternion())-.4)<.01);
  assert.ok(Math.abs(getQ(track(more,'leftUpperArm'),60).angleTo(
    new THREE.Quaternion())-1.2)<.01);
  assert.ok(endOriginal.angleTo(q(1,0,0,.8))<1e-3);
});

test('02C.4 Look creates a bounded head yaw offset',()=>{
  const out=adjustHumanoidMotionClip(clip(),{look:70}).clip;
  assert.ok(getQ(track(out,'head')).angleTo(
    q(0,1,0,THREE.MathUtils.degToRad(10)))<1e-5);
  assert.equal(track(out,'leftUpperArm').name,'leftUpperArm.quaternion');
});

test('02C.4 Mirror swaps left/right tracks and correctly reflects quaternion axes',()=>{
  const source=clip(),out=adjustHumanoidMotionClip(source,{mirror:true}).clip;
  assert.equal(track(out,'rightUpperArm').name,'rightUpperArm.quaternion');
  assert.ok(getQ(track(out,'rightUpperArm'),60).angleTo(
    q(1,0,0,.8))<.002);
  assert.ok(getQ(track(out,'leftUpperArm'),60).angleTo(
    q(0,1,0,.65))<.002);
  assert.equal(track(out,'rightUpperLeg'),undefined);
  assert.ok(track(out,'leftUpperLeg'));
});

test('02C.4 trim keeps chosen subinterval, resamples and preserves source keys',()=>{
  const source=clip();
  const out=adjustHumanoidMotionClip(source,{
    trimStart:25,trimEnd:75,
  });
  assert.ok(Math.abs(out.clip.duration-1)<1e-5);
  const first=getQ(track(out.clip,'leftUpperArm'));
  const last=getQ(track(out.clip,'leftUpperArm'),30);
  assert.ok(Math.abs(first.angleTo(new THREE.Quaternion())-.2)<.005);
  assert.ok(Math.abs(last.angleTo(new THREE.Quaternion())-.6)<.005);
  assert.equal(source.duration,2);
  assert.equal(track(source,'leftUpperArm').times[0],0);
});

test('02C.4 rejects invalid settings, short intervals and clips with position tracks',()=>{
  assert.throws(()=>normalizeMotionAdjustments({armSpace:101}),/rango/);
  assert.throws(()=>normalizeMotionAdjustments({armSwing:-1}),/rango/);
  assert.throws(()=>normalizeMotionAdjustments({look:NaN}),/no numérico/);
  assert.throws(()=>normalizeMotionAdjustments({mirror:'yes'}),/Mirror/);
  assert.throws(()=>normalizeMotionAdjustments({trimStart:90,trimEnd:90}),/5 %/);
  const bad=new THREE.AnimationClip('bad',1,[
    new THREE.VectorKeyframeTrack('hips.position',[0,1],[0,0,0,1,1,1]),
  ]);
  assert.throws(()=>adjustHumanoidMotionClip(bad,{armSpace:60}),/no compatible/);
});

test('02C.4 edited multi-joint motion plays on ORBI skeleton without changing source',()=>{
  const source=createOrbiMotionSamples()[0],before=source.tracks[0].values.slice();
  const edited=adjustHumanoidMotionClip(source,{armSpace:75,armSwing:70,
    trimStart:10,trimEnd:90,mirror:true,look:55}).clip;
  const b=skeletonDraft(initialMarkers({
    min:{x:-.7,y:-.9,z:-.2},max:{x:.7,y:.95,z:.2},
  }));
  const {root,nodeMap,skeleton}=buildBoneSkeleton(b);
  const mixer=new THREE.AnimationMixer(root);
  mixer.clipAction(edited).play();
  mixer.update(.4);
  for(const role of ['leftUpperArm','rightUpperArm',
    'leftUpperLeg','rightUpperLeg']){
    assert.ok(nodeMap.get(role).quaternion
      .angleTo(new THREE.Quaternion())>.01,role+' should move');
  }
  assert.deepEqual(source.tracks[0].values,before);
  mixer.stopAllAction();mixer.uncacheRoot(root);skeleton.dispose();
});

test('02C.4 UI persists settings per imported clip, live preview, reset and trim',()=>{
  const code=readFileSync(new URL('../src/AutoRigLab.jsx',import.meta.url),'utf8');
  for(const text of [
    'savedAdjustmentsRef.current.set(id,settings)',
    'adjustHumanoidMotionClip(chosen.clip,settings)',
    'Character Arm-Space',
    'amplitud',
    'Overdrive',
    'Mirror',
    'trimStart',
    'trimEnd',
    'resetMotionAdjustments',
    'Restaurar ajustes',
  ])assert.ok(code.includes(text),'Missing feature: '+text);
  assert.match(code,/pilot\.loadMotion\(result\.clip\)/);
});
