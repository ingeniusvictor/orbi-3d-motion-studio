import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  mixamoJointKey,inspectMixamoSource,retargetMixamoClip,createOrbiMotionSamples,
} from '../src/lib/autoRig/fullBodyMotion.js';
import {buildBoneSkeleton} from '../src/lib/autoRig/nativeSkinPreview.js';
import {initialMarkers,skeletonDraft} from '../src/lib/autoRig/nativeRig.js';
import {readFileSync} from 'node:fs';

const labels=[
  'Hips','Spine','Spine1','Neck','Head',
  'LeftShoulder','LeftArm','LeftForeArm','LeftHand',
  'RightShoulder','RightArm','RightForeArm','RightHand',
  'LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot',
];
function makeMixamoFixture(){
  const root=new THREE.Group(),nodes=new Map();
  const parents=new Map([
    ['Spine','Hips'],['Spine1','Spine'],['Neck','Spine1'],['Head','Neck'],
    ['LeftShoulder','Spine1'],['LeftArm','LeftShoulder'],
    ['LeftForeArm','LeftArm'],['LeftHand','LeftForeArm'],
    ['RightShoulder','Spine1'],['RightArm','RightShoulder'],
    ['RightForeArm','RightArm'],['RightHand','RightForeArm'],
    ['LeftUpLeg','Hips'],['LeftLeg','LeftUpLeg'],['LeftFoot','LeftLeg'],
    ['RightUpLeg','Hips'],['RightLeg','RightUpLeg'],['RightFoot','RightLeg'],
  ]);
  for(const label of labels){
    const node=new THREE.Bone();
    node.name='mixamorig:'+label;
    node.position.set(0,label==='Hips'?100:5,0);
    // Deliberately non-identity rest axes. Retargeting must cancel rest pose.
    if(label==='LeftArm'||label==='RightUpLeg')
      node.quaternion.setFromEuler(new THREE.Euler(.15,-.12,.08));
    nodes.set(label,node);
    (nodes.get(parents.get(label))||root).add(node);
  }
  root.updateWorldMatrix(true,true);
  const tracks=labels.map(label=>{
    const node=nodes.get(label);
    const r=node.quaternion.clone();
    const moved=r.clone().multiply(new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(1,0,0),.25));
    return new THREE.QuaternionKeyframeTrack(node.name+'.quaternion',
      [0,.5,1],[...r.toArray(),...moved.toArray(),...r.toArray()]);
  });
  tracks.push(new THREE.VectorKeyframeTrack('mixamorig:Hips.position',
    [0,.5,1],[0,100,0,0,102,30,0,100,0]));
  return {root,nodes,clip:new THREE.AnimationClip('Walking',1,tracks)};
}
const targetBones=()=>skeletonDraft(initialMarkers({
  min:{x:-.7,y:-.9,z:-.2},max:{x:.7,y:.95,z:.2},
}));

test('02C.3 recognizes Mixamo namespace prefixes and numerical suffixes',()=>{
  assert.equal(mixamoJointKey('mixamorig:LeftForeArm'),'leftforearm');
  assert.equal(mixamoJointKey('mixamorigLeftForeArm'),'leftforearm');
  assert.equal(mixamoJointKey('Armature|mixamorig2:RightUpLeg'),'rightupleg');
  assert.equal(mixamoJointKey('mixamorig:Hips'),'hips');
  assert.equal(mixamoJointKey(''),'');
});

test('02C.3 transfers 19 joints while omitting translational root motion',()=>{
  const {root,clip}=makeMixamoFixture();
  const res=retargetMixamoClip(root,clip);
  assert.equal(res.mappedRoles.length,19);
  assert.equal(res.rootMotionOmitted,1);
  assert.equal(res.clip.tracks.length,19);
  assert.ok(res.clip.tracks.every(t=>t.name.endsWith('.quaternion')));
  assert.match(res.warning,/traslación de caderas\/root motion omitida/);
  const original=clip.tracks[0].values.slice();
  assert.deepEqual(Array.from(original),Array.from(clip.tracks[0].values));
});

