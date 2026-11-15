import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {
  prepareStaticRigPreview,describeViewerRenderableState,
} from '../src/lib/staticRigPreview.js';
import {computeVisibleCharacterBounds,fastStaticGeometryBounds} from '../src/lib/visibleBounds.js';

function staticFixture(){
  const root=new THREE.Group();
  const rootBone=new THREE.Bone();rootBone.name='hips';
  rootBone.position.y=0.5;root.add(rootBone);
  const geom=new THREE.BufferGeometry();
  geom.setAttribute('position',new THREE.Float32BufferAttribute([
    -.5,0,0,.5,0,0,-.5,1.8,0,.5,1.8,0,
  ],3));
  geom.setIndex([0,1,2,1,3,2]);
  geom.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
  ],4));
  geom.setAttribute('skinWeight',new THREE.Float32BufferAttribute([
    1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,
  ],4));
  const mesh=new THREE.SkinnedMesh(geom,new THREE.MeshBasicMaterial());
  mesh.name='LUMIA static';
  root.add(mesh);root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([rootBone]));
  return {root,mesh,rootBone};
}

test('STATIC-FREEZE-02 never computes SkinnedMesh CPU bounding sphere for zero clips',()=>{
  const {root,mesh}=staticFixture();
  let called=0;
  mesh.computeBoundingSphere=()=>{
    called++;
    throw new Error('Expensive CPU skinning must not run during import');
  };
  const before=mesh.geometry.getAttribute('position').array.slice();
  const joints=mesh.geometry.getAttribute('skinIndex').array.slice();
  const weights=mesh.geometry.getAttribute('skinWeight').array.slice();
  const skeleton=mesh.skeleton,mat=mesh.material;
  const state=prepareStaticRigPreview(root,{animations:0});
  assert.equal(called,0);
  assert.equal(state.cullingBypassed,1);
  assert.equal(state.spheresUpdated,0);
  assert.equal(mesh.frustumCulled,false);
  assert.deepEqual(mesh.geometry.getAttribute('position').array,before);
  assert.deepEqual(mesh.geometry.getAttribute('skinIndex').array,joints);
  assert.deepEqual(mesh.geometry.getAttribute('skinWeight').array,weights);
  assert.equal(mesh.skeleton,skeleton);
  assert.equal(mesh.material,mat);
});
test('STATIC-FREEZE-02 bypasses culling for large skinned meshes too',()=>{
  const {root,mesh}=staticFixture();
  mesh.computeBoundingSphere=()=>{throw new Error('must not run');};
  const state=prepareStaticRigPreview(root,{animations:0,maxBypassVertices:1});
  assert.equal(state.cullingBypassed,1);
  assert.equal(mesh.frustumCulled,false);
});
test('STATIC-FREEZE-02 camera sampling skips CPU skinning and morph targets in static mode',()=>{
  const {root,mesh}=staticFixture();
  let calls=0;
  mesh.getVertexPosition=()=>{calls++;throw new Error('CPU skinning sampled');};
  const fast=computeVisibleCharacterBounds(root,{deformed:false,maxSamplesPerMesh:30});
  assert.equal(calls,0);
  assert.equal(fast.method,'rest-vertices-fast');
  assert.ok(fast.box.max.y>=1.79);
  assert.ok(fast.box.min.x<=-.49);
  // Preserve original deformation sampling for animated assets.
  computeVisibleCharacterBounds(root,{deformed:true,maxSamplesPerMesh:30});
  assert.ok(calls>0);
});
test('STATIC-FREEZE-02 static fallback bounding boxes never evaluate CPU skinned vertices',()=>{
  const {root,mesh}=staticFixture();
  let calls=0;
  mesh.getVertexPosition=()=>{calls++;throw Error('Expensive skinning forbidden');};
  const box=fastStaticGeometryBounds(root);
  assert.equal(calls,0);
  assert.equal(box.method,'static-geometry-box-fast');
  assert.ok(box.box.max.y>=1.79);
});
test('STATIC-FREEZE-02 still reports static geometry without synthetic clips',()=>{
  const {root}=staticFixture();
  const status=describeViewerRenderableState(root,[]);
  assert.equal(status.staticModel,true);
  assert.equal(status.animations,0);
  assert.equal(status.hasRenderable,true);
});
test('STATIC-FREEZE-02 shows load phase and yields before heavy initialization',()=>{
  const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  const viewer=readFileSync(new URL('../src/lib/viewer.js',import.meta.url),'utf8');
  for(const snippet of [
    "onProgress:message=>{",
    "setBusy(message)",
  ]) assert.ok(app.includes(snippet),snippet);
  for(const snippet of [
    "stage('Leyendo y decodificando modelo 3D",
    "stage('Preparando huesos, materiales y expresiones",
    "stage('Ajustando cámara al personaje",
    "await new Promise(resolve=>setTimeout(resolve,0))",
  ]) assert.ok(viewer.includes(snippet),snippet);
});

test('STATIC-FREEZE-02 camera fit defaults to fast path only for zero clips',()=>{
  const code=readFileSync(new URL('../src/lib/viewer.js',import.meta.url),'utf8');
  assert.match(code,/const staticModel=!this\.clips\?\.length/);
  assert.match(code,/deformed:!staticModel/);
  assert.match(code,/fastStaticGeometryBounds/);
  assert.match(code,/maxSamplesPerMesh:staticModel\?1600:4800/);
  const staticCode=readFileSync(new URL('../src/lib/staticRigPreview.js',import.meta.url),'utf8');
  assert.doesNotMatch(staticCode,/node\.computeBoundingSphere\s*\(/);
});
