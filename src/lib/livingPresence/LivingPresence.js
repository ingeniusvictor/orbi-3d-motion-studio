import * as THREE from 'three';
import { sampleIdlePose, springStep } from './motionPrimitives.js';
import { buildRelaxedArmOffsets } from './neutralPose.js';
import { buildFingerCurlAxes, FINGER_GROUPS } from './fingerPose.js';
import { JOINT_NAMES, relaxedFingerAngleDegrees } from './relaxedHandPose.js';
import { recognizedFingerPreset, fingerCurlSign, SUPPORTED_FINGERS, SIDES } from './fingerDirectionPolicy.js';
import { OrganicIdleScore, NaturalBlink } from './organicIdle.js';
import { AttentionDirector } from './attentionDirector.js';
import { PlantedLegs } from './plantedLegs.js';

const clamp01=x=>Math.max(0,Math.min(1,Number(x)||0));
const deg=x=>THREE.MathUtils.degToRad(x);
const LEFT='left',RIGHT='right';

// LP-02B: resting posture + asynchronous micro-actions, fingers, gaze and blinks.
// Only edits the current rendered pose. No exportable clip, rig or model is changed.
export class LivingPresence {
  constructor(vrm, {sourceName='',randomSeed=null}={}) {
    this.vrm=vrm;
    // Different uncorrelated sequences on each model load, with an explicit
    // seed override for reproducible regression tests and field reports.
    this.randomSeed=Number.isInteger(randomSeed)?randomSeed:
      Math.floor(Math.random()*0x100000000);
    this.enabled=false;
    this.intensity=0.55;
    this.posture=0.92;
    this.handActivity=true;
    this.handRelaxation=0.88;
    this.handPreset=recognizedFingerPreset(sourceName);
    this.fingerDirections={left:this.handPreset.left,right:this.handPreset.right};
    this.fingerOverrides=new Map();
    this.fingerStates=new Map();
    this.gazeActivity=true;
    this.blinkActivity=true;
    this.headActivity=true;
    this.elbowActivity=true;
    this.legActivity=false; // Enable only after visual knee/ground-contact QA.
    this.legIntensity=0.45;
    this.diagnostic=false;
    this.time=0;
    this.fade={x:0,v:0};
    this.states=new Map();
    this.applied=new Map();
    this.appliedPositions=new Map();
    this.headMotor={yaw:{x:0,v:0},pitch:{x:0,v:0}};
    this.elbowMotor={left:{x:0,v:0},right:{x:0,v:0}};
    this.calibration=buildRelaxedArmOffsets(vrm);
    this.fingerCalibration=buildFingerCurlAxes(vrm);
    this.score=new OrganicIdleScore(this.randomSeed);
    this.attention=new AttentionDirector(this.randomSeed ^ 0x35ab127d);
    this.plantedLegs=new PlantedLegs(vrm);
    this.blink=new NaturalBlink(this.randomSeed ^ 0x51c4f00d);
    this.euler=new THREE.Euler(0,0,0,'XYZ');
    this.offset=new THREE.Quaternion();
    this.restOffset=new THREE.Quaternion();
    this.extraElbow=new THREE.Quaternion();
    this.fingerOffset=new THREE.Quaternion();
    this.identity=new THREE.Quaternion();
    this.blinkApplied=null;
    this.gazeTarget=null;
    this.gazeBaseline=null;
    this.gazeBaselineAngles=null;
    this.gazeForward=null;
    this.tmpWorldQ=new THREE.Quaternion();
    this.tmpEye=new THREE.Vector3();
    this.tmpDir=new THREE.Vector3();
    this.tmpRight=new THREE.Vector3();
    this.tmpUp=new THREE.Vector3();
  }
  getDiagnostics(){
    return [...this.calibration.diagnostics,...this.fingerCalibration.diagnostics,
      this.plantedLegs.enabled?'Pies: dos cadenas IK disponibles para anclaje experimental.':
        'Pies: IK deshabilitado — '+this.plantedLegs.failureReason];
  }
  getCapabilities(){
    const mgr=this.vrm?.expressionManager;
    return {
      calibratedFingers:this.fingerCalibration.axes.size,
      blinking:Boolean(mgr?.getValue && (mgr.getValue('blink')!==null ||
        (mgr.getValue('blinkLeft')!==null && mgr.getValue('blinkRight')!==null))),
      lookAt:Boolean(this.vrm?.lookAt?.autoUpdate !== false && this.vrm?.lookAt),
      attention:true,
      sessionSeed:this.randomSeed,
      legIK:this.plantedLegs.enabled,
      footAnchors:this.plantedLegs.legs.size,
    };
  }
  setEnabled(value){
    this.enabled=Boolean(value);
    if(!this.enabled)this.resetOverlay();
  }
  setIntensity(value){if(Number.isFinite(Number(value)))this.intensity=clamp01(value);}
  setPosture(value){if(Number.isFinite(Number(value)))this.posture=clamp01(value);}
  setHandRelaxation(value){if(Number.isFinite(Number(value)))this.handRelaxation=clamp01(value);}
  setLegIntensity(value){if(Number.isFinite(Number(value)))this.legIntensity=clamp01(value);}
  getLegDiagnostics(){return this.plantedLegs.getDiagnostics();}
  setFingerDirection(side,reverse){
    if(SIDES.includes(side))this.fingerDirections[side]=reverse?-1:1;
  }
  setFingerOverride(side,finger,reverse){
    if(!SIDES.includes(side)||!SUPPORTED_FINGERS.includes(finger))return false;
    const key=side+':'+finger;
    if(reverse)this.fingerOverrides.set(key,-1);
    else this.fingerOverrides.delete(key);
    return true;
  }
  getFingerCalibrationState(){
    return {
      preset:this.handPreset.name,
      verifiedBy:this.handPreset.verifiedBy,
      directions:{...this.fingerDirections},
      fingers:Object.fromEntries(SIDES.map(side=>[side,
        Object.fromEntries(SUPPORTED_FINGERS.map(finger=>[
          finger,this.fingerOverrides.get(side+':'+finger)===-1
        ]))])),
    };
  }
  setOptions(opts={}){
    if(typeof opts.hands==='boolean')this.handActivity=opts.hands;
    if(typeof opts.gaze==='boolean')this.gazeActivity=opts.gaze;
    if(typeof opts.blink==='boolean')this.blinkActivity=opts.blink;
    if(typeof opts.head==='boolean')this.headActivity=opts.head;
    if(typeof opts.elbows==='boolean')this.elbowActivity=opts.elbows;
    if(typeof opts.legs==='boolean')this.legActivity=opts.legs;
    if(typeof opts.diagnostic==='boolean')this.diagnostic=opts.diagnostic;
    if(!this.gazeActivity)this.releaseGaze();
    if(!this.blinkActivity)this.restoreBlink();
  }
  releaseGaze(){
    if(this.vrm?.lookAt?.target===this.gazeTarget && this.gazeTarget) {
      const lookAt=this.vrm.lookAt;
      lookAt.target=this.gazeBaseline;
      if(this.gazeBaseline==null){
        if(this.gazeBaselineAngles&&Number.isFinite(this.gazeBaselineAngles.yaw)&&Number.isFinite(this.gazeBaselineAngles.pitch)){
          lookAt.yaw=this.gazeBaselineAngles.yaw;
          lookAt.pitch=this.gazeBaselineAngles.pitch;
        }else lookAt.reset?.();
      }
    }
    this.gazeTarget=null;
    this.gazeBaseline=null;
    this.gazeBaselineAngles=null;
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
    for(const {node,base,applied} of this.appliedPositions.values()){
      if(node.position.distanceToSquared(applied)<1e-12)node.position.copy(base);
    }
    this.appliedPositions.clear();
    this.restoreBlink();
  }
  resetOverlay(){
    this.beforeFrame();
    this.releaseGaze();
    this.fade={x:0,v:0};
    this.states.clear();
    this.fingerStates.clear();
    this.headMotor={yaw:{x:0,v:0},pitch:{x:0,v:0}};
    this.elbowMotor={left:{x:0,v:0},right:{x:0,v:0}};
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
  updateGaze(attention){
    const lookAt=this.vrm?.lookAt;
    if(!this.gazeActivity||!lookAt||lookAt.autoUpdate===false)return;
    if(lookAt.target!=null&&lookAt.target!==this.gazeTarget)return; // external owner
    const head=this.vrm?.humanoid?.getNormalizedBoneNode?.('head');
    if(!head||typeof lookAt.getLookAtWorldPosition!=='function')return;
    if(!this.gazeTarget){
      this.gazeBaseline=lookAt.target??null;
      this.gazeBaselineAngles={yaw:lookAt.yaw,pitch:lookAt.pitch};
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
    // Eye saccades reach a fixation rapidly; the head follows more slowly.
    const factor=clamp01(this.intensity)*(this.diagnostic?1.4:1);
    const remainingYaw=attention.yaw-(this.headActivity?this.headMotor.yaw.x:0);
    const remainingPitch=attention.pitch-(this.headActivity?this.headMotor.pitch.x:0);
    const x=3.5*Math.tan(THREE.MathUtils.clamp(remainingYaw*factor,-deg(16),deg(16)));
    const y=3.5*Math.tan(THREE.MathUtils.clamp(remainingPitch*factor,-deg(9),deg(9)));
    this.gazeTarget.position.copy(origin).addScaledVector(forward,3.5)
      .addScaledVector(right,x).addScaledVector(up,y);
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
    const attention=this.attention.sample(this.time);
    const micro=sampleIdlePose(this.time,activity);
    // The event lanes stay independent: a wrist may recover while fingers
    // barely move, or the head may hold its pose for multiple seconds.
    if(this.handActivity) {
      for(const side of [LEFT,RIGHT]){
        const wrist=score[side+'Wrist'],elbow=score[side+'Elbow'];
        const shoulder=score[side+'Shoulder'];
        micro[side+'Hand']=[0.017*wrist*activity,0.05*wrist*activity,0.028*wrist*activity];
        const arm=micro[side+'LowerArm']||[0,0,0];
        // Elbow flex follows the calibrated anatomical hinge, not arbitrary X.
        micro[side+'LowerArm']=[arm[0],arm[1]+0.006*elbow*activity,arm[2]];
        const clavicle=micro[side+'Shoulder']||[0,0,0];
        micro[side+'Shoulder']=[clavicle[0],clavicle[1]+0.012*shoulder*activity,
          clavicle[2]+0.022*shoulder*activity];
      }
    }
    // Head follows fixation after the eyes (low-frequency critically-damped).
    this.headMotor.yaw=springStep(this.headMotor.yaw,
      this.headActivity?attention.yaw*0.34*activity:0,dt,0.7);
    this.headMotor.pitch=springStep(this.headMotor.pitch,
      this.headActivity?attention.pitch*0.34*activity:0,dt,0.66);
    const head=micro.head||[0,0,0];
    micro.head=[head[0]+this.headMotor.pitch.x*0.76+0.008*score.headTilt*activity,
      head[1]+this.headMotor.yaw.x*0.76,
      head[2]+0.012*score.headTilt*activity];
    const neck=micro.neck||[0,0,0];
    micro.neck=[neck[0]+this.headMotor.pitch.x*0.24,
      neck[1]+this.headMotor.yaw.x*0.24+0.009*score.neck*activity,
      neck[2]];
    for(const side of [LEFT,RIGHT]){
      const goal=this.elbowActivity?Math.abs(score[side+'Elbow'])*activity:0;
      this.elbowMotor[side]=springStep(this.elbowMotor[side],goal,dt,0.85);
    }

    const fingerAngles=new Map();
    if(this.handActivity){
      for(const side of [LEFT,RIGHT]){
        const shared=score[side+'Fingers'];
        for(const finger of FINGER_GROUPS){
          const pulse=score[side+finger];
          for(const [i,joint] of JOINT_NAMES[finger].entries()){
            const role=side+finger+joint;
            if(!this.fingerCalibration.axes.has(role))continue;
            const degrees=relaxedFingerAngleDegrees({
              finger,jointIndex:i,relaxation:this.handRelaxation,blend,
              activity,individualPulse:pulse,sharedPulse:shared,side,
            });
            const target=deg(degrees)*fingerCurlSign(side,finger,this.fingerDirections,this.fingerOverrides);
            const previous=this.fingerStates.get(role)||{x:0,v:0};
            // Muscular tone does not snap instantly when a micro-action begins.
            const smooth=springStep(previous,target,dt,2.0);
            this.fingerStates.set(role,smooth);
            fingerAngles.set(role,smooth.x);
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
        if(this.elbowActivity && (role==='leftLowerArm'||role==='rightLowerArm')){
          const side=role.startsWith('left')?'left':'right';
          this.extraElbow.copy(this.identity).slerp(resting,
            Math.min(0.6,0.58*this.elbowMotor[side].x));
          node.quaternion.multiply(this.extraElbow);
        }
      }
      const curl=this.fingerCalibration.axes.get(role);
      if(curl&&fingerAngles.has(role)){
        this.fingerOffset.setFromAxisAngle(curl,fingerAngles.get(role));
        node.quaternion.multiply(this.fingerOffset);
      }
      node.quaternion.multiply(this.offset).normalize();
      this.applied.set(role,{node,base,applied:node.quaternion.clone()});
    }
    if(this.legActivity && this.plantedLegs.enabled && blend>0.01){
      this.plantedLegs.apply({
        bend:Math.min(1,Math.abs(score.lowerBodyBend)*this.legIntensity*activity),
        lift:Math.min(1,Math.abs(score.footLift)*this.legIntensity*activity),
        liftSide:score.footLift>=0?'left':'right',
        blend,
      },this.applied,this.appliedPositions);
    }
    this.updateGaze(attention);
    this.updateBlink(this.time,blend);
  }
  dispose(){
    this.resetOverlay();
    this.states.clear();
    this.applied.clear();
    this.vrm=null;
  }
}