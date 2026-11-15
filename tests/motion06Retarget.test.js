import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  identifyMixamoProfile,retargetMixamoToV06B,skinBoneIndex,
  LUMIA_MIXAMO_PROFILES,
} from '../src/lib/autoRig/mixamoRetargetV06.js';

function makeRig(count,{target=false}={}){
  const root=new THREE.Group();
  const required=target?[
    'V8_root','V8_Bip001-Pelvis','V8_Bip001-Spine','V8_Bip001-Spine1',
    'V8_Bip001-Spine2','V8_Bip001-Neck','J_Bip_C_Head',
    'V8_Bip001-L-Clavicle','V8_Bip001-R-Clavicle',
    'V8_Bip001-L-UpperArm','V8_Bip001-R-UpperArm',
    'V8_Bip001-L-Forearm','V8_Bip001-R-Forearm',
    'V8_Bip001-L-Hand','V8_Bip001-R-Hand',
    'V8_Bip001-L-Thigh','V8_Bip001-R-Thigh',
    'V8_Bip001-L-Calf','V8_Bip001-R-Calf',
    'V8_Bip001-L-Foot','V8_Bip001-R-Foot',
    'V8_Bip001-L-Toe0','V8_Bip001-R-Toe0',
  ]:[
    'Root','J_Bip_C_Hips','J_Bip_C_Spine','J_Bip_C_Head',
    'J_Bip_L_UpperArm','J_Bip_R_UpperArm',
    'J_Bip_L_UpperLeg','J_Bip_R_UpperLeg',
    'J_Bip_L_ToeBase','J_Bip_R_ToeBase',
    ...(count===155?['HairJoint-test']:['V8_Bone-L-ForeArm-Twist']),
  ];
  const names=[...required];
  for(let i=names.length;i<count;i++)names.push('dummy_'+i);
  const boneRoot=new THREE.Bone();boneRoot.name=names[0];root.add(boneRoot);
  const bones=[boneRoot];
  for(let i=1;i<names.length;i++){
    const bone=new THREE.Bone();bone.name=names[i];
    bone.position.set(i%2 ? .1 : -.1,i===1 ? 1 : .02,.01);
    boneRoot.add(bone);bones.push(bone);
  }
  root.updateWorldMatrix(true,true);
  const geom=new THREE.BoxGeometry(.1,.1,.1);
  geom.setAttribute('skinIndex',
    new THREE.Uint16BufferAttribute(new Uint16Array(geom.attributes.position.count*4),4));
  const weights=new Float32Array(geom.attributes.position.count*4);
  for(let i=0;i<weights.length;i+=4)weights[i]=1;
  geom.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const mesh=new THREE.SkinnedMesh(geom,new THREE.MeshBasicMaterial());
  root.add(mesh);root.updateWorldMatrix(true,true);
  mesh.bind(new THREE.Skeleton(bones));
  return {root,bones};
}
const sourceClip=()=>new THREE.AnimationClip('Clip',1,[
  new THREE.QuaternionKeyframeTrack('J_Bip_L_UpperArm.quaternion',[0,.5,1],[
    0,0,0,1,0,0,.38268343,.92387953,0,0,0,1,
  ]),
]);

test('MOTION-06 strict profile detection accepts only LUMIA 155/D162 to V06B 346',()=>{
  const target=makeRig(346,{target:true}).root;
  assert.equal(identifyMixamoProfile(makeRig(155).root,target).id,
    LUMIA_MIXAMO_PROFILES.ORIGINAL_155);
  assert.equal(identifyMixamoProfile(makeRig(162).root,target).id,
    LUMIA_MIXAMO_PROFILES.ADULT_D_162);
  assert.throws(()=>identifyMixamoProfile(makeRig(154).root,target),
    /esperaban 155 o 162/);
  assert.equal(skinBoneIndex(target).size,346);
});

test('MOTION-06 adds animation tracks without mutating source or target skeleton',()=>{
  const target=makeRig(346,{target:true});
  const source=makeRig(155),clip=sourceClip();
  const targetRest=target.bones.map(b=>b.position.clone());
  const sourceRest=source.bones.map(b=>b.quaternion.clone());
  const originalSource=clip.tracks.map(t=>Array.from(t.values));
  const {clip:converted,report}=retargetMixamoToV06B({
    sourceRoot:source.root,sourceClip:clip,targetRoot:target.root,
    pivot:'anchored',toes:'keep',
  });
  assert.equal(report.sourceBones,155);
  assert.equal(report.targetBones,346);
  assert.ok(report.tracks>2);
  assert.ok(converted.tracks.some(t=>t.name===target.bones[0].uuid+'.position'));
  assert.ok(converted.tracks.every(t=>t.times.length===report.samples));
  assert.deepEqual(target.bones.map(b=>b.position),targetRest);
  assert.deepEqual(clip.tracks.map(t=>Array.from(t.values)),originalSource);
  // Source FBX is disposable after use. AnimationMixer can leave the original
  // source pose changed; the source CLIP itself must remain exact.
  assert.equal(sourceRest.length,155);
});

test('MOTION-06 rejects unsupported options instead of guessing',()=>{
  assert.throws(()=>retargetMixamoToV06B({
    sourceRoot:makeRig(155).root,sourceClip:sourceClip(),
    targetRoot:makeRig(346,{target:true}).root,pivot:'freefall',
  }),/opciones/i);
});
