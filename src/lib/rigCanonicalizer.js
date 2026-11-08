import * as THREE from 'three';

// MOTION-05A.4: Some FBXLoader skins have duplicate skeletons under different
// root offsets even though they represent the same character. A root offset
// is safe to consolidate ONLY when the whole bone palette has one consistent
// translation, each bone has the same parent, and every mesh's effective
// skinning matrix is mathematically preserved.
const DIFF_TOLERANCE=1e-4;
const SAMPLE_LIMIT=160;
const matrixDelta=(a,b)=>{
  let diff=0,scale=1;
  for(let i=0;i<16;i++){
    diff=Math.max(diff,Math.abs(a.elements[i]-b.elements[i]));
    scale=Math.max(scale,Math.abs(a.elements[i]),Math.abs(b.elements[i]));
  }
  return diff/scale;
};
const parentBone=node=>{
  let p=node?.parent;
  while(p&&!p.isBone)p=p.parent;
  return p||null;
};
const parentName=bone=>parentBone(bone)?.name||null;
const uniqueSkins=root=>{
  const skins=[];root.traverse(n=>{if(n.isSkinnedMesh)skins.push(n);});
  return skins;
};
const skinSamples=mesh=>{
  const attr=mesh.geometry?.getAttribute('position');
  if(!attr||!mesh.geometry?.getAttribute('skinIndex')||
    !mesh.geometry?.getAttribute('skinWeight')||
    typeof mesh.applyBoneTransform!=='function'||!attr.count)return null;
  const result=[],n=attr.count;
  const step=Math.max(1,Math.floor(n/SAMPLE_LIMIT));
  for(let i=0;i<n;i+=step){
    const local=mesh.applyBoneTransform(i,new THREE.Vector3());
    result.push({index:i,position:local.clone(),
      world:local.clone().applyMatrix4(mesh.matrixWorld)});
  }
  if((n-1)%step!==0){
    const local=mesh.applyBoneTransform(n-1,new THREE.Vector3());
    result.push({index:n-1,position:local.clone(),
      world:local.clone().applyMatrix4(mesh.matrixWorld)});
  }
  return result;
};
const assertSkinUnchanged=(mesh,samples)=>{
  if(!samples)throw new Error('No se pudo verificar el skin de «'+
    (mesh.name||'malla')+'». No se unificaron huesos.');
  for(const sample of samples){
    const actual=mesh.applyBoneTransform(sample.index,new THREE.Vector3());
    const tolerance=DIFF_TOLERANCE*Math.max(1,sample.position.length());
    if(actual.distanceTo(sample.position)>tolerance)
      throw new Error('La unificación modificaría la deformación de «'+
        (mesh.name||'malla')+'». Se bloqueó el FBX.');
  }
};
const worldBoneBounds=bones=>{
  const box=new THREE.Box3();
  for(const bone of bones)box.expandByPoint(
    bone.getWorldPosition(new THREE.Vector3()));
  const span=box.getSize(new THREE.Vector3()).length();
  return box.expandByScalar(Math.max(0.02,span*0.25));
};
const sampleBounds=samples=>{
  const box=new THREE.Box3();
  for(const sample of samples||[])box.expandByPoint(sample.world);
  return box;
};
const isTranslationOnly=(matrix)=>{
  const e=matrix.elements;
  const expected=[1,0,0,0,0,1,0,0,0,0,1,0];
  const positions=[0,1,2,3,4,5,6,7,8,9,10,11];
  return positions.every((p,i)=>Math.abs(e[p]-expected[i])<1e-4)&&
    Math.abs(e[15]-1)<1e-4&&[e[12],e[13],e[14]].every(Number.isFinite);
};
const offsetBetween=(source,target)=>{
  if(Math.abs(source.matrixWorld.determinant())<1e-17)
    throw new Error('La matriz de un hueso tiene escala singular: «'+source.name+'».');
  const inverse=source.matrixWorld.clone().invert();
  return target.matrixWorld.clone().multiply(inverse);
};
const describeOffset=matrix=>new THREE.Vector3().setFromMatrixPosition(matrix)
  .toArray().map(n=>n.toFixed(4)).join(', ');
const deformationMatrix=(bone,inverse)=>bone.matrixWorld.clone().multiply(inverse);

