import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {detectBodyUpDirection,describeBodyAxisCandidates} from '../src/lib/visibleBounds.js';
import {orientExportUpright} from '../src/lib/uprightExport.js';

function rig({headName='mixamorig:Head',hipsName='mixamorig:Hips',ambiguous=false}={}){
  const root=new THREE.Group();
  const swivel=new THREE.Group();swivel.rotation.z=-Math.PI/2;root.add(swivel);
  const hips=new THREE.Bone();hips.name=hipsName;swivel.add(hips);
  const head=new THREE.Bone();head.name=headName;head.position.y=1;hips.add(head);
  if(ambiguous){
    const other=new THREE.Bone();other.name=headName;other.position.x=.3;hips.add(other);
  }
  // Real SkinnedMesh geometry needs skinIndex + skinWeight attributes.
  // Without them getVertexPosition() throws, and the visible-bounds safety
  // check correctly refuses to invent a pivot for the upright rotation.
  const geometry=new THREE.BoxGeometry(1,1,1);
  const vertexCount=geometry.getAttribute('position').count;
  const indices=new Uint16Array(vertexCount*4);
  const weights=new Float32Array(vertexCount*4);
  for(let i=0;i<vertexCount;i++)weights[i*4]=1;
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const skin=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial());
  skin.name='Body';
  swivel.add(skin);root.updateMatrixWorld(true);
  skin.bind(new THREE.Skeleton([hips,head,...(ambiguous?[hips.children[1]]:[])]));
  return root;
}
test('MOTION-05E.2 accepts a connected Mixamo head/hip chain',()=>{
  const root=rig();
  assert.ok(detectBodyUpDirection(root).angleToWorldY>89);
  const result=orientExportUpright(root,{mode:'upright'});
  assert.ok(result.report.afterAngle<2);
});
test('MOTION-05E.2 accepts Bip nomenclature',()=>{
  const root=rig({headName:'Bip001 Head',hipsName:'Bip001 Pelvis'});
  assert.ok(detectBodyUpDirection(root));
});
test('MOTION-05E.2 rejects ambiguous matching head bones',()=>{
  const root=rig({ambiguous:true});
  assert.equal(detectBodyUpDirection(root),null);
  assert.throws(()=>orientExportUpright(root,{mode:'upright'}),/Huesos observados/);
  assert.ok(describeBodyAxisCandidates(root)[0].anatomicalNames.length>=2);
});
test('MOTION-05E.2 rejects a skeleton with no anatomical names',()=>{
  const root=rig({headName:'mystery_A',hipsName:'mystery_B'});
  assert.equal(detectBodyUpDirection(root),null);
  assert.throws(()=>orientExportUpright(root,{mode:'upright'}),/No se identificó/);
});
