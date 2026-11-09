// LP-03D.1 — Face Presence: coordinated VRM facial expressions, not fake
// facial bone motion. Every morph is discovered through expressionManager;
// generic emotional presets are deliberately identified as PROXIES, not as
// independent eyebrows, cheeks or jaw controls.
// Does not own A/I/U/E/O visemes, blink/blinkLeft/blinkRight or VRMLookAt.
import {smoothNoise,springStep} from './motionPrimitives.js';

const bound=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(Number(v))?Number(v):0));
const CHANNELS=Object.freeze({
  browLift:['browInnerUp','browUp','surprised'],
  browFrown:['browDown','angry'],
  smile:['mouthSmile','smile','happy','joy'],
  cheeks:['cheekRaise','cheekPuff'],
  leftSquint:['squintLeft','eyeSquintLeft'],
  rightSquint:['squintRight','eyeSquintRight'],
  leftWide:['eyeWideLeft'],
  rightWide:['eyeWideRight'],
  jaw:['jawOpen'],
  relax:['relaxed','fun'],
});
const PREVIEW_CHANNELS=Object.freeze({
  brows:'browLift',smile:'smile',cheeks:'cheeks',
  eyelids:'leftSquint',jaw:'jaw',
});
const MODES=Object.freeze(['resting','attentive','thinking','explaining']);
const GENERIC=new Set(['surprised','angry','happy','joy','relaxed','fun']);
const get=(manager,name)=>{
  try{
    const val=manager?.getValue?.(name);
    return typeof val==='number'&&Number.isFinite(val)?val:null;
  }catch{return null;}
};
export function auditFacialRig(vrm){
  const manager=vrm?.expressionManager;
  if(typeof manager?.getValue!=='function'||typeof manager?.setValue!=='function')
    return {supported:false,channels:{},independent:[],proxies:[],missing:Object.keys(CHANNELS),
      blink:false,gaze:Boolean(vrm?.lookAt),reason:'No hay administrador de expresiones VRM.'};
  const channels={};
  for(const [key,names] of Object.entries(CHANNELS)){
    const name=names.find(n=>get(manager,n)!==null);
    if(name)channels[key]=name;
  }
  const independent=Object.entries(channels).filter(([,name])=>!GENERIC.has(name))
    .map(([key])=>key);
  const proxies=Object.entries(channels).filter(([,name])=>GENERIC.has(name))
    .map(([key])=>key);
  const missing=Object.keys(CHANNELS).filter(key=>!channels[key]);
  const blink=get(manager,'blink')!==null ||
    (get(manager,'blinkLeft')!==null&&get(manager,'blinkRight')!==null);
  return {supported:Object.keys(channels).length>0||blink||Boolean(vrm?.lookAt),
    channels,independent,proxies,missing,blink,gaze:Boolean(vrm?.lookAt),
    reason:'Los presets emocionales genéricos pueden mover varias zonas del rostro a la vez. Solo los morphs faciales independientes permiten control localizado.'};
}
export class FacialPresence {
  constructor(vrm,{seed=367}={}){
    this.vrm=vrm;
    this.capabilities=auditFacialRig(vrm);
    this.enabled=true; // gated by general Presence A/B unless testing a preview
    this.intensity=0.46;
    this.mode='resting';
    this.clock=0;
    this.seed=seed>>>0;
    this.speech=null;
    this.preview=null;
    this.states=new Map();
    this.applied=new Map();
    this.last={active:false,mode:'resting',speaking:false,values:{}};
  }
  setEnabled(value){this.enabled=Boolean(value);if(!this.enabled){this.release();this.states.clear();this.preview=null;}}
  setIntensity(value){if(Number.isFinite(Number(value)))this.intensity=bound(value);}
  setMode(mode){if(!MODES.includes(mode))return false;this.mode=mode;return true;}
  beginSpeech(token,{mode='explaining'}={}){
    if(!this.enabled)return false;
    this.speech={token,mode:MODES.includes(mode)?mode:'explaining'};
    return true;
  }
  endSpeech(token){
    if(!this.speech||this.speech.token!==token)return false;
    this.speech=null;return true;
  }
  previewFeature(feature,duration=1.5){
    if(this.speech||!Object.hasOwn(PREVIEW_CHANNELS,feature))return false;
    let channel=PREVIEW_CHANNELS[feature];
    if(feature==='eyelids'&&!this.capabilities.channels.leftSquint&&
       !this.capabilities.channels.rightSquint)return false;
    if(!this.capabilities.channels[channel]&&feature!=='eyelids')return false;
    this.preview={feature,until:this.clock+bound(duration,0.2,3)};
    return true;
  }
  getDiagnostics(){
    return {...this.capabilities,enabled:this.enabled,intensity:this.intensity,
      mode:this.mode,speaking:Boolean(this.speech),preview:this.preview?.feature||null,
      last:{...this.last,values:{...this.last.values}}};
  }
  release(){
    const mgr=this.vrm?.expressionManager;
    for(const [name,change] of this.applied){
      const current=get(mgr,name);
      if(current!==null&&Math.abs(current-change.applied)<0.0001)
        mgr.setValue(name,change.base);
    }
    this.applied.clear();
  }
  beforeFrame(){this.release();}
  update(delta,{presenceActive=false,lipOpening=0}={}){
    const dt=bound(delta,0,0.1);
    this.clock+=dt;
    if(this.preview&&this.clock>=this.preview.until)this.preview=null;
    const inPreview=Boolean(this.preview);
    if(!this.enabled||(!presenceActive&&!inPreview)){
      this.last={active:false,mode:this.mode,speaking:false,values:{}};
      return;
    }
    const mode=this.speech?.mode||this.mode;
    const speaking=Boolean(this.speech);
    const breath=smoothNoise(this.clock*0.095,this.seed+31);
    const curiosity=smoothNoise(this.clock*0.13,this.seed+49);
    const left=smoothNoise(this.clock*0.18,this.seed+63);
    const right=smoothNoise(this.clock*0.16,this.seed+79);
    const scale=this.intensity;
    // Restrained facial intention tied to listening/speaking rather than
    // independent random noise everywhere. Natural pauses are retained.
    const goals={
      browLift:(mode==='attentive'?0.12:mode==='thinking'?0.09:
        mode==='explaining'?0.07:0.045)*scale*(0.75+0.25*curiosity),
      browFrown:(mode==='thinking'?0.052:0)*scale,
      smile:(speaking?0.12:mode==='resting'?0.055:0.048)*scale*
        (0.72+0.22*breath),
      cheeks:(speaking?0.08:0.05)*scale*(0.7+0.25*breath),
      leftSquint:0.035*scale*(0.55+0.45*left),
      rightSquint:0.035*scale*(0.55+0.45*right),
      leftWide:mode==='attentive'?0.06*scale:0,
      rightWide:mode==='attentive'?0.06*scale:0,
      jaw:speaking?bound(lipOpening)*0.17*scale:0,
      relax:mode==='resting'?0.065*scale:0,
    };
    if(this.preview){
      // QA deliberately exaggerated to visually confirm each actual morph.
      for(const channel of Object.keys(goals))goals[channel]=0;
      const feature=this.preview.feature;
      if(feature==='eyelids'){goals.leftSquint=0.58;goals.rightSquint=0.58;}
      else goals[PREVIEW_CHANNELS[feature]]=0.65;
    }
    const mgr=this.vrm?.expressionManager,values={},appliedNames=new Set();
    for(const [channel,name] of Object.entries(this.capabilities.channels)){
      const raw=goals[channel]??0;
      // A generic emotion preset may change the entire mouth/eyelids. Keep
      // it much smaller while speaking so it does not fight lip-sync.
      const cap=GENERIC.has(name)?(this.preview?0.45:speaking?0.045:0.075):0.75;
      const goal=bound(raw,0,cap);
      const next=springStep(this.states.get(channel)||{x:0,v:0},goal,dt,1.15);
      this.states.set(channel,next);
      const current=get(mgr,name);
      if(current===null)continue;
      if(!this.applied.has(name))
        this.applied.set(name,{base:current,applied:current});
      const entry=this.applied.get(name);
      // Two channels mapping to same preset: take maximum, don't sum.
      const applied=Math.max(entry.applied,entry.base,bound(next.x));
      if(appliedNames.has(name)&&applied<=entry.applied)continue;
      mgr.setValue(name,applied);
      entry.applied=applied;
      appliedNames.add(name);
      values[channel]=applied;
    }
    this.last={active:true,mode,speaking,values};
  }
  dispose(){this.release();this.states.clear();this.vrm=null;this.speech=null;}
}
