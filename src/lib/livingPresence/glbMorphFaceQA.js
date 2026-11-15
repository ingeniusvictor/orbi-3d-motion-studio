import {FbxFaceQA} from './fbxFaceQA.js';
import {normalizedSpeechVowels,mouthAudioOpening} from './lipSync.js';

// FACIAL-08 — GLB/glTF morph targets are not VRM expression metadata.
// Discover only target names that really exist on drawable meshes. Multiple
// glTF face primitives with the same target must move together; no fabrication.
const normalize=name=>String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(+n)?+n:0));
const VOWELS=Object.freeze(['a','i','u','e','o']);
const EXPRESSIONS=Object.freeze(['angry','fun','joy','sorrow','surprised']);
const DIRECT=Object.freeze({
  blink:['blink'],blinkLeft:['blinkl','blinkleft'],
  blinkRight:['blinkr','blinkright'],a:['a'],i:['i'],u:['u'],e:['e'],o:['o'],
  angry:['angry'],fun:['fun'],joy:['joy'],sorrow:['sorrow'],surprised:['surprised'],
});
const CUES=Object.freeze({
  brows:'surprised',smile:'joy',eyelids:'blink',jaw:'a',
  angry:'angry',fun:'fun',joy:'joy',sorrow:'sorrow',surprised:'surprised',
});
const REMAPPED_PROXIES=['browLift','smile','leftSquint','rightSquint','jaw'];

export function auditGlbMorphFace(root){
  const raw=new Map();
  let meshes=0;
  root?.traverse?.(node=>{
    const dict=node?.morphTargetDictionary;
    const influences=node?.morphTargetInfluences;
    if(!node?.isMesh||!dict||!Array.isArray(influences)||!influences.length)return;
    meshes++;
    for(const [name,index] of Object.entries(dict)){
      if(!Number.isInteger(index)||index<0||index>=influences.length)continue;
      const key=normalize(name);
      if(!key)continue;
      const entries=raw.get(key)||[];
      // Avoid applying twice if an exporter emits aliases for the same index.
      if(!entries.some(ref=>ref.mesh===node&&ref.index===index))
        entries.push({mesh:node,index,name});
      raw.set(key,entries);
    }
  });
  const refs={},actual={};
  for(const [channel,aliases] of Object.entries(DIRECT)){
    const found=aliases.find(alias=>raw.has(alias));
    if(found){refs[channel]=raw.get(found);actual[channel]=refs[channel][0].name;}
  }
  const mouth=Object.fromEntries(VOWELS.filter(v=>refs[v])
    .map(v=>[v,actual[v]]));
  const blink=Boolean(refs.blink||(refs.blinkLeft&&refs.blinkRight));
  const channels={
    ...(refs.surprised?{browLift:actual.surprised}:{}),
    ...(refs.angry?{browFrown:actual.angry}:{}),
    ...(refs.joy?{smile:actual.joy}:{}),
    ...(refs.fun?{relax:actual.fun}:{}),
    ...(refs.blinkLeft?{leftSquint:actual.blinkLeft}:{}),
    ...(refs.blinkRight?{rightSquint:actual.blinkRight}:{}),
    ...(refs.a?{jaw:actual.a}:{}),
    ...Object.fromEntries(EXPRESSIONS.filter(k=>refs[k]).map(k=>[k,actual[k]])),
  };
  const supported=Object.keys(refs).length>0;
  return {
    supported,morphMeshes:meshes,morphNames:[...new Set([...raw.values()]
      .map(refs=>refs[0]?.name).filter(Boolean))],
    references:refs,names:actual,mouth,blink,channels,
    proxies:REMAPPED_PROXIES.filter(k=>channels[k]),
    independent:EXPrNames(refs),gaze:false,
    reason:supported
      ?'Morph targets GLB detectados por nombre real. Emociones genéricas pueden afectar todo el rostro. La mirada requiere huesos oculares identificados y calibrados.'
      :'El modelo no ofrece morph targets faciales reconocibles. Se usarán controles óseos únicamente si son compatibles.',
  };
}
function EXPrNames(refs){return EXPRESSIONS.filter(key=>Boolean(refs[key]));}

