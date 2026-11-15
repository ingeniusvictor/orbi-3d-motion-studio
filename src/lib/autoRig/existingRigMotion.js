import * as THREE from 'three';
import {DEFAULT_MOTION_ADJUSTMENTS,normalizeMotionAdjustments} from './motionAdjustments.js';

// 02D: edits an EXISTING animation without rebuilding the skeleton.
// A source AnimationClip is never mutated. Non-targeted tracks are retained,
// including hips translation, scale, face morphs and auxiliary animation.
const roles=['leftUpperArm','rightUpperArm','head'];
const ROLE_ALIASES={
  leftUpperArm:['leftarm','leftupperarm','leftuparm','upperarml','armupperl',
    'j_bip_l_upperarm','mixamorigleftarm','bip001lupperarm','lupperarm'],
  rightUpperArm:['rightarm','rightupperarm','rightuparm','upperarmr','armupperr',
    'j_bip_r_upperarm','mixamorigrightarm','bip001rupperarm','rupperarm'],
  head:['head','j_bip_c_head','mixamorighead','bip001head'],
};
const key=s=>String(s||'').split(/[|:]/).pop().replace(/[^a-z0-9]/gi,'').toLowerCase();
const qIdentity=new THREE.Quaternion();
const zAxis=new THREE.Vector3(0,0,1);
const yAxis=new THREE.Vector3(0,1,0);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const armSpaceRad=number=>THREE.MathUtils.degToRad(
  number>=50?(number-50)*.7:(number-50)*.4);
