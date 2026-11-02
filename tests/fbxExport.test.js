import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {lightweightBinaryFBX,animatedBinaryFBX,isBinaryFBX} from '../src/lib/fbxExport.js';
import {skinnedMeshes,skinBoneCount,categorizeLightMesh,suggestLightMeshes} from '../src/lib/lightweight.js';

function character(){
  const root=new THREE.Group();root.name='LUMIA_BODY';
  const bones=[];
  for(let i=0;i<7;i++){
    const bone=new THREE.Bone();bone.name='j_bip_'+i;
    if(i)bones[i-1].add(bone); else root.add(bone);
    bone.position.y=i===0?1:0.1;bones.push(bone);
  }
  function mesh(name){
    const g=new THREE.BoxGeometry(0.2,0.6,0.2);
    const n=g.getAttribute('position').count;
    const indexes=new Uint16Array(n*4),weights=new Float32Array(n*4);
    for(let i=0;i<n;i++){weights[i*4]=1;indexes[i*4]=i%7;}
    g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indexes,4));
    g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
    const node=new THREE.SkinnedMesh(g,new THREE.MeshStandardMaterial());
    node.name=name;root.add(node);node.bind(new THREE.Skeleton(bones));return node;
  }
  const body=mesh('LUMIA_FULL_SKIN_1');
  mesh('Vita_Dress_Skin');
  return {root,body};
}
test('classifies a dress with Skin in the name as clothing, never default body',()=>{
  const {root}=character(),meshes=skinnedMeshes(root);
  assert.equal(categorizeLightMesh('Vita_Dress_Skin').type,'clothing');
  assert.equal(categorizeLightMesh('LUMIA_FULL_SKIN_1').type,'body');
  const selected=suggestLightMeshes(meshes);
  assert.equal(selected.length,1);
  assert.equal(selected[0],meshes[0].id);
});
test('direct FBX is real binary, reloads a skinned mesh and all original bones',()=>{
  const {root}=character();
  const names=skinnedMeshes(root);
  const before=skinBoneCount(root);
  assert.equal(before,7);
  const result=lightweightBinaryFBX(root,[names[0].id]);
  assert.ok(isBinaryFBX(result.bytes));
  assert.equal(result.bones,7);
  assert.equal(result.meshes,1);
  assert.equal(result.removed,1);
  assert.equal(skinBoneCount(root),7);
  assert.equal(skinnedMeshes(root).length,2);
});
test('animated FBX keeps a rig and includes its movement data',()=>{
  const {root}=character();
  // Single-skinned-mesh character: the exporter must not duplicate its bones.
  root.remove(skinnedMeshes(root).length?root.getObjectByName('Vita_Dress_Skin'):null);
  const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),0.2);
  const clip=new THREE.AnimationClip('Idle',1,[
    new THREE.QuaternionKeyframeTrack('j_bip_0.quaternion',[0,1],[0,0,0,1,...q.toArray()])
  ]);
  const out=animatedBinaryFBX(root,[clip]);
  assert.ok(isBinaryFBX(out.bytes));
  assert.equal(out.bones,7);
  assert.equal(out.meshes,1);
});
test('multi-mesh animated FBX blocks export when it duplicates the skeleton',()=>{
  const {root}=character();
  const clip=new THREE.AnimationClip('Idle',1,[new THREE.QuaternionKeyframeTrack('j_bip_0.quaternion',[0,1],[0,0,0,1,0,0,0,1])]);
  assert.throws(()=>animatedBinaryFBX(root,[clip]),/no conservó todos los huesos/);
});
