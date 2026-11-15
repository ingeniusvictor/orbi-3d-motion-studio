import * as THREE from 'three';

// MOTION-06: isolated, non-destructive browser adapter for the TWO known LUMIA
// Mixamo sources. The certified Python V3/V4 is kept as the golden reference.
// Do not silently interpret a generic Y-Bot or arbitrary humanoid as LUMIA.
const CORE = {
  J_Bip_C_Hips:'V8_Bip001-Pelvis',
  J_Bip_C_Spine:'V8_Bip001-Spine',
  J_Bip_C_Chest:'V8_Bip001-Spine1',
  J_Bip_C_UpperChest:'V8_Bip001-Spine2',
  J_Bip_C_Neck:'V8_Bip001-Neck',
  J_Bip_C_Head:'J_Bip_C_Head',
};
for(const [s,t] of [['L','L'],['R','R']]){
  for(const [a,b] of [
    ['Shoulder','Clavicle'],['UpperArm','UpperArm'],['LowerArm','Forearm'],
    ['Hand','Hand'],['UpperLeg','Thigh'],['LowerLeg','Calf'],
    ['Foot','Foot'],['ToeBase','Toe0'],
  ]) CORE['J_Bip_'+s+'_'+a]='V8_Bip001-'+t+'-'+b;
  for(const [a,b] of [
    ['Thumb','Finger0'],['Index','Finger1'],['Middle','Finger2'],
    ['Ring','Finger3'],['Little','Finger4'],
  ]) for(const [i,suffix] of ['','1','2'].entries())
    CORE['J_Bip_'+s+'_'+a+(i+1)]='V8_Bip001-'+t+'-'+b+suffix;
}
export const LUMIA_MIXAMO_PROFILES=Object.freeze({
  ORIGINAL_155:'lumia-original-155',
  ADULT_D_162:'lumia-adult-d-162',
});
const req=['J_Bip_C_Hips','J_Bip_C_Spine','J_Bip_C_Head',
  'J_Bip_L_UpperArm','J_Bip_R_UpperArm','J_Bip_L_UpperLeg','J_Bip_R_UpperLeg'];

export function skinBoneIndex(root){
  if(!root?.traverse) throw new Error('Se requiere un personaje cargado.');
  let best=[];
  root.traverse(node=>{
    const bones=node.isSkinnedMesh?node.skeleton?.bones||[]:[];
    if(bones.length>best.length)best=bones;
  });
  if(!best.length)root.traverse(node=>{if(node.isBone)best.push(node);});
  return new Map(best.filter(b=>b?.isBone&&b.name).map(b=>[b.name,b]));
}

export function identifyMixamoProfile(sourceRoot,targetRoot){
  const src=skinBoneIndex(sourceRoot),tgt=skinBoneIndex(targetRoot);
  if(tgt.size!==346 || !tgt.has('V8_root') || !tgt.has('V8_Bip001-Pelvis')
    || !tgt.has('J_Bip_C_Head'))
    throw new Error('Este perfil necesita la LUMIA V06B maestra con 346 huesos.');
  const missing=req.filter(n=>!src.has(n));
  if(missing.length)throw new Error('El FBX no corresponde al rig LUMIA compatible: '+missing.join(', '));
  if(src.size!==155 && src.size!==162)
    throw new Error('Origen no certificado: se esperaban 155 o 162 huesos, hay '+src.size+'.');
  if(src.size===155 && ![...src.keys()].some(n=>n.startsWith('HairJoint-')))
    throw new Error('El rig de 155 huesos carece de la estructura facial/cabello esperada.');
  if(src.size===162 && ![...src.keys()].some(n=>n.startsWith('V8_Bone-')))
    throw new Error('El rig D de 162 huesos no contiene los correctores V8 esperados.');
  return {id:src.size===155?LUMIA_MIXAMO_PROFILES.ORIGINAL_155:
    LUMIA_MIXAMO_PROFILES.ADULT_D_162,sourceBones:src.size,targetBones:tgt.size};
}

