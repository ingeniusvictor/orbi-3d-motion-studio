import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {
  captureReferencePose,cloneAtReferencePose,prepareMixamoRig,
  makeCalibratedTPose,makeCalibratedAPose,exportableClipJSON,
} from '../src/lib/motionExtraction.js';
import {cleanRiggedMixamoFBX,isBinaryFBX} from '../src/lib/fbxExport.js';
import {readPhysicalFbxRig} from '../src/lib/fbxBoneAudit.js';
import {skinBoneCount,skinnedMeshes} from '../src/lib/lightweight.js';
import {consolidateEquivalentSkinRigs} from '../src/lib/rigCanonicalizer.js';
import {buildRigDiagnostic} from '../src/lib/rigDiagnostics.js';

function fixture({includeRight=true}={}){
  const root=new THREE.Group();root.name='Animated_Character';
  function bone(name,parent,x=0,y=0,z=0){
    const b=new THREE.Bone();b.name='mixamorig:'+name;
    b.position.set(x,y,z);parent.add(b);return b;
  }
  const hips=bone('Hips',root,0,1,0);
  const spine=bone('Spine',hips,0,0.3,0);
  const original={root,hips,spine,arms:{}};
  for(const [side,sign] of [['Left',1],['Right',-1]]){
    if(side==='Right'&&!includeRight)continue;
    const upper=bone(side+'Arm',spine,sign*.22,.22,0);
    const fore=bone(side+'ForeArm',upper,sign*.34,-.23,0);
    const hand=bone(side+'Hand',fore,sign*.27,-.17,0);
    original.arms[side]={upper,fore,hand};
  }
  root.updateWorldMatrix(true,true);
  const bones=[];root.traverse(n=>{if(n.isBone)bones.push(n);});
  const geom=new THREE.BoxGeometry(.5,1,.2);
  const count=geom.getAttribute('position').count;
  const indices=new Uint16Array(count*4),weights=new Float32Array(count*4);
  for(let i=0;i<count;i++)weights[i*4]=1;
  geom.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
  geom.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const mesh=new THREE.SkinnedMesh(geom,new THREE.MeshStandardMaterial());
  mesh.name='Character_With_Skin';root.add(mesh);
  root.updateWorldMatrix(true,true);
  mesh.bind(new THREE.Skeleton(bones));
  return original;
}
const worldSegment=(a,b)=>b.getWorldPosition(new THREE.Vector3())
  .sub(a.getWorldPosition(new THREE.Vector3())).normalize();


// Reproduce the FBXLoader behaviour observed on multi-component characters:
// one body skin and one clothing skin use distinct Bone proxy objects with
// exactly the same names, hierarchy, and rest transforms.
function duplicatedSkinFixture({shiftSecond=0}={}){
  const f=fixture();
  const original=f.root.getObjectByName('Character_With_Skin');
  const duplicateHips=f.hips.clone(true);
  duplicateHips.position.x+=shiftSecond;
  f.root.add(duplicateHips);
  const proxy=[];
  duplicateHips.traverse(node=>{if(node.isBone)proxy.push(node);});
  const clothes=new THREE.SkinnedMesh(
    original.geometry.clone(),new THREE.MeshStandardMaterial());
  clothes.name='Clothes_Shared_Rig';
  f.root.add(clothes);
  f.root.updateWorldMatrix(true,true);
  clothes.bind(new THREE.Skeleton(proxy,
    original.skeleton.boneInverses.map(matrix=>matrix.clone())),
    original.bindMatrix.clone());
  return {...f,clothes,duplicateHips};
}
test('MOTION-05A.4 local rig diagnostic exposes offsets but never mesh/animation bytes',()=>{
  const f=duplicatedSkinFixture({shiftSecond:0.3});
  const report=buildRigDiagnostic(f.root,{filename:'Modelo_Ropa.fbx'});
  assert.equal(report.format,'orbi.motion.rig-diagnostic.v1');
  assert.equal(report.summary.skinnedMeshes,2);
  assert.equal(report.summary.uniqueBoneObjects,16);
  assert.equal(report.summary.uniqueBoneNames,8);
  assert.ok(report.differences.some(d=>d.name==='mixamorig:Hips'));
  const root=report.differences.find(d=>d.name==='mixamorig:Hips');
  assert.equal(root.instances.length,2);
  const serialized=JSON.stringify(report);
  assert.ok(serialized.includes('Clothes_Shared_Rig'));
  assert.ok(!serialized.includes('skinWeight'));
  assert.ok(!serialized.includes('material:'));
  assert.ok(!serialized.includes('animationTracks'));
  assert.ok(report.meshes.every(m=>m.bones.length>0));
});

