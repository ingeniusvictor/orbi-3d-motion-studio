import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import * as THREE from 'three';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';
import {MotionViewer} from '../src/lib/viewer.js';
import {GlbMorphFaceQA} from '../src/lib/livingPresence/glbMorphFaceQA.js';

test('FACIAL-08 viewer forwards GLB blendshapes to facial and lip controls, separate from VRM',()=>{
  const root=new THREE.Group();
  const face=new THREE.Mesh(new THREE.BoxGeometry(.4,.3,.1),
    new THREE.MeshBasicMaterial());
  face.morphTargetDictionary={Blink:0,A:1,I:2,U:3,E:4,O:5,Joy:6};
  face.morphTargetInfluences=Array(7).fill(0);
  root.add(face);
  const viewer=Object.create(MotionViewer.prototype);
  viewer.vrm=null;viewer.presence=null;viewer.facial=null;viewer.lipSync=null;
  viewer.model=root;viewer.fbxFace=new GlbMorphFaceQA(root);
  assert.equal(viewer.getLivingFacialDiagnostics().supported,true);
  assert.equal(viewer.getLivingLipDiagnostics().supported,true);
  assert.equal(viewer.previewLivingBlink(),false,'explicit user activation required');
  viewer.setLivingFacialEnabled(true);
  assert.equal(viewer.previewLivingBlink(),true);
  viewer.fbxFace.update(.016);
  assert.ok(face.morphTargetInfluences[0]>.5);
  viewer.fbxFace.beforeFrame();
  assert.equal(face.morphTargetInfluences[0],0);
  assert.equal(viewer.previewLivingVowel('e'),true);
  viewer.fbxFace.update(.016);
  assert.ok(face.morphTargetInfluences[4]>0);
  viewer.fbxFace.dispose();
});
test('FACIAL-08 FaceQuickDock React SSR mounts with static V09 and no clips without black screen',async()=>{
  const vite=await createServer({
    appType:'custom',server:{middlewareMode:true,hmr:false},logLevel:'silent',
  });
  try{
    const {default:FaceQuickDock}=await vite.ssrLoadModule('/src/FaceQuickDock.jsx');
    const {default:VoiceMotorLab}=await vite.ssrLoadModule('/src/VoiceMotorLab.jsx');
    const model={
      format:'GLB',bones:346,filename:'LUMIA_CLAUDE_MAESTRA_346.glb',
      hierarchy:[],meshes:4,triangles:73157,materials:18,textures:15,
    };
    const viewer={getLivingFacialDiagnostics:()=>({
      supported:true,enabled:true,blink:true,
      channels:{smile:'Joy',jaw:'A'},morphCount:41,morphMeshes:9,
    }),getLivingLipDiagnostics:()=>({
      supported:true,mapping:{a:'A',e:'E'},active:false,opening:0,
    })};
    for(const open of [true,false]){
      assert.doesNotThrow(()=>{
        const html=renderToString(React.createElement(FaceQuickDock,{
          getViewer:()=>viewer,model,open,onClose:()=>{},
          voiceState:{ready:false,status:'idle'},onSpeak:()=>{},onStopVoice:()=>{},
        }));
        if(open){
          assert.match(html,/Rostro/);
          assert.match(html,/Activar pruebas faciales reversibles/);
          assert.match(html,/Ojos y expresiones/);
        }
      });
    }
    const voice=renderToString(React.createElement(VoiceMotorLab,{
      getViewer:()=>viewer,model,generation:1,activeClip:null,
      voiceQARef:{current:null},onVoiceQAState:()=>{},
    }));
    assert.match(voice,/LP-03C.2/);
    assert.match(voice,/GLB/);
  }finally{await vite.close();}
});
