import * as THREE from 'three';

// AUTORIG-02C.3 — animation QA. Procedural motions below are ORIGINAL ORBI
// test clips, not copyrighted/downloaded Mixamo assets.
const TARGET_MIXAMO_NAMES=Object.freeze({
  hips:'Hips',spine:'Spine',chest:'Spine1',neck:'Neck',head:'Head',
  leftClavicle:'LeftShoulder',leftUpperArm:'LeftArm',
  leftLowerArm:'LeftForeArm',leftHand:'LeftHand',
  rightClavicle:'RightShoulder',rightUpperArm:'RightArm',
  rightLowerArm:'RightForeArm',rightHand:'RightHand',
  leftUpperLeg:'LeftUpLeg',leftLowerLeg:'LeftLeg',leftFoot:'LeftFoot',
  rightUpperLeg:'RightUpLeg',rightLowerLeg:'RightLeg',rightFoot:'RightFoot',
});
const RIG_NAMES=Object.freeze(Object.keys(TARGET_MIXAMO_NAMES));
export const QA_MOTION_FPS=30;

export function mixamoJointKey(name){
  const bare=String(name||'').split(/[|:]/).pop()
    .replace(/[^a-z0-9]/gi,'').toLowerCase();
  return bare.replace(/^mixamorig\d*/,'');
}

export function inspectMixamoSource(root){
  if(!root?.traverse)throw new Error('Archivo Mixamo sin jerarquía de huesos.');
  const index=new Map(),duplicates=new Set();
  root.traverse(node=>{
    if(!node.isBone)return;
    const key=mixamoJointKey(node.name);
    if(index.has(key))duplicates.add(key);
    else index.set(key,node);
  });
  return {index,duplicates};
}

/**
 * Maps selected Mixamo bone quaternion tracks to the ORBI 19-bone hierarchy.
 * Preserve world-axis rotation deltas relative to the imported source rest:
 * parentWorldRest * animatedSourceLocalQ * inverse(sourceBoneWorldRest).
 *
 * Our anatomical ORBI rig uses identity bone orientations at rest. We do
 * NOT copy raw source local quaternions (which have different bind axes).
 * Hips translations/root motion intentionally omitted: QA stays in place.
 */
export function retargetMixamoClip(root,clip,{
  minChannels=6,
}={}){
  if(!root?.traverse||!clip?.tracks?.length)
    throw new Error('No hay una animación FBX/GLB con pistas para adaptar.');
  if(!Number.isFinite(clip.duration)||clip.duration<=0||clip.duration>600)
    throw new Error('Duración de animación fuera de límites de seguridad.');
  root.updateWorldMatrix(true,true);
  const {index,duplicates}=inspectMixamoSource(root);
  const required=['hips','spine','leftUpperArm','rightUpperArm',
    'leftUpperLeg','rightUpperLeg'];
  const missing=required.filter(name=>!index.has(
    mixamoJointKey(TARGET_MIXAMO_NAMES[name])));
  if(missing.length)throw new Error(
    'El archivo no parece contener un esqueleto Mixamo completo. Faltan: '+
    missing.join(', '));
  const targetByKey=new Map(RIG_NAMES.map(role=>[
    mixamoJointKey(TARGET_MIXAMO_NAMES[role]),role,
  ]));
  const outTracks=[],roles=new Set();
  const ignored=[];
  const tmp=new THREE.Quaternion(),parentWorld=new THREE.Quaternion(),
    boneWorld=new THREE.Quaternion(),restInv=new THREE.Quaternion();
  let rootMotionOmitted=0;
  for(const track of clip.tracks){
    const match=/^(.+)\.(quaternion|position|scale)$/.exec(track.name);
    if(!match){ignored.push(track.name);continue;}
    const [,sourceName,property]=match;
    const key=mixamoJointKey(sourceName),role=targetByKey.get(key);
    if(property!=='quaternion'){
      if(property==='position'&&key==='hips')rootMotionOmitted++;
      else if(property!=='scale')ignored.push(track.name);
      continue;
    }
    if(!role){ignored.push(track.name);continue;}
    if(duplicates.has(key))throw new Error(
      'Articulación Mixamo duplicada: '+sourceName);
    const node=index.get(key);
    if(!node)throw new Error('La pista anima un hueso ausente: '+sourceName);
    if(roles.has(role))throw new Error('Pistas duplicadas para '+role);
    if(!track.times?.length||track.values.length!==track.times.length*4)
      throw new Error('Pista de cuaterniones incompleta: '+sourceName);
    node.parent?.getWorldQuaternion(parentWorld);
    if(!node.parent)parentWorld.identity();
    node.getWorldQuaternion(boneWorld);
    restInv.copy(boneWorld).invert();
    const values=new Float32Array(track.values.length);
    for(let i=0;i<track.times.length;i++){
      if(!Number.isFinite(track.times[i])||track.times[i]<0||
        (i>0&&track.times[i]<track.times[i-1]))
        throw new Error('Tiempos de fotogramas inválidos en '+sourceName);
      const o=i*4;
      const q=tmp.fromArray(track.values,o);
      if(![q.x,q.y,q.z,q.w].every(Number.isFinite)||q.lengthSq()<1e-8)
        throw new Error('Rotaciones no finitas en '+sourceName);
      q.normalize().premultiply(parentWorld).multiply(restInv).normalize();
      q.toArray(values,o);
    }
    outTracks.push(new THREE.QuaternionKeyframeTrack(
      role+'.quaternion',Float32Array.from(track.times),values));
    roles.add(role);
  }
  if(outTracks.length<minChannels)throw new Error(
    'Se reconocieron '+outTracks.length+' articulaciones animadas. '+
    'Prueba un FBX Mixamo descargado Without Skin.');
  const out=new THREE.AnimationClip(
    'Mixamo QA / '+String(clip.name||'Movimiento').slice(0,90),
    clip.duration,outTracks);
  return {
    clip:out,
    mappedRoles:[...roles],
    ignoredTracks:ignored.length,
    rootMotionOmitted,
    warning:'Adaptación aproximada de '+roles.size+
      ' huesos: traslación de caderas/root motion omitida (en el sitio). '+
      'Verifica orientación, piernas, manos y postura inicial; no exportar como rig definitivo.',
  };
}

