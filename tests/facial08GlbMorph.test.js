import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {GlbMorphFaceQA,auditGlbMorphFace} from
  '../src/lib/livingPresence/glbMorphFaceQA.js';
import {canRunFacialQuickAction} from
  '../src/lib/livingPresence/facialQuickActions.js';

const NAMES=[
  'Angry','Fun','Joy','Sorrow','Surprised',
  ...Array.from({length:7},(_,i)=>'Shape_'+String(i+5).padStart(2,'0')),
  'Blink','Blink_R','Blink_L',
  ...Array.from({length:14},(_,i)=>'Shape_'+String(i+15).padStart(2,'0')),
  'A','I','U','E','O',
  ...Array.from({length:7},(_,i)=>'Shape_'+String(i+34).padStart(2,'0')),
];
assert.equal(NAMES.length,41,'Names from the actual LUMIA Claude V09 GLB');
function avatar({parts=9}={}){
  const root=new THREE.Group(),faces=[];
  for(let i=0;i<parts;i++){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1),
      new THREE.MeshBasicMaterial());
    mesh.name='Face primitive '+i;
    mesh.morphTargetDictionary=Object.fromEntries(NAMES.map((n,j)=>[n,j]));
    mesh.morphTargetInfluences=Array(41).fill(0);
    faces.push(mesh);root.add(mesh);
  }
  return {root,faces};
}
function channel(face,name){
  return face.morphTargetInfluences[face.morphTargetDictionary[name]];
}