function restIndex(root){
  const index=new Map(),bones=skinBoneIndex(root);
  root.updateWorldMatrix(true,true);
  root.traverse(obj=>{
    if(!obj.isSkinnedMesh)return;
    const sk=obj.skeleton;
    for(let i=0;i<sk.bones.length;i++){
      const b=sk.bones[i];
      if(!b?.name||index.has(b.name))continue;
      const m=sk.boneInverses[i]?.clone().invert()||b.matrixWorld.clone();
      index.set(b.name,{bone:b,matrix:m,
        pos:new THREE.Vector3().setFromMatrixPosition(m),
        rotation:new THREE.Quaternion().setFromRotationMatrix(m)});
    }
  });
  for(const [name,b] of bones){
    if(!index.has(name)){
      const m=b.matrixWorld.clone();
      index.set(name,{bone:b,matrix:m,
        pos:new THREE.Vector3().setFromMatrixPosition(m),
        rotation:new THREE.Quaternion().setFromRotationMatrix(m)});
    }
  }
  return index;
}
function timesForClip(clip){
  const times=new Set([0,clip.duration]);
  for(const track of clip.tracks)for(const t of track.times){
    if(t>=0&&t<=clip.duration&&Number.isFinite(t))times.add(+t.toFixed(6));
  }
  const a=[...times].sort((x,y)=>x-y);
  if(a.length>4000)throw new Error('Clip con demasiadas muestras: '+a.length);
  return a;
}
function calcToeJitter(qs){
  if(qs.length<2)return {max:0,p95:0,anomalous:false};
  const speeds=[];
  for(let i=1;i<qs.length;i++)
    speeds.push(THREE.MathUtils.radToDeg(qs[i-1].angleTo(qs[i])));
  const sorted=[...speeds].sort((a,b)=>a-b);
  const max=sorted.at(-1),p95=sorted[Math.floor((sorted.length-1)*.95)];
  return {max,p95,anomalous:max>60&&p95>35};
}
export function diagnoseToeTracks(clip){
  const result={};
  for(const side of ['L','R']){
    const name='V8_Bip001-'+side+'-Toe0';
    const track=clip.tracks.find(t=>t.name.endsWith('.quaternion') &&
      (t.name===name+'.quaternion'||t.userData?.boneName===name));
    if(!track)continue;
    const quats=[];
    for(let i=0;i<track.values.length;i+=4)quats.push(
      new THREE.Quaternion().fromArray(track.values,i).normalize());
    result[side]=calcToeJitter(quats);
  }
  return result;
}

