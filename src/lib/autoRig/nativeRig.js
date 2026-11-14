// AUTORIG-02A/B: Blender-free marker coordinates and draft skeleton.
// This module intentionally does not perform skinning or modify source models.
export const NATIVE_RIG_SCHEMA = 2;
export const LANDMARKS = Object.freeze({
  pelvis:[.5,.5,.53],spine:[.5,.5,.62],chest:[.5,.5,.75],
  neck:[.5,.5,.83],head:[.5,.5,.9],headTop:[.5,.5,.985],
  leftShoulder:[.38,.5,.77],leftElbow:[.27,.5,.77],
  leftWrist:[.16,.5,.77],leftHand:[.08,.5,.77],
  rightShoulder:[.62,.5,.77],rightElbow:[.73,.5,.77],
  rightWrist:[.84,.5,.77],rightHand:[.92,.5,.77],
  leftHip:[.445,.5,.52],leftKnee:[.445,.5,.3],
  leftAnkle:[.445,.5,.09],leftToe:[.445,.32,.045],
  rightHip:[.555,.5,.52],rightKnee:[.555,.5,.3],
  rightAnkle:[.555,.5,.09],rightToe:[.555,.32,.045],
});

export const BONE_DEFS = Object.freeze([
  ['hips','pelvis','spine',null],
  ['spine','spine','chest','hips'],
  ['chest','chest','neck','spine'],
  ['neck','neck','head','chest'],
  ['head','head','headTop','neck'],
  ['leftClavicle','chest','leftShoulder','chest'],
  ['leftUpperArm','leftShoulder','leftElbow','leftClavicle'],
  ['leftLowerArm','leftElbow','leftWrist','leftUpperArm'],
  ['leftHand','leftWrist','leftHand','leftLowerArm'],
  ['rightClavicle','chest','rightShoulder','chest'],
  ['rightUpperArm','rightShoulder','rightElbow','rightClavicle'],
  ['rightLowerArm','rightElbow','rightWrist','rightUpperArm'],
  ['rightHand','rightWrist','rightHand','rightLowerArm'],
  ['leftUpperLeg','leftHip','leftKnee','hips'],
  ['leftLowerLeg','leftKnee','leftAnkle','leftUpperLeg'],
  ['leftFoot','leftAnkle','leftToe','leftLowerLeg'],
  ['rightUpperLeg','rightHip','rightKnee','hips'],
  ['rightLowerLeg','rightKnee','rightAnkle','rightUpperLeg'],
  ['rightFoot','rightAnkle','rightToe','rightLowerLeg'],
]);

const finitePoint=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const names=Object.keys(LANDMARKS);
export const LANDMARK_NAMES=Object.freeze(names);

export function initialMarkers(bounds){
  const min=bounds?.min, max=bounds?.max;
  if(!min||!max||![min.x,min.y,min.z,max.x,max.y,max.z].every(Number.isFinite))
    throw new Error('El personaje no tiene límites geométricos finitos.');
  const height=max.y-min.y;
  if(height<=1e-6)throw new Error('El personaje no tiene altura suficiente en el eje Y.');
  const centerX=(min.x+max.x)/2, centerZ=(min.z+max.z)/2;
  const width=Math.max(max.x-min.x,height*.15);
  const depth=Math.max(max.z-min.z,height*.12);
  const markers={};
  for(const [name,[x,z,y]] of Object.entries(LANDMARKS)){
    // The AUTORIG-01 preset is Blender Z-up. Convert once to Three.js Y-up.
    markers[name]=[centerX+(x-.5)*width,min.y+y*height,centerZ+(z-.5)*depth];
  }
  return markers;
}

export function validateMarkers(markers){
  const errors=[],warnings=[];
  if(!markers||typeof markers!=='object'||Array.isArray(markers))
    return {ok:false,errors:['No hay marcadores válidos.'],warnings:[]};
  for(const name of names)
    if(!finitePoint(markers[name]))errors.push('Marcador ausente o no finito: '+name);
  if(errors.length)return {ok:false,errors,warnings};
  const h=dist(markers.headTop,markers.rightAnkle)+dist(markers.headTop,markers.leftAnkle);
  const height=Math.max(h/2,1e-6);
  for(const [name,start,end] of BONE_DEFS)
    if(dist(markers[start],markers[end])<=height*.003)
      errors.push('Hueso de longitud casi nula: '+name);
  for(const [a,b] of [['headTop','head'],['head','neck'],['neck','chest'],
    ['chest','spine'],['spine','pelvis'],
    ['leftHip','leftKnee'],['leftKnee','leftAnkle'],
    ['rightHip','rightKnee'],['rightKnee','rightAnkle']]){
    if(markers[a][1]<=markers[b][1])
      warnings.push('Revisar orden vertical entre '+a+' y '+b+'.');
  }
  for(const side of ['left','right']){
    const chain=['Shoulder','Elbow','Wrist','Hand'].map(p=>markers[side+p]);
    if(Math.max(...chain.map(p=>p[1]))-Math.min(...chain.map(p=>p[1]))>height*.16)
      warnings.push('El brazo '+side+' no parece estar en T-Pose.');
  }
  if(markers.leftShoulder[0]>=markers.rightShoulder[0])
    warnings.push('Revisar orientación izquierda/derecha del personaje.');
  return {ok:errors.length===0,errors,warnings};
}

export function skeletonDraft(markers){
  const result=validateMarkers(markers);
  if(!result.ok)throw new Error(result.errors.join(' '));
  return BONE_DEFS.map(([name,start,end,parent])=>({
    name,parent,head:[...markers[start]],tail:[...markers[end]],
  }));
}

export function mirrorMarker(markers,name){
  const pair=name.startsWith('left')?'right'+name.slice(4):
    name.startsWith('right')?'left'+name.slice(5):null;
  if(!pair||!Object.hasOwn(LANDMARKS,pair))
    throw new Error('Selecciona un marcador del lado izquierdo o derecho.');
  if(!finitePoint(markers?.pelvis)||!finitePoint(markers[name]))
    throw new Error('Marcadores de referencia no válidos.');
  return {...markers,[pair]:[
    2*markers.pelvis[0]-markers[name][0],
    markers[name][1],markers[name][2],
  ]};
}

export function exportRigDraft(markers,sourceFile='modelo.glb'){
  const bones=skeletonDraft(markers);
  return {
    schemaVersion:NATIVE_RIG_SCHEMA,
    coordinateSystem:'three-world-y-up',
    status:'SKELETON_DRAFT_NO_SKINNING',
    sourceFilename:String(sourceFile).slice(0,200),
    markerCount:names.length,
    boneCount:bones.length,
    markers:Object.fromEntries(names.map(n=>[n,[...markers[n]]])),
    bones,
    warning:'Esqueleto anatómico sin pesos de skinning. No es un avatar riggeado ni exportación VRM/FBX.',
  };
}

export function importRigDraft(data){
  if(data?.schemaVersion!==NATIVE_RIG_SCHEMA||
      data?.coordinateSystem!=='three-world-y-up'||
      data?.status!=='SKELETON_DRAFT_NO_SKINNING')
    throw new Error('Formato de proyecto AUTORIG-02 incompatible.');
  if(!data.markers||Object.keys(data.markers).length!==names.length)
    throw new Error('El proyecto no contiene exactamente 22 marcadores.');
  const markers=Object.fromEntries(names.map(n=>[n,data.markers[n]]));
  const check=validateMarkers(markers);
  if(!check.ok)throw new Error(check.errors.join(' '));
  return structuredClone(markers);
}