test('FACIAL-08 detects EXACT 41 face channels seen in Claude V09, not fake VRM expressions',()=>{
  const {root}=avatar();
  const data=auditGlbMorphFace(root);
  assert.equal(data.supported,true);
  assert.equal(data.morphMeshes,9);
  assert.equal(data.morphNames.length,41);
  assert.equal(data.blink,true);
  assert.deepEqual(Object.keys(data.mouth),['a','i','u','e','o']);
  assert.equal(data.mouth.a,'A');
  assert.equal(data.channels.smile,'Joy');
  assert.equal(data.channels.browLift,'Surprised');
  assert.equal(data.channels.jaw,'A');
  assert.equal(data.channels.cheeks,undefined);
  assert.equal(data.gaze,false);
  assert.ok(data.proxies.includes('smile'));
});
test('FACIAL-08 untouched until opt-in, blink and vowel previews reversible on ALL facial primitives',()=>{
  const {root,faces}=avatar();
  const qa=new GlbMorphFaceQA(root);
  assert.equal(qa.getDiagnostics().enabled,false);
  assert.equal(qa.previewBlink(),false);
  assert.equal(channel(faces[0],'Blink'),0);
  qa.setEnabled(true);
  assert.equal(qa.previewBlink(),true);
  qa.update(.016);
  assert.ok(faces.every(x=>channel(x,'Blink')>.8));
  qa.beforeFrame();
  assert.ok(faces.every(x=>channel(x,'Blink')===0));
  for(const vowel of ['a','i','u','e','o']){
    assert.equal(qa.previewVowel(vowel),true);
    qa.update(.016);
    assert.ok(faces.every(face=>channel(face,vowel.toUpperCase())>0),
      'missing vowel '+vowel);
    qa.beforeFrame();
    assert.ok(faces.every(face=>channel(face,vowel.toUpperCase())===0));
  }
  qa.setEnabled(false);
  assert.ok(faces.every(face=>face.morphTargetInfluences.every(v=>v===0)));
  qa.dispose();
});
test('FACIAL-08 Joy and Surprised are actual expressive proxies, not independent muscles',()=>{
  const {root,faces}=avatar();
  const qa=new GlbMorphFaceQA(root);qa.setEnabled(true);
  assert.equal(qa.previewFeature('smile'),true);
  qa.update(.016);
  assert.ok(channel(faces[0],'Joy')>.1);
  qa.beforeFrame();
  assert.equal(channel(faces[0],'Joy'),0);
  assert.equal(qa.previewFeature('brows'),true);
  qa.update(.016);
  assert.ok(channel(faces[0],'Surprised')>.1);
  assert.equal(qa.previewFeature('cheeks'),false);
  assert.equal(qa.previewFeature('angry'),true);
  qa.update(.016);
  assert.ok(channel(faces[0],'Angry')>0);
  qa.dispose();
  assert.ok(faces[0].morphTargetInfluences.every(v=>v===0));
});
test('FACIAL-08 file-audio lip synchronization uses existing A morph and resets after stop',()=>{
  const {root,faces}=avatar();
  const qa=new GlbMorphFaceQA(root);qa.setEnabled(true);
  assert.equal(qa.start(7,{source:'file',text:'aaaa'}),true);
  assert.equal(qa.beginSpeech(7,{mode:'explaining'}),true);
  assert.equal(qa.audioSignal(7,.22,.4),true);
  qa.update(.04);
  const status=qa.getLipDiagnostics();
  assert.equal(status.active,true);
  assert.equal(status.audioSignalReceived,true);
  assert.equal(status.currentVowel,'a');
  assert.ok(status.opening>0);
  assert.ok(channel(faces[0],'A')>0);
  assert.equal(qa.stop(7),true);
  assert.equal(channel(faces[0],'A'),0);
  assert.equal(qa.endSpeech(7),true);
  assert.equal(qa.getLipDiagnostics().active,false);
  qa.dispose();
});
test('FACIAL-08 idle expression is user-controlled, small and released before other animations',()=>{
  const {root,faces}=avatar();
  const qa=new GlbMorphFaceQA(root);
  qa.update(.05);
  assert.equal(channel(faces[0],'Joy'),0);
  qa.setEnabled(true);
  qa.setMode('resting');
  qa.update(.05);
  assert.ok(channel(faces[0],'Joy')>0);
  assert.ok(channel(faces[0],'Joy')<.08);
  qa.beforeFrame();
  assert.equal(channel(faces[0],'Joy'),0);
  qa.setEnabled(false);qa.dispose();
});
test('FACIAL-08 does not replace eye bone mapping with guessed J_Adj controllers',()=>{
  const {root}=avatar({parts:1});
  const hips=new THREE.Bone();hips.name='Hips';root.add(hips);
  const left=new THREE.Bone();left.name='J_Adj_L_FaceEye';
  const right=new THREE.Bone();right.name='J_Adj_R_FaceEye';
  hips.add(left);hips.add(right);
  const geometry=new THREE.BoxGeometry(.1,.1,.1);
  const count=geometry.attributes.position.count;
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(count*4),4));
  const weights=new Float32Array(count*4);
  for(let i=0;i<count;i++)weights[i*4]=1;
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const skin=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial());
  root.add(skin);root.updateMatrixWorld(true,true);
  skin.bind(new THREE.Skeleton([hips,left,right]));
  const qa=new GlbMorphFaceQA(root);
  qa.setEnabled(true);
  assert.equal(qa.getDiagnostics().gaze,false);
  assert.equal(qa.previewGaze('left'),false);
  assert.equal(qa.setManualMapping('eyeLeft',left.uuid).ok,true);
  assert.equal(qa.setManualMapping('eyeRight',right.uuid).ok,true);
  assert.equal(qa.getDiagnostics().gaze,true);
  assert.equal(qa.previewGaze('left'),true);
  const previous=left.quaternion.clone();
  qa.update(.016);
  assert.ok(!left.quaternion.equals(previous));
  qa.beforeFrame();assert.ok(left.quaternion.equals(previous));
  qa.dispose();
});
test('FACIAL-08 quick action availability enables real GLB morphs only after user opt-in',()=>{
  const {root}=avatar(),qa=new GlbMorphFaceQA(root);
  let face=qa.getDiagnostics(),lip=qa.getLipDiagnostics();
  assert.equal(canRunFacialQuickAction({group:'mouth',key:'a'},
    {face,lip,presenceEnabled:false,fbx:true}),false);
  qa.setEnabled(true);
  face=qa.getDiagnostics();lip=qa.getLipDiagnostics();
  assert.equal(canRunFacialQuickAction({group:'mouth',key:'a'},
    {face,lip,presenceEnabled:true,fbx:true}),true);
  assert.equal(canRunFacialQuickAction({key:'blink',feature:'blink'},
    {face,lip,presenceEnabled:true,fbx:true}),true);
  assert.equal(canRunFacialQuickAction({key:'joy',feature:'joy'},
    {face,lip,presenceEnabled:true,fbx:true}),true);
  assert.equal(canRunFacialQuickAction({key:'left',feature:'gaze'},
    {face,lip,presenceEnabled:true,fbx:true}),false);
  qa.dispose();
});
test('FACIAL-08 UI retains working MOTION-07/VIEWER-04 and VRM controllers',()=>{
  const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  const viewer=readFileSync(new URL('../src/lib/viewer.js',import.meta.url),'utf8');
  const faceDock=readFileSync(new URL('../src/FaceQuickDock.jsx',import.meta.url),'utf8');
  assert.match(app,/PanelErrorBoundary/);
  assert.match(app,/MixamoToeLockLab/);
  assert.match(viewer,/new GlbMorphFaceQA\(this\.model\)/);
  assert.match(viewer,/this\.vrm \? new LipSyncController\(this\.vrm\)/);
  assert.match(viewer,/this\.vrm \? new FacialPresence\(this\.vrm/);
  assert.match(viewer,/getExistingRigMotionStatus\(/);
  assert.match(faceDock,/Activar pruebas faciales reversibles/);
  assert.match(faceDock,/morphCount/);
});