export function existingRigBones(model){
  if(!model?.traverse)return [];
  const bones=[];
  model.traverse(node=>{if(node.isBone)bones.push(node);});
  return bones;
}
export function detectExistingRigRoles(model){
  const bones=existingRigBones(model);
  const detected={leftUpperArm:'',rightUpperArm:'',head:''};
  for(const role of roles){
    const matches=bones.filter(b=>ROLE_ALIASES[role].map(key).includes(key(b.name)));
    if(matches.length===1)detected[role]=matches[0].name;
  }
  return {detected,bones:bones.map(b=>({name:b.name,uuid:b.uuid}))};
}
// Called only BEFORE starting the original AnimationMixer; the source rest
// transformations should not be inferred from a currently animated frame.
export function captureExistingRigRest(model){
  const rest=new Map();
  model?.updateWorldMatrix(true,true);
  for(const bone of existingRigBones(model)){
    const world=new THREE.Quaternion(),parentWorld=new THREE.Quaternion();
    bone.getWorldQuaternion(world);
    if(bone.parent)bone.parent.getWorldQuaternion(parentWorld);
    rest.set(bone.uuid,{
      local:bone.quaternion.toArray(),
      world:world.toArray(),
      parentWorld:parentWorld.toArray(),
    });
  }
  return rest;
}
function indexBones(model){
  const exact=new Map(),uuids=new Map(),canon=new Map();
  for(const bone of existingRigBones(model)){
    if(!exact.has(bone.name))exact.set(bone.name,[]);
    exact.get(bone.name).push(bone);
    uuids.set(bone.uuid,bone);
    const k=key(bone.name);
    if(!canon.has(k))canon.set(k,[]);
    canon.get(k).push(bone);
  }
  return {exact,uuids,canon};
}
function lookupBone(index,trackNode){
  if(index.uuids.has(trackNode))return index.uuids.get(trackNode);
  const named=index.exact.get(trackNode);
  if(named?.length===1)return named[0];
  const canonical=index.canon.get(key(trackNode));
  if(canonical?.length===1)return canonical[0];
  return null;
}
function selectRoleBones(index,roleNames){
  const result={};
  for(const role of roles){
    if(!roleNames[role])continue;
    const found=lookupBone(index,roleNames[role]);
    if(!found)throw new Error('Articulación no encontrada: '+roleNames[role]);
    result[role]=found;
  }
  if(result.leftUpperArm&&result.rightUpperArm&&
    result.leftUpperArm===result.rightUpperArm)
    throw new Error('Los brazos izquierdo y derecho no pueden ser el mismo hueso.');
  return result;
}
const nameProperty=trackName=>{
  const pos=trackName.lastIndexOf('.');
  return pos<1?{node:'',property:''}:
    {node:trackName.slice(0,pos),property:trackName.slice(pos+1)};
};
function mirrorBoneName(name,index){
  const original=lookupBone(index,name);
  if(!original)return null;
  let opposite=null;
  for(const [from,to] of [['Left','Right'],['Right','Left'],['left','right'],
    ['right','left'],['LEFT','RIGHT'],['RIGHT','LEFT']]){
    if(original.name.includes(from)){
      const candidate=original.name.replace(from,to);
      const match=index.exact.get(candidate);
      if(match?.length===1)opposite=match[0];
      break;
    }
  }
  if(!opposite){
    const pairs=[['_L','_R'],['_R','_L'],['.L','.R'],['.R','.L'],
      ['_l_','_r_'],['_r_','_l_']];
    for(const [from,to] of pairs){
      if(original.name.includes(from)){
        const match=index.exact.get(original.name.replace(from,to));
        if(match?.length===1)opposite=match[0];
        break;
      }
    }
  }
  return opposite||original;
}
function reSampleTrack(track,begin,duration,needsResampling,rate=1){
  if(!needsResampling)return track.clone();
  const frames=Math.max(2,Math.ceil(duration*30));
  if(frames>18000)throw new Error('La animación supera 18.000 muestras.');
  const times=new Float32Array(frames+1);
  const stride=track.getValueSize();
  const values=track.values instanceof Float32Array?
    new Float32Array((frames+1)*stride):new Array((frames+1)*stride);
  const interpolant=track.createInterpolant();
  for(let i=0;i<=frames;i++){
    const t=duration*(i/frames);
    times[i]=t;
    const sample=interpolant.evaluate(begin+t*rate);
    for(let j=0;j<stride;j++)values[i*stride+j]=sample[j];
  }
  return new track.constructor(track.name,times,values,track.getInterpolation());
}
export function editExistingRigClip(original,model,{
  settings=DEFAULT_MOTION_ADJUSTMENTS,
  boneNames,
  rest,
}={}){
  if(!(original instanceof THREE.AnimationClip)||!original.tracks.length||
     !Number.isFinite(original.duration)||original.duration<=0||original.duration>600)
    throw new Error('La animación existente está vacía o tiene duración inválida.');
  const v=normalizeMotionAdjustments(settings);
  const overdrive=v.overdrive===undefined?1:v.overdrive;
  if(typeof overdrive!=='number'||!Number.isFinite(overdrive)||
    overdrive<.25||overdrive>2)
    throw new Error('Overdrive debe estar entre 0,25 y 2.');
  const unchanged=Object.keys(DEFAULT_MOTION_ADJUSTMENTS)
    .every(k=>v[k]===DEFAULT_MOTION_ADJUSTMENTS[k])&&overdrive===1;
  if(unchanged)return {clip:original,changed:false,targets:[]};
  const index=indexBones(model);
  if(!index.uuids.size)throw new Error('El personaje no tiene un esqueleto existente.');
  const named=boneNames||detectExistingRigRoles(model).detected;
  const resolved=selectRoleBones(index,named);
  const needsArm=v.armSpace!==50||v.armSwing!==100;
  if(needsArm&&(!resolved.leftUpperArm||!resolved.rightUpperArm))
    throw new Error('Asigna ambos huesos de brazo superior antes de modificar brazos.');
  if(v.look!==50&&!resolved.head)
    throw new Error('Asigna un hueso de cabeza antes de modificar Look.');
  const duration=original.duration*(v.trimEnd-v.trimStart)/100/overdrive;
  const begin=original.duration*v.trimStart/100;
  if(duration<.05)throw new Error('El recorte es demasiado corto.');
  const trim=v.trimStart!==0||v.trimEnd!==100;
  const timesampled=trim||v.mirror||overdrive!==1;
  const out=[],targets=new Set(),used=new Set(),q=new THREE.Quaternion(),
    worldCorrection=new THREE.Quaternion(),qRest=new THREE.Quaternion(),
    qParent=new THREE.Quaternion(),tmp=new THREE.Quaternion();
  for(const track of original.tracks){
    const {node,property}=nameProperty(track.name);
    const sourceBone=lookupBone(index,node);
    const role=roles.find(role=>sourceBone&&resolved[role]===sourceBone);
    const adjustArm=role==='leftUpperArm'||role==='rightUpperArm';
    const adaptRotation=property==='quaternion'&&sourceBone&&
      ((adjustArm&&needsArm)||(role==='head'&&v.look!==50));
    const resized=reSampleTrack(track,begin,duration,
      timesampled||Boolean(adaptRotation),overdrive);
    // Three.js PropertyBinding uses ':' and '|' as reserved path separators.
    // Resolve such names through a stable bone UUID on the edited COPY only,
    // otherwise browser playback and GLTFExporter can silently skip the track.
    if(sourceBone&&/[:|]/.test(node))
      resized.name=sourceBone.uuid+'.'+property;
    if(sourceBone && v.mirror){
      const opposite=mirrorBoneName(sourceBone.name,index);
      if(!opposite)throw new Error(
        'Mirror no puede identificar el hueso opuesto: '+sourceBone.name);
      resized.name=/[:|]/.test(opposite.name)?
        opposite.uuid+'.'+property:opposite.name+'.'+property;
      if(property==='quaternion'){
        for(let i=0;i<resized.values.length;i+=4){
          resized.values[i+1]*=-1;
          resized.values[i+2]*=-1;
        }
      }else if(property==='position'){
        for(let i=0;i<resized.values.length;i+=3)
          resized.values[i]*=-1;
      }
    }
    if(adaptRotation){
      if(track.getValueSize()!==4)throw new Error('Canal quaternion inválido.');
      const ref=rest?.get(sourceBone.uuid);
      if(!ref)throw new Error('No hay una pose de reposo segura para '+sourceBone.name);
      qRest.fromArray(ref.local);
      qParent.fromArray(ref.parentWorld);
      const axis=(role==='head'?yAxis:zAxis).clone().applyQuaternion(
        qParent.clone().invert()).normalize();
      const offset=role==='head'?THREE.MathUtils.degToRad((v.look-50)*.5):
        armSpaceRad(v.armSpace)*(role==='leftUpperArm'?-1:1);
      worldCorrection.setFromAxisAngle(axis,offset);
      for(let i=0;i<resized.values.length;i+=4){
        q.fromArray(resized.values,i);
        if (![q.x,q.y,q.z,q.w].every(Number.isFinite)||q.lengthSq()<1e-10)
          throw new Error('Cuaterniones inválidos en '+track.name);
        q.normalize();
        if(adjustArm&&v.armSwing!==100){
          tmp.copy(q);
          q.slerpQuaternions(qRest,tmp,v.armSwing/100);
        }
        if(offset!==0)q.premultiply(worldCorrection);
        q.normalize().toArray(resized.values,i);
      }
      targets.add(role);
    }
    if(used.has(resized.name))throw new Error(
      'Mirror produjo pistas duplicadas: '+resized.name);
    used.add(resized.name);
    out.push(resized);
  }
  const clip=new THREE.AnimationClip(original.name,duration,out);
  return {clip,changed:true,targets:[...targets],settings:{...v,overdrive}};
}

// Normalize namespaced animation bindings on a COPY for portable GLB export.
// Existing Mixamo clips may use 'mixamorig:Bone' names that GLTFExporter
// cannot reliably bind. This preserves every keyframe and the source library.
export function prepareExistingRigClipForExport(original,model){
  if(!(original instanceof THREE.AnimationClip)||!model?.traverse)
    throw new Error('No se puede preparar el clip para exportación.');
  const index=indexBones(model);
  const objects=[];
  model.traverse(obj=>objects.push(obj));
  let fixed=0;
  const tracks=original.tracks.map(track=>{
    const {node,property}=nameProperty(track.name);
    if(!/[:|]/.test(node))return track;
    const bound=lookupBone(index,node)||objects.find(obj=>
      obj.name===node);
    if(!bound)return track; // QA roundtrip will reject any lost track.
    const copy=track.clone();
    copy.name=bound.uuid+'.'+property;
    fixed++;
    return copy;
  });
  if(!fixed)return original;
  return new THREE.AnimationClip(original.name,original.duration,tracks);
}
