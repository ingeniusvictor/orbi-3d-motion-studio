import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {
  VIEWABLE_FORMATS,VIEWABLE_EXTENSIONS,choosePrimaryModel,
  inspectGLBHeader,inspectGLTFJson,inspectGLTFFile,
  explainImportError,
} from '../src/lib/viewerCompatibility.js';
import {
  createCompatibleModelLoader,detectPLYPointCloudHeader,
} from '../src/lib/loadCompatibleModel.js';
import {
  prepareStaticRigPreview,describeViewerRenderableState,
} from '../src/lib/staticRigPreview.js';
import {
  computeVisibleCharacterBounds,
} from '../src/lib/visibleBounds.js';
import {isSupportedModel,validateLoadedContent,
  summarizeRenderableGeometry} from '../src/lib/modelInfo.js';
import {readFileSync} from 'node:fs';

function makeGLB(document){
  const bytes=new TextEncoder().encode(JSON.stringify(document));
  const length=Math.ceil(bytes.length/4)*4;
  const binary=new Uint8Array(20+length);
  const v=new DataView(binary.buffer);
  v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);
  v.setUint32(8,binary.length,true);
  v.setUint32(12,length,true);v.setUint32(16,0x4e4f534a,true);
  binary.fill(32,20);binary.set(bytes,20);
  return binary;
}
function fakeFile(bytes,name){
  return {
    name,size:bytes.length,
    slice(a,b){return {arrayBuffer:async()=>bytes.slice(a,b).buffer};},
  };
}
function makeStaticSkinnedModel(){
  const root=new THREE.Group(),bone=new THREE.Bone();bone.name='hips';
  root.add(bone);
  const geom=new THREE.BoxGeometry(1,2,.5);
  const count=geom.attributes.position.count;
  const weights=new Float32Array(count*4);
  const indices=new Uint16Array(count*4);
  for(let i=0;i<count;i++)weights[i*4]=1;
  geom.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
  geom.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const body=new THREE.SkinnedMesh(geom,new THREE.MeshBasicMaterial());
  body.name='LUMIA STATIC BODY';
  root.add(body);root.updateMatrixWorld(true);
  body.bind(new THREE.Skeleton([bone]));
  return {root,body,bone};
}

test('VIEWER-COMPAT-01 explicitly supports common viewable formats, not all arbitrary formats',()=>{
  for(const ext of ['glb','gltf','vrm','fbx','obj','stl','ply','dae','3ds']){
    assert.ok(Object.hasOwn(VIEWABLE_FORMATS,ext),ext);
    assert.ok(VIEWABLE_EXTENSIONS.includes(ext));
    assert.equal(isSupportedModel('LUMIA.'+ext.toUpperCase()),true);
  }
  assert.equal(isSupportedModel('character.blend'),false);
  const files=[{name:'diffuse.png'},{name:'avatar.OBJ'},{name:'avatar.mtl'}];
  assert.equal(choosePrimaryModel(files)?.name,'avatar.OBJ');
  assert.equal(choosePrimaryModel([{name:'README.txt'}]),null);
});

test('VIEWER-COMPAT-01 glTF 2.0 header and static skin are independent of animation count',async()=>{
  const json={asset:{version:'2.0',generator:'Claude / Blender'},
    meshes:[{}],skins:[{joints:[0]}],nodes:[{name:'Head'}],
    extensionsUsed:['KHR_materials_unlit']};
  const binary=makeGLB(json);
  const info=await inspectGLTFFile(fakeFile(binary,'LUMIA_V09.glb'));
  assert.equal(info.animations,0);
  assert.equal(info.skins,1);
  assert.equal(info.meshes,1);
  assert.deepEqual(info.extensions,['KHR_materials_unlit']);
  assert.equal(inspectGLBHeader(binary.slice(0,20).buffer).ok,true);
  assert.equal(validateLoadedContent({
    hasGeometry:true,drawableMeshes:1},0,false),null);
  assert.throws(()=>inspectGLTFJson({asset:{version:'1.0'}}),/2.0/);
  assert.equal(inspectGLBHeader(new Uint8Array(10).buffer).ok,false);
});

test('VIEWER-COMPAT-01 diagnoses compressed glTF codecs and missing resources',()=>{
  const m=inspectGLTFJson({asset:{version:'2.0'},
    extensionsUsed:[
      'KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu',
    ],extensionsRequired:['KHR_draco_mesh_compression']});
  assert.equal(m.needsDraco,true);
  assert.equal(m.needsMeshopt,true);
  assert.equal(m.needsKtx2,true);
  assert.match(explainImportError('glb',new Error('Draco decoder failed')),/Draco/);
  assert.match(explainImportError('gltf',new Error('404 image.png')),/archivos auxiliares/);
});

