// LP-02C.2: preview-only attenuation of exaggerated Mixamo *torso* roll.
// Works on normalized VRM spine/chest/upperChest quaternion tracks only.
// Never alter hips, root, legs or shoes: those belong to the source FBX.
import * as THREE from 'three';
import {springStep} from './motionPrimitives.js';
const RAD=Math.PI/180;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const CHANNELS=Object.freeze([
  {role:'spine',maxCorrection:3.0*RAD},
  {role:'chest',maxCorrection:2.0*RAD},
  {role:'upperChest',maxCorrection:1.5*RAD},
]);
const Z=new THREE.Vector3(0,0,1);
const IDENTITY=new THREE.Quaternion();

export function quaternionTrackMean(track) {
  if(!track?.name?.endsWith('.quaternion')||!track.values||
     track.values.length<4||track.values.length%4!==0)return null;
  const v=track.values,base=new THREE.Quaternion().fromArray(v,0).normalize();
  const sum=[0,0,0,0];
  for(let i=0;i<v.length;i+=4){
    const q=new THREE.Quaternion().fromArray(v,i).normalize();
    const s=base.dot(q)<0?-1:1;
    sum[0]+=q.x*s;sum[1]+=q.y*s;sum[2]+=q.z*s;sum[3]+=q.w*s;
  }
  const q=new THREE.Quaternion(...sum);
  return q.lengthSq()>1e-12?q.normalize():base;
}
export function reduceLateralRoll(current,mean,requested,{maxCorrection=3*RAD}={}) {
  if(!current?.isQuaternion||!mean?.isQuaternion)return current?.clone()||null;
  const reduction=clamp(Number(requested)||0,0,1);
  if(reduction<=0)return current.clone();
  const relative=mean.clone().invert().multiply(current).normalize();
  // The q/-q representation must not trigger a 360-degree correction.
  if(relative.w<0)relative.set(-relative.x,-relative.y,-relative.z,-relative.w);
  let twist=new THREE.Quaternion(0,0,relative.z,relative.w);
  if(twist.lengthSq()<1e-12)return current.clone();
  twist.normalize();
  const signed=2*Math.atan2(twist.z,twist.w);
  if(Math.abs(signed)<1e-8)return current.clone();
  const removed=Math.min(Math.abs(signed)*reduction,Math.max(0,maxCorrection));
  const retained=1-removed/Math.abs(signed);
  const swing=relative.clone().multiply(twist.clone().invert());
  twist=IDENTITY.clone().slerp(twist,retained);
  return mean.clone().multiply(swing).multiply(twist).normalize();
}

export class ClipSwayReducer {
  constructor(vrm){
    this.vrm=vrm;
    this.enabled=true;
    this.target=0.60;
    this.state={x:0,v:0};
    this.channels=[];
    this.applied=new Map();
  }
  selectClip(clip){
    this.restore();
    this.channels=[];
    this.state={x:0,v:0};
    if(!clip)return;
    const tracks=new Map(clip.tracks.map(x=>[x.name,x]));
    for(const {role,maxCorrection} of CHANNELS){
      const node=this.vrm?.humanoid?.getNormalizedBoneNode?.(role);
      const track=node&&tracks.get(node.name+'.quaternion');
      const mean=quaternionTrackMean(track);
      if(node&&mean)this.channels.push({role,node,mean,maxCorrection});
    }
  }
  setEnabled(value){this.enabled=Boolean(value);if(!this.enabled)this.restore();}
  setStrength(value){if(Number.isFinite(Number(value)))this.target=clamp(Number(value),0,1);}
  restore(){
    for(const {node,base,applied} of this.applied.values()){
      if(node.quaternion.equals(applied)||
        node.quaternion.angleTo(applied)<0.00001)node.quaternion.copy(base);
    }
    this.applied.clear();
  }
  apply(delta,active){
    if(!active||!this.enabled||this.target===0||!this.channels.length)return 0;
    this.state=springStep(this.state,this.target,delta,0.55);
    const strength=clamp(this.state.x,0,1);
    for(const channel of this.channels){
      const {node,mean,maxCorrection}=channel;
      const base=node.quaternion.clone();
      node.quaternion.copy(reduceLateralRoll(base,mean,strength,{maxCorrection}));
      this.applied.set(channel.role,{node,base,applied:node.quaternion.clone()});
    }
    return strength;
  }
  getStatus(){return {enabled:this.enabled,strength:this.target,controlledBones:this.channels.map(x=>x.role)};}
  dispose(){this.restore();this.channels=[];this.vrm=null;}
}
