import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateMotorIntent,parseMotorIntentReply,askLocalMotorIntent,MOTOR_INTENT_SCHEMA,
} from '../src/lib/livingPresence/ollamaMotorIntent.js';
import {VoiceMotorBridge,bindMediaElementMotor} from '../src/lib/livingPresence/voiceMotorBridge.js';
import {MotionViewer} from '../src/lib/viewer.js';
const sample=(overrides={})=>({
  schema:MOTOR_INTENT_SCHEMA,
  dialogue:'Comprendo la pregunta y te responderé con calma.',
  motorMode:'explaining',
  gesture:'emphasize',
  attentionTarget:'interlocutor',
  intensity:0.53,
  ...overrides,
});
const createViewer=()=>{
  const log=[];
  const presence={};
  const current={motor:{enabled:false,mode:'resting',intensity:0.42},
    gesture:{enabled:false,intensity:0.58},available:true};
  const v={
    presence,
    getLivingSpeechMotorAvailability:()=>current.available?
      {available:true}:{available:false,reason:'FBX no autorizado.'},
    getLivingMotorStatus:()=>({...current.motor}),
    getLivingGestureStatus:()=>({...current.gesture}),
    setLivingMotorCoordination(value){log.push(['motorEnabled',value]);current.motor.enabled=value;},
    setLivingMotorMode(mode){log.push(['motorMode',mode]);current.motor.mode=mode;},
    setLivingGestureEnabled(value){log.push(['gestureEnabled',value]);current.gesture.enabled=value;},
    setLivingGestureIntensity(value){log.push(['gestureIntensity',value]);current.gesture.intensity=value;},
    triggerLivingGesture(name){log.push(['gesture',name]);return true;},
  };
  return {v,current,log};
};
test('LP-03C strict contract strips all extra properties and clamps motor intensity',()=>{
  const raw=sample({intensity:2,execute:'rm -rf /'});
  const data=validateMotorIntent(raw);
  assert.deepEqual(Object.keys(data),[
    'schema','dialogue','motorMode','gesture','attentionTarget','intensity']);
  assert.equal(data.intensity,0.75);
  assert.equal(data.execute,undefined);
  assert.ok(Object.isFrozen(data));
});
test('LP-03C rejects unknown model commands and never executes bone/tool code',()=>{
  for(const patch of [
    {schema:'orbi.lumia.motor-intent.v999'}, {gesture:'bend_left_pinky_180'},
    {motorMode:'run_shell'}, {attentionTarget:'https://attacker.example'},
    {intensity:'0.5'}, {dialogue:''}, {dialogue:'m'.repeat(451)},
  ])assert.throws(()=>validateMotorIntent(sample(patch)));
  assert.throws(()=>parseMotorIntentReply('Ejecuta este JSON: '+JSON.stringify(sample())));
  assert.throws(()=>parseMotorIntentReply('{"gesture": "wave"}'));
});
test('LP-03C Ollama request is local, non-streaming, text only and JSON validated',async()=>{
  let actualUrl='',opts={};
  const out=await askLocalMotorIntent({
    question:'¿Qué opinas del movimiento natural?',
    model:'qwen3.5:0.8b',
    request:async(url,options)=>{
      actualUrl=url;opts=options;
      return {ok:true,json:async()=>({message:{content:JSON.stringify(sample())}})};
    },
  });
  assert.equal(actualUrl,'http://127.0.0.1:11434/api/chat');
  assert.equal(out.gesture,'emphasize');
  assert.equal(opts.method,'POST');
  assert.equal(opts.mode,'cors');
  assert.equal(opts.targetAddressSpace,'loopback');
  const body=JSON.parse(opts.body);
  assert.equal(body.model,'qwen3.5:0.8b');
  assert.equal(body.stream,false);
  assert.equal(body.format,'json');
  assert.equal(body.messages[1].content,'¿Qué opinas del movimiento natural?');
  assert.ok(!body.messages[1].images);
  await assert.rejects(()=>askLocalMotorIntent({question:'hola',
    model:'qwen3.5:2b',base:'https://api.example.org'}),/Ollama local/);
  await assert.rejects(()=>askLocalMotorIntent({question:'hola',
    model:'qwen3.5:2b;malicioso'}),/Qwen 3.5/);
});
test('LP-03C motor waits for a real voice start, then restores original controls at end',()=>{
  const {v,current,log}=createViewer(),bridge=new VoiceMotorBridge(()=>v);
  const token=bridge.prepare(sample());
  assert.deepEqual(log,[],'text generation cannot animate bones');
  assert.equal(bridge.getStatus().status,'prepared');
  assert.equal(bridge.start(token),true);
  assert.equal(current.motor.enabled,true);
  assert.equal(current.motor.mode,'explaining');
  assert.equal(current.gesture.enabled,true);
  assert.equal(current.gesture.intensity,0.53);
  assert.deepEqual(log.find(x=>x[0]==='gesture'),['gesture','emphasize']);
  assert.equal(bridge.start(token),false,'duplicate onstart should do nothing');
  assert.equal(bridge.end(token),true);
  assert.equal(current.motor.enabled,false);
  assert.equal(current.motor.mode,'resting');
  assert.equal(current.gesture.enabled,false);
  assert.equal(current.gesture.intensity,0.58);
  assert.equal(bridge.end(token),false);
});
test('LP-03C voice pause cancels active gesture; resume never triggers another',()=>{
  const {v,current,log}=createViewer(),bridge=new VoiceMotorBridge(()=>v);
  const token=bridge.prepare(sample({motorMode:'attentive',gesture:'curious'}));
  bridge.start(token);
  assert.equal(log.filter(x=>x[0]==='gesture').length,1);
  assert.equal(bridge.pause(token),true);
  assert.equal(current.motor.mode,'attentive');
  assert.equal(current.gesture.enabled,false);
  assert.equal(bridge.resume(token),true);
  assert.equal(current.gesture.enabled,true);
  assert.equal(log.filter(x=>x[0]==='gesture').length,1);
  bridge.end(token);
  assert.equal(current.motor.enabled,false);
});
test('LP-03C old audio callbacks are rejected when a new session replaces old',()=>{
  const {v,current,log}=createViewer(),bridge=new VoiceMotorBridge(()=>v);
  const first=bridge.prepare(sample());
  bridge.start(first);
  const second=bridge.prepare(sample({gesture:'acknowledge'}));
  assert.equal(current.motor.enabled,false,'old session is cleaned first');
  assert.equal(bridge.start(first),false);
  assert.equal(bridge.end(first),false);
  assert.equal(log.filter(x=>x[0]==='gesture').length,1);
  bridge.start(second);
  assert.equal(log.filter(x=>x[0]==='gesture').length,2);
  bridge.cancel();
  assert.equal(current.motor.enabled,false);
});
test('LP-03C voice can still sound when FBX is not authorized, without moving VRM',()=>{
  const {v,current,log}=createViewer(),bridge=new VoiceMotorBridge(()=>v);
  current.available=false;
  const token=bridge.prepare(sample());
  assert.equal(bridge.start(token),true);
  assert.equal(bridge.getStatus().motorApplied,false);
  assert.equal(bridge.getStatus().status,'speaking');
  assert.deepEqual(log,[]);
  bridge.end(token);
  assert.equal(current.motor.enabled,false);
});
test('LP-03C never restores an old speaking session into a newly loaded model',()=>{
  const {v,current}=createViewer(),bridge=new VoiceMotorBridge(()=>v);
  const token=bridge.prepare(sample());bridge.start(token);
  v.presence={}; // same viewer instance, new VRM scene
  current.motor.mode='thinking';
  bridge.end(token);
  assert.equal(current.motor.mode,'thinking','must not clobber new model');
});
test('LP-03C HTMLAudioElement adapter fires from real playing not loading or play',()=>{
  const listeners=new Map(),events=[];
  const audio={
    ended:false,
    addEventListener(name,handler){listeners.set(name,handler);},
    removeEventListener(name,handler){if(listeners.get(name)===handler)listeners.delete(name);},
  };
  const {v,current}=createViewer();
  const bridge=new VoiceMotorBridge(()=>v);
  const token=bridge.prepare(sample());
  const detach=bindMediaElementMotor(audio,bridge,token);
  assert.equal(bridge.getStatus().status,'prepared');
  listeners.get('playing')();
  assert.equal(bridge.getStatus().status,'speaking');
  assert.equal(current.motor.enabled,true);
  listeners.get('pause')();
  assert.equal(bridge.getStatus().status,'paused');
  listeners.get('playing')();
  assert.equal(bridge.getStatus().status,'speaking');
  listeners.get('ended')();
  assert.equal(bridge.getStatus().status,'ended');
  assert.equal(current.motor.enabled,false);
  detach();
  assert.equal(listeners.size,0);
});
test('LP-03C viewer enforces VRM presence and Mixamo idle ownership',()=>{
  const method=MotionViewer.prototype.getLivingSpeechMotorAvailability;
  const eligible={vrm:{},presence:{enabled:true},mixer:null,current:null,motionComposer:null};
  assert.equal(method.call(eligible).available,true);
  eligible.mixer={};eligible.current=0;
  assert.equal(method.call(eligible).available,false);
  eligible.motionComposer={active:true};
  assert.equal(method.call(eligible).available,true);
  eligible.presence.enabled=false;
  assert.equal(method.call(eligible).available,false);
});
