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
  // Three.js Skeleton.pose() writes each bone's LOCAL matrix using the
  // inverse world matrix of its BONE parent. If the topmost bone lives inside
  // a transformed FBX Group (e.g. scale 100 / axis conversion) it assumes
  // that the Group is identity and incorrectly leaves the root in world space.
  //
  // Instead solve local bind transforms relative to the REAL scene parent,
  // including Groups and other non-Bone FBX transform nodes. Work from parent
  // to child. This mutates ONLY the caller's cloned rig.
  const ordered=[...matrixTargets.keys()].sort((a,b)=>{
    const depth=node=>{
      let n=node,d=0;
      while(n?.parent){d++;n=n.parent;}
      return d;
    };
    return depth(a)-depth(b);
  });
  const local=new THREE.Matrix4();
  const reconstructed=new THREE.Matrix4();
  const parentInverse=new THREE.Matrix4();
  const v=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();
  let maxDecompositionError=0;
  let changed=0;
  for(const bone of ordered){
    const desired=matrixTargets.get(bone);
    // The physical bind hierarchy cannot be restored faithfully if a
    // non-indexed BONE ancestor is animated but absent from all skin palettes.
    for(let parent=bone.parent;parent;parent=parent.parent){
      if(parent.isBone&&!matrixTargets.has(parent))
        throw new Error('No se puede restaurar «'+bone.name+
          '»: el hueso padre «'+parent.name+
          '» no pertenece a la paleta de bind verificable.');
    }
    bone.parent?.updateWorldMatrix(true,false);
    const parentWorld=bone.parent?.matrixWorld;
    if(parentWorld){
      if(Math.abs(parentWorld.determinant())<1e-18)
        throw new Error('El padre de «'+bone.name+
          '» tiene una transformación FBX singular; no se puede invertir.');
      parentInverse.copy(parentWorld).invert();
      local.multiplyMatrices(parentInverse,desired);
    }else local.copy(desired);
    if(!finiteMatrix(local))
      throw new Error('La matriz local de bind de «'+bone.name+'» no es finita.');
    // Matrix4.decompose() can silently discard SHEAR, a common issue under
    // nonuniform-scaled FBX ancestry. Verify a full matrix reconstruction.
    local.decompose(v,q,s);
    if(![...v.toArray(),...q.toArray(),...s.toArray()].every(Number.isFinite))
      throw new Error('La transformación de «'+bone.name+
        '» no se puede descomponer en posición, rotación y escala válidas.');
    reconstructed.compose(v,q,s);
    const reconstructionError=worldMatrixError(reconstructed,local);
    maxDecompositionError=Math.max(maxDecompositionError,reconstructionError);
    if(reconstructionError>MATRIX_TOLERANCE)
      throw new Error('La pose de bind de «'+bone.name+
        '» contiene cizallamiento o escalado FBX no representable sin deformación '+
        '(desviación '+reconstructionError.toFixed(5)+
        '). Se requiere corregir ese rig en Blender.');
    const before=bone.matrixWorld.clone();
    bone.position.copy(v);
    bone.quaternion.copy(q).normalize();
    bone.scale.copy(s);
    bone.updateMatrix();
    bone.updateWorldMatrix(false,false);
    if(worldMatrixError(before,bone.matrixWorld)>1e-5)changed++;
  }
  root.updateWorldMatrix(true,true);
  let maxError=0;
  for(const [bone,desired] of matrixTargets){
    const error=worldMatrixError(bone.matrixWorld,desired);
    maxError=Math.max(maxError,error);
    if(error>MATRIX_TOLERANCE)
      throw new Error('La pose de bind de «'+bone.name+
        '» no coincide después de resolver la matriz de su padre real '+
        '(desviación '+error.toFixed(5)+
        '). Revisa las matrices FBX, no se modificó el archivo original.');
    if(!finiteMatrix(bone.matrixWorld))
      throw new Error('La pose de bind produjo una matriz no finita: «'+bone.name+'».');
  }
  // At true bind pose, each skeleton palette product B_world × B_inverse
  // should be the identity, even when the scene root has a large scale.
  const identity=new THREE.Matrix4();
  let maxPaletteError=0;
  for(const mesh of skins){
    const skeleton=mesh.skeleton;
    for(let i=0;i<skeleton.bones.length;i++){
      const palette=skeleton.bones[i].matrixWorld.clone()
        .multiply(skeleton.boneInverses[i]);
      const error=worldMatrixError(palette,identity);
      maxPaletteError=Math.max(maxPaletteError,error);
      if(error>MATRIX_TOLERANCE)
        throw new Error('La matriz de skinning de bind no es identidad en «'+
          skeleton.bones[i].name+'» de «'+mesh.name+
          '» (desviación '+error.toFixed(5)+
          '). Se bloqueó la exportación para evitar deformaciones.');
    }
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
    maxBindError:Number(maxError.toFixed(7)),
    maxPaletteError:Number(maxPaletteError.toFixed(7)),
    maxDecompositionError:Number(maxDecompositionError.toFixed(7)),
    bonesAdjusted:changed,verticesChecked,
    angleBefore:angleBefore===null?null:Number(angleBefore.toFixed(1)),
    angleAfter:angleAfter===null?null:Number(angleAfter.toFixed(1)),
    sourceWasNotNeutral:angleBefore!==null&&angleAfter!==null&&
      Math.abs(angleAfter-angleBefore)>15};
}
