import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {
  captureReferencePose,cloneAtReferencePose,prepareMixamoRig,
  makeCalibratedTPose,exportableClipJSON,
} from '../src/lib/motionExtraction.js';
import {cleanRiggedMixamoFBX,isBinaryFBX} from '../src/lib/fbxExport.js';
import {readPhysicalFbxRig} from '../src/lib/fbxBoneAudit.js';
import {skinBoneCount,skinnedMeshes} from '../src/lib/lightweight.js';

function fixture({includeRight=true}={}){
  const root=new THREE.Group();root.name='Animated_Character';
  function bone(name,parent,x=0,y=0,z=0){
    const b=new THREE.Bone();b.name='mixamorig:'+name;
    b.position.set(x,y,z);parent.add(b);return b;
  }
  const hips=bone('Hips',root,0,1,0);
  const spine=bone('Spine',hips,0,0.3,0);
  const original={root,hips,spine,arms:{}};
  for(const [side,sign] of [['Left',1],['Right',-1]]){
    if(side==='Right'&&!includeRight)continue;
    const upper=bone(side+'Arm',spine,sign*.22,.22,0);
    const fore=bone(side+'ForeArm',upper,sign*.34,-.23,0);
    const hand=bone(side+'Hand',fore,sign*.27,-.17,0);
    original.arms[side]={upper,fore,hand};
  }
  root.updateWorldMatrix(true,true);
  const bones=[];root.traverse(n=>{if(n.isBone)bones.push(n);});
  const geom=new THREE.BoxGeometry(.5,1,.2);
  const count=geom.getAttribute('position').count;
  const indices=new Uint16Array(count*4),weights=new Float32Array(count*4);
  for(let i=0;i<count;i++)weights[i*4]=1;
  geom.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
  geom.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const mesh=new THREE.SkinnedMesh(geom,new THREE.MeshStandardMaterial());
  mesh.name='Character_With_Skin';root.add(mesh);
  root.updateWorldMatrix(true,true);
  mesh.bind(new THREE.Skeleton(bones));
  return original;
}
const worldSegment=(a,b)=>b.getWorldPosition(new THREE.Vector3())
  .sub(a.getWorldPosition(new THREE.Vector3())).normalize();

