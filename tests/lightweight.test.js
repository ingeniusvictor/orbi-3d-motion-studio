import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {skinnedMeshes,suggestLightMeshes,skinBoneCount,makeLightweightClone,exportLightweightGLB} from '../src/lib/lightweight.js';
import {blenderConvertScript} from '../src/lib/mixamoKit.js';

function fixture(){
  const root=new THREE.Group();
  const hip=new THREE.Bone();hip.name='Hips';root.add(hip);
  const spine=new THREE.Bone();spine.name='Spine';hip.add(spine);
  const head=new THREE.Bone();head.name='Head';spine.add(head);
  function addMesh(name,material){
    const g=new THREE.BoxGeometry(1,1,1);
    const count=g.getAttribute('position').count;
    const indices=new Uint16Array(count*4),weights=new Float32Array(count*4);
    for(let i=0;i<count;i++)weights[i*4]=1;
    g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
    g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
    g.morphAttributes.position=[g.getAttribute('position').clone()];
    const mesh=new THREE.SkinnedMesh(g,material);
    mesh.name=name;root.add(mesh);
    mesh.bind(new THREE.Skeleton([hip,spine,head]));
    return mesh;
  }
  const body=addMesh('Lumia_Body_Skin',new THREE.MeshStandardMaterial({color:0xffffff}));
  const hair=addMesh('Lumia_Hair',new THREE.MeshStandardMaterial({color:0x123456}));
  return {root,body,hair,hip,spine,head};
}
test('LightPrep defaults to body and excludes separate hair',()=>{
  const {root}=fixture(),meshes=skinnedMeshes(root);
  const chosen=suggestLightMeshes(meshes);
  assert.equal(meshes.length,2);
  assert.equal(chosen.length,1);
  assert.equal(chosen[0],meshes[0].id);
});
test('LightPrep only clones and never changes original model/materials/pose',()=>{
  const {root,body,hair,hip}=fixture();
  hip.rotation.y=0.4;
  const meshes=skinnedMeshes(root),before=body.material;
  const out=makeLightweightClone(root,[meshes[0].id]);
  assert.equal(out.kept.length,1);
  assert.equal(out.removed,1);
  assert.equal(skinnedMeshes(root).length,2);
  assert.equal(skinnedMeshes(out.model).length,1);
  assert.equal(body.material,before);
  assert.equal(hair.parent,root);
  assert.equal(skinBoneCount(out.model),3);
  assert.equal(skinBoneCount(root),3);
  assert.equal(body.geometry.morphAttributes.position.length,1);
  assert.equal(skinnedMeshes(out.model)[0].name,'Lumia_Body_Skin');
  assert.ok(Math.abs(hip.rotation.y-0.4)<1e-9);
});
test('LightPrep refuses no skinned mesh, empty or irrelevant selection',()=>{
  assert.throws(()=>makeLightweightClone(new THREE.Group(),[]),/SkinnedMesh/);
  const {root}=fixture();
  assert.throws(()=>makeLightweightClone(root,[]),/Selecciona/);
  assert.throws(()=>makeLightweightClone(root,['no-such-mesh']),/pertenecen/);
});
test('exports actual compact GLB preserving all skin bones, no textures or animations',async()=>{
  const oldReader=globalThis.FileReader;
  if(!oldReader)globalThis.FileReader=class {
    result=null;
    async readAsArrayBuffer(blob){try{this.result=await blob.arrayBuffer();this.onloadend?.({target:this});}catch(e){this.onerror?.(e);}}
    async readAsDataURL(blob){try{this.result='data:'+(blob.type||'application/octet-stream')+';base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');this.onloadend?.({target:this});}catch(e){this.onerror?.(e);}}
  };
  try {
    const {root}=fixture();
    const choice=suggestLightMeshes(skinnedMeshes(root));
    const out=await exportLightweightGLB(root,choice);
    assert.ok(out.buffer instanceof ArrayBuffer);
    assert.equal(out.bones,3);
    assert.equal(out.sourceBones,3);
    assert.equal(out.meshes,1);
    assert.equal(out.animations,0);
    assert.equal(out.removed,1);
    assert.equal(skinnedMeshes(root).length,2);
  } finally {if(!oldReader)delete globalThis.FileReader;}
});
test('the user receives a real Blender FBX script, not a renamed GLB',()=>{
  const py=blenderConvertScript();
  assert.match(py,/import_scene.gltf/);
  assert.match(py,/export_scene.fbx/);
  assert.match(py,/add_leaf_bones=False/);
  assert.match(py,/bake_anim=False/);
});
