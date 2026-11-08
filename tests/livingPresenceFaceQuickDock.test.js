import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {canRunFacialQuickAction} from '../src/lib/livingPresence/facialQuickActions.js';
import {MotionViewer} from '../src/lib/viewer.js';

test('LP-03D.2 QA dock allows precisely the facial channels present on the VRM',()=>{
  const data={
    presenceEnabled:true,
    face:{enabled:true,blink:true,gaze:true,
      channels:{smile:'smile',browLift:'surprised',leftSquint:'eyeSquintLeft'}},
    lip:{active:false,mapping:{a:'aa',i:'ih',o:'oh'}},
  };
  assert.equal(canRunFacialQuickAction({key:'blink'},data),true);
  assert.equal(canRunFacialQuickAction({key:'left',feature:'gaze'},data),true);
  assert.equal(canRunFacialQuickAction({key:'brows',feature:'browLift'},data),true);
  assert.equal(canRunFacialQuickAction({key:'smile',feature:'smile'},data),true);
  assert.equal(canRunFacialQuickAction({key:'cheeks',feature:'cheeks'},data),false);
  assert.equal(canRunFacialQuickAction({key:'eyelids',feature:'squint'},data),true);
  assert.equal(canRunFacialQuickAction({key:'a',group:'mouth'},data),true);
  assert.equal(canRunFacialQuickAction({key:'e',group:'mouth'},data),false);
  data.lip.active=true;
  assert.equal(canRunFacialQuickAction({key:'a',group:'mouth'},data),false,
    'manual vowel preview cannot overlap actual voice');
  data.presenceEnabled=false;
  assert.equal(canRunFacialQuickAction({key:'blink'},data),false);
  assert.equal(canRunFacialQuickAction({key:'left',feature:'gaze'},data),false);
  data.face.enabled=false;
  assert.equal(canRunFacialQuickAction({key:'smile',feature:'smile'},data),false);
});
test('LP-03D.2 camera focus on face changes only camera and controls',()=>{
  const scene=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.45,2,0.28),
    new THREE.MeshBasicMaterial());
  body.position.y=1;scene.add(body);
  const head=new THREE.Bone();head.name='head';head.position.set(0,1.75,0);
  scene.add(head);
  scene.updateWorldMatrix(true,true);
  const original=head.position.clone();
  const camera=new THREE.PerspectiveCamera(38,1.7,0.01,2000);
  camera.position.set(3,2.5,5);
  const controls={target:new THREE.Vector3(0,1,0),update(){this.updated=true;}};
  const fake={model:scene,vrm:{humanoid:{getNormalizedBoneNode(name){
    return name==='head'?head:null;
  }}},camera,controls};
  const ok=MotionViewer.prototype.focusFace.call(fake);
  assert.equal(ok,true);
  assert.ok(controls.updated);
  assert.ok(controls.target.distanceTo(head.getWorldPosition(new THREE.Vector3()))<1e-7);
  assert.equal(camera.position.distanceTo(controls.target)>0,true);
  assert.ok(head.position.equals(original),'camera must not adjust rigging');
  assert.equal(MotionViewer.prototype.focusFace.call({model:null,vrm:null}),false);
});
