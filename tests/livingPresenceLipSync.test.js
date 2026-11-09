import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LipSyncController,detectVrmMouth,mouthAudioOpening,normalizedSpeechVowels,
} from '../src/lib/livingPresence/lipSync.js';
import {MediaElementRmsMeter} from '../src/lib/livingPresence/audioRmsMeter.js';
import {VoiceMotorBridge} from '../src/lib/livingPresence/voiceMotorBridge.js';
import {MotionViewer} from '../src/lib/viewer.js';
import {MOTOR_INTENT_SCHEMA} from '../src/lib/livingPresence/ollamaMotorIntent.js';

function avatar(names=['aa','ih','ou','ee','oh']){
  const values=new Map(names.map(n=>[n,0]));
  const manager={
    getValue:name=>values.has(name)?values.get(name):null,
    setValue:(name,value)=>{if(!values.has(name))throw Error('Unknown '+name);values.set(name,value);},
  };
  return {vrm:{expressionManager:manager},values};
}
const utterance={
  schema:MOTOR_INTENT_SCHEMA,
  dialogue:'Hola, ¿cómo estás? Ahora puedo hablar y mover mis labios.',
  motorMode:'explaining',gesture:'emphasize',attentionTarget:'interlocutor',intensity:0.5,
};
test('LP-03C.2 detects VRM1 visemes, VRM0 fallback, partial and absent presets',()=>{
  assert.equal(detectVrmMouth(avatar().vrm).supported,true);
  assert.deepEqual(detectVrmMouth(avatar().vrm).names,['aa','ih','ou','ee','oh']);
  assert.equal(detectVrmMouth(avatar(['a','i','u','e','o']).vrm).mapping.a,'a');
  assert.equal(detectVrmMouth(avatar(['aa']).vrm).names.length,1);
  assert.equal(detectVrmMouth(avatar(['blink']).vrm).supported,false);
  assert.equal(detectVrmMouth({}).supported,false);
});
test('LP-03C.2 normalized Spanish vowels and real audio loudness thresholds',()=>{
  assert.deepEqual(normalizedSpeechVowels('Álvaro, ¿cómo está?'),['a','a','o','o','o','e','a']);
  assert.equal(mouthAudioOpening(0),0);
  assert.equal(mouthAudioOpening(0.002),0);
  assert.ok(mouthAudioOpening(0.09)>0.75);
  assert.ok(mouthAudioOpening(10)<=0.9);
});
test('LP-03C.2 mouth is fully closed before audible playback and after stopping',()=>{
  const {vrm,values}=avatar();
  const lips=new LipSyncController(vrm);
  assert.ok([...values.values()].every(x=>x===0));
  assert.equal(lips.start(33,{text:'Hola, ¿cómo estás?',source:'browser'}),true);
  assert.ok([...values.values()].every(x=>x===0),'prepare/start do not immediately mutate expression');
  for(let i=0;i<45;i++)lips.update(1/60);
  assert.ok(Math.max(...values.values())>0.1,'mouth animated after sound onset');
  assert.ok(lips.getDiagnostics().peak>0.15);
  assert.equal(lips.stop(33),true);
  assert.ok([...values.values()].every(x=>x===0),'mouth returns to neutral after sound');
  assert.equal(lips.getDiagnostics().active,false);
});
test('LP-03C.2 browser boundary changes vowel selection, with temporal fallback',()=>{
  const lips=new LipSyncController(avatar().vrm);
  lips.start(1,{text:'aaaa aaaa oooo oooo',source:'browser'});
  lips.update(1/60);
  assert.equal(lips.getDiagnostics().currentVowel,'a');
  assert.equal(lips.boundary(1,16),true);
  lips.update(1/60);
  assert.equal(lips.getDiagnostics().currentVowel,'o');
  assert.equal(lips.boundary(999,1),false);
  lips.stop(1);
});
test('LP-03C.2 WAV energy drives mouth and silence closes it with smooth release',()=>{
  const {vrm,values}=avatar(),lips=new LipSyncController(vrm);
  lips.start(4,{text:'Hola amiga',source:'file'});
  for(let i=0;i<40;i++){
    lips.audioSignal(4,0.09,i/40);
    lips.update(1/60);
  }
  assert.ok(Math.max(...values.values())>0.5);
  assert.equal(lips.getDiagnostics().audioSignalReceived,true);
  for(let i=0;i<50;i++){
    lips.audioSignal(4,0,i/50);
    lips.update(1/60);
  }
  assert.ok(Math.max(...values.values())<0.02,'mouth closes on recorded silence');
  lips.pause(4);
  assert.ok([...values.values()].every(x=>x===0));
  lips.resume(4);lips.stop(4);
});
test('LP-03C.2 lip preview without audio tests rigging, stops and restores baseline',()=>{
  const {vrm,values}=avatar(['aa','ih','ou','ee','oh']);
  values.set('aa',0.07);
  const lips=new LipSyncController(vrm);
  assert.equal(lips.preview('a',0.25),true);
  for(let i=0;i<10;i++)lips.update(1/60);
  assert.ok(values.get('aa')>0.3);
  assert.equal(lips.preview('INVALID'),false);
  for(let i=0;i<30;i++)lips.update(1/60);
  assert.equal(values.get('aa'),0.07);
});
test('LP-03C.2 respect external expression ownership and old session tokens',()=>{
  const {vrm,values}=avatar(),lips=new LipSyncController(vrm);
  lips.start(11,{text:'hola',source:'file'});
  lips.audioSignal(11,0.12);
  for(let i=0;i<30;i++)lips.update(1/60);
  const activeName=lips.capability.mapping[lips.getDiagnostics().currentVowel];
  const old=values.get(activeName);
  assert.ok(old>0.05,'the current vowel, not necessarily AA, must be open');
  values.set(activeName,0.123456); // external face controller takes ownership
  assert.equal(lips.stop(12),false);
  lips.stop(11);
  assert.equal(values.get(activeName),0.123456,
    'do not overwrite an expression changed by another controller');
  assert.equal(lips.audioSignal(11,0.4),false);
});
test('LP-03C.2 blocked body FBX can still talk facially after audio starts',()=>{
  const {vrm,values}=avatar(),lips=new LipSyncController(vrm);
  const state={bodyGestures:0};
  const view={
    presence:{},
    getLivingSpeechMotorAvailability:()=>({available:false,reason:'FBX exclusive'}),
    startLivingLipSync:(token,opts)=>lips.start(token,opts),
    stopLivingLipSync:token=>lips.stop(token),
    pauseLivingLipSync:token=>lips.pause(token),
    resumeLivingLipSync:token=>lips.resume(token),
    triggerLivingGesture:()=>{state.bodyGestures++;return true;},
  };
  const bridge=new VoiceMotorBridge(()=>view);
  const token=bridge.prepare(utterance,{lipSource:'browser'});
  assert.equal(lips.getDiagnostics().active,false);
  bridge.start(token);
  assert.equal(bridge.getStatus().motorApplied,false);
  assert.equal(bridge.getStatus().lipsApplied,true);
  for(let i=0;i<30;i++)lips.update(1/60);
  assert.ok(Math.max(...values.values())>0.05);
  assert.equal(state.bodyGestures,0);
  bridge.end(token);
  assert.ok([...values.values()].every(x=>x===0));
});
test('LP-03C.2 export suspends and restores mouth expression with no baked viseme',async()=>{
  const {vrm,values}=avatar();
  const lips=new LipSyncController(vrm);
  lips.start(5,{text:'hola',source:'browser'});
  for(let i=0;i<35;i++)lips.update(1/60);
  assert.ok(Math.max(...values.values())>0.05);
  const fake={
    lipSync:lips,presenceSuspendCount:0,
    presence:{resetOverlay(){}},
    motionComposer:{beforeFrame(){}},
    vrm:{update(){}},
    model:{updateWorldMatrix(){}},
  };
  await MotionViewer.prototype.withPresenceSuspended.call(fake,async()=>{
    assert.ok([...values.values()].every(x=>x===0),
      'no viseme during GLB/FBX copy');
  });
  lips.update(1/60);
  assert.ok(Math.max(...values.values())>0.05,'mouth resumes after export');
  lips.stop(5);
});
test('LP-03C.2 local audio RMS analyser uses PCM amplitude without network calls',async()=>{
  const events=[];
  class Context{
    constructor(){this.destination={};this.state='running';}
    createMediaElementSource(audio){
      events.push(['source',audio.id]);
      return {connect:()=>events.push('connect'),disconnect:()=>events.push('disconnect')};
    }
    createAnalyser(){
      return {fftSize:8,connect:()=>events.push('speaker'),
        disconnect:()=>events.push('disconnect-analyser'),
        getFloatTimeDomainData(buffer){buffer.fill(0.1);}};
    }
    async close(){events.push('close');}
  }
  const meter=new MediaElementRmsMeter({id:'local-audio'},{AudioContextCtor:Context});
  await meter.connect();
  assert.ok(Math.abs(meter.sample()-0.1)<1e-5);
  await meter.connect();
  assert.equal(events.filter(e=>Array.isArray(e)).length,1,'one node per audio element');
  assert.ok(events.includes('speaker'),'audio continues through speakers');
  await meter.dispose();
  assert.ok(events.includes('close'));
});
