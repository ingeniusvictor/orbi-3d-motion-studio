// LP-03C.2 — lightweight speech-to-mouth layer on standard VRM presets.
// This is VISUAL speech approximation, not phoneme-aligned Kokoro lip-sync.
// Audio-file mode uses real loudness; browser TTS offers word boundaries and
// a timing estimate only (SpeechSynthesis does not expose an audio PCM stream).
const VOWELS=Object.freeze(['a','i','u','e','o']);
const GROUPS=Object.freeze([
  Object.freeze({a:'aa',i:'ih',u:'ou',e:'ee',o:'oh'}), // VRM 1.0 normalized presets
  Object.freeze({a:'a',i:'i',u:'u',e:'e',o:'o'}), // legacy/custom aliases
]);
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const getValue=(manager,name)=>{
  try {
    const value=manager?.getValue?.(name);
    return typeof value==='number'&&Number.isFinite(value)?value:null;
  } catch {return null;}
};
const safeSet=(manager,name,value)=>{
  try {manager.setValue(name,value);return true;}catch{return false;}
};
export function detectVrmMouth(vrm){
  const manager=vrm?.expressionManager;
  if(!manager||typeof manager.getValue!=='function'||typeof manager.setValue!=='function')
    return {supported:false,mapping:{},names:[],reason:'Este VRM no tiene administrador de expresiones faciales.'};
  let best={score:0,mapping:{}};
  for(const group of GROUPS){
    const mapping={};
    for(const vowel of VOWELS)if(getValue(manager,group[vowel])!==null)
      mapping[vowel]=group[vowel];
    const score=Object.keys(mapping).length;
    if(score>best.score)best={score,mapping};
  }
  return {supported:best.score>0,mapping:best.mapping,
    names:[...new Set(Object.values(best.mapping))],
    reason:best.score===0?
      'No hay visemas VRM compatibles (aa/ih/ou/ee/oh o a/i/u/e/o). Se necesita un avatar con expresiones de boca.':
      best.score<5?'Visemas parciales: algunas vocales utilizarán las expresiones disponibles.':
      'Cinco expresiones vocales VRM detectadas.'};
}
export function normalizedSpeechVowels(text){
  const stripped=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return [...stripped].filter(ch=>VOWELS.includes(ch)).slice(0,600);
}
export function mouthAudioOpening(rms){
  const n=Number(rms);
  if(!Number.isFinite(n))return 0;
  return clamp((Math.max(0,n)-0.008)*10.5,0,0.90);
}
const smooth=(current,target,dt,time)=>current+(target-current)*
  (1-Math.exp(-Math.max(0,dt)/time));
