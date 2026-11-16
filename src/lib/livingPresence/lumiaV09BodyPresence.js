import * as THREE from 'three';
import {inspectLumiaMasterRest} from '../autoRig/lumiaMasterProfile.js';
import {GestureDirector} from './gestureDirector.js';
import {MotorCoordinator,MOTOR_MODES} from './motorCoordinator.js';

// LP-04: explicitly opt-in, local and fully reversible procedural presence for
// the validated Claude V09 346-bone rig, not a universal FBX/GLB animator.
// No root, pelvis, legs, feet, face morphs, bind matrices or export tracks.
const NAMES=Object.freeze({
  torso:'V8_Bip001-Spine2',
  spine:'V8_Bip001-Spine1',
  neck:'J_Bip_C_Neck',
  head:'J_Bip_C_Head',
  armL:'V8_Bip001-L-UpperArm',
  armR:'V8_Bip001-R-UpperArm',
  wristL:'V8_Bip001-L-Hand',
  wristR:'V8_Bip001-R-Hand',
});
const SIDE=['L','R'];
const FINGERS=[0,1,2,3,4];
const AXIS_X=new THREE.Vector3(1,0,0);
const AXIS_Y=new THREE.Vector3(0,1,0);
const AXIS_Z=new THREE.Vector3(0,0,1);
const GESTURE_ROLES=Object.freeze({
  chest:'spine',upperChest:'torso',neck:'neck',head:'head',
  leftUpperArm:'armL',rightUpperArm:'armR',
  leftHand:'wristL',rightHand:'wristR',
});
const MAX_GESTURE_ANGLE=4*Math.PI/180;
const motorModes=new Set(Object.keys(MOTOR_MODES));
const attentionTargets=new Set(['interlocutor','ambient']);
const DEFAULT_OPTIONS=Object.freeze({
  breathing:true,head:true,arms:false,fingers:false,
});
const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number.isFinite(Number(v))?Number(v):min));

export function auditLumiaV09Body(root){
  const profile=inspectLumiaMasterRest(root);
  if(!profile.ok||profile.version!=='claude-v09')
    return {ok:false,profile,reason:profile.reason||
      'El motor LP-04 solo admite la maestra Claude V09 con reposo verificado.'};
  const skins=[];
  root.traverse(object=>{
    if(object.isSkinnedMesh&&object.skeleton?.bones?.length===346)
      skins.push(object.skeleton);
  });
  if(!skins.length)return {ok:false,profile,reason:'No hay skin de 346 huesos.'};
  const bones=skins[0].bones;
  const lookup=new Map();
  for(const bone of bones){
    if(!bone?.isBone||!bone.name||lookup.has(bone.name))
      return {ok:false,profile,reason:'Nombres de huesos duplicados o inválidos.'};
    lookup.set(bone.name,bone);
  }
  for(const [role,name] of Object.entries(NAMES))
    if(!lookup.has(name))
      return {ok:false,profile,reason:'Falta hueso obligatorio '+role+': '+name};
  const descendant=(bone,ancestor)=>{
    let cursor=bone;
    while(cursor&&cursor!==root){
      if(cursor===ancestor)return true;
      cursor=cursor.parent;
    }
    return false;
  };
  if(!descendant(lookup.get(NAMES.head),lookup.get(NAMES.neck))||
     !descendant(lookup.get(NAMES.armL),lookup.get(NAMES.torso))||
     !descendant(lookup.get(NAMES.armR),lookup.get(NAMES.torso))||
     !descendant(lookup.get(NAMES.wristL),lookup.get(NAMES.armL))||
     !descendant(lookup.get(NAMES.wristR),lookup.get(NAMES.armR))||
     !descendant(lookup.get(NAMES.torso),lookup.get(NAMES.spine)))
    return {ok:false,profile,reason:'Jerarquía V09 desconocida. No aplicar microgestos.'};
  const fingerBones=[];
  for(const side of SIDE)
    for(const finger of FINGERS){
      const name='V8_Bip001-'+side+'-Finger'+finger;
      const bone=lookup.get(name);
      if(bone&&descendant(bone,lookup.get(side==='L'?NAMES.wristL:NAMES.wristR)))
        fingerBones.push({side,finger,bone});
    }
  // Finger pose remains opt-in because joint axes need visual QA on hardware.
  const mapping=Object.fromEntries(Object.entries(NAMES)
    .map(([role,name])=>[role,lookup.get(name)]));
  return {
    ok:true,profile,bones:346,roles:Object.keys(mapping),mapping,
    fingerBones,fingerCount:fingerBones.length,
    reason:'Rig Claude V09 verificado por inverse-bind y jerarquía. '+
      'Respiración/cabeza son pruebas leves; manos y dedos requieren QA visual.',
  };
}

