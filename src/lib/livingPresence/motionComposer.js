// LP-02C.1 — conservative post-mixer compositor for PREVIEW of idle clips.
// No source AnimationClip tracks, bind poses or exported assets are modified.
import * as THREE from 'three';

const FINGERS=['Thumb','Index','Middle','Ring','Little'];
const JOINTS={
  Thumb:['Metacarpal','Proximal','Distal'],
  Index:['Proximal','Intermediate','Distal'],
  Middle:['Proximal','Intermediate','Distal'],
  Ring:['Proximal','Intermediate','Distal'],
  Little:['Proximal','Intermediate','Distal'],
};
const FINGER_ROLES=new Set(['left','right'].flatMap(side=>
  FINGERS.flatMap(finger=>JOINTS[finger].map(part=>side+finger+part))));
const clamp01=x=>Math.max(0,Math.min(1,Number(x)||0));
const IDLE=/(?:^|[\s_.\-])(idle|rest|resting|reposo|relaxed|relax|standing|waiting|neutral|breathing|respirar|quiet)(?:$|[\s_.\-])/i;
const ACTION=/(?:^|[\s_.\-])(walk|walking|run|running|jump|jumping|attack|fight|dance|clap|clapping|sit|sitting|talk|talking|sprint|turn|turning)(?:$|[\s_.\-])/i;
const MAX_STILL_DEGREES=0.65;
const angleDeg=(a,b)=>{
  const normA=Math.hypot(...a),normB=Math.hypot(...b);
  if(normA<1e-8||normB<1e-8)return Infinity;
  const dot=Math.abs((a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3])/(normA*normB));
  return 2*180/Math.PI*Math.acos(Math.min(1,Math.max(-1,dot)));
};
export function classifyIdleClip(name=''){
  const normalized=String(name||'');
  return !ACTION.test(normalized)&&IDLE.test(normalized);
}
export function analyzeQuaternionTrack(track){
  if(!track?.name?.endsWith('.quaternion')||!track.values||track.values.length<4||
     track.values.length%4!==0)return {kind:'invalid',maxAngle:Infinity};
  const base=Array.from(track.values.slice(0,4));
  let maxAngle=0;
  for(let i=4;i<track.values.length;i+=4) {
    const v=Array.from(track.values.slice(i,i+4));
    maxAngle=Math.max(maxAngle,angleDeg(base,v));
  }
  return {kind:maxAngle<=MAX_STILL_DEGREES?'static':'animated',
    maxAngle:Number(maxAngle.toFixed(4))};
}
export class MotionComposer {
  constructor(vrm) {
    this.vrm=vrm;
    this.enabled=false;
    this.intensity=0.65;
    this.clip=null;
    this.clipName='';
    this.eligible=false;
    this.roleMotion=new Map();
    this.fingerStats={static:0,animated:0,missing:0};
  }
  setEnabled(value){this.enabled=Boolean(value);}
  setIntensity(value){if(Number.isFinite(Number(value)))this.intensity=clamp01(value);}
  selectClip(clip) {
    this.clip=clip||null;
    this.clipName=clip?.name||'';
    this.eligible=Boolean(clip&&classifyIdleClip(this.clipName));
    this.roleMotion.clear();
    this.fingerStats={static:0,animated:0,missing:0};
    if(!clip||!this.vrm?.humanoid?.getNormalizedBoneNode)return;
    const tracks=new Map(clip.tracks.map(track=>[track.name,track]));
    // Only inspect humanoid-normalized nodes actually targeted by the mixer.
    for(const side of ['left','right']){
      for(const finger of FINGERS){
        for(const part of JOINTS[finger]){
          const role=side+finger+part;
          const node=this.vrm.humanoid.getNormalizedBoneNode(role);
          const track=node ? tracks.get(node.name+'.quaternion') : null;
          const classification=track?analyzeQuaternionTrack(track).kind:'missing';
          this.roleMotion.set(role,classification);
          this.fingerStats[classification==='static'?'static':
            classification==='animated'?'animated':'missing']++;
        }
      }
      for(const role of [side+'Hand',side+'Shoulder',side+'UpperArm',side+'LowerArm']){
        const node=this.vrm.humanoid.getNormalizedBoneNode(role);
        const track=node?tracks.get(node.name+'.quaternion'):null;
        this.roleMotion.set(role,track?analyzeQuaternionTrack(track).kind:'missing');
      }
    }
    for(const role of ['spine','chest','upperChest','neck','head']){
      const node=this.vrm.humanoid.getNormalizedBoneNode(role);
      const track=node?tracks.get(node.name+'.quaternion'):null;
      this.roleMotion.set(role,track?analyzeQuaternionTrack(track).kind:'missing');
    }
  }
  get active(){return this.enabled&&this.eligible&&Boolean(this.clip)&&this.intensity>0;}
  weightForRole(role) {
    if(!this.active)return 0;
    const motion=this.roleMotion.get(role)||'missing',alpha=this.intensity;
    if(FINGER_ROLES.has(role))
      return (motion==='animated'?0.08:motion==='static'?0.90:0.90)*alpha;
    if(role==='leftHand'||role==='rightHand')
      return (motion==='animated'?0.06:0.28)*alpha;
    if(role==='neck'||role==='head')return (motion==='animated'?0.16:0.32)*alpha;
    if(role==='spine'||role==='chest'||role==='upperChest')return 0.62*alpha;
    if(role.endsWith('Shoulder'))return 0.14*alpha;
    if(role.endsWith('UpperArm')||role.endsWith('LowerArm'))return 0.08*alpha;
    // No root, hips, legs or feet overlays on a playing/paused FBX.
    return 0;
  }
  getStatus() {
    return {
      enabled:this.enabled,active:this.active,eligible:this.eligible,
      clipName:this.clipName,clipSelected:Boolean(this.clip),
      intensity:this.intensity,
      fingerTracks:{...this.fingerStats},
      reason:!this.clip?'Selecciona un clip FBX de reposo.':
        !this.eligible?'Clip no identificado como reposo; la composición queda bloqueada.':
        !this.enabled?'La composición está desactivada (modo seguro).':
        this.intensity===0?'Mezcla al 0 %: solo movimiento Mixamo.':
        'Mezcla experimental activada sobre el clip de reposo.'
    };
  }
  dispose(){this.enabled=false;this.clip=null;this.roleMotion.clear();this.vrm=null;}
}