function eulerQuat([x,y,z]){
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z,'XYZ'));
}
function makeClip(name,seconds,sample,roles){
  const frames=Math.ceil(seconds*QA_MOTION_FPS),times=new Float32Array(frames+1);
  const tracks=roles.map(role=>({role,values:new Float32Array((frames+1)*4)}));
  for(let frame=0;frame<=frames;frame++){
    const t=(frame/frames)*seconds;
    times[frame]=t;
    const pose=sample(t);
    for(const {role,values} of tracks)
      eulerQuat(pose[role]||[0,0,0]).toArray(values,frame*4);
  }
  return new THREE.AnimationClip(name,seconds,tracks.map(({role,values})=>
    new THREE.QuaternionKeyframeTrack(role+'.quaternion',times,values)));
}

/** Original deterministic multi-joint motion QA without external assets. */
export function createOrbiMotionSamples(){
  const walk=makeClip('ORBI original · Marcha en el sitio',2,t=>{
    const phase=2*Math.PI*t/2;
    const swing=Math.sin(phase),bounce=.035*Math.sin(phase*2);
    return {
      hips:[.03*swing,.015*swing,.018*swing],
      spine:[-.03*swing,.02*swing,0],
      chest:[.02*bounce,0,-.02*swing],
      neck:[.012*swing,0,0],
      leftUpperArm:[0,.28*swing,1.03],
      rightUpperArm:[0,-.28*swing,-1.03],
      leftLowerArm:[.12+.11*Math.max(0,-swing),0,0],
      rightLowerArm:[.12+.11*Math.max(0,swing),0,0],
      leftUpperLeg:[.42*swing,0,0],
      rightUpperLeg:[-.42*swing,0,0],
      leftLowerLeg:[-.48*Math.max(0,-swing),0,0],
      rightLowerLeg:[-.48*Math.max(0,swing),0,0],
      leftFoot:[.13*swing,0,0],
      rightFoot:[-.13*swing,0,0],
    };
  },['hips','spine','chest','neck','leftUpperArm','rightUpperArm',
    'leftLowerArm','rightLowerArm','leftUpperLeg','rightUpperLeg',
    'leftLowerLeg','rightLowerLeg','leftFoot','rightFoot']);
  const squat=makeClip('ORBI original · Sentadilla y brazos',3,t=>{
    const f=(1-Math.cos(2*Math.PI*t/3))/2;
    return {
      hips:[-.26*f,0,0],spine:[.19*f,0,0],chest:[.07*f,0,0],
      neck:[-.04*f,0,0],leftUpperLeg:[-.63*f,0,0],
      rightUpperLeg:[-.63*f,0,0],
      leftLowerLeg:[.87*f,0,0],rightLowerLeg:[.87*f,0,0],
      leftFoot:[-.28*f,0,0],rightFoot:[-.28*f,0,0],
      leftUpperArm:[0,.16*f,.72*f],
      rightUpperArm:[0,-.16*f,-.72*f],
      leftLowerArm:[.25*f,0,0],rightLowerArm:[.25*f,0,0],
    };
  },['hips','spine','chest','neck','leftUpperLeg','rightUpperLeg',
    'leftLowerLeg','rightLowerLeg','leftFoot','rightFoot',
    'leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm']);
  const wave=makeClip('ORBI original · Saludo y giro',3,t=>{
    const f=(1-Math.cos(2*Math.PI*t/3))/2,
      wave=Math.sin(6*Math.PI*t/3)*f;
    return {
      hips:[0,.08*f,0],spine:[0,-.12*f,.06*f],
      chest:[0,-.13*f,.045*f],
      neck:[0,.12*f,0],head:[0,.2*f,.035*wave],
      leftUpperArm:[0,.08*f,1.03*f],
      rightUpperArm:[0,.1*f,-.3*f],
      rightLowerArm:[0,.05*f,-.95*f+.16*wave],
      rightHand:[0,.15*wave,.1*wave],
      leftUpperLeg:[.06*f,0,0],rightUpperLeg:[-.06*f,0,0],
    };
  },['hips','spine','chest','neck','head','leftUpperArm','rightUpperArm',
    'rightLowerArm','rightHand','leftUpperLeg','rightUpperLeg']);
  return [walk,squat,wave];
}