export function consolidateEquivalentSkinRigs(root){
  if(!root)throw new Error('No se recibió una escena para consolidar.');
  const meshes=uniqueSkins(root);
  if(!meshes.length)throw new Error('La escena no contiene mallas con esqueleto.');
  const referenced=new Set();
  for(const mesh of meshes){
    if(!mesh.skeleton?.bones?.length||
      mesh.skeleton.bones.length!==mesh.skeleton.boneInverses.length)
      throw new Error('La malla «'+(mesh.name||'sin nombre')+
        '» no tiene un skin verificable.');
    for(const bone of mesh.skeleton.bones){
      if(!bone?.isBone||!bone.name)
        throw new Error('Hay referencias a huesos sin nombre o inválidos.');
      referenced.add(bone);
    }
  }
  const beforeCount=referenced.size;
  const named=new Set([...referenced].map(bone=>bone.name));
  if(beforeCount===named.size)return {
    consolidated:false,bonesBefore:beforeCount,
    bonesAfter:beforeCount,meshes:meshes.length,offsetsCompensated:0,
  };
  root.updateWorldMatrix(true,true);
  const main=meshes.slice().sort((a,b)=>
    b.skeleton.bones.length-a.skeleton.bones.length)[0];
  const canonical=new Map();
  for(const bone of main.skeleton.bones){
    if(canonical.has(bone.name))
      throw new Error('La malla principal tiene huesos homónimos: «'+bone.name+'».');
    canonical.set(bone.name,bone);
  }
  const canonicalSet=new Set(canonical.values());
  const redundant=new Set([...referenced].filter(b=>!canonicalSet.has(b)));
  const descriptors=[];
  let offsetsCompensated=0;
  // Cross-skin compatibility: a constant translation is permissible; arbitrary
  // per-bone offsets, rotations and scales are NOT equivalent rest rigs.
  for(const mesh of meshes){
    let referenceOffset=null,referenceBone=null;
    const skeleton=mesh.skeleton;
    for(let j=0;j<skeleton.bones.length;j++){
      const source=skeleton.bones[j],target=canonical.get(source.name);
      if(!target)
        throw new Error('La malla «'+mesh.name+'» contiene un hueso ajeno al rig '+
          'principal: «'+source.name+'». No se unificaron esqueletos distintos.');
      if(parentName(source)!==parentName(target))
        throw new Error('«'+source.name+'» tiene padres óseos distintos entre mallas.');
      const offset=offsetBetween(source,target);
      if(!isTranslationOnly(offset))
        throw new Error('«'+source.name+'» tiene orientación o escala de referencia '+
          'distinta en «'+(mesh.name||'malla')+'». No es una simple traslación.');
      if(!referenceOffset){
        referenceOffset=offset;referenceBone=source.name;
      }else if(matrixDelta(referenceOffset,offset)>DIFF_TOLERANCE){
        throw new Error('«'+source.name+'» no comparte el desplazamiento uniforme '+
          'del hueso «'+referenceBone+'» en «'+(mesh.name||'malla')+
          '». Traslación esperada: ('+describeOffset(referenceOffset)+
          '); observada: ('+describeOffset(offset)+
          '). No se forzó la unión de rigs distintos.');
      }
    }
    const displacement=referenceOffset?
      new THREE.Vector3().setFromMatrixPosition(referenceOffset).length():0;
    if(displacement>DIFF_TOLERANCE&&skeleton.bones.some(b=>redundant.has(b))){
      offsetsCompensated++;
    }
    descriptors.push({mesh,offset:referenceOffset,displacement});
  }
  // Two separate characters may have identical bone names and the same
  // translation across every bone. Require each shifted skin to physically
  // remain near the chosen character's canonical bone envelope.
  const before=meshes.map(mesh=>skinSamples(mesh));
  const envelope=worldBoneBounds(canonicalSet);
  // A character mesh may legitimately be in mesh-local coordinates far
  // from its skeleton origin. Cover BOTH the canonical joint bounds and its
  // actually skinned geometry, not bones alone.
  const mainSamples=before[meshes.indexOf(main)];
  if(mainSamples?.length){
    envelope.union(sampleBounds(mainSamples));
    const span=envelope.getSize(new THREE.Vector3()).length();
    envelope.expandByScalar(Math.max(0.02,span*0.2));
  }
  descriptors.forEach((entry,i)=>{
    if(entry.displacement<=DIFF_TOLERANCE)return;
    const samples=before[i],bounds=sampleBounds(samples);
    if(!samples?.length||bounds.isEmpty()||!bounds.intersectsBox(envelope))
      throw new Error('La malla «'+(entry.mesh.name||'malla')+
        '» tiene un esqueleto trasladado sin proximidad espacial al personaje '+
        'principal. Podría ser otro personaje; se rechazó la unión.');
  });
  // Never delete accessory nodes mounted on a duplicate Bone tree.
  for(const bone of redundant)for(const child of bone.children){
    if(!child.isBone||!redundant.has(child))
      throw new Error('El hueso duplicado «'+bone.name+
        '» contiene una malla, accesorio o elemento propio; se conserva sin exportar.');
  }
  const originals=meshes.map(mesh=>mesh.skeleton);
  try{
    for(const mesh of meshes){
      const old=mesh.skeleton;
      const replacements=[],compensated=[];
      for(let i=0;i<old.bones.length;i++){
        const original=old.bones[i];
        const target=canonical.get(original.name);
        const oldInverse=old.boneInverses[i];
        // Bc * Inew = Bo * Iold, preserving EVERY effective skin palette
        // matrix, regardless of a uniform FBX proxy root translation.
        const adjusted=target.matrixWorld.clone().invert()
          .multiply(original.matrixWorld).multiply(oldInverse);
        const oldPalette=deformationMatrix(original,oldInverse);
        const newPalette=deformationMatrix(target,adjusted);
        if(matrixDelta(oldPalette,newPalette)>1e-6)
          throw new Error('No se pudo preservar la matriz de skin del hueso «'+
            original.name+'» en «'+mesh.name+'».');
        replacements.push(target);compensated.push(adjusted);
      }
      mesh.skeleton=new THREE.Skeleton(replacements,compensated);
    }
    meshes.forEach((mesh,i)=>assertSkinUnchanged(mesh,before[i]));
    for(const bone of redundant){
      if(!bone.parent)continue;
      if(bone.parent.isBone&&redundant.has(bone.parent))continue;
      bone.parent.remove(bone);
    }
    root.updateWorldMatrix(true,true);
    const actual=new Set();
    for(const mesh of meshes)for(const bone of mesh.skeleton.bones)actual.add(bone);
    if(actual.size!==canonicalSet.size)
      throw new Error('Los skins no comparten un conjunto único de huesos.');
    for(const bone of canonicalSet)if(!actual.has(bone))
      throw new Error('Se perdió un hueso físico del rig canónico.');
    meshes.forEach((mesh,i)=>assertSkinUnchanged(mesh,before[i]));
    return {consolidated:true,bonesBefore:beforeCount,
      bonesAfter:canonicalSet.size,meshes:meshes.length,offsetsCompensated};
  }catch(error){
    for(let i=0;i<meshes.length;i++)meshes[i].skeleton=originals[i];
    throw error;
  }
}
