import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {catalogMaterials} from '../src/lib/textureStudio.js';
import {buildGlobalTextureInventory,detectGlobalColorCandidate,
  planGlobalVisionTasks,rankGlobalCandidates} from '../src/lib/globalTextureInventory.js';
const file=(name)=>({name,size:1024,orbiRelativePath:name});
const mat=(i,options={})=>({id:'m'+i,name:'Material'+i,meshes:1,
  meshNames:['Part'+i],hasUV:true,channels:[],type:'MeshStandardMaterial',
  textureReferences:[],...options});
test('04E1: a shared material is counted once despite 3 meshes',()=>{
 const root=new THREE.Group(),shared=new THREE.MeshStandardMaterial({name:'Skin'});
 for(let i=0;i<3;i++)root.add(new THREE.Mesh(new THREE.BoxGeometry(),shared));
 const inventory=buildGlobalTextureInventory(catalogMaterials(root),[file('Skin_Color.png')]);
 assert.equal(inventory.slots.length,1);
 assert.equal(inventory.slots[0].meshCount,3);
});
test('04E1: only albedo candidates, normals and PBR remain excluded',()=>{
 const names=['Body_Color.png','Hair_Albedo.dds','Eye.png','Face_NormalDX.dds',
 'Body_NormalGL.png','Clothes_Roughness.jpg','Metal_Metallic.dds',
 'Skin_AO.png','Face_ORM.png','Skin_Gloss.png','Eyes_Emissive.png','Hair_Opacity.png'];
 const inv=buildGlobalTextureInventory([mat(1)],names.map(file));
 assert.deepEqual(inv.images.map(x=>x.name),names.slice(0,3));
 assert.equal(inv.excluded.length,9);
 assert.equal(detectGlobalColorCandidate(file('Body_N.dds')).eligible,false);
});
test('04E1: ranking prefers matching name but keeps all candidates',()=>{
 const inv=buildGlobalTextureInventory([{...mat(1),name:'Body',meshNames:['Body']}],
  ['Unknown.png','Body_Color.png','Hat_Diffuse.png'].map(file));
 const ranked=rankGlobalCandidates(inv.slots[0],inv.images);
 assert.equal(ranked[0].name,'Body_Color.png');
 assert.equal(ranked.length,3);
});
test('04E1: 19 images form three requests per material with no silent omission',()=>{
 const inv=buildGlobalTextureInventory([mat(1),mat(2)],
  Array.from({length:19},(_,i)=>file('img'+i+'.png')));
 const plan=planGlobalVisionTasks(inv);
 assert.equal(plan.requests,6);
 const batches=plan.tasks.filter(t=>t.materialId==='m1');
 assert.deepEqual(batches.map(x=>x.candidates.length),[8,8,3]);
 assert.equal(new Set(batches.flatMap(x=>x.candidates.map(c=>c.fileIndex))).size,19);
});
test('04E1: material with existing albedo or no UV is skipped',()=>{
 const inv=buildGlobalTextureInventory([
  mat(1,{hasUV:false}),mat(2,{channels:['Color / Albedo']}),mat(3)
 ],[file('Material3_Albedo.png')]);
 const p=planGlobalVisionTasks(inv);
 assert.deepEqual(p.skipped.map(x=>x.status),['blocked','existing']);
 assert.equal(p.requests,1);
 assert.throws(()=>planGlobalVisionTasks(inv,{maxTasks:0}),/consultas/);
});
