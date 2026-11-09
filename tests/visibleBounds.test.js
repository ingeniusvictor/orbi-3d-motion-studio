import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {computeVisibleCharacterBounds,cameraFitParameters,
  detectBodyUpDirection} from '../src/lib/visibleBounds.js';

function importedCharacter(){
  const root=new THREE.Group();root.name='Imported_Mint_View';
  root.position.set(120,1,-70);
  const hips=new THREE.Bone();hips.name='Bip001-Pelvis';root.add(hips);
  const head=new THREE.Bone();head.name='Bip001-Head';head.position.y=1.7;
  hips.add(head);
  const geom=new THREE.BoxGeometry(.55,1.8,.27);
  const count=geom.getAttribute('position').count;
  const indices=new Uint16Array(count*4),weights=new Float32Array(count*4);
  for(let i=0;i<count;i++)weights[i*4]=1;
  geom.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
  geom.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const body=new THREE.SkinnedMesh(geom,new THREE.MeshStandardMaterial());
  body.name='Mint_Body';root.add(body);root.updateWorldMatrix(true,true);
  body.bind(new THREE.Skeleton([hips,head]));
  return {root,hips,head,body};
}
test('MOTION-05C camera follows actual world-space body mesh instead of the origin',()=>{
  const {root,hips,body}=importedCharacter();
  const rotation=hips.quaternion.clone(),source=body.bindMatrix.clone();
  const result=computeVisibleCharacterBounds(root);
  assert.equal(result.method,'skinned-vertices');
  assert.equal(result.anchorName,'Mint_Body');
  const center=result.box.getCenter(new THREE.Vector3());
  assert.ok(Math.abs(center.x-120)<.1);
  assert.ok(Math.abs(center.z+70)<.1);
  const fit=cameraFitParameters(result.box,{fovDegrees:38,aspect:1.3});
  assert.ok(fit.distance>0);
  assert.ok(fit.near>0);
  assert.ok(fit.far>fit.distance);
  assert.ok(fit.center.distanceTo(center)<1e-8);
  assert.ok(hips.quaternion.equals(rotation),'camera must not rotate bones');
  assert.ok(body.bindMatrix.equals(source),'camera must never alter the skin');
});
test('MOTION-05C camera ignores a distant static FBX helper mesh and preserves imported transforms',()=>{
  const {root}=importedCharacter();
  const extra=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),
    new THREE.MeshStandardMaterial());
  extra.name='FBX_Export_Helper_Offset';
  extra.position.set(250000,0,0);
  root.add(extra);
  const before=extra.position.clone();
  const result=computeVisibleCharacterBounds(root);
  assert.equal(result.excludedMeshes,1);
  assert.equal(result.includedMeshes,1);
  const center=result.box.getCenter(new THREE.Vector3());
  assert.ok(Math.abs(center.x-120)<.5,'do not frame distant export garbage');
  assert.ok(extra.position.equals(before),'do not touch helper transforms');
});
test('MOTION-05C camera-only upright detection works on horizontal body from actual bones',()=>{
  const {root}=importedCharacter();
  root.rotation.z=-Math.PI/2;
  root.updateWorldMatrix(true,true);
  const orientation=detectBodyUpDirection(root);
  assert.equal(orientation.head,'Bip001-Head');
  assert.equal(orientation.hips,'Bip001-Pelvis');
  assert.ok(Math.abs(orientation.angleToWorldY-90)<.05);
  assert.ok(orientation.up.x>.99);
  assert.ok(Math.abs(root.rotation.z+Math.PI/2)<1e-7,
    'checking orientation must not fix the asset');
});
test('MOTION-05C safely handles empty scene and missing humanoid roles',()=>{
  const empty=new THREE.Group();
  assert.equal(computeVisibleCharacterBounds(empty),null);
  assert.equal(detectBodyUpDirection(empty),null);
  assert.equal(cameraFitParameters(null),null);
  const box=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));
  empty.add(box);
  assert.ok(computeVisibleCharacterBounds(empty));
  assert.equal(detectBodyUpDirection(empty),null);
});