test('VIEWER-COMPAT-01 instantiates loaders for formats, without modifying models',async()=>{
  const mgr=new THREE.LoadingManager();
  for(const ext of VIEWABLE_EXTENSIONS){
    const {loader,dispose}=await createCompatibleModelLoader(ext,{
      manager:mgr,
    });
    assert.ok(loader&&typeof loader.loadAsync==='function',ext);
    dispose();
  }
  await assert.rejects(createCompatibleModelLoader('glb',{
    manager:mgr,preflight:{needsKtx2:true},
  }),/contexto WebGL/);
  await assert.rejects(createCompatibleModelLoader('blend',{manager:mgr}),/no soportado/);
  const {loader}=await createCompatibleModelLoader('obj',{manager:mgr});
  const scene=loader.parse('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
  assert.ok(scene.children.some(o=>o.isMesh));
});

test('VIEWER-COMPAT-01 PLY point clouds are visible and framed without mesh faces',()=>{
  assert.equal(detectPLYPointCloudHeader('ply\nformat ascii 1.0\nelement vertex 3\nend_header'),true);
  assert.equal(detectPLYPointCloudHeader('ply\nelement face 20\nend_header'),false);
  const root=new THREE.Group();
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([
    -1,0,0,1,0,0,0,2,0],3));
  const points=new THREE.Points(geometry,new THREE.PointsMaterial({size:.05}));
  root.add(points);
  assert.equal(summarizeRenderableGeometry(root).drawableMeshes,1);
  const bounds=computeVisibleCharacterBounds(root);
  assert.ok(bounds?.box);
  assert.equal(bounds.includedMeshes,1);
  assert.ok(bounds.box.max.y>1.9);
  const state=describeViewerRenderableState(root,[]);
  assert.equal(state.pointClouds,1);
  assert.equal(state.staticModel,true);
});

test('VIEWER-COMPAT-01 static skinned geometry never needs synthetic animation',()=>{
  const {root,body,bone}=makeStaticSkinnedModel();
  const positions=body.geometry.getAttribute('position').array.slice();
  const weights=body.geometry.getAttribute('skinWeight').array.slice();
  const reference=bone.quaternion.clone();
  const material=body.material;
  const sourceSkeleton=body.skeleton;
  const result=prepareStaticRigPreview(root,{animations:0});
  assert.equal(result.staticModel,true);
  assert.equal(result.skins,1);
  assert.equal(result.cullingBypassed,1);
  assert.equal(body.frustumCulled,false);
  assert.ok(result.spheresUpdated>=0);
  assert.equal(body.material,material);
  assert.equal(body.skeleton,sourceSkeleton);
  assert.ok(bone.quaternion.equals(reference));
  assert.deepEqual(body.geometry.getAttribute('position').array,positions);
  assert.deepEqual(body.geometry.getAttribute('skinWeight').array,weights);
  assert.ok(computeVisibleCharacterBounds(root)?.box);
  const second=makeStaticSkinnedModel();
  const animated=prepareStaticRigPreview(second.root,{animations:1});
  assert.equal(animated.staticModel,false);
  assert.equal(animated.cullingBypassed,0);
  assert.equal(second.body.frustumCulled,true);
});

test('VIEWER-COMPAT-01 real static GLB roundtrip keeps skin and zero animation clips',async()=>{
  const {root}=makeStaticSkinnedModel();
  const data=await new GLTFExporter().parseAsync(root,{binary:true,animations:[]});
  assert.ok(data instanceof ArrayBuffer);
  const loaded=await new GLTFLoader().parseAsync(data,'');
  assert.equal(loaded.animations.length,0);
  let meshes=0,skins=0;
  loaded.scene.traverse(n=>{
    if(n.isSkinnedMesh){meshes++;skins+=n.skeleton.bones.length;}
  });
  assert.equal(meshes,1);
  assert.equal(skins,1);
  const visibility=prepareStaticRigPreview(loaded.scene,{
    animations:loaded.animations.length,
  });
  assert.equal(visibility.cullingBypassed,1);
  assert.ok(computeVisibleCharacterBounds(loaded.scene)?.box);
});

test('VIEWER-COMPAT-01 existing workflow remains separate from preview-only formats',()=>{
  const viewer=readFileSync(new URL('../src/lib/viewer.js',import.meta.url),'utf8');
  const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  assert.match(viewer,/loadCompatibleModel\(/);
  assert.match(viewer,/getImportDiagnostics\(/);
  assert.match(viewer,/diagnoseModelVisibility\(/);
  assert.match(viewer,/prepareStaticRigPreview\(/);
  assert.match(app,/Diagnosticar visualización/);
  assert.match(app,/\.obj,\.mtl,\.stl,\.ply,\.dae,\.3ds/);
  assert.match(viewer,/this\.existingRigRest = captureExistingRigRest\(this\.model\)/);
});
