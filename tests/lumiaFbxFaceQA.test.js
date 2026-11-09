import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FbxFaceQA,auditFbxFacialBones} from '../src/lib/livingPresence/fbxFaceQA.js';
import {getFaceFraming,findFaceAnchor} from '../src/lib/faceFraming.js';

function character(){
  const root=new THREE.Group();
  const hips=new THREE.Bone();hips.name='Bip001 Pelvis';root.add(hips);
  const head=new THREE.Bone();head.name='Bn_C_Head';head.position.y=1.4;hips.add(head);
  const jaw=new THREE.Bone();jaw.name='Jaw';jaw.position.y=-.2;head.add(jaw);
  const eyeL=new THREE.Bone();eyeL.name='LeftEye';head.add(eyeL);
  const eyeR=new THREE.Bone();eyeR.name='RightEye';head.add(eyeR);
  const lidL=new THREE.Bone();lidL.name='LeftUpperLid';head.add(lidL);
  const lidR=new THREE.Bone();lidR.name='RightUpperLid';head.add(lidR);
  const browL=new THREE.Bone();browL.name='LeftBrow';head.add(browL);
  const browR=new THREE.Bone();browR.name='RightBrow';head.add(browR);
  const geometry=new THREE.BoxGeometry(.6,2,.4);
  const count=geometry.getAttribute('position').count;
  const indices=new Uint16Array(count*4),weights=new Float32Array(count*4);
  for(let i=0;i<count;i++)weights[i*4]=1;
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial());
  mesh.name='Skin';root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([hips,head,jaw,eyeL,eyeR,lidL,lidR,browL,browR]));
  return {root,head,jaw,eyeL,eyeR};
}
test('LP-FBX-01 camera finds animated FBX head and never alters its pose',()=>{
  const {root,head}=character();
  const before=head.quaternion.clone();
  const framing=getFaceFraming(root);
  assert.ok(framing);
  assert.equal(findFaceAnchor(root).node,head);
  assert.equal(framing.anchor,head);
  assert.ok(framing.distance>0);
  assert.ok(head.quaternion.equals(before));
});
test('LP-FBX-01 camera falls back to visible upper mesh on unknown rig',()=>{
  const root=new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1,3,1)));
  const framing=getFaceFraming(root);
  assert.equal(framing.method,'visible-upper-body');
  assert.ok(framing.target.y>0);
});
test('LP-FBX-01 detects supported facial bones conservatively',()=>{
  const {root}=character();
  const data=auditFbxFacialBones(root);
  assert.equal(data.controls.gaze,true);
  assert.equal(data.controls.blink,true);
  assert.equal(data.controls.jaw,true);
  assert.equal(data.controls.brows,true);
  assert.equal(data.names.jaw,'Jaw');
  assert.equal(data.controls.smile,false,'smile needs two recognized mouth corners');
});
test('LP-FBX-01 preview overlays are reversible and never modify rest pose',()=>{
  const {root,jaw,eyeL}=character();
  const qa=new FbxFaceQA(root);
  assert.equal(qa.previewFeature('jaw'),false);
  qa.setEnabled(true);
  const base=jaw.quaternion.clone();
  assert.equal(qa.previewFeature('jaw'),true);
  qa.update(.016);
  assert.ok(!jaw.quaternion.equals(base));
  qa.beforeFrame();
  assert.ok(jaw.quaternion.equals(base));
  const eyeBase=eyeL.quaternion.clone();
  assert.equal(qa.previewGaze('left'),true);
  qa.update(.016);
  assert.ok(!eyeL.quaternion.equals(eyeBase));
  qa.dispose();
  assert.ok(eyeL.quaternion.equals(eyeBase));
});
test('LP-FBX-01 speech uses jaw only when user enables QA; stop restores pose',()=>{
  const {root,jaw}=character();const qa=new FbxFaceQA(root);
  assert.equal(qa.start(1,{text:'Hola'}),false);
  qa.setEnabled(true);const base=jaw.quaternion.clone();
  assert.equal(qa.start(1,{text:'Hola',source:'browser'}),true);
  qa.update(.016);
  assert.ok(!jaw.quaternion.equals(base));
  assert.equal(qa.stop(1),true);
  assert.ok(jaw.quaternion.equals(base));
});
test('LP-FBX-01 missing or duplicated jaw does not enable fake visemes',()=>{
  const {root,head}=character();
  const second=new THREE.Bone();second.name='jaw';head.add(second);
  const meshes=[];root.traverse(n=>{if(n.isSkinnedMesh)meshes.push(n);});
  meshes[0].skeleton.bones.push(second);
  const qa=new FbxFaceQA(root);
  assert.equal(qa.getLipDiagnostics().supported,false);
  assert.equal(qa.previewVowel('a'),false);
  assert.equal(qa.start(1,{text:'a'}),false);
});

