import * as THREE from 'three';

// Calibrate each normalized humanoid finger axis from rest geometry.
// Never rotate spring-bone chains or assume that local X is the finger hinge.
export const FINGER_GROUPS=Object.freeze(['Thumb','Index','Middle','Ring','Little']);
const JOINTS={
  Thumb:['Metacarpal','Proximal','Distal'],
  Index:['Proximal','Intermediate','Distal'],
  Middle:['Proximal','Intermediate','Distal'],
  Ring:['Proximal','Intermediate','Distal'],
  Little:['Proximal','Intermediate','Distal'],
};
export function buildFingerCurlAxes(vrm) {
  const axes=new Map(), diagnostics=[];
  const h=vrm?.humanoid;
  if(!vrm?.scene||!h?.getNormalizedBoneNode)return {axes,diagnostics};
  vrm.scene.updateWorldMatrix(true,true);
  const localQuaternion=new THREE.Quaternion();
  const worldNormal=new THREE.Vector3();
  const forward=new THREE.Vector3();
  const across=new THREE.Vector3();
  for(const side of ['left','right']) {
    const hand=h.getNormalizedBoneNode(side+'Hand');
    const index=h.getNormalizedBoneNode(side+'IndexProximal');
    const little=h.getNormalizedBoneNode(side+'LittleProximal');
    const middle=h.getNormalizedBoneNode(side+'MiddleProximal');
    if(!hand||!index||!little||!middle){diagnostics.push(side+': datos insuficientes para calibrar palma.');continue;}
    const wrist=hand.getWorldPosition(new THREE.Vector3());
    across.subVectors(index.getWorldPosition(new THREE.Vector3()),little.getWorldPosition(new THREE.Vector3()));
    forward.subVectors(middle.getWorldPosition(new THREE.Vector3()),wrist);
    worldNormal.crossVectors(across,forward);
    if(worldNormal.lengthSq()<1e-10){diagnostics.push(side+': palma degenerada; dedos sin ajuste.');continue;}
    worldNormal.normalize();
    // Prefer the visible-facing side; small angles still require a visual QA
    // for non-standard hand rigs and special thumb orientation.
    const face=new THREE.Vector3(0,0,1).applyQuaternion(vrm.scene.getWorldQuaternion(new THREE.Quaternion()));
    if(worldNormal.dot(face)<0)worldNormal.negate();
    let calibrated=0;
    for(const finger of FINGER_GROUPS) {
      const roles=JOINTS[finger].map(part=>side+finger+part);
      const nodes=roles.map(role=>h.getNormalizedBoneNode(role));
      for(let i=0;i<nodes.length;i++){
        const joint=nodes[i];
        if(!joint)continue;
        const child=nodes[i+1];
        const axisWorld=new THREE.Vector3();
        let along=null;
        if(child){
          along=child.getWorldPosition(new THREE.Vector3()).sub(joint.getWorldPosition(new THREE.Vector3()));
        } else if(i>0&&nodes[i-1]) {
          along=joint.getWorldPosition(new THREE.Vector3()).sub(nodes[i-1].getWorldPosition(new THREE.Vector3()));
        }
        if(!along||along.lengthSq()<1e-10)continue;
        along.normalize();
        axisWorld.crossVectors(along,worldNormal);
        if(axisWorld.lengthSq()<1e-10)continue;
        axisWorld.normalize();
        joint.getWorldQuaternion(localQuaternion);
        const axisLocal=axisWorld.applyQuaternion(localQuaternion.clone().invert()).normalize();
        axes.set(roles[i],axisLocal);
        calibrated++;
      }
    }
    diagnostics.push(side+': '+calibrated+' articulaciones de dedos calibradas.');
  }
  return {axes,diagnostics};
}