test('MOTION-05A.3 merges equivalent FBXLoader bone proxies for body+clothing without changing the source',()=>{
  const f=duplicatedSkinFixture();
  const before=skinBoneCount(f.root);
  assert.equal(before,16);
  const reference=captureReferencePose(f.root);
  const result=cleanRiggedMixamoFBX(f.root,reference);
  assert.equal(result.animations,0);
  assert.equal(result.bones,8);
  assert.equal(result.meshes,2);
  assert.equal(result.consolidation.consolidated,true);
  assert.deepEqual([result.consolidation.bonesBefore,
    result.consolidation.bonesAfter],[16,8]);
  assert.equal(readPhysicalFbxRig(result.bytes).size,8);
  const reopened=new FBXLoader().parse(result.bytes.buffer.slice(
    result.bytes.byteOffset,result.bytes.byteOffset+result.bytes.byteLength),'');
  assert.equal(reopened.animations.length,0);
  assert.equal(skinnedMeshes(reopened).length,2);
  assert.equal(skinBoneCount(f.root),16,
    'do not rewrite the original skin or source bone proxies');
  assert.ok(f.duplicateHips.parent===f.root);
});
test('MOTION-05A.4 translates duplicate root bones uniformly and preserves skinned body+clothes',()=>{
  const f=duplicatedSkinFixture({shiftSecond:0.5});
  const original=captureReferencePose(f.root);
  const poseBefore=f.clothes.applyBoneTransform(0,new THREE.Vector3()).clone();
  const skinBefore=f.clothes.skeleton.boneInverses.map(m=>m.clone());
  const out=cleanRiggedMixamoFBX(f.root,original);
  assert.equal(out.bones,8);
  assert.equal(out.meshes,2);
  assert.equal(out.animations,0);
  assert.equal(out.consolidation.bonesBefore,16);
  assert.equal(out.consolidation.bonesAfter,8);
  assert.equal(out.consolidation.offsetsCompensated,1);
  const reopened=new FBXLoader().parse(out.bytes.buffer.slice(
    out.bytes.byteOffset,out.bytes.byteOffset+out.bytes.byteLength),'');
  assert.equal(reopened.animations.length,0);
  assert.equal(skinnedMeshes(reopened).length,2);
  assert.equal(readPhysicalFbxRig(out.bytes).size,8);
  assert.equal(skinBoneCount(f.root),16,'source must retain both proxy rigs');
  assert.ok(f.clothes.applyBoneTransform(0,new THREE.Vector3()).distanceTo(poseBefore)<1e-8);
  assert.ok(f.clothes.skeleton.boneInverses.every((m,i)=>m.equals(skinBefore[i])),
    'source skin palette inverses must not be altered');
});
test('MOTION-05A.4 also supports a shifted duplicate rig with its own inverse bind matrices',()=>{
  const f=duplicatedSkinFixture({shiftSecond:0.5});
  f.root.updateWorldMatrix(true,true);
  // This is the common legitimate case: a differently positioned proxy
  // skeleton with inverse binds that place its vertices on the SAME body.
  for(let i=0;i<f.clothes.skeleton.bones.length;i++){
    f.clothes.skeleton.boneInverses[i].copy(
      f.clothes.skeleton.bones[i].matrixWorld).invert();
  }
  const reference=captureReferencePose(f.root);
  const out=cleanRiggedMixamoFBX(f.root,reference);
  assert.equal(out.bones,8);
  assert.equal(out.meshes,2);
  assert.equal(out.animations,0);
  assert.equal(out.consolidation.offsetsCompensated,1);
});
test('MOTION-05A.4 refuses nonuniform relative offsets between a repeated root and its children',()=>{
  const f=duplicatedSkinFixture({shiftSecond:0.5});
  const child=f.duplicateHips.children.find(x=>x.isBone);
  child.position.x+=0.18;
  const reference=captureReferencePose(f.root);
  assert.throws(()=>cleanRiggedMixamoFBX(f.root,reference),
    /no comparte el desplazamiento uniforme/);
  assert.equal(skinBoneCount(f.root),16);
});
test('MOTION-05A.4 refuses rotated duplicate rigs even if names and parents match',()=>{
  const f=duplicatedSkinFixture({shiftSecond:0.15});
  f.duplicateHips.rotation.y=0.22;
  const reference=captureReferencePose(f.root);
  assert.throws(()=>cleanRiggedMixamoFBX(f.root,reference),
    /orientación o escala/);
});
test('MOTION-05A.4 separate character at a distant position never merges',()=>{
  const f=duplicatedSkinFixture({shiftSecond:15});
  const reference=captureReferencePose(f.root);
  assert.throws(()=>cleanRiggedMixamoFBX(f.root,reference),
    /sin proximidad espacial/);
  assert.equal(skinBoneCount(f.root),16);
});
test('MOTION-05A.3 refuses a second independent character rig in a single Mixamo FBX',()=>{
  const f=duplicatedSkinFixture();
  // Give the second skeleton unique names: it is a real SECOND character,
  // not equivalent skin proxy references for clothing.
  f.duplicateHips.traverse(node=>{if(node.isBone)node.name='Second_'+node.name;});
  const ref=captureReferencePose(f.root);
  const status=consolidateEquivalentSkinRigs(f.root);
  assert.equal(status.consolidated,false);
  assert.throws(()=>cleanRiggedMixamoFBX(f.root,ref),/raíces óseas distintas/);
});

