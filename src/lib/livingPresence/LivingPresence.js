import * as THREE from 'three';
import { sampleIdlePose, springStep } from './motionPrimitives.js';
import { buildRelaxedArmOffsets } from './neutralPose.js';
import { buildFingerCurlAxes, FINGER_GROUPS } from './fingerPose.js';
import { OrganicIdleScore, NaturalBlink } from './organicIdle.js';

const clamp01=x=>Math.max(0,Math.min(1,Number(x)||0));
const deg=x=>THREE.MathUtils.degToRad(x);
const LEFT='left',RIGHT='right';
const FINGER_JOINTS={
  Thumb:['Metacarpal','Proximal','Distal'],
  Index:['Proximal','Intermediate','Distal'],
  Middle:['Proximal','Intermediate','Distal'],
  Ring:['Proximal','Intermediate','Distal'],
  Little:['Proximal','Intermediate','Distal'],
};
const FINGER_REST={Thumb:6,Index:8,Middle:11,Ring:13,Little:15};

// LP-02B: resting posture + asynchronous micro-actions, fingers, gaze and blinks.
// Only edits the current rendered pose. No exportable clip, rig or model is changed.
export class LivingPresence {
  constructor(vrm) {
    this.vrm=vrm;
    this.enabled=false;
    this.intensity=0.55;
    this.posture=0.92;
    this.handActivity=true;
    this.gazeActivity=true;
    this.blinkActivity=true;
    this.diagnostic=false;
    this.time=0;
    this.fade={x:0,v:0};
    this.states=new Map();
    this.applied=new Map();
    this.calibration=buildRelaxedArmOffsets(vrm);
    this.fingerCalibration=buildFingerCurlAxes(vrm);
    this.score=new OrganicIdleScore();
    this.blink=new NaturalBlink();
    this.euler=new THREE.Euler(0,0,0,'XYZ');
    this.offset=new THREE.Quaternion();
    this.restOffset=new THREE.Quaternion();
    this.fingerOffset=new THREE.Quaternion();
    this.identity=new THREE.Quaternion();
    this.blinkApplied=null;
    this.gazeTarget=null;
    this.gazeBaseline=null;
    this.gazeForward=null;
    this.tmpWorldQ=new THREE.Quaternion();
    this.tmpEye=new THREE.Vector3();
    this.tmpDir=new THREE.Vector3();
    this.tmpRight=new THREE.Vector3();
    this.tmpUp=new THREE.Vector3();
  }
  getDiagnostics(){
    return [...this.calibration.diagnostics,...this.fingerCalibration.diagnostics];
  }
  getCapabilities(){
    const mgr=this.vrm?.expressionManager;
    return {
      calibratedFingers:this.fingerCalibration.axes.size,
      blinking:Boolean(mgr?.getValue && (mgr.getValue('blink')!==null ||
        (mgr.getValue('blinkLeft')!==null && mgr.getValue('blinkRight')!==null))),
      lookAt:Boolean(this.vrm?.lookAt?.autoUpdate !== false && this.vrm?.lookAt),
    };
  }
  setEnabled(value){
    this.enabled=Boolean(value);
    if(!this.enabled)this.resetOverlay();
  }
  setIntensity(value){if(Number.isFinite(Number(value)))this.intensity=clamp01(value);}
  setPosture(value){if(Number.isFinite(Number(value)))this.posture=clamp01(value);}
  setOptions(opts={}){
    if(typeof opts.hands==='boolean')this.handActivity=opts.hands;
    if(typeof opts.gaze==='boolean')this.gazeActivity=opts.gaze;
    if(typeof opts.blink==='boolean')this.blinkActivity=opts.blink;
    if(typeof opts.diagnostic==='boolean')this.diagnostic=opts.diagnostic;
    if(!this.gazeActivity)this.releaseGaze();
    if(!this.blinkActivity)this.restoreBlink();
  }
  releaseGaze(){
    if(this.vrm?.lookAt?.target===this.gazeTarget && this.gazeTarget) {
      this.vrm.lookAt.target=this.gazeBaseline;
    }
    this.gazeTarget=null;
    this.gazeBaseline=null;
    this.gazeForward=null;
  }
  restoreBlink(){
    const previous=this.blinkApplied;
    this.blinkApplied=null;
    const mgr=this.vrm?.expressionManager;
    if(!previous||!mgr?.setValue||!mgr?.getValue)return;
    for(const [name,data] of previous){
      const current=mgr.getValue(name);
      if(current!==null && Math.abs(current-data.applied)<0.00001)
        mgr.setValue(name,data.base);
    }
  }
  beforeFrame(){
    // Remove ONLY our offsets, and only when nobody else touched that bone.
    for(const {node,base,applied} of this.applied.values())
      if(node.quaternion.angleTo(applied)<0.0001)node.quaternion.copy(base);
    this.applied.clear();
    this.restoreBlink();
  }
  resetOverlay(){
    this.beforeFrame();
    this.releaseGaze();
    this.fade={x:0,v:0};
    this.states.clear();
  }
  updateBlink(t,scale){
    if(!this.blinkActivity)return;
    const mgr=this.vrm?.expressionManager;
    if(!mgr?.getValue||!mgr?.setValue)return;
    const names=mgr.getValue('blink')!==null?['blink']:
      (mgr.getValue('blinkLeft')!==null&&mgr.getValue('blinkRight')!==null?
        ['blinkLeft','blinkRight']:[]);
    if(!names.length)return;
    const value=clamp01(this.blink.sample(t)*scale);
    if(value<0.00001)return;
    const prev=new Map();
    for(const name of names){
      const base=mgr.getValue(name);
      if(base===null)continue;
      const applied=Math.max(base,value);
      mgr.setValue(name,applied);
      prev.set(name,{base,applied});
    }
    if(prev.size)this.blinkApplied=prev;
  }
  updateGaze(score){
    const lookAt=this.vrm?.lookAt;
    if(!this.gazeActivity||!lookAt||lookAt.autoUpdate===false)return;
    if(lookAt.target!=null&&lookAt.target!==this.gazeTarget)return; // external owner
    const head=this.vrm?.humanoid?.getNormalizedBoneNode?.('head');
    if(!head||typeof lookAt.getLookAtWorldPosition!=='function')return;
    if(!this.gazeTarget){
      this.gazeBaseline=lookAt.target??null;
      this.gazeTarget=new THREE.Object3D(); // detached target: no scene/export pollution
      const direction=typeof lookAt.getLookAtWorldDirection==='function' ?
        lookAt.getLookAtWorldDirection(new THREE.Vector3()) :
        new THREE.Vector3(0,0,1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
      head.getWorldQuaternion(this.tmpWorldQ);
      this.gazeForward=direction.normalize().applyQuaternion(this.tmpWorldQ.clone().invert()).normalize();
      lookAt.target=this.gazeTarget;
    }
    const headWorld=head.getWorldQuaternion(this.tmpWorldQ);
    const forward=this.tmpDir.copy(this.gazeForward).applyQuaternion(headWorld).normalize();
    const right=this.tmpRight.set(1,0,0).applyQuaternion(headWorld);
    const up=this.tmpUp.set(0,1,0).applyQuaternion(headWorld);
    const origin=lookAt.getLookAtWorldPosition(this.tmpEye);
    const factor=this.intensity*(this.diagnostic?2.4:1);
    this.gazeTarget.position.copy(origin).addScaledVector(forward,3.5)
      .addScaledVector(right,score.gazeX*0.18*factor)
      .addScaledVector(up,score.gazeY*0.12*factor);
    this.gazeTarget.updateMatrixWorld(true);
  }
  update(deltaSeconds,{clipPlaying=false}={}){
    const dt=Math.max(0,Math.min(0.1,Number(deltaSeconds)||0));
    this.time+=dt;
    if(clipPlaying){this.resetOverlay();return;} // including paused imported clips
    this.fade=springStep(this.fade,this.enabled?1:0,dt,0.85);
    const blend=clamp01(this.fade.x);
    if(blend<0.00001){this.releaseGaze();return;}
    const energy=clamp01(this.intensity);
    const diagnostic=this.diagnostic?2.4:1;
    const activity=blend*energy*diagnostic;
    const score=this.score.sample(this.time);
    const micro=sampleIdlePose(this.time,activity);
    // The event lanes stay independent: a wrist may recover while fingers
    // barely move, or the head may hold its pose for multiple seconds.
    if(this.handActivity) {
      for(const side of [LEFT,RIGHT]){
        const wrist=score[side+'Wrist'],elbow=score[side+'Elbow'];
        const shoulder=score[side+'Shoulder'];
        micro[side+'Hand']=[0.017*wrist*activity,0.05*wrist*activity,0.028*wrist*activity];
        const arm=micro[side+'LowerArm']||[0,0,0];
        micro[side+'LowerArm']=[arm[0]+0.04*elbow*activity,arm[1]+0.012*elbow*activity,arm[2]];
        const clavicle=micro[side+'Shoulder']||[0,0,0];
        micro[side+'Shoulder']=[clavicle[0],clavicle[1]+0.012*shoulder*activity,
          clavicle[2]+0.022*shoulder*activity];
      }
    }
    const head=micro.head||[0,0,0];
    micro.head=[head[0]+0.014*score.headTilt*activity,
      head[1]+0.045*score.headYaw*activity,
      head[2]+0.016*score.headTilt*activity];
    const neck=micro.neck||[0,0,0];
    micro.neck=[neck[0]+0.008*score.neck*activity,neck[1]+0.013*score.neck*activity,neck[2]];

    const fingerAngles=new Map();
    if(this.handActivity){
      for(const side of [LEFT,RIGHT]){
        const shared=score[side+'Fingers'];
        for(const finger of FINGER_GROUPS){
          const pulse=score[side+finger];
          const spread=FINGER_REST[finger];
          for(const [i,joint] of FINGER_JOINTS[finger].entries()){
            const role=side+finger+joint;
            if(!this.fingerCalibration.axes.has(role))continue;
            const weight=i===0?0.68:i===1?1:0.52;
            // A softly flexed rest hand plus isolated actions. Do not tie the
            // fingers in lockstep with respiration.
            const relaxed=deg(spread)*blend*this.posture*weight;
            const motion=deg(5.5)*(pulse*0.74+shared*0.26)*activity*weight;
            fingerAngles.set(role,Math.max(0,Math.min(deg(23),relaxed+motion)));
          }
        }
      }
    }
    const roles=new Set([...Object.keys(micro),...this.calibration.offsets.keys(),...fingerAngles.keys()]);
    for(const role of roles){
      const node=this.vrm?.humanoid?.getNormalizedBoneNode?.(role);
      if(!node)continue;
      const angles=micro[role]||[0,0,0];
      const channels=this.states.get(role)||[{x:0,v:0},{x:0,v:0},{x:0,v:0}];
      for(let axis=0;axis<3;axis++)channels[axis]=springStep(channels[axis],angles[axis],dt,2.4);
      this.states.set(role,channels);
      const [x,y,z]=channels.map(c=>c.x);
      this.euler.set(x,y,z);
      this.offset.setFromEuler(this.euler);
      const base=node.quaternion.clone();
      const resting=this.calibration.offsets.get(role);
      if(resting){
        this.restOffset.copy(this.identity).slerp(resting,blend*this.posture);
        node.quaternion.multiply(this.restOffset);
      }
      const curl=this.fingerCalibration.axes.get(role);
      if(curl&&fingerAngles.has(role)){
        this.fingerOffset.setFromAxisAngle(curl,fingerAngles.get(role));
        node.quaternion.multiply(this.fingerOffset);
      }
      node.quaternion.multiply(this.offset).normalize();
      this.applied.set(role,{node,base,applied:node.quaternion.clone()});
    }
    this.updateGaze(score);
    this.updateBlink(this.time,blend);
  }
  dispose(){
    this.resetOverlay();
    this.states.clear();
    this.applied.clear();
    this.vrm=null;
  }
}