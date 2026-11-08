import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {captureReferencePose,prepareMixamoRig} from '../src/lib/motionExtraction.js';
import {cleanRiggedMixamoFBX as exportCleanFBXWithAudit} from '../src/lib/fbxExport.js';
// Legacy tests of root bind recovery are structural. Preserve them with a
// visibly unverified report; MOTION-05E performs strict geometry QA.
const cleanRiggedMixamoFBX=(source,reference,opts={})=>
  exportCleanFBXWithAudit(source,reference,{...opts,integrityMode:'report'});
import {restoreSkinnedBindPose} from '../src/lib/bindPose.js';

function character(){
  const root=new THREE.Group();root.name='Mint_Body';
  const hips=new THREE.Bone();hips.name='Bip001-Pelvis';root.add(hips);
  const spine=new THREE.Bone();spine.name='Bip001-Spine2';spine.position.y=.7;hips.add(spine);
  const head=new THREE.Bone();head.name='Bip001-Head';head.position.y=.7;spine.add(head);
  const geom=new THREE.BoxGeometry(.5,1.6,.3);
  const num=geom.attributes.position.count;
  const ids=new Uint16Array(num*4),weight=new Float32Array(num*4);
  for(let i=0;i<num;i++)weight[i*4]=1;
  geom.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(ids,4));
  geom.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weight,4));
  const body=new THREE.SkinnedMesh(geom,new THREE.MeshStandardMaterial());
  body.name='Skin_Body';
  root.add(body);
  root.updateWorldMatrix(true,true);
  body.bind(new THREE.Skeleton([hips,spine,head]));
  return {root,hips,spine,head,body};
}
test('MOTION-05D.2 restores actual root bind under non-Bone FBX scale-100 and rotated axis parent',()=>{
  const {root,hips,spine,head,body}=character();
  hips.name='root';
  const axis=new THREE.Group();axis.name='FBX_Global_Axis_And_UnitScale';
  axis.position.set(8,-14,31);
  axis.rotation.x=-Math.PI/2;
  axis.scale.setScalar(100);
  root.add(axis);axis.add(hips);
  root.updateWorldMatrix(true,true);
  body.skeleton.calculateInverses();
  const bindWorld=new Map([hips,spine,head].map(b=>[b,b.matrixWorld.clone()]));
  const bindInverses=body.skeleton.boneInverses.map(m=>m.clone());
  hips.rotation.z=-Math.PI/2; // imported source contains an action pose
  root.updateWorldMatrix(true,true);
  const animated=hips.quaternion.clone();
  const audit=restoreSkinnedBindPose(root);
  assert.equal(audit.bones,3);
  assert.equal(audit.skinnedMeshes,1);
  assert.ok(audit.maxBindError<1e-6);
  assert.ok(audit.maxPaletteError<1e-6);
  assert.ok(audit.maxDecompositionError<1e-6);
  for(const bone of [hips,spine,head]){
    const expected=bindWorld.get(bone).elements;
    const actual=bone.matrixWorld.elements;
    for(let i=0;i<16;i++)assert.ok(Math.abs(expected[i]-actual[i])<1e-5,
      bone.name+' world matrix element '+i);
  }
  assert.ok(hips.quaternion.angleTo(animated)>0.1);
  assert.ok(body.skeleton.boneInverses.every((m,i)=>m.equals(bindInverses[i])),
    'never rewrite inverse-bind data');
  assert.deepEqual(axis.scale.toArray(),[100,100,100],
    'the FBX parent is kept intact');
  assert.ok(Math.abs(axis.rotation.x+Math.PI/2)<1e-9);
});
test('MOTION-05D.2 copy-only root recovery works through actual clean FBX export',()=>{
  const {root,hips,body}=character();
  hips.name='root';
  const axis=new THREE.Group();axis.name='FBX_Centimeter_100';
  axis.rotation.y=.23;
  axis.scale.setScalar(100);
  axis.position.set(12,9,-5);
  root.add(axis);axis.add(hips);
  root.updateWorldMatrix(true,true);
  body.skeleton.calculateInverses();
  hips.rotation.z=-.71;
  root.updateWorldMatrix(true,true);
  const frozen=hips.quaternion.clone(),transforms=axis.matrix.clone();
  const ref=captureReferencePose(root);
  const preview=prepareMixamoRig(root,ref,{pose:'bind'});
  assert.ok(preview.bind.maxBindError<1e-5);
  assert.ok(preview.bind.maxPaletteError<1e-5);
  assert.ok(hips.quaternion.angleTo(frozen)<1e-8,
    'the source model remains in its current pose');
  assert.ok(axis.matrix.equals(transforms));
  const out=cleanRiggedMixamoFBX(root,ref,{pose:'bind'});
  assert.equal(out.bones,3);
  assert.equal(out.animations,0);
  assert.ok(out.bind.maxBindError<1e-5);
  const loaded=new FBXLoader().parse(out.bytes.buffer.slice(
    out.bytes.byteOffset,out.bytes.byteOffset+out.bytes.byteLength),'');
  assert.equal(loaded.animations.length,0);
});
test('MOTION-05D.1 reference vs bind: restores body from a horizontal animation frame without mutating source',()=>{
  const {root,hips,head,body}=character();
  hips.rotation.z=-Math.PI/2;
  root.updateWorldMatrix(true,true);
  const sourceAngle=head.getWorldPosition(new THREE.Vector3())
    .sub(hips.getWorldPosition(new THREE.Vector3()))
    .angleTo(new THREE.Vector3(0,1,0));
  assert.ok(Math.abs(THREE.MathUtils.radToDeg(sourceAngle)-90)<.1);
  const sourceLocal=hips.quaternion.clone();
  const sourceBind=body.skeleton.boneInverses.map(m=>m.clone());
  const records=captureReferencePose(root);
  const original=prepareMixamoRig(root,records,{pose:'reference'});
  const originalHips=original.model.getObjectByName('Bip001-Pelvis');
  assert.ok(originalHips.quaternion.angleTo(sourceLocal)<1e-8);
  const prepared=prepareMixamoRig(root,records,{pose:'bind'});
  const restored=prepared.model.getObjectByName('Bip001-Pelvis');
  assert.ok(restored.quaternion.angleTo(new THREE.Quaternion())<1e-8);
  assert.equal(prepared.bind.bones,3);
  assert.ok(prepared.bind.angleBefore>=89&&prepared.bind.angleBefore<=91);
  assert.ok(prepared.bind.angleAfter<1);
  assert.equal(prepared.bind.sourceWasNotNeutral,true);
  assert.ok(hips.quaternion.angleTo(sourceLocal)<1e-8);
  assert.ok(body.skeleton.boneInverses.every((b,i)=>b.equals(sourceBind[i])));
});
test('MOTION-05D.1 bind mode roundtrips to an actual FBX with rig and no animation',()=>{
  const {root,hips}=character();
  hips.rotation.z=-Math.PI/2;
  root.updateWorldMatrix(true,true);
  const snapshot=captureReferencePose(root);
  const out=cleanRiggedMixamoFBX(root,snapshot,{pose:'bind'});
  assert.equal(out.bones,3);
  assert.equal(out.animations,0);
  assert.equal(out.bind.bones,3);
  assert.ok(out.bind.angleAfter<1);
  assert.equal(root.getObjectByName('Bip001-Pelvis').rotation.z,-Math.PI/2);
  const reopened=new FBXLoader().parse(out.bytes.buffer.slice(
    out.bytes.byteOffset,out.bytes.byteOffset+out.bytes.byteLength),'');
  assert.equal(reopened.animations.length,0);
});
test('MOTION-05D.1 bind pose does not promise A/T when source bind itself is inclined',()=>{
  const {root,hips}=character();
  hips.rotation.z=-Math.PI/3;
  root.updateWorldMatrix(true,true);
  const body=root.getObjectByName('Skin_Body');
  body.skeleton.calculateInverses();
  // Rig was intentionally BOUND in a 60-degree pose. The bind mode must
  // reproduce the true bind, never hallucinate a perfectly upright person.
  hips.rotation.z=0;
  root.updateWorldMatrix(true,true);
  const reference=captureReferencePose(root);
  const result=prepareMixamoRig(root,reference,{pose:'bind'});
  assert.ok(Math.abs(result.bind.angleAfter-60)<1);
});
test('MOTION-05D.1 refuses two incompatible inverse binds for same physical bone',()=>{
  const {root,body}=character();
  const other=new THREE.SkinnedMesh(body.geometry.clone(),
    new THREE.MeshStandardMaterial());
  root.add(other);
  const bones=body.skeleton.bones;
  const inverses=body.skeleton.boneInverses.map(m=>m.clone());
  other.bind(new THREE.Skeleton(bones,inverses));
  // Inject the discrepancy AFTER the Three.js constructor/bind logic.
  // Verifies that each skin actually exposes a different inverse matrix.
  other.skeleton.boneInverses[0].elements[12]+=.5;
  assert.notEqual(other.skeleton.boneInverses[0].elements[12],
    body.skeleton.boneInverses[0].elements[12]);
  assert.throws(()=>restoreSkinnedBindPose(root),/contradictorias/);
});