export class LipSyncController{
  constructor(vrm){
    this.vrm=vrm;
    this.capability=detectVrmMouth(vrm);
    this.strength=0.72;
    this.session=null;
    this.elapsed=0;
    this.opening=0;
    this.selected='a';
    this.baseline=new Map();
    this.applied=new Map();
    this.audioLevel=0;
    this.audioProgress=null;
    this.audioSignalReceived=false;
    this.previewRemaining=0;
    this.previewVowel='a';
    this.stats={peak:0,frames:0,signalFrames:0};
  }
  getDiagnostics(){
    return {...this.capability,active:Boolean(this.session),
      paused:Boolean(this.session?.paused),source:this.session?.source||null,
      currentVowel:this.selected,opening:this.opening,
      audioSignalReceived:this.audioSignalReceived,
      preview:this.previewRemaining>0,
      peak:this.stats.peak,frames:this.stats.frames,signalFrames:this.stats.signalFrames};
  }
  setStrength(value){
    if(Number.isFinite(Number(value)))this.strength=clamp(Number(value),0,1);
  }
  captureBaseline(){
    const manager=this.vrm?.expressionManager;
    this.baseline.clear();this.applied.clear();
    for(const name of this.capability.names){
      const v=getValue(manager,name);
      if(v!==null)this.baseline.set(name,v);
    }
  }
  release(){
    const manager=this.vrm?.expressionManager;
    for(const [name,base] of this.baseline.entries()){
      const previous=this.applied.get(name);
      const current=getValue(manager,name);
      // Never overwrite an expression another controller changed after us.
      if(previous!==undefined&&current!==null&&Math.abs(current-previous)<0.0001)
        safeSet(manager,name,base);
    }
    this.baseline.clear();this.applied.clear();
  }
  start(token,{text='',source='browser'}={}){
    if(!this.capability.supported)return false;
    this.stop();
    this.captureBaseline();
    this.session={token,source:source==='file'?'file':'browser',
      text:String(text||'').slice(0,500),paused:false,boundary:0,
      vowels:normalizedSpeechVowels(text)};
    this.elapsed=0;this.opening=0;this.selected='a';
    this.audioLevel=0;this.audioProgress=null;
    this.audioSignalReceived=false;
    this.stats={peak:0,frames:0,signalFrames:0};
    return true;
  }
  pause(token){
    if(!this.session||this.session.token!==token)return false;
    this.session.paused=true;
    this.opening=0;
    this.apply(0,'a'); // mouth closes at pause, body can still listen
    return true;
  }
  resume(token){
    if(!this.session||this.session.token!==token)return false;
    this.session.paused=false;
    return true;
  }
  boundary(token,index){
    if(!this.session||this.session.token!==token)return false;
    if(Number.isFinite(index))
      this.session.boundary=clamp(Math.floor(index),0,this.session.text.length);
    return true;
  }
  audioSignal(token,rms,progress=null){
    const s=this.session;
    if(!s||s.token!==token||s.source!=='file')return false;
    if(Number.isFinite(Number(rms))){
      this.audioLevel=clamp(Number(rms),0,1);
      this.audioSignalReceived=true;
    }
    if(progress!==null&&Number.isFinite(Number(progress)))
      this.audioProgress=clamp(Number(progress),0,1);
    return true;
  }
  preview(vowel='a',seconds=1.2){
    if(!this.capability.supported||this.session||!VOWELS.includes(vowel))return false;
    this.release();
    this.captureBaseline();
    this.previewVowel=vowel;
    this.previewRemaining=clamp(Number(seconds)||1.2,0.1,3);
    this.opening=0;
    return true;
  }
  apply(opening,vowel){
    const manager=this.vrm?.expressionManager;
    if(!manager)return;
    const activeName=this.capability.mapping[vowel]||
      this.capability.mapping.a||this.capability.names[0];
    const output=clamp(opening*this.strength,0,0.94);
    for(const [name,base] of this.baseline.entries()){
      const previous=this.applied.get(name);
      const current=getValue(manager,name);
      if(current===null)continue;
      if(previous!==undefined&&Math.abs(current-previous)>0.0001){
        // Another facial controller owns this expression now.
        this.baseline.delete(name);this.applied.delete(name);continue;
      }
      const goal=name===activeName?Math.max(base,output):base;
      if(safeSet(manager,name,goal))this.applied.set(name,goal);
    }
  }
  update(dt){
    const seconds=clamp(Number(dt)||0,0,0.1);
    if(this.previewRemaining>0){
      this.previewRemaining=Math.max(0,this.previewRemaining-seconds);
      const goal=this.previewRemaining>0?0.77:0;
      this.opening=smooth(this.opening,goal,seconds,goal>this.opening?0.08:0.1);
      this.selected=this.previewVowel;
      this.apply(this.opening,this.selected);
      if(this.previewRemaining===0){this.release();this.opening=0;}
      return;
    }
    const s=this.session;
    if(!s||s.paused)return;
    this.elapsed+=seconds;
    const count=s.vowels.length;
    const progress=s.source==='file'
      ?(this.audioProgress??clamp(this.elapsed/Math.max(2,s.text.length/14),0,1))
      :Math.max(
          clamp(s.boundary/Math.max(1,s.text.length),0,1),
          clamp(this.elapsed/Math.max(1.8,s.text.length/13),0,1),
        );
    const index=count?Math.min(count-1,Math.floor(progress*count)):0;
    this.selected=s.vowels[index]||'a';
    let target;
    if(s.source==='file'&&this.audioSignalReceived){
      target=mouthAudioOpening(this.audioLevel);
      this.stats.signalFrames++;
    }else{
      // SpeechSynthesis exposes no PCM; this is intentionally a rough
      // audible-only syllabic motion, never advertised as real lip sync.
      const syllables=2.7+0.45*Math.sin(this.elapsed*0.71);
      const pulse=Math.sin(2*Math.PI*this.elapsed*syllables);
      target=0.22+0.55*Math.max(0,pulse);
    }
    this.opening=smooth(this.opening,target,seconds,target>this.opening?0.055:0.115);
    this.apply(this.opening,this.selected);
    this.stats.frames++;
    this.stats.peak=Math.max(this.stats.peak,this.opening);
  }
  stop(token=null){
    if(token!==null&&this.session?.token!==token)return false;
    this.session=null;this.previewRemaining=0;
    this.release();
    this.opening=0;this.audioLevel=0;this.audioProgress=null;
    this.audioSignalReceived=false;
    return true;
  }
  dispose(){this.stop();this.vrm=null;}
}