test('02C.3 starts from neutral rest even when Mixamo bind bone axes are rotated',()=>{
  const {root,clip}=makeMixamoFixture();
  const adapted=retargetMixamoClip(root,clip).clip;
  for(const track of adapted.tracks){
    const q=new THREE.Quaternion().fromArray(track.values,0);
    assert.ok(q.angleTo(new THREE.Quaternion())<1e-5,
      'first sample must be neutral for '+track.name);
  }
});

test('02C.3 AnimMixer reproduces simultaneous rotations on ORBI 19-bone skeleton',()=>{
  const {root,clip}=makeMixamoFixture();
  const adapted=retargetMixamoClip(root,clip).clip;
  const {root:target,nodeMap,skeleton}=buildBoneSkeleton(targetBones());
  const mixer=new THREE.AnimationMixer(target);
  mixer.clipAction(adapted).play();
  mixer.update(.5);
  const roles=['leftUpperArm','rightUpperArm','leftLowerArm','leftUpperLeg',
    'rightUpperLeg','rightLowerLeg','spine','head'];
  for(const role of roles){
    assert.ok(nodeMap.get(role).quaternion.angleTo(new THREE.Quaternion())>.05,
      role+' must be animated by whole-body clip');
  }
  mixer.stopAllAction();mixer.uncacheRoot(target);skeleton.dispose();
});

test('02C.3 refuses incompatible Mixamo hierarchy and partial/invalid quaternion tracks',()=>{
  const {root,clip,nodes}=makeMixamoFixture();
  root.remove(nodes.get('Hips'));
  assert.throws(()=>retargetMixamoClip(root,clip),/Faltan/);
  const another=makeMixamoFixture();
  const one=new THREE.AnimationClip('one',1,[another.clip.tracks[0]]);
  assert.throws(()=>retargetMixamoClip(another.root,one),/Se reconocieron/);
  const broken=new THREE.AnimationClip('invalid',1,[
    new THREE.QuaternionKeyframeTrack('mixamorig:Hips.quaternion',[0,.5],
      [0,0,0,1,0,0,0,1]),
  ]);
  assert.throws(()=>retargetMixamoClip(another.root,broken),/Se reconocieron/);
});

test('02C.3 original diagnostic cycles animate multiple limbs without Mixamo assets',()=>{
  const motions=createOrbiMotionSamples();
  assert.equal(motions.length,3);
  assert.ok(motions.every(clip=>clip instanceof THREE.AnimationClip&&
    clip.duration>=2&&clip.tracks.length>=10));
  const walk=motions[0];
  assert.match(walk.name,/Marcha/);
  const {root,nodeMap,skeleton}=buildBoneSkeleton(targetBones());
  const mixer=new THREE.AnimationMixer(root);
  mixer.clipAction(walk).play();
  mixer.update(.35);
  for(const role of ['leftUpperLeg','rightUpperLeg','leftUpperArm','rightUpperArm']){
    assert.ok(nodeMap.get(role).quaternion.angleTo(new THREE.Quaternion())>.02,
      'procedure must actuate '+role);
  }
  mixer.stopAllAction();mixer.uncacheRoot(root);skeleton.dispose();
});

test('02C.3 playback is separated from source and exposes timeline controls',()=>{
  const s=readFileSync(new URL('../src/lib/autoRig/nativeSkinPreview.js',
    import.meta.url),'utf8');
  for(const method of ['loadMotion','setMotionPlaying','setMotionSpeed',
    'updateMotion','seekMotion','stopMotion'])
    assert.ok(s.includes(method+'('),method+' method missing');
  assert.match(s,/new THREE\.AnimationMixer\(boneRoot\)/);
  assert.match(s,/motionMixer\.uncacheRoot\(boneRoot\)/);
  assert.match(s,/source\.visible=false/);
  assert.doesNotMatch(s,/viewer\.model\.add\(boneRoot\)/);
});
