import * as THREE from 'three';

// LP-02D experimental, local two-bone planted-foot correction.
// Does NOT promise full-body IK, center-of-mass simulation or ground collision.
// The ankle rest positions are anchors; a rare deliberate lift leaves ONE foot
// planted and returns the moved ankle to its original point.
const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
const TEMP_Q=new THREE.Quaternion();
const EPS=1e-8;
function jointTowards(node,child,worldTarget){
  const pivot=node.getWorldPosition(new THREE.Vector3());
  const current=child.getWorldPosition(new THREE.Vector3()).sub(pivot);
  const desired=worldTarget.clone().sub(pivot);
  if(current.lengthSq()<EPS||desired.lengthSq()<EPS)return false;
  const delta=new THREE.Quaternion().setFromUnitVectors(current.normalize(),desired.normalize());
  const world=node.getWorldQuaternion(new THREE.Quaternion());
  const localDelta=world.clone().invert().multiply(delta).multiply(world).normalize();
  node.quaternion.multiply(localDelta).normalize();
  node.updateWorldMatrix(true,true);
  return true;
}
function preferredPole(vrm,upper,knee,ankle,legLength){
  const hip=upper.getWorldPosition(new THREE.Vector3());
  const kneeP=knee.getWorldPosition(new THREE.Vector3());
  const footP=ankle.getWorldPosition(new THREE.Vector3());
  const ray=footP.clone().sub(hip).normalize();
  const original=kneeP.clone().sub(hip);
  original.addScaledVector(ray,-original.dot(ray));
  if(original.lengthSq()>Math.pow(legLength*0.008,2))return original.normalize();
  const front=new THREE.Vector3(0,0,1)
    .applyQuaternion(vrm.scene.getWorldQuaternion(new THREE.Quaternion()));
  front.addScaledVector(ray,-front.dot(ray));
  return front.lengthSq()>EPS?front.normalize():new THREE.Vector3(1,0,0);
}

export class PlantedLegs{
  constructor(vrm){
    this.vrm=vrm;
    this.hips=vrm?.humanoid?.getNormalizedBoneNode?.('hips')||null;
    this.legs=new Map();
    this.enabled=false;
    this.lastError=0;
    this.failureReason='';
    if(!this.hips)return;
    vrm.scene.updateWorldMatrix(true,true);
    for(const side of ['left','right']){
      const h=vrm.humanoid;
      const upper=h.getNormalizedBoneNode(side+'UpperLeg');
      const lower=h.getNormalizedBoneNode(side+'LowerLeg');
      const foot=h.getNormalizedBoneNode(side+'Foot');
      if(!upper||!lower||!foot){this.failureReason='Falta cadena de pierna '+side;this.legs.clear();return;}
      const hipP=upper.getWorldPosition(new THREE.Vector3());
      const kneeP=lower.getWorldPosition(new THREE.Vector3());
      const ankleP=foot.getWorldPosition(new THREE.Vector3());
      const thigh=hipP.distanceTo(kneeP),shin=kneeP.distanceTo(ankleP);
      if(thigh<0.01||shin<0.01){
        this.failureReason='Longitud inválida en '+side;
        this.legs.clear();
        return;
      }
      const length=thigh+shin;
      this.legs.set(side,{upper,lower,foot,thigh,shin,length,
        anchor:ankleP.clone(),baseFootWorld:foot.getWorldQuaternion(new THREE.Quaternion()),
        pole:preferredPole(vrm,upper,lower,foot,length)});
    }
    this.enabled=this.legs.size===2;
  }
  getDiagnostics(){
    return {available:this.enabled,failureReason:this.failureReason,
      anchoredFeet:this.legs.size,maximumError:this.lastError};
  }
  // Returns false without retaining transformed bones when target cannot be solved.
  apply({bend=0,lift=0,liftSide='left',blend=1}={},trackedRotations,trackedPositions){
    if(!this.enabled||!this.hips)return false;
    const strength=clamp(Number(bend)||0,0,1);
    const liftHeight=clamp(Number(lift)||0,0,1);
    const average=[...this.legs.values()].reduce((a,l)=>a+l.length,0)/this.legs.size;
    // 0.45%-0.9% leg length makes space for a slight knee bend.
    const sink=average*(0.0045+0.0045*strength)*clamp(Number(blend)||0,0,1);
    const rootBase=this.hips.position.clone();
    const snapshots=new Map();
    const allBones=[...this.legs.values()].flatMap(l=>[l.upper,l.lower,l.foot]);
    for(const bone of allBones)snapshots.set(bone,bone.quaternion.clone());
    const rollback=()=>{
      this.hips.position.copy(rootBase);
      for(const [node,quat] of snapshots)node.quaternion.copy(quat);
      this.hips.updateWorldMatrix(true,true);
      return false;
    };
    this.hips.position.y-=sink;
    this.hips.updateWorldMatrix(true,true);
    this.lastError=0;
    const targets=new Map();
    for(const [side,leg] of this.legs){
      const dest=leg.anchor.clone();
      // An intentional lift (up to 0.9% of leg length); the other foot
      // always remains at its original world position.
      if(side===liftSide)dest.y+=average*0.009*liftHeight;
      const hip=leg.upper.getWorldPosition(new THREE.Vector3());
      const d=hip.distanceTo(dest);
      if(d>leg.length-0.00001||d<Math.abs(leg.thigh-leg.shin)+0.00001){
        this.failureReason='Objetivo de pie inalcanzable: '+side;
        return rollback();
      }
      targets.set(side,dest);
    }
    for(const [side,leg] of this.legs){
      const dest=targets.get(side);
      const hip=leg.upper.getWorldPosition(new THREE.Vector3());
      const forward=dest.clone().sub(hip);
      const distance=forward.length();
      forward.normalize();
      const axial=(leg.thigh**2-leg.shin**2+distance**2)/(2*distance);
      const radial=Math.sqrt(Math.max(0,leg.thigh**2-axial**2));
      const pole=leg.pole.clone().addScaledVector(forward,-leg.pole.dot(forward));
      if(pole.lengthSq()<EPS){this.failureReason='Plano de flexión degenerado';return rollback();}
      pole.normalize();
      const kneeGoal=hip.clone().addScaledVector(forward,axial).addScaledVector(pole,radial);
      if(!jointTowards(leg.upper,leg.lower,kneeGoal)||
         !jointTowards(leg.lower,leg.foot,dest)){
        this.failureReason='Articulación no resoluble';return rollback();
      }
      // Keep the shoe's orientation stable independently of the knee.
      const parentWorld=leg.foot.parent?.getWorldQuaternion(new THREE.Quaternion())||
        TEMP_Q.identity();
      leg.foot.quaternion.copy(parentWorld.invert().multiply(leg.baseFootWorld)).normalize();
      leg.foot.updateWorldMatrix(true,true);
      const error=leg.foot.getWorldPosition(new THREE.Vector3()).distanceTo(dest);
      this.lastError=Math.max(this.lastError,error);
      if(error>average*0.002){
        this.failureReason='Deslizamiento por error IK: '+side;return rollback();
      }
    }
    // Record all changes only after the full two-leg solve succeeds.
    trackedPositions.set('hips',{node:this.hips,base:rootBase,applied:this.hips.position.clone()});
    for(const [side,leg] of this.legs){
      for(const [role,node] of [[side+'UpperLeg',leg.upper],[side+'LowerLeg',leg.lower],[side+'Foot',leg.foot]]){
        trackedRotations.set(role,{node,base:snapshots.get(node),applied:node.quaternion.clone()});
      }
    }
    this.failureReason='';
    return true;
  }
}
