import * as THREE from 'three';

// MOTION-05D — Resting at imported "current transforms" is NOT necessarily
// a neutral pose: an FBX can open with frame-0 motion already baked into the
// bone transforms. Recover the real bind pose from Skeleton.boneInverses.
// Only mutate a deep CLONE prepared for export; never modify source FBX.
const MATRIX_TOLERANCE=2e-3;
const finiteMatrix=m=>m?.elements?.length===16&&m.elements.every(Number.isFinite);
function worldMatrixError(a,b){
  let error=0,scale=1;
  for(let i=0;i<16;i++){
    error=Math.max(error,Math.abs(a.elements[i]-b.elements[i]));
    scale=Math.max(scale,Math.abs(a.elements[i]),Math.abs(b.elements[i]));
  }
  return error/scale;
}
const uniqueSkins=root=>{
  const skins=[];root.traverse(n=>{if(n.isSkinnedMesh)skins.push(n);});
  return skins;
};
function bodyAxis(root){
  const all=uniqueSkins(root).sort((a,b)=>b.skeleton.bones.length-a.skeleton.bones.length);
  const mesh=all[0];if(!mesh)return null;
  const bones=mesh.skeleton?.bones||[];
  const find=(patterns)=>{
    for(const p of patterns){
      const names=bones.filter(b=>p.test(b.name||''));
      if(names.length===1)return names[0];
    }
    return null;
  };
  const head=find([/(?:^|[-_:])head$/i,/^head$/i]);
  const hips=find([/(?:^|[-_:])pelvis$/i,/(?:^|[-_:])hips?$/i,/^hips$/i]);
  if(!head||!hips||head===hips)return null;
  const axis=head.getWorldPosition(new THREE.Vector3()).sub(
    hips.getWorldPosition(new THREE.Vector3()));
  if(axis.lengthSq()<1e-12)return null;
  axis.normalize();
  return THREE.MathUtils.radToDeg(axis.angleTo(new THREE.Vector3(0,1,0)));
}
export function restoreSkinnedBindPose(root){
  if(!root)throw new Error('No hay personaje clonado para restaurar bind pose.');
  const skins=uniqueSkins(root);
  if(!skins.length)throw new Error('El personaje no tiene un esqueleto skinned.');
  root.updateWorldMatrix(true,true);
  const angleBefore=bodyAxis(root);
  const matrixTargets=new Map();
  for(const mesh of skins){
    const bones=mesh.skeleton?.bones||[],inverse=mesh.skeleton?.boneInverses||[];
    if(!bones.length||bones.length!==inverse.length)
      throw new Error('La malla «'+mesh.name+'» tiene una paleta ósea inválida.');
    for(let i=0;i<bones.length;i++){
      const bone=bones[i],bind=inverse[i];
      if(!bone?.isBone||!finiteMatrix(bind)||Math.abs(bind.determinant())<1e-18)
        throw new Error('La pose de bind de «'+mesh.name+'» no contiene matrices válidas.');
      const desired=bind.clone().invert();
      if(!finiteMatrix(desired))
        throw new Error('La pose de bind del hueso «'+bone.name+'» no es finita.');
      const known=matrixTargets.get(bone);
      if(known&&worldMatrixError(known,desired)>MATRIX_TOLERANCE)
        throw new Error('El hueso «'+bone.name+
          '» tiene matrices de bind contradictorias entre mallas. No se forzó la pose.');
      matrixTargets.set(bone,desired);
    }
  }
  // Re-pose each independent skin. For shared proxy bones the inverse targets
  // must already agree (above); the rest pose operation is deterministic.
  for(const mesh of skins)mesh.skeleton.pose();
  root.updateWorldMatrix(true,true);
  let maxError=0,changed=0;
  for(const [bone,desired] of matrixTargets){
    const error=worldMatrixError(bone.matrixWorld,desired);
    maxError=Math.max(maxError,error);
    if(error>MATRIX_TOLERANCE)
      throw new Error('El esqueleto no alcanzó la pose de bind en «'+
        bone.name+'» (diferencia '+error.toFixed(5)+
        '). Puede tener transformaciones FBX externas incompatibles; no se exportó.');
    if(!finiteMatrix(bone.matrixWorld))
      throw new Error('La pose de bind produjo una matriz no finita: «'+bone.name+'».');
    if(error>1e-5)changed++;
  }
  let verticesChecked=0;
  const sample=new THREE.Vector3();
  for(const mesh of skins){
    const count=mesh.geometry?.getAttribute('position')?.count||0;
    if(!count||typeof mesh.getVertexPosition!=='function')
      throw new Error('La malla «'+mesh.name+'» no admite verificación de skin.');
    const step=Math.max(1,Math.floor(count/180));
    for(let i=0;i<count;i+=step){
      mesh.getVertexPosition(i,sample);
      sample.applyMatrix4(mesh.matrixWorld);
      if(!sample.toArray().every(Number.isFinite))
        throw new Error('La restauración del bind deformó la malla «'+
          mesh.name+'» con coordenadas no finitas.');
      verticesChecked++;
    }
  }
  const angleAfter=bodyAxis(root);
  return {mode:'bind',bones:matrixTargets.size,skinnedMeshes:skins.length,
    maxBindError:Number(maxError.toFixed(7)),verticesChecked,
    angleBefore:angleBefore===null?null:Number(angleBefore.toFixed(1)),
    angleAfter:angleAfter===null?null:Number(angleAfter.toFixed(1)),
    sourceWasNotNeutral:angleBefore!==null&&angleAfter!==null&&
      Math.abs(angleAfter-angleBefore)>15};
}
