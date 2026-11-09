import * as THREE from 'three';

// LP-FBX-01: reversible, opt-in QA over the imported FBX pose.
// Bone names are evidence of a candidate, NOT evidence of calibrated axes.
// Restrict rotations to small angles and always undo BEFORE AnimationMixer.
const canonical=name=>String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const finite=v=>Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z);
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,Number(n)||0));
const DEG=Math.PI/180;
function bodyPalette(root){
  const meshes=[];
  root?.traverse(node=>{
    if(node.isSkinnedMesh&&node.skeleton?.bones?.length)meshes.push(node);
  });
  meshes.sort((a,b)=>b.skeleton.bones.length-a.skeleton.bones.length);
  return [...new Set(meshes[0]?.skeleton?.bones||[])].filter(b=>b?.isBone);
}
function findUnique(bones,aliases){
  const matches=bones.filter(b=>aliases.some(pattern=>pattern.test(canonical(b.name))));
  return matches.length===1?matches[0]:null;
}
const rolePatterns={
  jaw:[/(?:^|bip\d*|mixamorig|j?bip[c]?|bn)jaw$/, /^lowerjaw$/, /^mandible$/],
  eyeLeft:[/^(?:left|l)eye(?:ball)?$/, /^eye(?:ball)?(?:left|l)$/, /(?:^|bn)l(?:eft)?eye$/],
  eyeRight:[/^(?:right|r)eye(?:ball)?$/, /^eye(?:ball)?(?:right|r)$/, /(?:^|bn)r(?:ight)?eye$/],
  lidLeft:[/^(?:left|l)upper(?:eye)?lid$/, /^upper(?:eye)?lid(?:left|l)$/, /(?:^|bn)l(?:eft)?eyelidupper$/],
  lidRight:[/^(?:right|r)upper(?:eye)?lid$/, /^upper(?:eye)?lid(?:right|r)$/, /(?:^|bn)r(?:ight)?eyelidupper$/],
  browLeft:[/^(?:left|l)(?:eye)?brow$/, /^(?:eye)?brow(?:left|l)$/],
  browRight:[/^(?:right|r)(?:eye)?brow$/, /^(?:eye)?brow(?:right|r)$/],
};
// Do not infer smile/cheeks/visemes from material names or the 488 bone count.
export function auditFbxFacialBones(root){
  const bones=bodyPalette(root),mapped={};
  for(const [role,patterns] of Object.entries(rolePatterns)){
    const match=findUnique(bones,patterns);
    if(match)mapped[role]=match;
  }
  const names=Object.fromEntries(Object.entries(mapped).map(([k,v])=>[k,v.name]));
  const eyePair=Boolean(mapped.eyeLeft&&mapped.eyeRight);
  const lidPair=Boolean(mapped.lidLeft&&mapped.lidRight);
  const browPair=Boolean(mapped.browLeft&&mapped.browRight);
  const controls={
    gaze:eyePair,blink:lidPair,jaw:Boolean(mapped.jaw),brows:browPair,
  };
  return {bones,roleNodes:mapped,names,controls,
    supported:Object.values(controls).some(Boolean),
    candidates:bones.filter(b=>/eye|lid|brow|jaw|mouth|lip|blink/i.test(b.name))
      .slice(0,60).map(b=>b.name),
    reason:'FBX utiliza huesos sin metadatos de expresiones VRM. Solo las parejas reconocidas inequívocamente habilitan pruebas reversibles; los ejes todavía requieren calibración visual.'};
}
export class FbxFaceQA{
  constructor(root){
    this.root=root;
    this.audit=auditFbxFacialBones(root);
    this.enabled=false; // explicit opt-in, never modify new import automatically
    this.intensity=.45;this.mode='resting';
    this.time=0;this.preview=null;this.modified=new Map();
    this.speech=null;this.opening=0;this.strength=.72;
    this.lastAudio=0;
  }
  getDiagnostics(){
    const {controls,names,candidates,reason,supported}=this.audit;
    return {supported,enabled:this.enabled,channels:{
      ...(controls.brows?{browLift:names.browLeft+' / '+names.browRight}:{}),
      ...(controls.jaw?{jaw:names.jaw}:{}),
      ...(controls.blink?{leftSquint:names.lidLeft,rightSquint:names.lidRight}:{}),
    },independent:Object.keys(controls).filter(k=>controls[k]),
      proxies:[],blink:controls.blink,gaze:controls.gaze,
      missing:['smile','cheeks','phoneticVisemes'],
      boneNames:names,candidates,reason,mode:this.mode,
      speaking:Boolean(this.speech),preview:this.preview?.action||null};
  }
  getLipDiagnostics(){
    const jaw=this.audit.controls.jaw;
    return {supported:jaw,names:jaw?['jaw (aproximación)']:[],
      mapping:jaw?{a:'jaw',e:'jaw',i:'jaw',o:'jaw',u:'jaw'}:{},
      active:Boolean(this.speech),opening:this.opening,
      source:this.speech?.source||null,preview:Boolean(this.preview?.action==='vowel'),
      reason:jaw?'Apertura aproximada mediante hueso de mandíbula; NO equivale a visemas ni a lip-sync calibrado.':
        'No se reconoció un hueso de mandíbula único. Voz disponible sin movimiento de labios.'};
  }
  setEnabled(value){this.enabled=Boolean(value);if(!this.enabled){this.preview=null;this.release();}}
  setIntensity(value){this.intensity=clamp(value);}
  setMode(value){if(!['resting','attentive','thinking','explaining'].includes(value))return false;
    this.mode=value;return true;}
  setStrength(value){this.strength=clamp(value);}
  previewFeature(key){
    if(!this.enabled||this.speech)return false;
    const map={brows:'brows',jaw:'jaw',eyelids:'blink'};
    const action=map[key];
    if(!action||!this.audit.controls[action])return false;
    this.preview={action,until:this.time+1.2};
    return true;
  }
  previewBlink(){
    if(!this.enabled||!this.audit.controls.blink||this.speech)return false;
    this.preview={action:'blink',until:this.time+.65};return true;
  }
  previewGaze(direction){
    if(!this.enabled||!this.audit.controls.gaze||this.speech||
      !['left','right','up','down'].includes(direction))return false;
    this.preview={action:'gaze',direction,until:this.time+1.2};return true;
  }
  preview(vowel){
    if(!this.enabled||!this.audit.controls.jaw||this.speech||
      !'aeiou'.includes(vowel))return false;
    this.preview={action:'vowel',until:this.time+1.1,vowel};return true;
  }
  beginSpeech(token){return Boolean(this.enabled&&this.speech?.token===token);}
  endSpeech(token){return Boolean(this.speech?.token===token);}
  start(token,{source='browser',text=''}={}){
    if(!this.enabled||!this.audit.controls.jaw||this.speech)return false;
    this.speech={token,source,text:String(text),paused:false};
    this.preview=null;return true;
  }
  stop(token){if(this.speech?.token!==token)return false;this.speech=null;this.opening=0;this.release();return true;}
  pause(token){if(this.speech?.token!==token)return false;this.speech.paused=true;return true;}
  resume(token){if(this.speech?.token!==token)return false;this.speech.paused=false;return true;}
  boundary(token,index){
    if(this.speech?.token!==token)return false;
    // Only a crude jaw-opening cue, never claim precise phonemes.
    const char=this.speech.text?.[index]?.toLowerCase()||'';
    this.lastAudio=/[aeoáéó]/.test(char)?.7:/[iuíú]/.test(char)?.4:.23;
    return true;
  }
  audioSignal(token,rms){
    if(this.speech?.token!==token)return false;
    this.lastAudio=clamp((Number(rms)||0)*3);
    return true;
  }
  release(){
    for(const [bone,quaternion] of this.modified)bone.quaternion.copy(quaternion);
    this.modified.clear();
    this.root?.updateMatrixWorld(true);
  }
  beforeFrame(){this.release();}
  turn(role,axis,angle){
    const bone=this.audit.roleNodes[role];
    if(!bone||!Number.isFinite(angle)||angle===0)return;
    if(!this.modified.has(bone))this.modified.set(bone,bone.quaternion.clone());
    const offset=new THREE.Quaternion().setFromAxisAngle(axis,angle);
    bone.quaternion.multiply(offset).normalize();
  }
  update(dt){
    this.time+=clamp(dt,0,.12);
    if(this.preview&&this.time>this.preview.until)this.preview=null;
    if(!this.enabled)return;
    const command=this.preview;
    const X=new THREE.Vector3(1,0,0),Y=new THREE.Vector3(0,1,0),Z=new THREE.Vector3(0,0,1);
    if(command?.action==='gaze'){
      const yaw=command.direction==='left'?.07:command.direction==='right'?-.07:0;
      const pitch=command.direction==='up'?.05:command.direction==='down'?-.05:0;
      this.turn('eyeLeft',Y,yaw);this.turn('eyeRight',Y,yaw);
      this.turn('eyeLeft',X,pitch);this.turn('eyeRight',X,pitch);
    }
    if(command?.action==='blink'){
      this.turn('lidLeft',X,.075);this.turn('lidRight',X,.075);
    }
    if(command?.action==='brows'){
      this.turn('browLeft',Z,.06);this.turn('browRight',Z,-.06);
    }
    if(command?.action==='jaw'||command?.action==='vowel'){
      this.opening=command.action==='vowel'?.4:.65;
      this.turn('jaw',X,this.opening*.13*this.intensity);
    }else if(this.speech&&!this.speech.paused){
      const signal=this.speech.source==='file'?this.lastAudio:
        Math.max(this.lastAudio,.16+.25*(.5+.5*Math.sin(this.time*24)));
      this.opening=clamp(signal)*this.strength;
      this.turn('jaw',X,this.opening*.13*this.intensity);
    }else this.opening=0;
    // Only bone overlays; original FBX clips, weights, and materials are untouched.
    this.root?.updateMatrixWorld(true);
  }
  dispose(){this.release();this.speech=null;this.root=null;}
}
