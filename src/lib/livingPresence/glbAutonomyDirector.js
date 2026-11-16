// LP-04A: opt-in, disposable movement overlay for the approved 346-bone LUMIA GLB.
// A Qwen intent is NEVER a bone command. VoiceMotorBridge validates it and
// sends only an allowlisted state/one-shot gesture through the viewer API.
// The source rig, skin weights, animations, bind matrices and export data stay untouched.
import * as THREE from 'three';
import {GestureDirector} from './gestureDirector.js';

const ROLES=Object.freeze({
  head:'J_Bip_C_Head',
  neck:'V8_Bip001-Neck',
  chest:'V8_Bip001-Spine1',
  upperChest:'V8_Bip001-Spine2',
  leftUpperArm:'V8_Bip001-L-UpperArm',
  rightUpperArm:'V8_Bip001-R-UpperArm',
  leftHand:'V8_Bip001-L-Hand',
  rightHand:'V8_Bip001-R-Hand',
});
const MODES=Object.freeze(['resting','attentive','thinking','explaining']);
const deg=n=>n*Math.PI/180;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

function identifyApprovedGlb(root){
  if(!root?.traverse)return {eligible:false,reason:'No hay personaje cargado.',bones:new Map()};
  const discovered=new Map(),duplicates=new Set();
  let maxSkeleton=0;
  root.traverse(obj=>{
    if(obj.isSkinnedMesh)maxSkeleton=Math.max(maxSkeleton,obj.skeleton?.bones?.length||0);
    if(obj.isBone){
      if(discovered.has(obj.name))duplicates.add(obj.name);
      discovered.set(obj.name,obj);
    }
  });
  const missing=Object.values(ROLES).filter(name=>!discovered.has(name)||duplicates.has(name));
  if(maxSkeleton!==346 || missing.length)
    return {eligible:false,reason:'LP-04A solo admite LUMIA GLB con rig de 346 huesos y roles únicos.'+
      (missing.length?' Faltan o se duplican: '+missing.join(', '):''),bones:new Map()};
  return {eligible:true,reason:'LUMIA GLB 346 reconocida.',bones:new Map(
    Object.entries(ROLES).map(([role,name])=>[role,discovered.get(name)]))};
}

export class GlbAutonomyDirector {
  constructor(root){
    this.root=root;
    const identified=identifyApprovedGlb(root);
    this.eligible=identified.eligible;
    this.reason=identified.reason;
    this.bones=identified.bones;
    this.enabled=false;
    this.motorEnabled=false;
    this.mode='resting';
    this.intensity=0.42;
    this.time=0;
    this.gestures=new GestureDirector();
    this.applied=new Map();
    this.last={applied:false,maxDegrees:0,reason:this.reason};
  }
  setEnabled(enabled){
    this.beforeFrame();
    this.enabled=Boolean(enabled)&&this.eligible;
    if(this.enabled)this.motorEnabled=true; // User-authorized gentle idle presence.
    if(!this.enabled){
      this.motorEnabled=false;
      this.gestures.setEnabled(false);
    }
    return this.enabled;
  }
  setMotorEnabled(enabled){this.motorEnabled=Boolean(enabled)&&this.enabled;}
  setMotorMode(mode){
    if(!MODES.includes(mode))return false;
    this.mode=mode;return true;
  }
  setMotorIntensity(value){
    if(Number.isFinite(value))this.intensity=clamp(value,0,0.65);
  }
  setGestureEnabled(enabled){this.gestures.setEnabled(Boolean(enabled)&&this.enabled);}
  setGestureIntensity(value){this.gestures.setIntensity(clamp(Number(value)||0,0,0.65));}
  triggerGesture(name){return this.enabled&&this.gestures.trigger(name);}
  getMotorStatus(){return {enabled:this.motorEnabled,mode:this.mode,intensity:this.intensity};}
  getGestureStatus(){return this.gestures.getStatus();}
  getStatus(){return {...this.last,eligible:this.eligible,enabled:this.enabled,
    motor:this.getMotorStatus(),gesture:this.getGestureStatus()};}
  // Called BEFORE mixer updates: restores the exact rotation that existed
  // before the previous visual-only overlay (no accumulation / no baked keys).
  beforeFrame(){
    for(const [bone,q] of this.applied)bone.quaternion.copy(q);
    this.applied.clear();
  }
  update(dt,{clipPlaying=false}={}){
    if(!this.enabled||!this.eligible||clipPlaying){
      this.last={applied:false,maxDegrees:0,reason:clipPlaying?
        'Clip activo: prioridad exclusiva de la animación.':this.reason};
      if(clipPlaying)this.gestures.reset();
      return this.last;
    }
    const step=clamp(Number.isFinite(dt)?dt:0,0,0.1);
    this.time+=step;
    const gesture=this.gestures.update(step);
    const phase=this.time;
    const gain=this.motorEnabled?this.intensity:0;
    const speaking=this.mode==='explaining'?1:
      this.mode==='thinking'?0.7:this.mode==='attentive'?0.45:0.6;
    // Gentle, deterministic micro-motion: not model hallucinations,
    // not a dance; amplitudes under one degree before one-shot gestures.
    const breathe=Math.sin(phase*1.65)*deg(0.30)*gain;
    const look=Math.sin(phase*0.75)*deg(0.38)*gain*speaking;
    const base={
      chest:[breathe*0.3,look*0.2,0],
      upperChest:[breathe,look*0.6,0],
      neck:[0,-look*0.2,0],
      head:[Math.sin(phase*1.05)*deg(0.18)*gain,look,0],
      leftUpperArm:[0,0,breathe*0.30],
      rightUpperArm:[0,0,-breathe*0.30],
    };
    let maxDegrees=0;
    for(const [role,bone] of this.bones){
      const a=base[role]||[0,0,0],g=gesture.pose[role]||[0,0,0];
      // A small one-shot addition may never become an arbitrary rotation.
      const xyz=a.map((x,i)=>clamp(x+g[i],-deg(5),deg(5)));
      if(xyz.every(x=>Math.abs(x)<1e-10))continue;
      this.applied.set(bone,bone.quaternion.clone());
      bone.quaternion.multiply(new THREE.Quaternion().setFromEuler(
        new THREE.Euler(xyz[0],xyz[1],xyz[2],'XYZ'))).normalize();
      for(const x of xyz)maxDegrees=Math.max(maxDegrees,Math.abs(x)*180/Math.PI);
    }
    this.last={applied:this.applied.size>0,maxDegrees,
      reason:this.motorEnabled?'Microgestos de LUMIA activos.':
        gesture.name?'Gesto puntual activo.':'Esperando intención de Qwen.'};
    return this.last;
  }
  dispose(){this.setEnabled(false);this.root=null;this.bones.clear();}
}