test('LP-FBX-02 manual mapping enables previously unknown eye controls without altering animation',()=>{
  const {root,eyeL,eyeR}=character();
  eyeL.name='ocular_001';eyeR.name='ocular_002';
  const qa=new FbxFaceQA(root);
  assert.equal(qa.audit.controls.gaze,false,'unknown names are not guessed');
  assert.equal(qa.getMappingConfig().bones.length,9);
  const left=qa.setManualMapping('eyeLeft',eyeL.uuid);
  const right=qa.setManualMapping('eyeRight',eyeR.uuid);
  assert.equal(left.ok,true);
  assert.equal(right.ok,true);
  assert.equal(qa.audit.controls.gaze,true);
  assert.equal(qa.getMappingConfig().names.eyeRight,'ocular_002');
  const before=eyeL.quaternion.clone();
  assert.equal(qa.previewGaze('left'),false,'must explicitly authorize controls');
  qa.setEnabled(true);
  assert.equal(qa.previewGaze('left'),true);
  qa.update(.016);
  assert.ok(!eyeL.quaternion.equals(before));
  qa.setEnabled(false);
  assert.ok(eyeL.quaternion.equals(before),'disabling restores imported pose');
  qa.dispose();
});
test('LP-FBX-02 rejects duplicate roles, unknown bones and blocks remapping during speech',()=>{
  const {root,eyeL,eyeR,jaw}=character();
  const qa=new FbxFaceQA(root);
  assert.equal(qa.setManualMapping('eyeRight',eyeL.uuid).ok,false);
  assert.equal(qa.setManualMapping('eyeLeft','uuid_not_in_rig').ok,false);
  assert.equal(qa.setManualMapping('invalidRole',jaw.uuid).ok,false);
  assert.equal(qa.setManualMapping('jaw','').ok,true);
  assert.equal(qa.getLipDiagnostics().supported,false);
  assert.equal(qa.setManualMapping('jaw','auto').ok,true);
  assert.equal(qa.getLipDiagnostics().supported,true);
  qa.setEnabled(true);
  assert.equal(qa.start(33,{text:'hola'}),true);
  assert.equal(qa.setManualMapping('eyeLeft',eyeL.uuid).ok,false);
  qa.stop(33);
  assert.equal(qa.setManualMapping('eyeLeft',eyeL.uuid).ok,true);
  qa.dispose();
});
test('LP-FBX-02 explicit mouth corner and cheek pairs allow preview only when mapped',()=>{
  const {root,head}=character();
  const bones=[];root.traverse(o=>{if(o.isSkinnedMesh)bones.push(o)});
  const add=(name)=>{
    const bone=new THREE.Bone();bone.name=name;head.add(bone);
    bones[0].skeleton.bones.push(bone);return bone;
  };
  const ml=add('unknown_corner_l'),mr=add('unknown_corner_r');
  const cl=add('unknown_cheek_l'),cr=add('unknown_cheek_r');
  const qa=new FbxFaceQA(root);
  assert.equal(qa.previewFeature('smile'),false);
  for(const [role,bone] of [
    ['mouthLeft',ml],['mouthRight',mr],['cheekLeft',cl],['cheekRight',cr]
  ])assert.equal(qa.setManualMapping(role,bone.uuid).ok,true);
  qa.setEnabled(true);
  assert.equal(qa.previewFeature('smile'),true);
  qa.update(.016);
  assert.equal(qa.getDiagnostics().channels.smile,ml.name+' / '+mr.name);
  qa.beforeFrame();
  assert.equal(qa.previewFeature('cheeks'),true);
  qa.dispose();
});