// The Mint Swimsuit diagnostic has TWO genuinely distinct palettes:
// 340 bone body (Bip001) and 36 bone ChestBow, intersecting only in the
// NAME "root". The following fixture reproduces this class of failure,
// not the private file itself.
function separateChestBowRigFixture({name='mint019_swimsuit_ChestBow_skin_LOD0'}={}){
  const f=fixture();
  f.hips.name='root'; // body's own root; different physical Bone from accessory
  const auxRoot=new THREE.Bone();auxRoot.name='root';
  auxRoot.position.set(-0.5,1.4,0.12);
  auxRoot.rotation.z=0.7;
  const adjust=new THREE.Bone();adjust.name='pelvis_adjust';
  auxRoot.add(adjust);
  const bowNode=new THREE.Bone();bowNode.name='B_L_cb00';
  bowNode.position.set(0.05,0.02,0.04);
  adjust.add(bowNode);
  f.root.add(auxRoot);
  const body=f.root.getObjectByName('Character_With_Skin');
  const geom=new THREE.BoxGeometry(.12,.08,.04);
  const count=geom.getAttribute('position').count;
  const indices=new Uint16Array(count*4),weights=new Float32Array(count*4);
  // Bow vertices are actually weighted to its independent aux skeleton.
  for(let i=0;i<count;i++){indices[i*4]=2;weights[i*4]=1;}
  geom.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
  geom.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const bow=new THREE.SkinnedMesh(geom,new THREE.MeshStandardMaterial({color:0x0099cc}));
  bow.name=name;
  f.root.add(bow);
  f.root.updateWorldMatrix(true,true);
  bow.bind(new THREE.Skeleton([auxRoot,adjust,bowNode]));
  return {...f,bow,auxRoot,adjust,bowNode,body};
}
test('MOTION-05B rigid bow export retains body and visual accessory with one FBX rig',()=>{
  const f=separateChestBowRigFixture();
  const pose=captureReferencePose(f.root);
  const expected={
    roots:skinBoneCount(f.root),
    bowPosition:f.bow.applyBoneTransform(0,
      f.bow.getVertexPosition(0,new THREE.Vector3())).clone(),
    originalArm:f.arms.Left.upper.quaternion.clone(),
  };
  assert.equal(expected.roots,11);
  const result=cleanRiggedMixamoFBX(f.root,pose,{accessoryHandling:'rigid'});
  assert.equal(result.animations,0);
  assert.equal(result.bones,8);
  assert.equal(result.meshes,1);
  assert.equal(result.accessory.handling,'rigid');
  assert.equal(result.accessory.changed,true);
  assert.match(result.accessory.rigidParent,/spine/i);
  assert.ok(result.accessory.maxPositionError<0.0005);
  assert.equal(f.bow.isSkinnedMesh,true);
  assert.equal(skinBoneCount(f.root),11,'never rewrite source FBX');
  assert.ok(f.arms.Left.upper.quaternion.equals(expected.originalArm));
  assert.ok(expected.bowPosition.distanceTo(
    f.bow.applyBoneTransform(0,f.bow.getVertexPosition(0,new THREE.Vector3())))<1e-7);
  assert.equal(readPhysicalFbxRig(result.bytes).size,8);
  const exported=new FBXLoader().parse(result.bytes.buffer.slice(
    result.bytes.byteOffset,result.bytes.byteOffset+result.bytes.byteLength),'');
  const staticMeshes=[];
  exported.traverse(n=>{
    if(n.isMesh&&!n.isSkinnedMesh)staticMeshes.push(n);
  });
  assert.ok(staticMeshes.some(n=>n.name.includes('ChestBow')));
  assert.equal(exported.animations.length,0);
});
test('MOTION-05B body-only export strips only independent bow from COPY',()=>{
  const f=separateChestBowRigFixture();
  const reference=captureReferencePose(f.root);
  const result=cleanRiggedMixamoFBX(f.root,reference,{accessoryHandling:'exclude'});
  assert.equal(result.bones,8);
  assert.equal(result.meshes,1);
  assert.equal(result.animations,0);
  assert.equal(result.accessory.handling,'exclude');
  assert.equal(result.accessory.accessoryName,'mint019_swimsuit_ChestBow_skin_LOD0');
  assert.ok(f.bow.parent,'source must retain the bow with rig');
  assert.ok(f.auxRoot.parent,'source must retain its auxiliary bones');
});
test('MOTION-05B strict mode still rejects non-equivalent ChestBow rig',()=>{
  const f=separateChestBowRigFixture();
  const reference=captureReferencePose(f.root);
  assert.throws(()=>cleanRiggedMixamoFBX(f.root,reference),
    /orientación o escala de referencia/);
});
test('MOTION-05B never strips a second character mistaken for an accessory',()=>{
  const f=separateChestBowRigFixture({name:'Second_Character_Body'});
  const reference=captureReferencePose(f.root);
  assert.throws(()=>cleanRiggedMixamoFBX(f.root,reference,
    {accessoryHandling:'exclude'}),/no se identificó con certeza como accesorio/);
  assert.throws(()=>cleanRiggedMixamoFBX(f.root,reference,
    {accessoryHandling:'rigid'}),/no se identificó con certeza como accesorio/);
});
test('MOTION-05B.2 preserves harmless transform children under head_adjust',()=>{
  const f=separateChestBowRigFixture();
  f.adjust.name='head_adjust'; // The failure reported by the real Mint FBX
  const attached=new THREE.Group();attached.name='FBX_HeadAdjust_Helper';
  attached.position.set(.03,-.06,.01);
  f.adjust.add(attached);
  const before=attached.getWorldPosition(new THREE.Vector3());
  const ref=captureReferencePose(f.root);
  const result=cleanRiggedMixamoFBX(f.root,ref,
    {accessoryHandling:'rigid'});
  assert.equal(result.bones,8);
  assert.equal(result.animations,0);
  assert.ok(result.accessory.preservedAttachments.some(
    x=>x.name==='FBX_HeadAdjust_Helper'));
  assert.ok(attached.parent===f.adjust,'original helper is never moved');
  assert.ok(attached.getWorldPosition(new THREE.Vector3()).distanceTo(before)<1e-7);
  const exported=new FBXLoader().parse(result.bytes.buffer.slice(
    result.bytes.byteOffset,result.bytes.byteOffset+result.bytes.byteLength),'');
  assert.equal(exported.animations.length,0);
  // The exporter may omit an empty Group, but no skinned or visible asset
  // may be lost. Preserved helper is reported and materialized on the clone.
});
test('MOTION-05B.2 static prop attached to auxiliary head_adjust retains visible geometry',()=>{
  const f=separateChestBowRigFixture();
  f.adjust.name='head_adjust';
  const prop=new THREE.Mesh(new THREE.BoxGeometry(.07,.09,.12),
    new THREE.MeshStandardMaterial({color:0x336699}));
  prop.name='Mint_Head_Adjust_Prop';
  prop.position.set(-.07,.02,.05);
  f.adjust.add(prop);
  f.root.updateWorldMatrix(true,true);
  const before=prop.getVertexPosition(0,new THREE.Vector3())
    .applyMatrix4(prop.matrixWorld);
  const ref=captureReferencePose(f.root);
  const result=cleanRiggedMixamoFBX(f.root,ref,
    {accessoryHandling:'rigid'});
  assert.equal(result.bones,8);
  assert.ok(result.accessory.preservedAttachments.some(
    x=>x.name==='Mint_Head_Adjust_Prop'));
  assert.ok(prop.getVertexPosition(0,new THREE.Vector3())
    .applyMatrix4(prop.matrixWorld).distanceTo(before)<1e-7);
  const parsed=new FBXLoader().parse(result.bytes.buffer.slice(
    result.bytes.byteOffset,result.bytes.byteOffset+result.bytes.byteLength),'');
  assert.ok(parsed.getObjectByName('Mint_Head_Adjust_Prop'),
    'physically exported FBX must retain the static prop');
  assert.equal(parsed.animations.length,0);
});
test('MOTION-05B.2 unweighted helper Bone under head_adjust becomes static Group, not another rig',()=>{
  const f=separateChestBowRigFixture();
  f.adjust.name='head_adjust';
  const orphan=new THREE.Bone();orphan.name='unweighted_head_helper';
  orphan.position.set(.04,.09,0);
  const marker=new THREE.Mesh(new THREE.BoxGeometry(.03,.04,.05),
    new THREE.MeshBasicMaterial());
  marker.name='Accessory_Marker';
  orphan.add(marker);
  f.adjust.add(orphan);
  const ref=captureReferencePose(f.root);
  const out=cleanRiggedMixamoFBX(f.root,ref,{accessoryHandling:'rigid'});
  assert.equal(out.bones,8,'unweighted helper must not become a second physical skeleton');
  assert.ok(out.accessory.preservedAttachments.some(
    x=>x.name==='unweighted_head_helper_estatico'));
  const loaded=new FBXLoader().parse(out.bytes.buffer.slice(
    out.bytes.byteOffset,out.bytes.byteOffset+out.bytes.byteLength),'');
  assert.equal(loaded.animations.length,0);
  assert.ok(loaded.getObjectByName('Accessory_Marker'));
  assert.ok(orphan.isBone&&orphan.parent===f.adjust,'keep original unweighted bone');
});
test('MOTION-05B.2 rejects unsupported light under head_adjust, never silently deletes it',()=>{
  const f=separateChestBowRigFixture();
  f.adjust.name='head_adjust';
  const attached=new THREE.PointLight(0xffffff,1);
  attached.name='HeadLight_Aux';
  f.adjust.add(attached);
  const ref=captureReferencePose(f.root);
  assert.throws(()=>cleanRiggedMixamoFBX(f.root,ref,
    {accessoryHandling:'rigid'}),/objeto no convertible/);
  assert.ok(attached.parent===f.adjust);
});
test('MOTION-05A.1 supports an unnamed FBX root renamed by the viewer after load',()=>{
  const f=fixture();
  f.root.name=''; // FBXLoader sometimes supplies an unnamed top-level Group
  const reference=captureReferencePose(f.root);
  assert.equal(reference[0].name,'');
  // Reproduce the exact old program sequence: the viewer subsequently
  // assigned the filename, then exported a skeletal clone.
  f.root.name='character_loaded_from_file';
  f.hips.rotation.y=0.37; // active clip should never leak into export
  const restored=cloneAtReferencePose(f.root,reference);
  assert.equal(restored.name,'character_loaded_from_file');
  const hips=restored.getObjectByName('mixamorig:Hips');
  assert.ok(hips);
  assert.ok(Math.abs(hips.rotation.y)<1e-7);
  assert.ok(Math.abs(f.hips.rotation.y-0.37)<1e-7);
  const binary=cleanRiggedMixamoFBX(f.root,reference,{pose:'t'});
  assert.ok(isBinaryFBX(binary.bytes));
  assert.equal(binary.animations,0);
  assert.equal(binary.bones,8);
});

