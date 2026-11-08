import * as THREE from 'three';
import {clone as cloneRig} from 'three/addons/utils/SkeletonUtils.js';
import {skinBoneCount,skinnedMeshes} from './lightweight.js';

// MOTION-05A: Reference pose is captured BEFORE AnimationMixer.play().
// A paused animation is not a bind pose and must never be exported as one.
const angleDegrees=(a,b)=>THREE.MathUtils.radToDeg(a.angleTo(b));
const clean=name=>String(name||'').replace(/^mixamorig\d*[:_]?/i,'')
  .replace(/[^a-z0-9]/gi,'').toLowerCase();
const candidates={
  leftUpperArm:['leftarm','leftupperarm','upperarml','lupperarm'],
  leftLowerArm:['leftforearm','leftlowerarm','forearml','lowerarml','llowerarm'],
  leftHand:['lefthand','handl','lhand'],
  rightUpperArm:['rightarm','rightupperarm','upperarmr','rupperarm'],
  rightLowerArm:['rightforearm','rightlowerarm','forearmr','lowerarmr','rlowerarm'],
  rightHand:['righthand','handr','rhand'],
  hips:['hips','pelvis'],
};
function poseNodes(root){
  const out=[];root.traverse(node=>out.push(node));return out;
}
export function captureReferencePose(root){
  if(!root)throw new Error('No se ha cargado un personaje.');
  const nodes=poseNodes(root);
  return nodes.map(n=>({
    name:n.name,type:n.type,
    position:n.position.toArray(),quaternion:n.quaternion.toArray(),
    scale:n.scale.toArray(),
    morph:n.morphTargetInfluences?Array.from(n.morphTargetInfluences):null,
  }));
}
export function cloneAtReferencePose(root,records){
  if(!root||!Array.isArray(records)||records.length===0)
    throw new Error('Falta la pose de referencia original del personaje.');
  if(!skinnedMeshes(root).length)
    throw new Error('No hay mallas riggeadas (SkinnedMesh) para exportar a Mixamo.');
  const copy=cloneRig(root);
  const nodes=poseNodes(copy);
  if(nodes.length!==records.length)
    throw new Error('La jerarquía del personaje cambió; no se puede restaurar el bind original.');
  nodes.forEach((node,i)=>{
    const source=records[i];
    if(node.name!==source.name||node.type!==source.type)
      throw new Error('La jerarquía original no coincide con la copia de exportación.');
    node.position.fromArray(source.position);
    node.quaternion.fromArray(source.quaternion);
    node.scale.fromArray(source.scale);
    if(source.morph&&node.morphTargetInfluences){
      for(let j=0;j<Math.min(source.morph.length,node.morphTargetInfluences.length);j++)
        node.morphTargetInfluences[j]=source.morph[j];
    }
    node.animations=[];
  });
  // Skin bind matrices, not the final animation frame, own the rest position.
  // Some exporters include root.animations even when animations:[] is passed.
  copy.animations=[];
  copy.updateWorldMatrix(true,true);
  if(!skinnedMeshes(copy).length||skinBoneCount(copy)!==skinBoneCount(root))
    throw new Error('La copia perdió mallas vinculadas o huesos del rig.');
  return copy;
}
function roleBones(root){
  const bones=new Set();
  root.traverse(node=>{
    if(node.isSkinnedMesh)for(const bone of node.skeleton?.bones||[])bones.add(bone);
  });
  const found={};
  for(const [role,aliases] of Object.entries(candidates)){
    const matches=[...bones].filter(bone=>aliases.includes(clean(bone.name)));
    if(matches.length===1)found[role]=matches[0];
  }
  return found;
}
function worldPosition(node){
  return node.getWorldPosition(new THREE.Vector3());
}
function alignSegment(bone,child,target,maxDegrees){
  bone.updateWorldMatrix(true,true);
  const from=worldPosition(child).sub(worldPosition(bone));
  if(from.lengthSq()<1e-10)throw new Error('La longitud de un brazo es demasiado pequeña para calibrarlo.');
  from.normalize();
  const angle=angleDegrees(from,target);
  if(angle>maxDegrees)
    throw new Error('La corrección a pose T requiere '+angle.toFixed(1)+
      '° en «'+bone.name+'»; supera el límite seguro de '+maxDegrees+'°. Usa Blender para calibrar este rig.');
  if(angle>0.001){
    const world=bone.getWorldQuaternion(new THREE.Quaternion());
    const correction=new THREE.Quaternion().setFromUnitVectors(from,target);
    const desired=correction.multiply(world);
    const parent=bone.parent?.getWorldQuaternion(new THREE.Quaternion())||new THREE.Quaternion();
    bone.quaternion.copy(parent.invert().multiply(desired)).normalize();
    bone.updateWorldMatrix(true,true);
  }
  const final=worldPosition(child).sub(worldPosition(bone)).normalize();
  if(angleDegrees(final,target)>2.5)
    throw new Error('La articulación «'+bone.name+'» no quedó horizontal después de la corrección.');
  return angle;
}
export function makeCalibratedTPose(root,{maxUpperArmDegrees=75,maxForearmDegrees=65}={}){
  const rig=roleBones(root),adjustments=[];
  for(const side of ['left','right']){
    const upper=rig[side+'UpperArm'];
    const forearm=rig[side+'LowerArm'];
    const hand=rig[side+'Hand'];
    const pelvis=rig.hips;
    if(!upper||!forearm||!hand||!pelvis)
      throw new Error('No se pudo reconocer el brazo '+side+
        ' completo (brazo superior, antebrazo, mano y caderas). Se conserva la pose original, sin generar una T falsa.');
    root.updateWorldMatrix(true,true);
    const shoulder=worldPosition(upper),hip=worldPosition(pelvis);
    const elbow=worldPosition(forearm);
    // Determine the actual lateral direction from rig geometry, never from
    // left/right name assumptions (FBX import axes can be mirrored).
    let dx=shoulder.x-hip.x;
    if(Math.abs(dx)<1e-4)dx=elbow.x-shoulder.x;
    if(Math.abs(dx)<1e-4)
      throw new Error('No se distingue el eje lateral del brazo '+side+'.');
    const target=new THREE.Vector3(Math.sign(dx),0,0);
    const upperAngle=alignSegment(upper,forearm,target,maxUpperArmDegrees);
    const lowerAngle=alignSegment(forearm,hand,target,maxForearmDegrees);
    adjustments.push({side,upperDegrees:upperAngle,forearmDegrees:lowerAngle});
  }
  root.updateWorldMatrix(true,true);
  return {pose:'T calibrada',adjustments};
}
export function prepareMixamoRig(root,referencePose,{pose='t'}={}){
  if(!['t','reference'].includes(pose))
    throw new Error('Modo de pose no reconocido.');
  const clone=cloneAtReferencePose(root,referencePose);
  try{
    const details=pose==='t'?makeCalibratedTPose(clone):
      {pose:'Referencia original',adjustments:[]};
    return {model:clone,pose:details.pose,adjustments:details.adjustments,
      bones:skinBoneCount(clone),meshes:skinnedMeshes(clone).length};
  }catch(error){
    throw new Error('No se exportó un FBX en T dudoso. '+error.message);
  }
}
export function exportableClipJSON(clip,{rigName='personaje',rigBones=0}={}){
  if(!clip?.isAnimationClip||!clip.tracks.length)
    throw new Error('Selecciona una animación válida para guardarla.');
  return JSON.stringify({
    format:'orbi.motion.clip.v1',
    sourceRig:{name:String(rigName).slice(0,120),boneCount:rigBones},
    clip:THREE.AnimationClip.toJSON(clip),
    compatibility:'Requiere esqueleto y nombres de pistas compatibles. No es un FBX ni un archivo de Mixamo.',
  },null,2);
}