test('MOTION-05A a reference pose is captured before mixer alters the original',()=>{
  const {root,hips,arms}=fixture();
  const original=captureReferencePose(root);
  hips.rotation.y=0.45;arms.Left.upper.rotation.x=0.4;
  root.updateWorldMatrix(true,true);
  const clean=cloneAtReferencePose(root,original);
  const map=new Map();clean.traverse(n=>map.set(n.name,n));
  assert.ok(Math.abs(map.get('mixamorig:Hips').rotation.y)<1e-8);
  assert.ok(Math.abs(map.get('mixamorig:LeftArm').rotation.x)<1e-8);
  assert.ok(Math.abs(hips.rotation.y-0.45)<1e-8,'original animation remains untouched');
  assert.equal(skinBoneCount(clean),skinBoneCount(root));
  assert.equal(skinnedMeshes(clean).length,1);
});
test('MOTION-05A two A-pose arms become horizontal T without modifying source',()=>{
  const f=fixture(),initial=captureReferencePose(f.root);
  const initialBone=f.arms.Left.upper.quaternion.clone();
  const built=prepareMixamoRig(f.root,initial,{pose:'t'});
  assert.equal(built.pose,'T calibrada');
  assert.equal(built.adjustments.length,2);
  const nodes=new Map();built.model.traverse(n=>nodes.set(n.name,n));
  for(const [side,sign] of [['Left',1],['Right',-1]]){
    const b=nodes.get('mixamorig:'+side+'Arm');
    const fore=nodes.get('mixamorig:'+side+'ForeArm');
    const hand=nodes.get('mixamorig:'+side+'Hand');
    const direction=worldSegment(b,fore);
    const second=worldSegment(fore,hand);
    assert.ok(direction.dot(new THREE.Vector3(sign,0,0))>0.999);
    assert.ok(second.dot(new THREE.Vector3(sign,0,0))>0.999);
  }
  assert.ok(f.arms.Left.upper.quaternion.equals(initialBone));
  assert.equal(built.bones,8);
  assert.equal(built.meshes,1);
});
test('MOTION-05A pose reference fallback never forces T correction',()=>{
  const f=fixture(),original=captureReferencePose(f.root);
  const result=prepareMixamoRig(f.root,original,{pose:'reference'});
  assert.equal(result.pose,'Referencia original');
  assert.deepEqual(result.adjustments,[]);
  assert.deepEqual(captureReferencePose(f.root),original);
});
test('MOTION-05A emits an actual binary FBX with skin, original bone graph and zero clips',()=>{
  const f=fixture(),original=captureReferencePose(f.root);
  const clip=new THREE.AnimationClip('Dance',1,[
    new THREE.QuaternionKeyframeTrack('mixamorig:LeftArm.quaternion',
      [0,1],[0,0,0,1,0,0,.2,Math.sqrt(1-.2*.2)]),
  ]);
  f.root.animations=[clip];
  f.hips.rotation.y=.3;
  const before=f.hips.rotation.y;
  const result=cleanRiggedMixamoFBX(f.root,original,{pose:'t'});
  assert.ok(isBinaryFBX(result.bytes));
  assert.equal(result.animations,0);
  assert.equal(result.bones,8);
  assert.equal(result.meshes,1);
  assert.equal(readPhysicalFbxRig(result.bytes).size,8);
  const reimported=new FBXLoader().parse(result.bytes.buffer.slice(
    result.bytes.byteOffset,result.bytes.byteOffset+result.bytes.byteLength),'');
  assert.equal(reimported.animations.length,0);
  reimported.updateWorldMatrix(true,true);
  const reloadedBones=[];
  reimported.traverse(node=>{if(node.isBone)reloadedBones.push(node);});
  const normalizedName=node=>node.name.replace(/[^a-z0-9]/gi,'')
    .toLowerCase().replace(/\d+$/,'');
  for(const side of ['Left','Right']){
    // FBXLoader may strip colons, add suffixes or clone a per-skin proxy.
    const upper=reloadedBones.find(node=>normalizedName(node).endsWith(
      side.toLowerCase()+'arm'));
    const fore=reloadedBones.find(node=>normalizedName(node).endsWith(
      side.toLowerCase()+'forearm'));
    assert.ok(upper&&fore,'FBX bone list: '+
      reloadedBones.map(node=>node.name).join(', '));
    const direction=worldSegment(upper,fore);
    assert.ok(Math.abs(direction.y)<0.055,
      'exported FBX must preserve horizontal '+side+' T arm. y='+direction.y);
  }
  assert.equal(f.root.animations.length,1);
  assert.equal(f.hips.rotation.y,before);
});
test('MOTION-05A refuses missing humanoid arms without fake T pose',()=>{
  const f=fixture({includeRight:false}),original=captureReferencePose(f.root);
  assert.throws(()=>prepareMixamoRig(f.root,original,{pose:'t'}),/brazo right/);
  const fallback=prepareMixamoRig(f.root,original,{pose:'reference'});
  assert.equal(fallback.pose,'Referencia original');
});
test('MOTION-05A protects against stale hierarchy and unrigged models',()=>{
  const f=fixture(),original=captureReferencePose(f.root);
  f.root.add(new THREE.Group());
  assert.throws(()=>cloneAtReferencePose(f.root,original),/jerarquía/);
  assert.throws(()=>cloneAtReferencePose(new THREE.Group(),original),/SkinnedMesh/);
  assert.throws(()=>prepareMixamoRig(f.root,original,{pose:'unsafe'}),/pose/);
});
test('MOTION-05A extracted clip JSON stores motion and compatibility metadata separately',()=>{
  const f=fixture();
  const clip=new THREE.AnimationClip('Dance',1,[
    new THREE.QuaternionKeyframeTrack('mixamorig:LeftArm.quaternion',[0,1],
      [0,0,0,1,0,0,0,1]),
  ]);
  const data=JSON.parse(exportableClipJSON(clip,{
    rigName:'My_character.fbx',rigBones:skinBoneCount(f.root),
  }));
  assert.equal(data.format,'orbi.motion.clip.v1');
  assert.equal(data.clip.name,'Dance');
  assert.equal(data.sourceRig.boneCount,8);
  assert.ok(data.clip.tracks.length>0);
  assert.equal(THREE.AnimationClip.parse(data.clip).tracks.length,1);
  assert.throws(()=>exportableClipJSON(new THREE.AnimationClip('Empty',1,[])),/válida/);
});
