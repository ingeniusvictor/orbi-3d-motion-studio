import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {exportFbx} from 'three-js-fbx-exporter';
import {orientExportUpright} from '../src/lib/uprightExport.js';
import {auditMeshRoundTrip,auditBodyPreparation} from '../src/lib/meshAudit.js';
import {captureReferencePose} from '../src/lib/motionExtraction.js';
import {cleanRiggedMixamoFBX} from '../src/lib/fbxExport.js';
import {detectBodyUpDirection} from '../src/lib/visibleBounds.js';

function humanoid({horizontal=true}={}){
  const scene=new THREE.Group();scene.name='FBX_Original_Character';
  const transform=new THREE.Group();
  transform.name='FBX_Axis_Conversion';
  if(horizontal)transform.rotation.z=-Math.PI/2;
  scene.add(transform);
  const hips=new THREE.Bone();hips.name='Bip001-Pelvis';transform.add(hips);
  const spine=new THREE.Bone();spine.name='Bip001-Spine2';
  spine.position.y=.6;hips.add(spine);
  const head=new THREE.Bone();head.name='Bip001-Head';
  head.position.y=.6;spine.add(head);
  const geom=new THREE.SphereGeometry(.65,30,20);
  const count=geom.getAttribute('position').count;
  const indexes=new Uint16Array(count*4),weights=new Float32Array(count*4);
  for(let i=0;i<count;i++)weights[i*4]=1;
  geom.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indexes,4));
  geom.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const body=new THREE.SkinnedMesh(geom,
    new THREE.MeshStandardMaterial({name:'Skin_Base'}));
  body.name='Mint_Body';transform.add(body);
  scene.updateWorldMatrix(true,true);
  body.bind(new THREE.Skeleton([hips,spine,head]));
  return {scene,transform,hips,head,body};
}
test('MOTION-05E.1 physically upright whole clone preserves every sampled skinned vertex',()=>{
  const {scene,transform,hips,body}=humanoid();
  const before=detectBodyUpDirection(scene);
  assert.ok(Math.abs(before.angleToWorldY-90)<.1);
  const originalParent=transform.parent;
  const originals=body.skeleton.boneInverses.map(m=>m.clone());
  const aligned=orientExportUpright(scene,{mode:'upright'});
  assert.equal(aligned.report.mode,'upright');
  assert.ok(aligned.report.afterAngle<.01);
  assert.ok(aligned.report.verticesChecked>10);
  assert.ok(aligned.report.maxRigidError<1e-6);
  assert.ok(aligned.model!==scene);
  assert.equal(scene.parent,aligned.model);
  assert.ok(originalParent===scene);
  assert.ok(originals.every((m,i)=>m.equals(body.skeleton.boneInverses[i])));
  assert.ok(hips.isBone);
});
test('MOTION-05E.1 actual FBX binary is Y-upright after export/reimport with 0 clips',()=>{
  const {scene}=humanoid();
  const ref=captureReferencePose(scene);
  const output=cleanRiggedMixamoFBX(scene,ref,{
    pose:'bind',orientation:'upright',
  });
  assert.equal(output.animations,0);
  assert.equal(output.bones,3);
  assert.ok(output.orientation.beforeAngle>89);
  assert.ok(output.orientation.roundTripAngle<5);
  assert.equal(output.integrity.passed,true);
  const fb=new FBXLoader().parse(output.bytes.buffer.slice(
    output.bytes.byteOffset,output.bytes.byteOffset+output.bytes.byteLength),'');
  assert.ok(detectBodyUpDirection(fb).angleToWorldY<5);
  assert.equal(fb.animations.length,0);
});
test('MOTION-05E.1 geometry audit passes intact exported FBX without inventing new vertices',()=>{
  const {scene}=humanoid({horizontal:false});
  const bytes=exportFbx(scene,{
    format:'binary',version:7400,target:'threejs',animations:[],
    embedTextures:false,bakeAnimations:false,
  });
  const parsed=new FBXLoader().parse(bytes.buffer.slice(
    bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const result=auditMeshRoundTrip(scene,parsed);
  assert.equal(result.passed,true);
  assert.equal(result.meshCount,1);
  assert.equal(result.details[0].triangles,1200);
});
test('MOTION-05E.1 rejects a missing mesh even when the skeleton is present',()=>{
  const root=new THREE.Group(),empty=new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1)));
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1)));
  empty.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1)));
  assert.throws(()=>auditMeshRoundTrip(root,empty),/faltan o sobran mallas/);
});
test('MOTION-05E.1 rejects missing surface triangles from an exported mesh',()=>{
  const root=new THREE.Group(),copy=new THREE.Group();
  const source=new THREE.Mesh(new THREE.SphereGeometry(1,48,32));
  source.name='Cuerpo';root.add(source);
  const bad=new THREE.Mesh(source.geometry.clone(),source.material);
  bad.name='Cuerpo';copy.add(bad);
  const trimmed=bad.geometry.index.array.slice(0,-3);
  bad.geometry.setIndex(new THREE.BufferAttribute(trimmed,1));
  assert.throws(()=>auditMeshRoundTrip(root,copy),/triángulos/);
});
test('MOTION-05E.1 detects localized distorted left-hip region even with same counts',()=>{
  const root=new THREE.Group(),copy=new THREE.Group();
  const source=new THREE.Mesh(new THREE.SphereGeometry(1,64,48));
  source.name='Cuerpo';root.add(source);
  const bad=new THREE.Mesh(source.geometry.clone(),source.material);
  bad.name='Cuerpo';copy.add(bad);
  const pos=bad.geometry.getAttribute('position');
  let changed=0;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    if(x<-.4&&y<-.23&&z>.25){
      pos.setXYZ(i,x+.32,y,z+.25);changed++;
    }
  }
  assert.ok(changed>40);
  pos.needsUpdate=true;
  assert.equal(source.geometry.index.count,bad.geometry.index.count);
  assert.equal(source.geometry.attributes.position.count,pos.count);
  assert.throws(()=>auditMeshRoundTrip(root,copy),/pérdida\/desplazamiento de superficie/);
});
test('MOTION-05E.1 source body topology is compared before any accessory preparation',()=>{
  const source=humanoid({horizontal:false}).scene;
  const copy=source.clone(true);
  assert.deepEqual(auditBodyPreparation(source,copy).triangles,1200);
  const prepared=copy.getObjectByName('Mint_Body');
  prepared.geometry=prepared.geometry.clone();
  prepared.geometry.setIndex(new THREE.BufferAttribute(
    prepared.geometry.index.array.slice(0,-3),1));
  assert.throws(()=>auditBodyPreparation(source,copy),/cambió de topología/);
});
test('MOTION-05E.1 material backface loss is blocked even if mesh counts match',()=>{
  const root=new THREE.Group(),copy=new THREE.Group();
  const geo=new THREE.BoxGeometry(1,1,1);
  const front=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({
    side:THREE.DoubleSide,
  }));
  front.name='Cabello';root.add(front);
  const back=new THREE.Mesh(geo.clone(),new THREE.MeshStandardMaterial({
    side:THREE.FrontSide,
  }));
  back.name='Cabello';copy.add(back);
  assert.throws(()=>auditMeshRoundTrip(root,copy),/doble cara/);
});