// Optional bone QA keeps manual eye mapping separate from morphs.
// Unknown J_Adj_*FaceEye bones are NOT assumed to be eye pivots automatically.
export class GlbMorphFaceQA{
  constructor(root){
    this.root=root;
    this.audit=auditGlbMorphFace(root);
    this.bones=new FbxFaceQA(root);
    this.enabled=false;this.intensity=.46;this.strength=.72;
    this.mode='resting';this.clock=0;this.preview=null;
    this.applied=new Map();this.session=null;this.speechFace=null;
    this.opening=0;this.selected='a';this.lastAudio=0;
    this.audioProgress=null;this.audioSignalReceived=false;
  }
  get enabledMorph(){return this.audit.supported;}
  getMappingConfig(){return this.bones.getMappingConfig();}
  setManualMapping(role,id){return this.bones.setManualMapping(role,id);}
  getDiagnostics(){
    const morph=this.audit,bone=this.bones.getDiagnostics();
    const channels={...bone.channels,...morph.channels};
    const boneControls=bone.independent||[];
    return {
      supported:morph.supported||bone.supported,enabled:this.enabled,
      channels,independent:[...new Set([...morph.independent,...boneControls])],
      proxies:morph.proxies,
      missing:['cheeks'].filter(k=>!channels[k]),blink:morph.blink||bone.blink,
      gaze:bone.gaze,morphTargets:morph.morphNames,
      morphMeshes:morph.morphMeshes,morphCount:morph.morphNames.length,
      boneNames:bone.boneNames,candidates:bone.candidates,
      reason:morph.reason,mode:this.mode,
      speaking:Boolean(this.session||this.speechFace),
      preview:this.preview?.action||bone.preview||null,
    };
  }
  getLipDiagnostics(){
    const capability=this.audit,fromBones=this.bones.getLipDiagnostics();
    if(!Object.keys(capability.mouth).length)return fromBones;
    return {
      supported:true,names:Object.values(capability.mouth),
      mapping:{...capability.mouth},active:Boolean(this.session),
      paused:Boolean(this.session?.paused),opening:this.opening,
      source:this.session?.source||null,currentVowel:this.selected,
      audioSignalReceived:this.audioSignalReceived,
      preview:this.preview?.action==='vowel',
      reason:'Visemas GLB A/I/U/E/O reales. Voz del navegador: sincronía aproximada con el texto; archivo local: volumen medido con vocal estimada.',
    };
  }
  setEnabled(value){
    this.enabled=Boolean(value);this.bones.setEnabled(this.enabled);
    if(!this.enabled){this.preview=null;this.session=null;this.speechFace=null;this.release();}
  }
  setIntensity(value){this.intensity=clamp(value);this.bones.setIntensity(value);}
  setStrength(value){this.strength=clamp(value);this.bones.setStrength(value);}
  setMode(value){
    if(!['resting','attentive','thinking','explaining'].includes(value))return false;
    this.mode=value;return this.bones.setMode(value);
  }
  previewFeature(feature){
    if(!this.enabled||this.session||this.speechFace)return false;
    const channel=CUES[feature];
    if(this.audit.references[channel]){
      this.preview={action:'expression',key:feature,morph:channel,
        until:this.clock+1.35};return true;
    }
    return this.bones.previewFeature(feature);
  }
  previewBlink(){
    if(!this.enabled||this.session||this.speechFace)return false;
    if(this.audit.blink){
      this.preview={action:'blink',until:this.clock+.65};return true;
    }
    return this.bones.previewBlink();
  }
  previewGaze(direction){
    if(!this.enabled||this.session||this.speechFace)return false;
    return this.bones.previewGaze(direction);
  }
  previewVowel(vowel){
    if(!this.enabled||this.session||!VOWELS.includes(vowel))return false;
    if(!this.audit.references[vowel])return this.bones.previewVowel(vowel);
    this.preview={action:'vowel',morph:vowel,until:this.clock+1.1};
    return true;
  }
  beginSpeech(token,{mode='explaining'}={}){
    if(!this.enabled)return false;
    this.speechFace={token,mode};return true;
  }
  endSpeech(token){
    if(this.speechFace?.token!==token)return false;
    this.speechFace=null;return true;
  }
  start(token,{source='browser',text=''}={}){
    if(!this.enabled)return false;
    if(!Object.keys(this.audit.mouth).length)
      return this.bones.start(token,{source,text});
    this.session={token,source:source==='file'?'file':'browser',
      text:String(text).slice(0,600),vowels:normalizedSpeechVowels(text),
      boundary:0,elapsed:0,paused:false};
    this.preview=null;this.opening=0;this.selected='a';
    this.lastAudio=0;this.audioProgress=null;this.audioSignalReceived=false;
    return true;
  }
  stop(token){
    if(this.session?.token===token){
      this.session=null;this.opening=0;this.lastAudio=0;
      this.audioSignalReceived=false;this.release();return true;
    }
    return this.bones.stop(token);
  }
  pause(token){
    if(this.session?.token===token){this.session.paused=true;this.release();return true;}
    return this.bones.pause(token);
  }
  resume(token){
    if(this.session?.token===token){this.session.paused=false;return true;}
    return this.bones.resume(token);
  }
  boundary(token,index){
    if(this.session?.token===token){
      if(Number.isFinite(index))this.session.boundary=clamp(index,0,this.session.text.length);
      return true;
    }
    return this.bones.boundary(token,index);
  }
  audioSignal(token,rms,progress=null){
    if(this.session?.token===token){
      this.lastAudio=clamp(rms);
      this.audioSignalReceived=true;
      if(progress!=null)this.audioProgress=clamp(progress);
      return true;
    }
    return this.bones.audioSignal(token,rms,progress);
  }
  release(){
    for(const [key,{mesh,index,baseline,applied}] of this.applied){
      if(mesh?.morphTargetInfluences &&
          Math.abs(mesh.morphTargetInfluences[index]-applied)<.0001)
        mesh.morphTargetInfluences[index]=baseline;
    }
    this.applied.clear();this.bones.release();
  }
  beforeFrame(){this.release();}
  apply(name,value){
    for(const target of this.audit.references[name]||[]){
      const {mesh,index}=target;
      if(!mesh?.morphTargetInfluences)return;
      const key=mesh.uuid+':'+index;
      const current=Number(mesh.morphTargetInfluences[index]);
      if(!Number.isFinite(current))continue;
      if(!this.applied.has(key))
        this.applied.set(key,{mesh,index,baseline:current,applied:current});
      const entry=this.applied.get(key);
      const result=Math.max(current,clamp(value,0,.95));
      mesh.morphTargetInfluences[index]=result;
      entry.applied=result;
    }
  }
  update(dt){
    const seconds=clamp(dt,0,.10);
    this.clock+=seconds;
    if(this.preview&&this.clock>=this.preview.until)this.preview=null;
    if(!this.enabled){this.opening=0;return;}
    this.bones.update(seconds);
    const preview=this.preview;
    if(preview){
      if(preview.action==='blink'){
        if(this.audit.references.blink)this.apply('blink',.85);
        else{this.apply('blinkLeft',.85);this.apply('blinkRight',.85);}
      }else if(preview.action==='vowel'){
        this.selected=preview.morph;this.opening=.7;
        this.apply(preview.morph,.75*this.strength);
      }else if(preview.action==='expression'){
        const level=preview.morph==='blink'?.5:.43;
        this.apply(preview.morph,level*this.intensity/.46);
      }
      return;
    }
    const s=this.session;
    if(!s||s.paused){
      this.opening=0;
      if(!s&&this.audit.supported){
        // The user explicitly enabled facial QA; keep subtle, reversible
        // expression activity without pretending the GLB has VRM metadata.
        const blinkPhase=(this.clock+1.2)%4.7;
        if(blinkPhase<.18&&this.audit.blink){
          const amount=.7*Math.sin(Math.PI*blinkPhase/.18)**2;
          if(this.audit.references.blink)this.apply('blink',amount);
          else{
            this.apply('blinkLeft',amount);
            this.apply('blinkRight',amount);
          }
        }
        const expression=this.mode==='attentive'?'surprised':
          this.mode==='thinking'?'fun':'joy';
        const strength=this.mode==='resting'?.018:.034;
        if(this.audit.references[expression])
          this.apply(expression,strength*this.intensity/.46);
      }
      return;
    }
    s.elapsed+=seconds;
    const progress=s.source==='file'
      ?(this.audioProgress??clamp(s.elapsed/Math.max(2,s.text.length/14)))
      :Math.max(clamp(s.boundary/Math.max(1,s.text.length)),
        clamp(s.elapsed/Math.max(1.8,s.text.length/13)));
    const i=s.vowels.length?
      Math.min(s.vowels.length-1,Math.floor(progress*s.vowels.length)):0;
    this.selected=s.vowels[i]||'a';
    const pulse=Math.max(0,Math.sin(s.elapsed*17));
    const target=s.source==='file'&&this.audioSignalReceived
      ?mouthAudioOpening(this.lastAudio):(.2+.52*pulse);
    this.opening+=(target-this.opening)*(1-Math.exp(-seconds/.07));
    const morph=this.audit.references[this.selected]?
      this.selected:(this.audit.references.a?'a':
        Object.keys(this.audit.mouth)[0]);
    if(morph)this.apply(morph,this.opening*this.strength);
  }
  dispose(){
    this.release();this.bones.dispose();this.root=null;
    this.session=null;this.speechFace=null;this.applied.clear();
  }
}
