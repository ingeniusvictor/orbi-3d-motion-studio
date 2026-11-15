import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {
 TOELOCK_V4,transferToeWeightSlots,parseToeLockGLB,
 inspectToeLockV4,applyToeLockV4,sha256Hex,
} from '../src/lib/autoRig/toeWeightTransfer.js';
import {
 inspectLumiaMasterRest,requireLumiaTargetRest,
} from '../src/lib/autoRig/lumiaMasterProfile.js';
import {
 inspectToeLockKit,makeToeLockMixamoPackage,
} from '../src/lib/toeLockMixamoPackage.js';
import {
 identifyMixamoProfile,
} from '../src/lib/autoRig/mixamoRetargetV06.js';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

function master(version){
 const scene=new THREE.Group();
 const names=['V8_root','V8_Bip001-Pelvis','J_Bip_C_Head'];
 while(names.length<346)names.push('Joint-'+names.length);
 const bones=names.map(name=>{const b=new THREE.Bone();b.name=name;return b;});
 const ys=version==='v09'?[0,.9432,1.4177]:
          version==='v06b'?[0,1.0564,1.5835]:[0,1.3,1.6];
 const inv=bones.map((b,i)=>new THREE.Matrix4().makeTranslation(0,-(ys[i]||0),0));
 const mesh=new THREE.SkinnedMesh(new THREE.BoxGeometry(1,1,1),
   new THREE.MeshBasicMaterial());
 mesh.skeleton=new THREE.Skeleton(bones,inv);
 scene.add(mesh);
 return scene;
}

test('MOTION-07 row transfer reproduces V4 four-slot behavior exactly',()=>{
 const originalJ=[91,90,3,4],originalW=[.3,.2,.25,.25];
 const result=transferToeWeightSlots(originalJ,originalW,91,90);
 assert.deepEqual(result.joints,[0,90,3,4]);
 assert.equal(result.weights[0],0);
 assert.equal(result.weights[1],Math.fround(.3+.2));
 assert.equal(result.moved,1);
 assert.deepEqual(originalJ,[91,90,3,4]);
 assert.deepEqual(originalW,[.3,.2,.25,.25]);
 const noFoot=transferToeWeightSlots([91,2,3,4],[.3,.2,.25,.25],91,90);
 assert.deepEqual(noFoot.joints,[90,2,3,4]);
 assert.deepEqual(noFoot.weights,[.3,.2,.25,.25]);
 assert.equal(noFoot.moved,1);
});
test('MOTION-07 ToeLock is idempotent and rejects multiple Foot slots',()=>{
 const clean=transferToeWeightSlots([0,90,3,4],[0,.5,.25,.25],91,90);
 assert.equal(clean.moved,0);
 assert.deepEqual(clean.weights,[0,.5,.25,.25]);
 assert.throws(()=>transferToeWeightSlots([91,90,90,4],
   [.25,.25,.25,.25],91,90),/varias influencias/);
 assert.throws(()=>transferToeWeightSlots([91,90,2],[.5,.3,.2],91,90),
   /cuatro influencias/);
});
test('MOTION-07 rejects arbitrary master and malformed GLB before editing',async()=>{
 const buffer=new ArrayBuffer(36);
 assert.throws(()=>parseToeLockGLB(buffer),/GLB 2\.0 inválido/);
 assert.equal(TOELOCK_V4.bones,162);
 assert.equal(TOELOCK_V4.vertices,47386);
 assert.equal(TOELOCK_V4.triangles,73157);
 assert.equal(TOELOCK_V4.sourceSha256.length,64);
 assert.equal(TOELOCK_V4.correctedSha256.length,64);
 await assert.rejects(inspectToeLockV4(buffer),/identidad SHA-256/);
 await assert.rejects(applyToeLockV4(buffer),/identidad SHA-256/);
 const hash=await sha256Hex(new TextEncoder().encode('abc').buffer);
 assert.equal(hash,'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test('MOTION-07 distinguishes V09 and V06B by actual inverse-bind rest positions',()=>{
 const v09=inspectLumiaMasterRest(master('v09'));
 assert.equal(v09.ok,true);
 assert.equal(v09.version,'claude-v09');
 assert.equal(v09.bones,346);
 assert.equal(inspectLumiaMasterRest(master('v06b')).version,'v06b');
 assert.equal(inspectLumiaMasterRest(master('unknown')).ok,false);
 assert.throws(()=>requireLumiaTargetRest(master('v06b'),'claude-v09'),
   /no coincide/);
 assert.equal(requireLumiaTargetRest(master('v09'),'claude-v09').version,'claude-v09');
});
test('MOTION-07 never accepts a random replacement for certified Blender script',async()=>{
 await assert.rejects(inspectToeLockKit(new Uint8Array([1,2,3]).buffer),
   /kit V4 íntegro aprobado/);
 await assert.rejects(makeToeLockMixamoPackage({
   kitBuffer:new ArrayBuffer(0),
   glbBuffer:new ArrayBuffer(0),
   report:{targetSha256:'wrong'},
 }),/SHA certificado/);
});
test('MOTION-07 is opt-in and does not overwrite AUTORIG or MOTION-06',()=>{
 const app=source('src/App.jsx');
 const retarget=source('src/lib/autoRig/mixamoRetargetV06.js');
 const panel=source('src/MixamoToeLockLab.jsx');
 const original=source('src/MixamoRetargetLab.jsx');
 assert.match(app,/MixamoRetargetLab/);
 assert.match(app,/MixamoToeLockLab/);
 assert.match(original,/keep/);
 assert.match(original,/auto/);
 assert.match(original,/lock/);
 assert.match(retarget,/targetVersion='v06b'/);
 assert.match(retarget,/requireLumiaTargetRest/);
 assert.match(panel,/Maestra LUMIA Claude V09/);
 assert.match(panel,/makeToeLockMixamoPackage/);
 assert.match(panel,/ToeLockMiniPreview/);
 assert.doesNotMatch(source('src/lib/autoRig/toeWeightTransfer.js'),/document\.write/);
});