export class LumiaV09BodyPresence {
  constructor(root){
    this.root=root;
    this.audit=auditLumiaV09Body(root);
    this.enabled=false;this.intensity=.32;this.speed=1;
    this.options={...DEFAULT_OPTIONS};
    this.clock=0;this.fade=0;
    this.applied=new Map();this.suspendedForClip=false;
    // The SAME director drives both manual LP-04 idle and Qwen speech cues.
    // No second GLB autonomy engine or concurrent quaternion writer.
    this.coordinator=new MotorCoordinator();
    this.gestures=new GestureDirector();
    this.motorEnabled=false;
    this.motorMode='resting';this.motorIntensity=.35;
    this.attentionTarget='ambient';
    this.lastMotor={applied:false,maxDegrees:0};
  }
  getStatus(){
    const {ok,profile,bones,fingerCount,reason}=this.audit;
    return {
      supported:Boolean(ok),enabled:this.enabled,intensity:this.intensity,
      speed:this.speed,options:{...this.options},
      bones:bones||0,fingersRecognized:fingerCount||0,
      profile:profile?.version||null,
      suspendedForClip:this.suspendedForClip,
      motor:this.getMotorStatus(),gesture:this.getGestureStatus(),
      autonomyAvailable:Boolean(ok),
      reason:reason||'No se reconoce un rig corporal Claude V09.',
      safety:'Solo superposición de vista previa. No modifica clips, skin ni exportación.',
    };
  }
  setEnabled(value){
    if(!this.audit.ok){this.enabled=false;return false;}
    this.enabled=Boolean(value);
    this.fade=0;
    if(!this.enabled){
      this.release();this.suspendedForClip=false;
      this.setGestureEnabled(false);this.setMotorEnabled(false);
      this.attentionTarget='ambient';
    }
    return true;
  }
  setIntensity(value){this.intensity=clamp(value,0,.65);}
  setSpeed(value){this.speed=clamp(value,.3,1.5);}
  setOptions(options={}){
    for(const k of Object.keys(DEFAULT_OPTIONS))
      if(Object.hasOwn(options,k))this.options[k]=Boolean(options[k]);
    this.release();
    return {...this.options};
  }
  setMotorEnabled(value){
    this.motorEnabled=Boolean(value)&&this.enabled&&this.audit.ok;
    this.coordinator.setEnabled(this.motorEnabled);
    if(!this.motorEnabled)this.coordinator.reset();
    return this.motorEnabled;
  }
  setMotorMode(mode){
    if(!motorModes.has(mode))return false;
    this.motorMode=mode;this.coordinator.setMode(mode);return true;
  }
  setMotorIntensity(value){
    if(!Number.isFinite(value))return false;
    this.motorIntensity=clamp(value,0,.65);
    this.coordinator.setIntensity(this.motorIntensity);
    return true;
  }
  setAttentionTarget(target){
    if(!attentionTargets.has(target))return false;
    this.attentionTarget=target;return true;
  }
  getMotorStatus(){
    return {enabled:this.motorEnabled,mode:this.motorMode,
      intensity:this.motorIntensity,attentionTarget:this.attentionTarget};
  }
  setGestureEnabled(value){
    this.gestures.setEnabled(Boolean(value)&&this.enabled&&this.audit.ok);
  }
  setGestureIntensity(value){
    if(!Number.isFinite(value))return false;
    this.gestures.setIntensity(clamp(value,0,.65));
    return true;
  }
  getGestureStatus(){return this.gestures.getStatus();}
  triggerGesture(name){
    if(!this.enabled||!this.motorEnabled||this.suspendedForClip)return false;
    return this.gestures.trigger(name);
  }
  // The body model owns local axes. Qwen provides ENUMs only; the existing
  // coordinator and gesture catalog generate bounded local joint deltas.
  applyRoleAngles(role,angles){
    const bone=this.audit.mapping[GESTURE_ROLES[role]];
    if(!bone||!Array.isArray(angles))return;
    const axes=[AXIS_X,AXIS_Y,AXIS_Z];
    for(let axis=0;axis<3;axis++){
      const amount=clamp(angles[axis]||0,-MAX_GESTURE_ANGLE,MAX_GESTURE_ANGLE);
      this.rotate(bone,axes[axis],amount);
    }
  }
  // Only restore transforms if no other editor changed them since our overlay.
  // This preserves edits performed while the preview was visible.
  release(){
    for(const [bone,{base,applied}] of this.applied)
      if(bone?.quaternion&&bone.quaternion.angleTo(applied)<1e-6)
        bone.quaternion.copy(base);
    this.applied.clear();
  }
  beforeFrame(){this.release();}
  rotate(bone,axis,angle){
    if(!bone?.isBone||!Number.isFinite(angle)||Math.abs(angle)<1e-10)return;
    let entry=this.applied.get(bone);
    if(!entry){
      entry={base:bone.quaternion.clone(),applied:bone.quaternion.clone()};
      this.applied.set(bone,entry);
    }
    // Local axis rotation: a SMALL delta from current rest/animation state.
    bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axis,angle));
    bone.quaternion.normalize();
    entry.applied.copy(bone.quaternion);
  }
  update(delta,{clipSelected=false}={}){
    this.suspendedForClip=Boolean(clipSelected);
    if(!this.audit.ok||!this.enabled||this.suspendedForClip){
      this.release();
      // A selected clip, even paused, owns the entire skeleton.
      if(this.suspendedForClip){
        this.gestures.reset();this.coordinator.reset();
      }
      this.fade=0;
      return false;
    }
    const dt=clamp(delta,0,.1);
    this.clock+=dt*this.speed;
    // Fade in gently so enable/disable cannot jerk the skeleton.
    this.fade=Math.min(1,this.fade+dt/.8);
    const gain=this.intensity*this.fade;
    if(gain<1e-7)return false;
    const b=this.audit.mapping,t=this.clock;
    if(this.options.breathing){
      const wave=Math.sin(t*2*Math.PI*.18);
      const slow=Math.sin(t*2*Math.PI*.09+.4);
      this.rotate(b.spine,AXIS_X,.004*gain*wave);
      this.rotate(b.torso,AXIS_X,.014*gain*wave);
      this.rotate(b.torso,AXIS_Z,.0025*gain*slow);
    }
    if(this.options.head){
      this.rotate(b.neck,AXIS_Y,.014*gain*Math.sin(t*.61));
      this.rotate(b.head,AXIS_Y,.010*gain*Math.sin(t*.61+.3));
      this.rotate(b.head,AXIS_X,.009*gain*Math.sin(t*.78));
      this.rotate(b.head,AXIS_Z,.005*gain*Math.sin(t*.39));
    }
    if(this.options.arms){
      const sway=Math.sin(t*.77);
      this.rotate(b.armL,AXIS_Z,.013*gain*sway);
      this.rotate(b.armR,AXIS_Z,-.013*gain*sway);
      this.rotate(b.wristL,AXIS_X,.012*gain*Math.sin(t*.94));
      this.rotate(b.wristR,AXIS_X,-.012*gain*Math.sin(t*.94));
    }
    if(this.options.fingers){
      // No anatomical claim: low-amplitude exploratory flexion, OFF by default.
      for(const {side,finger,bone} of this.audit.fingerBones){
        const direction=side==='L'?1:-1;
        const phase=t*.84+finger*.28+(side==='L'?0:.4);
        this.rotate(bone,AXIS_X,direction*.009*gain*Math.sin(phase));
      }
    }
    if(this.motorEnabled){
      const gaze=this.attentionTarget==='interlocutor'?.009:0;
      const motor=this.coordinator.update(dt,{
        roll:Math.sin(t*.39)*.008,yaw:Math.sin(t*.21)*.012,
        headYaw:gaze*Math.sin(t*.45),
        wristLeft:Math.sin(t*.37)*.2,
        wristRight:-Math.sin(t*.42)*.2,
      });
      for(const [role,angles] of Object.entries(motor.euler||{}))
        this.applyRoleAngles(role,angles);
    }
    const gesture=this.gestures.update(dt);
    if(this.motorEnabled){
      for(const [role,angles] of Object.entries(gesture.pose||{}))
        this.applyRoleAngles(role,angles);
    }
    this.lastMotor={applied:this.applied.size>0,
      maxDegrees:Math.min(4,Math.max(
        this.coordinator.last?.maxDegrees||0,
        ...Object.values(gesture.pose||{}).flat()
          .map(a=>Math.abs(a)*180/Math.PI),0)),
      gesture:gesture.name||null};
    return this.applied.size>0;
  }
  dispose(){
    this.setEnabled(false);
    this.release();this.gestures.reset();this.coordinator.reset();
    this.root=null;
    this.audit={ok:false,reason:'Adaptador liberado.'};
  }
}
