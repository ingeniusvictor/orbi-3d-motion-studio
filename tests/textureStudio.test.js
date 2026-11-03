import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {TEXTURE_CHANNELS,catalogMaterials,inferTextureChannel,isTextureFile,suggestTextureMatches,bindDecodedTexture} from '../src/lib/textureStudio.js';

function model(){
  const root=new THREE.Group();
  const geo=new THREE.BoxGeometry(1,1,1);
  const skin=new THREE.MeshStandardMaterial({name:'LUMIA_Body'});
  const clothes=new THREE.MeshStandardMaterial({name:'Dress_Mat'});
  const body=new THREE.Mesh(geo,skin);body.name='LUMIA_Skin';root.add(body);
  const dress=new THREE.Mesh(geo,clothes);dress.name='Dress';root.add(dress);
  return {root,body,dress,skin,clothes};
}
const f=(name,size=120)=>({name,size,type:'image/png'});
test('admite formatos comunes pero no ZIP, PSD, SVG ni imágenes excesivas',()=>{
  for(const file of ['body.png','normal.jpg','light.jpeg','eyes.webp'])assert.equal(isTextureFile(f(file)),true);
  for(const file of ['textures.zip','material.psd','vector.svg','texture.tga'])assert.equal(isTextureFile(f(file)),false);
  assert.equal(isTextureFile(f('huge.png',60*1024*1024)),false);
});
test('deduce mapas de color, normales, rugosidad, metal y ORM sin confundirlos',()=>{
  assert.equal(inferTextureChannel('Skin_BaseColor.png'),'map');
  assert.equal(inferTextureChannel('Body_NormalGL.png'),'normalMap');
  assert.equal(inferTextureChannel('Hair_Roughness.jpg'),'roughnessMap');
  assert.equal(inferTextureChannel('Torso_Metallic.png'),'metalnessMap');
  assert.equal(inferTextureChannel('Head_AO.png'),'aoMap');
  assert.equal(inferTextureChannel('Skin_ORM.png'),'orm');
  assert.equal(inferTextureChannel('Eyes_Emissive.webp'),'emissiveMap');
  assert.equal(inferTextureChannel('Hair_Opacity.png'),'alphaMap');
  assert.ok(TEXTURE_CHANNELS.length>=7);
});
test('lee materiales compartidos sin duplicar y detecta UV',()=>{
  const {root,body,skin}=model();
  const twin=new THREE.Mesh(body.geometry,skin);twin.name='LUMIA_Arm';root.add(twin);
  const records=catalogMaterials(root);
  assert.equal(records.length,2);
  assert.equal(records.find(r=>r.id===skin.uuid).meshes,2);
  assert.equal(records.find(r=>r.id===skin.uuid).hasUV,true);
});
test('asociación automática requiere coincidencia no ambigua',()=>{
  const {root,skin,clothes}=model();
  const records=catalogMaterials(root);
  const files=[f('LUMIA_Skin_BaseColor.png'),f('Dress_Mat_Normal.png')];
  const results=suggestTextureMatches(files,records);
  assert.equal(results.length,2);
  assert.equal(results[0].materialId,skin.uuid);
  assert.equal(results[0].channel,'map');
  assert.equal(results[1].materialId,clothes.uuid);
  assert.equal(results[1].channel,'normalMap');
  const unmatched=suggestTextureMatches([f('mystery.png')],records);
  assert.equal(unmatched.length,0);
});
test('solo un material permite sugerir color de una imagen sin nombre relacionado',()=>{
  const {root,dress,skin}=model();
  root.remove(dress);
  const results=suggestTextureMatches([f('diffuse.jpg')],catalogMaterials(root));
  assert.equal(results.length,1);
  assert.equal(results[0].materialId,skin.uuid);
});
test('no sugiere texturas en geometría sin coordenadas UV',()=>{
  const {root,body}=model();
  body.geometry=new THREE.BufferGeometry();
  body.geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
  const chosen=suggestTextureMatches([f('Skin_Color.jpg')],catalogMaterials(root));
  assert.equal(chosen.length,0);
});

test('aplica textura color al material y conserva la geometría y jerarquía',()=>{
  const {root,body,skin}=model();
  const geometry=body.geometry;
  const texture=new THREE.DataTexture(new Uint8Array([255,0,0,255]),1,1);
  texture.name='LUMIA_BaseColor.png';
  const result=bindDecodedTexture(root,skin.uuid,'map',texture,{format:'FBX'});
  assert.equal(result.materialId,skin.uuid);
  assert.equal(body.material.map,texture);
  assert.equal(texture.colorSpace,THREE.SRGBColorSpace);
  assert.equal(texture.flipY,true);
  assert.equal(body.geometry,geometry);
  assert.equal(root.children.length,2);
  assert.equal(catalogMaterials(root).find(m=>m.id===skin.uuid).channels.includes('Color / Albedo'),true);
});
test('textura glTF se aplica con origen UV glTF (flipY false)',()=>{
  const {root,skin}=model();
  const texture=new THREE.DataTexture(new Uint8Array([0,255,0,255]),1,1);
  bindDecodedTexture(root,skin.uuid,'map',texture,{format:'GLB'});
  assert.equal(texture.flipY,false);
});
test('FBX con material Phong convierte a PBR cuando se añade rugosidad',()=>{
  const {root,body}=model();
  body.material=new THREE.MeshPhongMaterial({name:'Skin_Phong'});
  const old=body.material;
  const tex=new THREE.DataTexture(new Uint8Array([128,128,128,255]),1,1);
  const result=bindDecodedTexture(root,old.uuid,'roughnessMap',tex,{format:'FBX'});
  assert.ok(body.material.isMeshStandardMaterial);
  assert.equal(body.material.roughnessMap,tex);
  assert.notEqual(result.materialId,old.uuid);
  assert.equal(tex.colorSpace,THREE.NoColorSpace);
});
test('no modifica los materiales especiales VRM con canales incompatibles',()=>{
  const {root,body}=model();
  const mat=new THREE.MeshPhongMaterial({name:'VRM special'});
  body.material=mat;
  const texture=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);
  assert.throws(()=>bindDecodedTexture(root,mat.uuid,'roughnessMap',texture,{format:'VRM'}),/material especial/);
  assert.equal(body.material,mat);
});
test('rechaza malla sin UV y canal inexistente sin alterar material',()=>{
  const {root,body,skin}=model();
  const tex=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);
  body.geometry=new THREE.BufferGeometry();
  body.geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
  assert.throws(()=>bindDecodedTexture(root,skin.uuid,'map',tex),/UV/);
  assert.equal(body.material.map,null);
  assert.throws(()=>bindDecodedTexture(root,skin.uuid,'mystery',tex),/UV/);
});