// Source and target can have different rest axes. Sample the SOURCE in its
// actual animated hierarchy, then transfer global rest-relative rotations.
// Target skin, inverse binds, node hierarchy and source tracks stay untouched.
export function retargetMixamoToV06B({sourceRoot,sourceClip,targetRoot,
  pivot='anchored',toes='auto'}={}){
  if(!(sourceClip instanceof THREE.AnimationClip)||!sourceClip.tracks.length)
    throw new Error('El FBX no incluye una animación válida.');
  if(!['anchored','preserve-stage'].includes(pivot) ||
      !['auto','keep','lock'].includes(toes))
    throw new Error('Opciones de transferencia no reconocidas.');
  const profile=identifyMixamoProfile(sourceRoot,targetRoot);
  const si=restIndex(sourceRoot),ti=restIndex(targetRoot),srcBones=skinBoneIndex(sourceRoot);
  const sourceLookup=new Map(srcBones),targetLookup=skinBoneIndex(targetRoot);
  const mapping=new Map();
  for(const [s,t] of Object.entries(CORE))if(si.has(s)&&ti.has(t))mapping.set(t,s);
  for(const s of si.keys()){
    if((s.startsWith('HairJoint-')||s.startsWith('J_Adj_')||
      (profile.id===LUMIA_MIXAMO_PROFILES.ADULT_D_162&&s.startsWith('V8_')))
      && ti.has(s))mapping.set(s,s);
  }
  const times=timesForClip(sourceClip);
  const mixer=new THREE.AnimationMixer(sourceRoot);
  const action=mixer.clipAction(sourceClip);action.setLoop(THREE.LoopOnce,1);
  action.clampWhenFinished=true;action.play();
  const targetOrder=[],targetChildren=[];
  targetRoot.traverse(n=>{if(n.isBone)targetOrder.push(n);});
  const qYaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),
    profile.id===LUMIA_MIXAMO_PROFILES.ORIGINAL_155?Math.PI:0);
  const qYawInv=qYaw.clone().invert();
  const calib=new Map();
  if(profile.id===LUMIA_MIXAMO_PROFILES.ORIGINAL_155){
    for(const side of ['L','R']){
      for(const [a,b,mult] of [['Shoulder','UpperArm',.5],
        ['UpperArm','LowerArm',1],['LowerArm','Hand',1]]){
        const s='J_Bip_'+side+'_'+a,sc='J_Bip_'+side+'_'+b;
        const t=CORE[s],tc=CORE[sc];
        if(!si.has(s)||!si.has(sc)||!ti.has(t)||!ti.has(tc))continue;
        const sv=si.get(sc).pos.clone().sub(si.get(s).pos).normalize()
          .applyQuaternion(qYaw);
        const tv=ti.get(tc).pos.clone().sub(ti.get(t).pos).normalize();
        const correction=new THREE.Quaternion().setFromUnitVectors(tv,sv);
        calib.set(t,new THREE.Quaternion().slerp(correction,mult));
      }
    }
  }
  const root=targetLookup.get('V8_root'),pelvis=targetLookup.get('V8_Bip001-Pelvis');
  const sourceMaster=sourceRoot.getObjectByName?.('LUMIA_FULL_SKIN_1');
  const srcHips=sourceLookup.get('J_Bip_C_Hips');
  const master=sourceMaster||srcHips;
  if(!root||!pelvis||!master)
    throw new Error('No se pudo identificar el controlador principal de Mixamo.');
  const sourceMasterRest=new THREE.Quaternion();
  const originalMasterQuaternion=master.getWorldQuaternion(sourceMasterRest);
  const masterRestPos=master.getWorldPosition(new THREE.Vector3());
  const targetRootRest=ti.get('V8_root').rotation;
  const rootToPelvis=ti.get('V8_Bip001-Pelvis').pos.clone()
    .sub(ti.get('V8_root').pos);
  const targetLocalRest=new Map();
  for(const bone of targetOrder){
    const rb=ti.get(bone.name);
    if(!rb)continue;
    const parent=bone.parent?.isBone?ti.get(bone.parent.name):null;
    targetLocalRest.set(bone, parent?
      parent.rotation.clone().invert().multiply(rb.rotation):
      rb.rotation.clone());
  }
  const values=new Map(),quatHistory=new Map();
  for(const bone of targetOrder)if(mapping.has(bone.name)||bone===root){
    values.set(bone.name,[]);quatHistory.set(bone.name,[]);
  }
  const rootTr=[],profileWarnings=[];
  let appliedSamples=0;
  try{
    for(const time of times){
      mixer.setTime(time);sourceRoot.updateWorldMatrix(true,true);
      const worldOut=new Map();
      const masterQ=master.getWorldQuaternion(new THREE.Quaternion());
      const masterDelta=masterQ.multiply(originalMasterQuaternion.clone().invert());
      const rootDelta=qYaw.clone().multiply(masterDelta).multiply(qYawInv);
      const masterPos=master.getWorldPosition(new THREE.Vector3());
      const stage=masterPos.sub(masterRestPos);
      const stageDelta=stage.applyQuaternion(qYaw);
      for(const bone of targetOrder){
        const rest=ti.get(bone.name);if(!rest)continue;
        const parent=bone.parent?.isBone?worldOut.get(bone.parent):null;
        const parentWorld=parent|| (bone.parent?.getWorldQuaternion?.(new THREE.Quaternion())||new THREE.Quaternion());
        let local;
        if(bone===root){
          local=targetLocalRest.get(bone).clone().premultiply(rootDelta);
        }else if(mapping.has(bone.name)){
          const sb=sourceLookup.get(mapping.get(bone.name));
          if(!sb)continue;
          const sq=sb.getWorldQuaternion(new THREE.Quaternion());
          const rel=sq.multiply(si.get(sb.name).rotation.clone().invert());
          const delta=qYaw.clone().multiply(rel).multiply(qYawInv);
          const desired=rest.rotation.clone()
            .premultiply(calib.get(bone.name)||new THREE.Quaternion())
            .premultiply(delta);
          local=parentWorld.clone().invert().multiply(desired);
        }else local=targetLocalRest.get(bone)||new THREE.Quaternion();
        local.normalize();
        worldOut.set(bone,parentWorld.clone().multiply(local));
        if(values.has(bone.name)){
          const previous=quatHistory.get(bone.name).at(-1);
          if(previous && previous.dot(local)<0)local.set(-local.x,-local.y,-local.z,-local.w);
          values.get(bone.name).push(...local.toArray());
          quatHistory.get(bone.name).push(local.clone());
        }
      }
      const rootQ=worldOut.get(root)||new THREE.Quaternion();
      const rotatedPivot=rootToPelvis.clone().applyQuaternion(rootQ);
      const offset=rootToPelvis.clone().sub(rotatedPivot);
      const x=offset.x+(pivot==='preserve-stage'?stageDelta.x:0);
      const z=offset.z+(pivot==='preserve-stage'?stageDelta.z:0);
      rootTr.push(x,stageDelta.y,z);
      appliedSamples++;
    }
  }finally{
    action.stop();mixer.stopAllAction();
    // The FBX input is disposable, not the currently displayed LUMIA.
  }
  if(appliedSamples!==times.length)throw new Error('La animación no se muestreó completamente.');
  const toeReport={};
  for(const side of ['L','R']){
    const key='V8_Bip001-'+side+'-Toe0';
    toeReport[side]=calcToeJitter(quatHistory.get(key)||[]);
  }
  const lockToes=toes==='lock'||(toes==='auto'&&
    toeReport.L.anomalous&&toeReport.R.anomalous);
  const tracks=[];
  for(const [name,quaternions] of values){
    if(lockToes&&(name==='V8_Bip001-L-Toe0'||name==='V8_Bip001-R-Toe0'))
      continue;
    const bone=targetLookup.get(name);
    tracks.push(new THREE.QuaternionKeyframeTrack(bone.uuid+'.quaternion',
      times,quaternions));
  }
  tracks.push(new THREE.VectorKeyframeTrack(root.uuid+'.position',times,rootTr));
  const clip=new THREE.AnimationClip(sourceClip.name+' · LUMIA V06B',-1,tracks);
  const report={sourceProfile:profile.id,sourceBones:profile.sourceBones,
    targetBones:346,samples:times.length,duration:clip.duration,
    tracks:tracks.length,toeReport,lockedToes:lockToes,
    pivot,preservesOriginalModel:true,warning:
      'Conversión web experimental: revisar movimiento, pies y cuello en ORBI. '+
      'No equivale a la certificación Golden del motor Python.'};
  return {clip,report};
}
