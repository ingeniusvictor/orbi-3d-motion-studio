import * as THREE from 'three';
import { boneKey, staticTrackAtRest } from './modelInfo.js';

// Limited preview adapter based on the public three-vrm Mixamo humanoid example.
// This is NOT generic FBX retargeting, rigging, or VRM export.
const aliases = {
  hips:'Hips',spine:'Spine',chest:'Spine1',upperChest:'Spine2',
  neck:'Neck',head:'Head',leftShoulder:'LeftShoulder',
  leftUpperArm:'LeftArm',leftLowerArm:'LeftForeArm',leftHand:'LeftHand',
  rightShoulder:'RightShoulder',rightUpperArm:'RightArm',
  rightLowerArm:'RightForeArm',rightHand:'RightHand',
  leftUpperLeg:'LeftUpLeg',leftLowerLeg:'LeftLeg',leftFoot:'LeftFoot',leftToes:'LeftToeBase',
  rightUpperLeg:'RightUpLeg',rightLowerLeg:'RightLeg',rightFoot:'RightFoot',rightToes:'RightToeBase',
};
for (const side of ['left','right']) {
  const a=side==='left'?'Left':'Right';
  for (const [finger,vrmFinger] of [['Thumb','Thumb'],['Index','Index'],['Middle','Middle'],['Ring','Ring'],['Pinky','Little']]) {
    const suffixes=finger==='Thumb'?['Metacarpal','Proximal','Distal']:['Proximal','Intermediate','Distal'];
    suffixes.forEach((suffix,i)=>{aliases[side+vrmFinger+suffix]=a+'Hand'+finger+(i+1);});
  }
}
const sourceBoneIndex=root=>{
  const index=new Map();
  let largest=[];
  root.traverse(node=>{
    if(node.isSkinnedMesh && node.skeleton?.bones?.length>largest.length)largest=node.skeleton.bones;
  });
  const bones=largest.length ? largest : [];
  if(!bones.length)root.traverse(node=>{if(node.isBone)bones.push(node);});
  for(const bone of bones){
    if(!bone?.isBone)continue;
    const key=boneKey(bone.name);
    if(!index.has(key))index.set(key,[]);
    if(!index.get(key).includes(bone))index.get(key).push(bone);
  }
  return index;
};
const findNamed=root=>{
  const map=new Map();
  root.traverse(node=>{
    if(!node.name)return;
    if(!map.has(node.name))map.set(node.name,[]);
    map.get(node.name).push(node);
  });
  return map;
};
const tempQuat=new THREE.Quaternion();
const worldRest=new THREE.Quaternion();
const parentWorld=new THREE.Quaternion();

/**
 * A guarded Mixamo-FBX -> VRM humanoid preview conversion.
 * Keeps the original VRM intact and only creates animation tracks on
 * normalized VRM humanoid proxies. Non-humanoid moving roots are rejected.
 */
