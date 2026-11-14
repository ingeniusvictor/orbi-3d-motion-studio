import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {initialMarkers,skeletonDraft,validateMarkers} from '../src/lib/autoRig/nativeRig.js';
import {computeSkinWeights,validateWeightBuffers,prepareBoneSegments} from '../src/lib/autoRig/nativeSkinWeights.js';
import {buildBoneSkeleton,collectStaticMeshes} from '../src/lib/autoRig/nativeSkinPreview.js';

const bounds={min:{x:-.7,y:-.9,z:-.2},max:{x:.7,y:.95,z:.2}};
const bones=()=>skeletonDraft(initialMarkers(bounds));

test('02C computes max-four finite normalized influences on a realistic skeleton',()=>{
  const sample=new Float32Array([
    -.37,.5,.02,-.45,.48,.01,.37,.5,.02,.44,.48,.01,
    -.1,-.3,.02,.1,-.3,.02,0,.7,.03,
  ]);
  const b=bones();
  const result=computeSkinWeights(sample,b);
  assert.equal(result.indices.length,(sample.length/3)*4);
  assert.equal(result.weights.length,result.indices.length);
  assert.equal(result.audit.vertices,sample.length/3);
  assert.equal(result.audit.influencedVertices,result.audit.vertices);
  assert.equal(result.audit.requiresDeformationQA,true);
  assert.equal(result.audit.sourceMethod,'distance-approximation');
  assert.equal(validateWeightBuffers(result.indices,result.weights,b.length).ok,true);
  for(let v=0;v<sample.length/3;v++){
    const w=result.weights.slice(v*4,v*4+4);
    assert.ok(Math.abs([...w].reduce((a,b)=>a+b,0)-1)<1e-5);
    assert.ok([...w].every(x=>x>=0&&Number.isFinite(x)));
  }
});

test('02C warns about default planar joint depths without blocking the skeleton',()=>{
  const m=initialMarkers(bounds);
  const result=validateMarkers(m);
  assert.equal(result.ok,true);
  assert.ok(result.warnings.some(w=>w.includes('profundidad Z')));
});

test('02C favors anatomically nearby arm and leg chains',()=>{
  const b=bones(),markers=initialMarkers(bounds);
  const pts=new Float32Array([
    ...markers.leftWrist,...markers.rightWrist,...markers.leftKnee,...markers.rightKnee,
  ]);
  const r=computeSkinWeights(pts,b,{softness:.02});
  const read=(v)=>Array.from(r.indices.slice(v*4,v*4+4)).map((i,k)=>({
    name:b[i].name,w:r.weights[v*4+k],
  })).filter(x=>x.w>0);
  assert.ok(read(0).some(x=>x.name==='leftLowerArm'));
  assert.ok(read(1).some(x=>x.name==='rightLowerArm'));
  assert.ok(read(2).some(x=>x.name==='leftUpperLeg'||x.name==='leftLowerLeg'));
  assert.ok(read(3).some(x=>x.name==='rightUpperLeg'||x.name==='rightLowerLeg'));
});

test('02C rejects invalid bones, vertex coordinates and influence limits',()=>{
  const b=bones();
  assert.equal(prepareBoneSegments(b).length,19);
  assert.throws(()=>computeSkinWeights(new Float32Array([0,0]),b),/ternas/);
  assert.throws(()=>computeSkinWeights([0,Infinity,0],b),/no finito/);
  assert.throws(()=>computeSkinWeights([0,0,0],b,{maxInfluences:5}),/entre 1 y 4/);
  assert.throws(()=>computeSkinWeights([0,0,0],b,{softness:0}),/Suavizado/);
  assert.throws(()=>computeSkinWeights([0,0,0],[b[0],b[0]]),/duplicado/);
  assert.throws(()=>computeSkinWeights([0,0,0],[{name:'zero',head:[0,0,0],tail:[0,0,0]}]),/longitud cero/);
  assert.equal(validateWeightBuffers(new Uint16Array([0,0,0,0]),
    new Float32Array([.4,.2,.2,.1]),19).ok,false);
});

test('02C creates hierarchy of 19 actual THREE.Bone objects with stable names',()=>{
  const b=bones();
  const {root,skeleton,nodeMap}=buildBoneSkeleton(b);
  assert.equal(skeleton.bones.length,19);
  assert.ok(root.children[0].isBone);
  assert.deepEqual(skeleton.bones.map(x=>x.name),b.map(x=>x.name));
  assert.equal(nodeMap.get('leftLowerArm').parent,nodeMap.get('leftUpperArm'));
  const expected=new THREE.Vector3().fromArray(
    b.find(x=>x.name==='leftLowerArm').head);
  const actual=nodeMap.get('leftLowerArm').getWorldPosition(new THREE.Vector3());
  assert.ok(actual.distanceTo(expected)<1e-7);
  skeleton.dispose();
});

test('02C rotations deform a synthetic skinned vertex without mutating source',()=>{
  const b=bones(),{root,skeleton,nodeMap}=buildBoneSkeleton(b);
  const target=b.find(x=>x.name==='leftLowerArm');
  const point=new THREE.Vector3().fromArray(target.tail);
  const source=point.clone();
  const geom=new THREE.BufferGeometry();
  geom.setAttribute('position',new THREE.Float32BufferAttribute(point.toArray(),3));
  const idx=b.findIndex(x=>x.name==='leftLowerArm');
  geom.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([idx,0,0,0],4));
  geom.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0],4));
  const mesh=new THREE.SkinnedMesh(geom,new THREE.MeshBasicMaterial());
  const group=new THREE.Group();group.add(root,mesh);
  group.updateMatrixWorld(true);
  mesh.bind(skeleton,new THREE.Matrix4());
  const rest=mesh.applyBoneTransform(0,source.clone());
  assert.ok(rest.distanceTo(source)<1e-6,'bind pose must remain unchanged');
  nodeMap.get('leftLowerArm').rotation.z=Math.PI/5;
  root.updateMatrixWorld(true);
  skeleton.update();
  const moved=mesh.applyBoneTransform(0,source.clone());
  assert.ok(moved.distanceTo(rest)>.005,'bone must actually deform vertex');
  assert.ok(new THREE.Vector3().fromBufferAttribute(geom.getAttribute('position'),0)
    .distanceTo(source)<1e-6,'source geometry is unchanged');
  mesh.material.dispose();geom.dispose();skeleton.dispose();
});

test('02C rejects skinned or morph-target models; accepts static source meshes',()=>{
  const group=new THREE.Group();
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());
  group.add(mesh);
  assert.equal(collectStaticMeshes(group).meshes.length,1);
  mesh.geometry.morphAttributes.position=[mesh.geometry.attributes.position.clone()];
  assert.throws(()=>collectStaticMeshes(group),/morph targets/);
  mesh.geometry.morphAttributes.position=[];
  mesh.material.dispose();mesh.geometry.dispose();
});
