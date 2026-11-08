import * as THREE from 'three';
import {clone as cloneRig} from 'three/addons/utils/SkeletonUtils.js';
import {skinBoneCount,skinnedMeshes} from './lightweight.js';
import {consolidateEquivalentSkinRigs} from './rigCanonicalizer.js';
import {prepareAuxiliaryRigForMixamo} from './auxiliaryRig.js';

// MOTION-05A: Reference pose is captured BEFORE AnimationMixer.play().
// A paused animation is not a bind pose and must never be exported as one.
const angleDegrees=(a,b)=>THREE.MathUtils.radToDeg(a.angleTo(b));
const clean=name=>String(name||'').replace(/^mixamorig\d*[:_]?/i,'')
  .replace(/[^a-z0-9]/gi,'').toLowerCase();
const candidates={
  // Extra aliases for VRM-like, Blender, Unreal and Daz human rigs. Never
  // assume a shoulder/clavicle is the upper ARM, or a finger is the hand.
  leftUpperArm:['leftarm','leftupperarm','upperarml','lupperarm',
    'arml','armleft','jbiplupperarm','bip001lupperarm','lshldrbend'],
  leftLowerArm:['leftforearm','leftlowerarm','forearml','lowerarml','llowerarm',
    'lowerarmleft','forearmleft','jbipllowerarm','bip001lforearm','lforearmbend'],
  leftHand:['lefthand','handl','lhand','jblhand','jbiplhand','bip001lhand'],
  rightUpperArm:['rightarm','rightupperarm','upperarmr','rupperarm',
    'armr','armright','jbiprupperarm','bip001rupperarm','rshldrbend'],
  rightLowerArm:['rightforearm','rightlowerarm','forearmr','lowerarmr','rlowerarm',
    'lowerarmright','forearmright','jbiprlowerarm','bip001rforearm','rforearmbend'],
  rightHand:['righthand','handr','rhand','jbiprhand','bip001rhand'],
  hips:['hips','pelvis','hip','jbipchips','rootpelvis'],
};
function poseNodes(root){
  const out=[];root.traverse(node=>out.push(node));return out;
}
// Three's FBXLoader may assign display .type labels that are not preserved
// by SkeletonUtils.clone(). Structural safety depends on actual bone/skin
// classes, hierarchy, and binding—not an arbitrary presentation string.
function structuralKind(node){
  if(node.isBone)return 'bone';
  if(node.isSkinnedMesh)return 'skinnedMesh';
  if(node.isMesh)return 'mesh';
  return 'transform';
}
export function captureReferencePose(root){
  if(!root)throw new Error('No se ha cargado un personaje.');
  const nodes=poseNodes(root);
  return nodes.map(n=>({
    name:n.name,type:n.type,kind:structuralKind(n),
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
    // The loader can supply an unnamed root and the viewer later labels it
    // with the filename. The top-level label is NOT a bone/skin identity.
    // Every descendant still requires its original name and traversal slot.
    const rootLabelOnly=(i===0);
    if(!rootLabelOnly&&node.name!==source.name)
      throw new Error('La copia cambió el nombre del nodo #'+i+
        ' (original: «'+source.name+'», copia: «'+node.name+'»). No se exportó.');
    // A custom FBX .type string may change when a Three class is cloned;
    // only changes to functional Bone/SkinnedMesh/Mesh roles are unsafe.
    if(source.kind&&structuralKind(node)!==source.kind)
      throw new Error('La copia cambió el tipo estructural del nodo #'+i+
        ' («'+source.name+'»). No se exportó.');
    if(!source.kind&&!rootLabelOnly&&node.type!==source.type)
      throw new Error('La copia cambió el tipo del nodo #'+i+
        ' («'+source.name+'»). No se exportó.');
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
function alignSegment(bone,child,target,maxDegrees,poseLabel='T'){
  bone.updateWorldMatrix(true,true);
  const from=worldPosition(child).sub(worldPosition(bone));
  if(from.lengthSq()<1e-10)throw new Error('La longitud de un brazo es demasiado pequeña para calibrarlo.');
  from.normalize();
  const angle=angleDegrees(from,target);
  if(angle>maxDegrees)
    throw new Error('La corrección a pose '+poseLabel+' requiere '+angle.toFixed(1)+
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
    throw new Error('La articulación «'+bone.name+'» no alcanzó la orientación de pose '+poseLabel+'.');
  return angle;
}
function makeCalibratedArmPose(root,{pose='t',maxUpperArmDegrees=75,maxForearmDegrees=65}={}){
  const label=pose==='a'?'A':'T';
  const downRadians=THREE.MathUtils.degToRad(pose==='a'?35:0);
  const rig=roleBones(root),adjustments=[];
  for(const side of ['left','right']){
    const upper=rig[side+'UpperArm'];
    const forearm=rig[side+'LowerArm'];
    const hand=rig[side+'Hand'];
    const pelvis=rig.hips;
    if(!upper||!forearm||!hand||!pelvis){
      const missing=[
        !upper?'brazo superior':null,!forearm?'antebrazo':null,
        !hand?'mano':null,!pelvis?'caderas':null,
      ].filter(Boolean);
      const known=[];root.traverse(node=>{
        if(node.isSkinnedMesh)for(const bone of node.skeleton?.bones||[]){
          if(bone.isBone&&bone.name&&!known.includes(bone.name))known.push(bone.name);
        }
      });
      throw new Error('No se pudo reconocer el brazo '+(side==='left'?'izquierdo':'derecho')+
        ': faltan '+missing.join(', ')+'. Huesos encontrados: '+
        (known.slice(0,18).join(', ')||'ninguno')+
        (known.length>18?'… ('+known.length+' en total)':'')+
        '. Puedes exportar con «Pose de referencia original», sin forzar A/T.');
    }
    root.updateWorldMatrix(true,true);
    const shoulder=worldPosition(upper),hip=worldPosition(pelvis);
    const elbow=worldPosition(forearm);
    // Determine the actual lateral direction from rig geometry, never from
    // left/right name assumptions (FBX import axes can be mirrored).
    let dx=shoulder.x-hip.x;
    if(Math.abs(dx)<1e-4)dx=elbow.x-shoulder.x;
    if(Math.abs(dx)<1e-4)
      throw new Error('No se distingue el eje lateral del brazo '+side+'.');
    const target=new THREE.Vector3(
      Math.sign(dx)*Math.cos(downRadians),-Math.sin(downRadians),0,
    ).normalize();
    const upperAngle=alignSegment(upper,forearm,target,maxUpperArmDegrees,label);
    const lowerAngle=alignSegment(forearm,hand,target,maxForearmDegrees,label);
    adjustments.push({side,upperDegrees:upperAngle,forearmDegrees:lowerAngle});
  }
  root.updateWorldMatrix(true,true);
  return {pose:pose==='a'?'A calibrada (35° descendente)':'T calibrada',
    adjustments};
}
export function makeCalibratedTPose(root,options={}){
  return makeCalibratedArmPose(root,{...options,pose:'t'});
}
export function makeCalibratedAPose(root,options={}){
  return makeCalibratedArmPose(root,{...options,pose:'a'});
}
export function prepareMixamoRig(root,referencePose,{pose='reference',accessoryHandling='strict'}={}){
  if(!['t','a','reference'].includes(pose))
    throw new Error('Modo de pose no reconocido.');
  const clone=cloneAtReferencePose(root,referencePose);
  // Optional, explicitly lossy preparation for an independent clothing rig.
  // Mint ChestBow has 36 bones separate from the body's 340; matching only
  // their root name can NEVER justify skeleton consolidation.
  const accessory=prepareAuxiliaryRigForMixamo(clone,{handling:accessoryHandling});
  // FBXLoader can duplicate the same rig as a separate Bone proxy tree
  // for EACH clothing, hair, body, etc. SkinnedMesh. Collapse only genuinely
  // identical copies before validating a single physical FBX armature.
  const consolidation=consolidateEquivalentSkinRigs(clone);
  try{
    const details=pose==='t'?makeCalibratedTPose(clone):
      pose==='a'?makeCalibratedAPose(clone):
      {pose:'Referencia original (sin modificar)',adjustments:[]};
    return {model:clone,pose:details.pose,adjustments:details.adjustments,
      consolidation,accessory,bones:skinBoneCount(clone),
      meshes:skinnedMeshes(clone).length};
  }catch(error){
    throw new Error('No se exportó una pose '+(pose==='a'?'A':'T')+' dudosa. '+error.message);
  }
}
export function exportableClipJSON(clip,{rigName='personaje',rigBones=0}={}){
  if(!(clip instanceof THREE.AnimationClip)||!clip.tracks.length)
    throw new Error('Selecciona una animación válida para guardarla.');
  return JSON.stringify({
    format:'orbi.motion.clip.v1',
    sourceRig:{name:String(rigName).slice(0,120),boneCount:rigBones},
    clip:THREE.AnimationClip.toJSON(clip),
    compatibility:'Requiere esqueleto y nombres de pistas compatibles. No es un FBX ni un archivo de Mixamo.',
  },null,2);
}
