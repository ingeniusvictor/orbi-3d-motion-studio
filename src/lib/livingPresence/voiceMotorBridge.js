// LP-03C.1 — audio event → motor intent bridge.
// Only the REAL audio 'playing' / speechSynthesis 'start' event starts a
// speaking gesture. Preparing/generating TTS or receiving Qwen JSON does not.
import {validateMotorIntent} from './ollamaMotorIntent.js';

const playingModes=new Set(['resting','attentive','thinking','explaining']);
export class VoiceMotorBridge{
  constructor(getViewer){
    if(typeof getViewer!=='function')throw new Error('Se requiere un proveedor de visor.');
    this.getViewer=getViewer;
    this.sequence=0;
    this.session=null;
    this.last={status:'idle',reason:'',motorApplied:false};
  }
  prepare(rawIntent,{lipSource='browser'}={}){
    const intent=validateMotorIntent(rawIntent);
    this.cancel('replaced');
    const token=++this.sequence;
    this.session={
      token,intent,started:false,paused:false,motorApplied:false,lipsApplied:false,faceApplied:false,
      lipSource:lipSource==='file'?'file':'browser',
      viewer:null,presenceIdentity:null,restore:null,gestureTriggered:false,
    };
    this.last={status:'prepared',reason:'Esperando audio audible.',motorApplied:false};
    return token;
  }
  start(token){
    const s=this.session;
    if(!s||s.token!==token||s.started)return false;
    s.started=true;s.paused=false;
    const viewer=this.getViewer();
    // Mouth expressions are independent of body bones, so they can accompany
    // speech even when FBX excludes the entire procedural BODY compositor.
    s.viewer=viewer||null;
    s.presenceIdentity=viewer?.presence??null;
    s.lipsApplied=Boolean(viewer?.startLivingLipSync?.(token,{
      text:s.intent.dialogue,source:s.lipSource,
    }));
    s.faceApplied=Boolean(viewer?.startLivingFaceSpeech?.(token,{
      mode:s.intent.motorMode,
    }));
    const eligibility=viewer?.getLivingSpeechMotorAvailability?.()||
      {available:false,reason:'Visor no disponible.'};
    if(!eligibility.available){
      this.last={status:'speaking',reason:eligibility.reason||'Motor no disponible.',
        motorApplied:false,lipsApplied:s.lipsApplied,faceApplied:s.faceApplied};
      return true; // Voice must still be allowed without animation.
    }
    s.restore={
      motor:viewer.getLivingMotorStatus?.()||null,
      gesture:viewer.getLivingGestureStatus?.()||null,
    };
    viewer.setLivingMotorCoordination(true);
    viewer.setLivingGestureEnabled(true);
    const mode=playingModes.has(s.intent.motorMode)?s.intent.motorMode:'explaining';
    // A "thinking" answer still SPEAKS. The state is a stylistic cue only.
    viewer.setLivingMotorMode(mode);
    // Keep the lab's user-selected gesture weight; bound the LLM's proposed
    // intensity to a conservative cap, and restore original settings at end.
    viewer.setLivingGestureIntensity(Math.min(s.intent.intensity,0.65));
    s.motorApplied=true;
    if(s.intent.gesture!=='none')
      s.gestureTriggered=Boolean(viewer.triggerLivingGesture(s.intent.gesture));
    this.last={
      status:'speaking',reason:s.gestureTriggered?
        'Voz iniciada: gesto sincronizado con el comienzo del audio.':
        'Voz iniciada: respuesta corporal atenta.',
      motorApplied:true,lipsApplied:s.lipsApplied,faceApplied:s.faceApplied,
    };
    return true;
  }
  pause(token){
    const s=this.session;
    if(!s||s.token!==token||!s.started||s.paused)return false;
    s.paused=true;
    if(s.lipsApplied)s.viewer?.pauseLivingLipSync?.(token);
    if(s.faceApplied)s.viewer?.stopLivingFaceSpeech?.(token);
    if(s.motorApplied){
      s.viewer.setLivingGestureEnabled(false); // cancel ongoing action on pause
      s.viewer.setLivingMotorMode('attentive');
    }
    this.last={status:'paused',reason:'Audio pausado; gesto detenido.',
      motorApplied:s.motorApplied,lipsApplied:s.lipsApplied,faceApplied:s.faceApplied};
    return true;
  }
  resume(token){
    const s=this.session;
    if(!s||s.token!==token||!s.started||!s.paused)return false;
    s.paused=false;
    if(s.lipsApplied)s.viewer?.resumeLivingLipSync?.(token);
    if(s.faceApplied)s.viewer?.startLivingFaceSpeech?.(token,{mode:s.intent.motorMode});
    if(s.motorApplied){
      s.viewer.setLivingGestureEnabled(true);
      s.viewer.setLivingMotorMode(s.intent.motorMode);
      // Do NOT retrigger a gesture after audio resume.
    }
    this.last={status:'speaking',reason:'Audio reanudado.',
      motorApplied:s.motorApplied,lipsApplied:s.lipsApplied,faceApplied:s.faceApplied};
    return true;
  }
  end(token,reason='ended'){
    const s=this.session;
    if(!s||s.token!==token)return false;
    this.session=null;
    if(s.lipsApplied&&s.viewer&&s.viewer.presence===s.presenceIdentity)
      s.viewer.stopLivingLipSync?.(token);
    if(s.faceApplied&&s.viewer&&s.viewer.presence===s.presenceIdentity)
      s.viewer.stopLivingFaceSpeech?.(token);
    if(s.motorApplied&&s.viewer&&s.viewer.presence===s.presenceIdentity){
      // End always returns the motor controls to precisely their user-owned
      // enabling/mode/intensity. Gesture reset prevents stale actions.
      s.viewer.setLivingGestureEnabled(false);
      if(s.restore?.gesture){
        s.viewer.setLivingGestureIntensity(s.restore.gesture.intensity);
        s.viewer.setLivingGestureEnabled(s.restore.gesture.enabled);
      }
      if(s.restore?.motor){
        s.viewer.setLivingMotorMode(s.restore.motor.mode);
        s.viewer.setLivingMotorCoordination(s.restore.motor.enabled);
      }
    }
    this.last={status:reason,reason:'Audio finalizado. Controles de reposo restaurados.',
      motorApplied:false,lipsApplied:false,faceApplied:false};
    return true;
  }
  cancel(reason='cancelled'){
    if(!this.session)return false;
    return this.end(this.session.token,reason);
  }
  getStatus(){return {...this.last,token:this.session?.token??null};}
}

// Reuse the SAME intent/motor bridge with real Kokoro audio in future R8.
// 'playing' means playback is under way, unlike 'loadedmetadata' or 'play'.
export function bindMediaElementMotor(audio,bridge,token){
  if(!audio?.addEventListener||!audio?.removeEventListener)
    throw new Error('Se requiere un reproductor HTMLAudioElement.');
  const pairs=[
    ['playing',()=>bridge.resume(token)||bridge.start(token)],
    ['pause',()=>{if(!audio.ended)bridge.pause(token);}],
    ['ended',()=>bridge.end(token,'ended')],
    ['error',()=>bridge.end(token,'error')],
    ['abort',()=>bridge.end(token,'cancelled')],
  ];
  for(const [name,handler] of pairs)audio.addEventListener(name,handler);
  return ()=>{for(const [name,handler] of pairs)audio.removeEventListener(name,handler);};
}