test('MOTION-05A.1 compares semantic FBX bones/skin instead of display .type',()=>{
  const f=fixture();
  // An FBX importer can attach custom runtime type strings. These labels
  // are NOT guaranteed to survive a SkeletonUtils.clone() round trip.
  f.root.type='FBXImportedGroup';
  f.hips.type='FBXLimbNode';
  f.arms.Left.upper.type='FBXLimbNode';
  const reference=captureReferencePose(f.root);
  const restored=cloneAtReferencePose(f.root,reference);
  const hip=restored.getObjectByName('mixamorig:Hips');
  assert.ok(hip?.isBone);
  assert.equal(hip.type,'Bone');
  assert.equal(skinBoneCount(restored),8);
  // Still reject semantic changes to node roles; not a bypass of rig safety.
  const tampered=reference.map(x=>({...x}));
  const index=tampered.findIndex(x=>x.name==='mixamorig:Hips');
  tampered[index].kind='mesh';
  assert.throws(()=>cloneAtReferencePose(f.root,tampered),/tipo estructural/);
});

test('MOTION-05A a reference pose is captured before mixer alters the original',()=>{
  const {root,hips,arms}=fixture();
  const original=captureReferencePose(root);
  hips.rotation.y=0.45;arms.Left.upper.rotation.x=0.4;
  root.updateWorldMatrix(true,true);
  const clean=cloneAtReferencePose(root,original);
  const map=new Map();clean.traverse(n=>map.set(n.name,n));
  assert.ok(Math.abs(map.get('mixamorig:Hips').rotation.y)<1e-8);
  assert.ok(Math.abs(map.get('mixamorig:LeftArm').rotation.x)<1e-8);
  assert.ok(Math.abs(hips.rotation.y-0.45)<1e-8,'original animation remains untouched');
  assert.equal(skinBoneCount(clean),skinBoneCount(root));
  assert.equal(skinnedMeshes(clean).length,1);
});
test('MOTION-05A two A-pose arms become horizontal T without modifying source',()=>{
  const f=fixture(),initial=captureReferencePose(f.root);
  const initialBone=f.arms.Left.upper.quaternion.clone();
  const built=prepareMixamoRig(f.root,initial,{pose:'t'});
  assert.equal(built.pose,'T calibrada');
  assert.equal(built.adjustments.length,2);
  const nodes=new Map();built.model.traverse(n=>nodes.set(n.name,n));
  for(const [side,sign] of [['Left',1],['Right',-1]]){
    const b=nodes.get('mixamorig:'+side+'Arm');
    const fore=nodes.get('mixamorig:'+side+'ForeArm');
    const hand=nodes.get('mixamorig:'+side+'Hand');
    const direction=worldSegment(b,fore);
    const second=worldSegment(fore,hand);
    assert.ok(direction.dot(new THREE.Vector3(sign,0,0))>0.999);
    assert.ok(second.dot(new THREE.Vector3(sign,0,0))>0.999);
  }
  assert.ok(f.arms.Left.upper.quaternion.equals(initialBone));
  assert.equal(built.bones,8);
  assert.equal(built.meshes,1);
});
test('MOTION-05A.2 calibrated A pose uses downward straight arms, not horizontal T',()=>{
  const f=fixture(),reference=captureReferencePose(f.root);
  const before=JSON.stringify(captureReferencePose(f.root));
  const prepared=prepareMixamoRig(f.root,reference,{pose:'a'});
  assert.match(prepared.pose,/A calibrada/);
  const nodes=new Map();prepared.model.traverse(n=>nodes.set(n.name,n));
  for(const [side,sign] of [['Left',1],['Right',-1]]){
    const upper=nodes.get('mixamorig:'+side+'Arm');
    const forearm=nodes.get('mixamorig:'+side+'ForeArm');
    const hand=nodes.get('mixamorig:'+side+'Hand');
    const target=new THREE.Vector3(sign*Math.cos(Math.PI*35/180),
      -Math.sin(Math.PI*35/180),0);
    assert.ok(worldSegment(upper,forearm).angleTo(target)<0.03,
      side+' upper arm must follow the natural diagonal A');
    assert.ok(worldSegment(forearm,hand).angleTo(target)<0.03,
      side+' forearm must be extended diagonally');
  }
  assert.equal(JSON.stringify(captureReferencePose(f.root)),before,
    'calibration is applied only to the cloned rig');
});
test('MOTION-05A.2 unfamiliar bone names do not prevent default original-pose FBX',()=>{
  const f=fixture();
  f.root.traverse(n=>{
    if(n.isBone)n.name='avatar_joint_'+n.id;
  });
  f.root.name='Character_Unknown_Rig';
  const reference=captureReferencePose(f.root);
  f.hips.rotation.y=0.34;
  const result=cleanRiggedMixamoFBX(f.root,reference);
  assert.equal(result.pose,'Referencia original (sin modificar)');
  assert.equal(result.animations,0);
  assert.equal(result.bones,8);
  assert.ok(isBinaryFBX(result.bytes));
  assert.ok(Math.abs(f.hips.rotation.y-.34)<1e-7);
  assert.throws(()=>prepareMixamoRig(f.root,reference,{pose:'a'}),/Huesos encontrados/);
  assert.throws(()=>prepareMixamoRig(f.root,reference,{pose:'t'}),/Pose de referencia original/);
});
test('MOTION-05A.2 default original pose preserves a downward A posture',()=>{
  const f=fixture();
  f.arms.Left.upper.rotation.z=0.17;
  f.arms.Right.upper.rotation.z=-0.17;
  const reference=captureReferencePose(f.root);
  const prepared=prepareMixamoRig(f.root,reference);
  assert.equal(prepared.pose,'Referencia original (sin modificar)');
  const nodes=new Map();prepared.model.traverse(n=>nodes.set(n.name,n));
  for(const side of ['Left','Right']){
    const a=f.arms[side].upper;
    const b=nodes.get('mixamorig:'+side+'Arm');
    assert.ok(a.quaternion.angleTo(b.quaternion)<1e-7,
      side+' shoulder pose should not be altered');
  }
});

