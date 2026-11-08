import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FacialPresence,auditFacialRig} from '../src/lib/livingPresence/facialPresence.js';
import {LivingPresence} from '../src/lib/livingPresence/LivingPresence.js';
import {LipSyncController} from '../src/lib/livingPresence/lipSync.js';
import {VoiceMotorBridge} from '../src/lib/livingPresence/voiceMotorBridge.js';
import {MotionViewer} from '../src/lib/viewer.js';
import {MOTOR_INTENT_SCHEMA} from '../src/lib/livingPresence/ollamaMotorIntent.js';

function avatar(names=['blink','aa','ih','ou','ee','oh','surprised','happy','relaxed']){
  const values=new Map(names.map(name=>[name,0]));
  const mgr={
    getValue(name){return values.has(name)?values.get(name):null;},
    setValue(name,value){if(!values.has(name))throw Error('No morph '+name);
      values.set(name,value);},
  };
  const scene=new THREE.Group();
  const hips=new THREE.Bone();hips.name='hips';scene.add(hips);
  const head=new THREE.Bone();head.name='head';hips.add(head);
  const nodes={hips,head};
  const gaze={autoUpdate:true,target:null,yaw:0,pitch:0,
    getLookAtWorldPosition(out){return out.set(0,1.7,0);},
    getLookAtWorldDirection(out){return out.set(0,0,1);},
    reset(){}};
  return {values,vrm:{expressionManager:mgr,scene,lookAt:gaze,
    humanoid:{getNormalizedBoneNode(name){return nodes[name]||null;}}},head,hips,gaze};
}
function advance(face,count=120,opts={presenceActive:true}){
  for(let i=0;i<count;i++){face.beforeFrame();face.update(1/60,opts);}
}
test('LP-03D facial audit distinguishes independent brow/cheek/eye/jaw from emotion proxies',()=>{
  const a=auditFacialRig(avatar().vrm);
  assert.equal(a.blink,true);assert.equal(a.gaze,true);
  assert.equal(a.channels.browLift,'surprised');
  assert.equal(a.channels.smile,'happy');
  assert.equal(a.channels.cheeks,undefined);
  assert.ok(a.proxies.includes('browLift'));
  assert.ok(!a.independent.includes('browLift'));
  const b=auditFacialRig(avatar([
    'blinkLeft','blinkRight','browInnerUp','cheekRaise','smile','jawOpen','eyeSquintLeft',
  ]).vrm);
  assert.equal(b.channels.browLift,'browInnerUp');
  assert.equal(b.channels.cheeks,'cheekRaise');
  assert.equal(b.channels.jaw,'jawOpen');
  assert.equal(b.channels.leftSquint,'eyeSquintLeft');
  assert.equal(b.blink,true);
  assert.ok(b.independent.includes('jaw'));
  assert.equal(auditFacialRig({}).supported,false);
});
test('LP-03D camera motion and blink availability do not invent facial muscles',()=>{
  const a=avatar(['blink','aa','ih']);
  const audit=auditFacialRig(a.vrm);
  assert.equal(audit.supported,true);
  assert.equal(audit.channels.smile,undefined);
  assert.equal(audit.channels.browLift,undefined);
  assert.ok(audit.missing.includes('cheeks'));
  const face=new FacialPresence(a.vrm,{seed:22});
  assert.equal(face.previewFeature('cheeks'),false);
  assert.equal(face.previewFeature('jaw'),false);
});
test('LP-03D does not affect model until Presence A/B is enabled, and can be turned off',()=>{
  const a=avatar(['browInnerUp','cheekRaise','smile','jawOpen','blink']);
  const face=new FacialPresence(a.vrm,{seed:177});
  advance(face,200,{presenceActive:false});
  assert.ok([...a.values.values()].every(v=>v===0));
  advance(face,400,{presenceActive:true});
  assert.ok(a.values.get('browInnerUp')>0);
  assert.ok(a.values.get('smile')>0);
  face.setEnabled(false);
  assert.ok([...a.values.values()].every(v=>v===0));
});
test('LP-03D facial QA previews are reversible and never own the standard VRM vowel presets',()=>{
  const a=avatar(['browInnerUp','smile','cheekRaise','jawOpen','blink',
    'squintLeft','squintRight','aa','ih','ou','ee','oh']);
  const face=new FacialPresence(a.vrm);
  for(const [feature,name] of [
    ['brows','browInnerUp'],['smile','smile'],
    ['cheeks','cheekRaise'],['eyelids','squintLeft'],['jaw','jawOpen'],
  ]){
    assert.equal(face.previewFeature(feature,0.45),true,feature);
    advance(face,15,{presenceActive:false});
    assert.ok(a.values.get(name)>0.1,feature+' must animate');
    face.beforeFrame();face.preview=null;
    face.update(1/60,{presenceActive:false});
    for(const k of a.values.keys())
      assert.equal(a.values.get(k),0,feature+' must restore '+k);
  }
  assert.ok(['aa','ih','ou','ee','oh'].every(x=>a.values.get(x)===0));
});
test('LP-03D speech switches to speaking face while lipSync retains vowel ownership',()=>{
  const a=avatar(['browInnerUp','smile','cheekRaise','jawOpen',
    'squintLeft','squintRight','aa','ih','ou','ee','oh']);
  const face=new FacialPresence(a.vrm,{seed:515});
  const lips=new LipSyncController(a.vrm);
  assert.equal(face.beginSpeech(7,{mode:'explaining'}),true);
  assert.equal(lips.start(7,{text:'Hola!',source:'file'}),true);
  for(let i=0;i<90;i++){
    face.beforeFrame();
    lips.audioSignal(7,0.07,i/90);lips.update(1/60);
    face.update(1/60,{presenceActive:true,lipOpening:lips.opening});
  }
  assert.equal(face.getDiagnostics().speaking,true);
  assert.ok(a.values.get('jawOpen')>0.001);
  assert.ok(face.getDiagnostics().last.values.browLift>0);
  assert.ok(Math.max(...['aa','ih','ou','ee','oh'].map(n=>a.values.get(n)))>0.3);
  assert.equal(face.endSpeech(8),false);
  assert.equal(face.endSpeech(7),true);
  face.beforeFrame();face.update(1/60,{presenceActive:false});
  lips.stop(7);
  assert.equal(a.values.get('jawOpen'),0);
  assert.equal(a.values.get('aa'),0);
});
test('LP-03D generic presets never overwhelm visemes during voice or resting',()=>{
  const a=avatar(['surprised','happy','angry','relaxed']);
  const face=new FacialPresence(a.vrm,{seed:16});
  face.setIntensity(1);
  assert.equal(face.beginSpeech(2,{mode:'explaining'}),true);
  advance(face,240,{presenceActive:true});
  for(const x of a.values.values())assert.ok(x<=0.046);
  face.endSpeech(2);
  advance(face,250,{presenceActive:true});
  for(const x of a.values.values())assert.ok(x<=0.076);
});
test('LP-03D external expression overrides are not overwritten on A/B restoration',()=>{
  const a=avatar(['browInnerUp']);
  const face=new FacialPresence(a.vrm,{seed:35});
  advance(face,140,{presenceActive:true});
  assert.ok(a.values.get('browInnerUp')>0);
  a.values.set('browInnerUp',0.44777);
  face.beforeFrame();
  assert.equal(a.values.get('browInnerUp'),0.44777);
  face.setEnabled(false);
  assert.equal(a.values.get('browInnerUp'),0.44777);
});
test('LP-03D eye gaze and blinking remain available with exclusive FBX, body pose unchanged',()=>{
  const a=avatar(['blink']);
  const presence=new LivingPresence(a.vrm,{sourceName:'Vita.vrm',randomSeed:11});
  presence.setEnabled(true);
  assert.equal(presence.previewGaze('left'),true);
  assert.equal(presence.previewBlink(),true);
  const hips=a.hips.quaternion.clone(),head=a.head.quaternion.clone();
  let observedBlink=false;
  for(let i=0;i<100;i++){
    presence.beforeFrame();
    presence.update(1/60,{clipPlaying:true,composition:null});
    if(a.values.get('blink')>0.1)observedBlink=true;
    assert.ok(a.hips.quaternion.equals(hips));
    assert.ok(a.head.quaternion.equals(head));
  }
  assert.equal(observedBlink,true);
  assert.ok(a.gaze.target,'eyes must have a gaze target with body-exclusive FBX');
  presence.setEnabled(false);
  assert.equal(a.gaze.target,null);
  assert.equal(a.values.get('blink'),0);
});
test('LP-03D face mode rejects invalid states and survives clip-independent voice lifecycle',()=>{
  const a=avatar(['browInnerUp','smile','cheekRaise']);
  const face=new FacialPresence(a.vrm);
  assert.equal(face.setMode('evil'),false);
  assert.equal(face.setMode('attentive'),true);
  assert.equal(face.getDiagnostics().mode,'attentive');
  assert.equal(face.beginSpeech(101,{mode:'explaining'}),true);
  advance(face,50,{presenceActive:true});
  assert.equal(face.getDiagnostics().last.mode,'explaining');
  assert.equal(face.endSpeech(102),false);
  assert.equal(face.endSpeech(101),true);
  advance(face,50,{presenceActive:true});
  assert.equal(face.getDiagnostics().last.mode,'attentive');
});
test('LP-03D voice starts the facial layer only upon audio start, even if FBX blocks body',()=>{
  const a=avatar(['browInnerUp','cheekRaise','smile']);
  const face=new FacialPresence(a.vrm);
  const viewer={
    presence:{},getLivingSpeechMotorAvailability:()=>({available:false,reason:'FBX exclusive'}),
    startLivingFaceSpeech:(token,options)=>face.beginSpeech(token,options),
    stopLivingFaceSpeech:(token)=>face.endSpeech(token),
  };
  const bridge=new VoiceMotorBridge(()=>viewer);
  const intent={schema:MOTOR_INTENT_SCHEMA,dialogue:'Buenos días.',
    motorMode:'explaining',gesture:'none',attentionTarget:'interlocutor',intensity:0.5};
  const token=bridge.prepare(intent);
  assert.equal(face.getDiagnostics().speaking,false);
  bridge.start(token);
  assert.equal(bridge.getStatus().motorApplied,false);
  assert.equal(bridge.getStatus().faceApplied,true);
  advance(face,30,{presenceActive:true});
  assert.ok(a.values.get('browInnerUp')>0);
  bridge.pause(token);
  assert.equal(face.getDiagnostics().speaking,false);
  bridge.resume(token);
  assert.equal(face.getDiagnostics().speaking,true);
  bridge.end(token);
  assert.equal(face.getDiagnostics().speaking,false);
});
test('LP-03D viewer owns no exported facial microexpression and exposes direct QA hooks',async()=>{
  const a=avatar(['browInnerUp']);
  const face=new FacialPresence(a.vrm);
  advance(face,50,{presenceActive:true});
  const fake={facial:face,presenceSuspendCount:0,
    presence:{resetOverlay(){}},motionComposer:{beforeFrame(){}},
    lipSync:null,vrm:{update(){}},model:{updateWorldMatrix(){}},
  };
  await MotionViewer.prototype.withPresenceSuspended.call(fake,async()=>{
    assert.equal(a.values.get('browInnerUp'),0);
  });
  face.beforeFrame();face.update(1/60,{presenceActive:true});
  assert.ok(a.values.get('browInnerUp')>0);
});