export function adaptFbxToVrm(sourceRoot,vrm,original) {
  const humanoid=vrm?.humanoid;
  if(!humanoid?.getNormalizedBoneNode || !humanoid?.rawHumanBones)
    throw new Error('El VRM no declara un esqueleto humanoide compatible.');
  sourceRoot.updateWorldMatrix(true,true);
  const bones=sourceBoneIndex(sourceRoot);
  const named=findNamed(sourceRoot);
  const roles=new Map();
  for(const role of Object.keys(humanoid.rawHumanBones)) {
    const raw=humanoid.getRawBoneNode(role);
    const norm=humanoid.getNormalizedBoneNode(role);
    if(!raw||!norm)continue;
    const alias=aliases[role];
    const candidates=[raw.name,alias,alias?'mixamorig'+alias:null];
    for(const label of candidates){
      if(!label)continue;
      const list=bones.get(boneKey(label));
      if(list?.length===1){
        roles.set(boneKey(label),{role,node:list[0],target:norm});
        break;
      }
    }
  }
  const coreRoles=new Set([...roles.values()].map(x=>x.role));
  if(!['hips','spine','head','leftUpperArm','rightUpperArm','leftUpperLeg','rightUpperLeg'].every(k=>coreRoles.has(k))){
    throw new Error('El FBX y el VRM usan estructuras humanoides distintas o incompletas. Para esta vista experimental deben reconocerse caderas, columna, cabeza, ambos brazos y piernas; prepara la animación en Mixamo o Blender.');
  }
  const tracks=[];
  let skipped=0;
  const omittedExternalMotion=[];
  const isCharacterGeometry = obj => {
    if(obj?.isSkinnedMesh) return true;
    let found=false;
    obj?.traverse?.(child=>{if(child.isSkinnedMesh)found=true;});
    return found;
  };
  const isVrm0=vrm.meta?.metaVersion==='0';
  const sourceHips=[...roles.values()].find(x=>x.role==='hips')?.node;
  const sourceHeight=Math.abs(sourceHips?.position.y||0);
  const vrmHeight=Math.abs(humanoid.normalizedRestPose?.hips?.position?.[1]||0);
  const scale=sourceHeight>1e-5 && vrmHeight>1e-5 ? Math.min(1000,Math.max(0.0001,vrmHeight/sourceHeight)):null;
  const mappedRoles=new Set();
  for(const track of original.tracks){
    const match=/^(.+)\.(position|quaternion|scale)$/.exec(track.name);
    if(!match){
      skipped++;continue;
    }
    const [ ,name,property]=match;
    const roleInfo=roles.get(boneKey(name));
    if(!roleInfo){
      const obj=named.get(name);
      // A constant mesh/group transform is just FBX export metadata.
      if(obj?.length===1 && staticTrackAtRest(track,obj[0],property)){skipped++;continue;}
      if(bones.has(boneKey(name))){skipped++;continue;} // Unmapped secondary bone channels
      if(obj?.length===1 && isCharacterGeometry(obj[0])){
        // Mixamo With Skin can also keyframe the skinned mesh or its wrapper.
        // VRM has no equivalent of this object's motion. Preview ONLY the
        // transferred humanoid channels, with an explicit loss warning.
        omittedExternalMotion.push(track.name);
        skipped++;
        continue;
      }
      throw new Error('La pista «'+track.name+'» anima un objeto externo al humanoide que no corresponde a la geometría del personaje. No se puede convertir automáticamente.');
    }
    const {role,node,target}=roleInfo;
    if(property==='quaternion'){
      // World-rest correction from three-vrm's official Mixamo example.
      // Parent world orientation maps source local rotations to VRM axes.
      node.getWorldQuaternion(worldRest).invert();
      if(node.parent)node.parent.getWorldQuaternion(parentWorld);
      else parentWorld.identity();
      const values=[];
      for(let i=0;i<track.values.length;i+=4){
        const q=tempQuat.fromArray(track.values,i).premultiply(parentWorld).multiply(worldRest).normalize();
        const arr=q.toArray();
        if(isVrm0){arr[0]*=-1;arr[2]*=-1;}
        values.push(...arr);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(target.name+'.quaternion',track.times,values));
      mappedRoles.add(role);
    }else if(property==='position' && role==='hips') {
      if(scale===null) {
        // Hips without a reliable scale are safe only when unanimated.
        if(staticTrackAtRest(track,node,property)){skipped++;continue;}
        throw new Error('No se pudo determinar la escala de caderas entre el FBX y el VRM.');
      }
      const values=Array.from(track.values,(value,i)=>value*scale*(isVrm0&&i%3!==1?-1:1));
      tracks.push(new THREE.VectorKeyframeTrack(target.name+'.position',track.times,values));
      mappedRoles.add(role);
    }else if(staticTrackAtRest(track,node,property)){
      skipped++;
    }else {
      throw new Error('La pista «'+track.name+'» modifica una posición o escala no compatible con el humanoide VRM.');
    }
  }
  if(!tracks.length || !mappedRoles.has('hips')) {
    throw new Error('La animación no contiene movimientos humanoides reconocibles para el VRM.');
  }
  return {
    clip:new THREE.AnimationClip(original.name||'Mixamo / VRM',original.duration,tracks),
    warning:(omittedExternalMotion.length
      ? 'PREVISUALIZACIÓN APROXIMADA: se omitieron '+omittedExternalMotion.length+' pistas con movimiento propio de la malla FBX ('+omittedExternalMotion.slice(0,3).join(', ')+(omittedExternalMotion.length>3?', …':'')+'). Ese desplazamiento NO está integrado al VRM; no exportes ni utilices como animación definitiva. '
      : 'Previsualización VRM experimental. ')+
      mappedRoles.size+' zonas humanoides transferidas; '+skipped+' pistas no transferidas. Revisa postura, manos y desplazamientos.',
    mappedRoles:mappedRoles.size,
    skipped,
    omittedExternalMotion,
  };
}