test('MOTION-05A pose reference fallback never forces T correction',()=>{
  const f=fixture(),original=captureReferencePose(f.root);
  const result=prepareMixamoRig(f.root,original,{pose:'reference'});
  assert.equal(result.pose,'Referencia original (sin modificar)');
  assert.deepEqual(result.adjustments,[]);
  assert.deepEqual(captureReferencePose(f.root),original);
});
test('MOTION-05A emits an actual binary FBX with skin, original bone graph and zero clips',()=>{
  const f=fixture(),original=captureReferencePose(f.root);
  const clip=new THREE.AnimationClip('Dance',1,[
    new THREE.QuaternionKeyframeTrack('mixamorig:LeftArm.quaternion',
      [0,1],[0,0,0,1,0,0,.2,Math.sqrt(1-.2*.2)]),
  ]);
  f.root.animations=[clip];
  f.hips.rotation.y=.3;
  const before=f.hips.rotation.y;
  const result=cleanRiggedMixamoFBX(f.root,original,{pose:'t'});
  assert.ok(isBinaryFBX(result.bytes));
  assert.equal(result.animations,0);
  assert.equal(result.bones,8);
  assert.equal(result.meshes,1);
  assert.equal(readPhysicalFbxRig(result.bytes).size,8);
  const reimported=new FBXLoader().parse(result.bytes.buffer.slice(
    result.bytes.byteOffset,result.bytes.byteOffset+result.bytes.byteLength),'');
  assert.equal(reimported.animations.length,0);
  reimported.updateWorldMatrix(true,true);
  const reloadedBones=[];
  reimported.traverse(node=>{if(node.isBone)reloadedBones.push(node);});
  const normalizedName=node=>node.name.replace(/[^a-z0-9]/gi,'')
    .toLowerCase().replace(/\d+$/,'');
  for(const side of ['Left','Right']){
    // FBXLoader may strip colons, add suffixes or clone a per-skin proxy.
    const upper=reloadedBones.find(node=>normalizedName(node).endsWith(
      side.toLowerCase()+'arm'));
    const fore=reloadedBones.find(node=>normalizedName(node).endsWith(
      side.toLowerCase()+'forearm'));
    assert.ok(upper&&fore,'FBX bone list: '+
      reloadedBones.map(node=>node.name).join(', '));
    const direction=worldSegment(upper,fore);
    assert.ok(Math.abs(direction.y)<0.055,
      'exported FBX must preserve horizontal '+side+' T arm. y='+direction.y);
  }
  assert.equal(f.root.animations.length,1);
  assert.equal(f.hips.rotation.y,before);
});
test('MOTION-05A refuses missing humanoid arms without fake T pose',()=>{
  const f=fixture({includeRight:false}),original=captureReferencePose(f.root);
  assert.throws(()=>prepareMixamoRig(f.root,original,{pose:'t'}),/brazo derecho/);
  const fallback=prepareMixamoRig(f.root,original,{pose:'reference'});
  assert.equal(fallback.pose,'Referencia original (sin modificar)');
});
test('MOTION-05A protects against stale hierarchy and unrigged models',()=>{
  const f=fixture(),original=captureReferencePose(f.root);
  f.root.add(new THREE.Group());
  assert.throws(()=>cloneAtReferencePose(f.root,original),/jerarquía/);
  assert.throws(()=>cloneAtReferencePose(new THREE.Group(),original),/SkinnedMesh/);
  assert.throws(()=>prepareMixamoRig(f.root,original,{pose:'unsafe'}),/pose/);
});
test('MOTION-05A extracted clip JSON stores motion and compatibility metadata separately',()=>{
  const f=fixture();
  const clip=new THREE.AnimationClip('Dance',1,[
    new THREE.QuaternionKeyframeTrack('mixamorig:LeftArm.quaternion',[0,1],
      [0,0,0,1,0,0,0,1]),
  ]);
  const data=JSON.parse(exportableClipJSON(clip,{
    rigName:'My_character.fbx',rigBones:skinBoneCount(f.root),
  }));
  assert.equal(data.format,'orbi.motion.clip.v1');
  assert.equal(data.clip.name,'Dance');
  assert.equal(data.sourceRig.boneCount,8);
  assert.ok(data.clip.tracks.length>0);
  assert.equal(THREE.AnimationClip.parse(data.clip).tracks.length,1);
  assert.throws(()=>exportableClipJSON(new THREE.AnimationClip('Empty',1,[])),/válida/);
});
