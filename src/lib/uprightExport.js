import * as THREE from 'three';
import {detectBodyUpDirection,computeVisibleCharacterBounds} from './visibleBounds.js';

// MOTION-05E.1: Rotate the COMPLETE CLONED export scene, not a pelvis bone.
// Skin, outfit, face and static accessories must undergo the same rigid-world
// transform. No inverse bind matrices, vertices or original files are edited.
const MAX_VERTEX_SAMPLES=950;
const finite=v=>[v.x,v.y,v.z].every(Number.isFinite);
function allVisualMeshes(root){
  const meshes=[];root.traverse(n=>{
    if(n.isMesh&&n.geometry?.getAttribute('position')?.count)meshes.push(n);
  });return meshes;
}
function samples(mesh){
  const vertices=mesh.geometry.getAttribute('position').count;
  const step=Math.max(1,Math.floor(vertices/MAX_VERTEX_SAMPLES));
  const points=[],p=new THREE.Vector3();
  for(let i=0;i<vertices;i+=step){
    mesh.getVertexPosition(i,p);
    p.applyMatrix4(mesh.matrixWorld);
    if(!finite(p))
      throw new Error('El modelo tiene vértices no finitos en «'+mesh.name+'».');
    points.push({i,point:p.clone()});
  }
  return points;
}
const dist=(a,b)=>a.distanceTo(b);
export function orientExportUpright(model,{mode='keep'}={}){
  if(!model)throw new Error('No se recibió el modelo de exportación.');
  if(mode==='keep')return {model,report:{mode,changed:false}};
  if(mode!=='upright')
    throw new Error('Modo de orientación desconocido; el FBX original no se modificó.');
  const body=detectBodyUpDirection(model);
  if(!body)
    throw new Error('No se identificaron cabeza y pelvis del esqueleto corporal. '+
      'Para enderezar el FBX de manera segura es necesaria esa referencia anatómica.');
  if(!finite(body.up)||body.up.lengthSq()<1e-8)
    throw new Error('La orientación cabeza-pelvis no es verificable.');
  const from=body.up.clone().normalize();
  const to=new THREE.Vector3(0,1,0);
  const angle=THREE.MathUtils.radToDeg(from.angleTo(to));
  if(!Number.isFinite(angle))
    throw new Error('El eje cabeza-pelvis del FBX tiene orientación inválida.');
  const visualBounds=computeVisibleCharacterBounds(model);
  const pivot=visualBounds?.box?.getCenter(new THREE.Vector3());
  if(!pivot||!finite(pivot))
    throw new Error('No se identificó una posición de referencia de la geometría visible.');
  const transform=new THREE.Quaternion().setFromUnitVectors(from,to);
  // Rotate around the apparent body center, not around (0,0,0), which can be
  // very far away in large FBX coordinate systems.
  const translation=pivot.clone().sub(pivot.clone().applyQuaternion(transform));
  model.updateWorldMatrix(true,true);
  const meshes=allVisualMeshes(model);
  const before=meshes.map(mesh=>({mesh,points:samples(mesh)}));
  const wrapper=new THREE.Group();wrapper.name='ORBI_MIXAMO_UPRIGHT';
  wrapper.quaternion.copy(transform);
  wrapper.position.copy(translation);
  wrapper.add(model);
  wrapper.updateWorldMatrix(true,true);
  let maxError=0,checked=0;
  for(const {mesh,points} of before){
    const now=new THREE.Vector3();
    for(const {i,point} of points){
      mesh.getVertexPosition(i,now);
      now.applyMatrix4(mesh.matrixWorld);
      const expected=point.clone().applyQuaternion(transform).add(translation);
      const error=dist(now,expected);
      maxError=Math.max(maxError,error);
      const limit=1e-4*Math.max(1,point.length(),expected.length());
      if(error>limit)
        throw new Error('Enderezar el modelo alteraría el skin o la geometría de «'+
          (mesh.name||'malla')+'» (desviación '+error.toFixed(5)+
          '). No se generó un FBX deforme.');
      checked++;
    }
  }
  const after=detectBodyUpDirection(wrapper);
  if(!after||after.angleToWorldY>2)
    throw new Error('La exportación sigue inclinada '+
      (after?.angleToWorldY?.toFixed(1)||'?')+
      '° después de enderezar la escena; se bloqueó el FBX.');
  return {model:wrapper,report:{
    mode,changed:angle>0.01,beforeAngle:Number(angle.toFixed(3)),
    afterAngle:Number(after.angleToWorldY.toFixed(3)),
    pivot:pivot.toArray().map(n=>Number(n.toFixed(4))),
    meshesChecked:meshes.length,verticesChecked:checked,
    maxRigidError:Number(maxError.toFixed(7)),
    head:body.head,hips:body.hips,
  }};
}
