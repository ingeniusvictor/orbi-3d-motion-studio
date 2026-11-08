import * as THREE from 'three';

// MOTION-05A.3: FBXLoader can materialize one equivalent Bone proxy tree for
// each SkinnedMesh. Consolidate ONLY equivalent bone proxies on a CLONED
// reference pose before FBX export. Different characters/rigs stay blocked.
const matrixDelta=(a,b)=>{
  let diff=0;
  for(let i=0;i<16;i++)diff=Math.max(diff,Math.abs(a.elements[i]-b.elements[i]));
  return diff;
};
const parentBone=node=>{
  let p=node?.parent;
  while(p&&!p.isBone)p=p.parent;
  return p||null;
};
const structure=bone=>{
  const parent=parentBone(bone);
  return parent?.name||null;
};
const sampledWorldSkin=mesh=>{
  const position=mesh.geometry?.getAttribute('position');
  if(!position||!mesh.geometry?.getAttribute('skinIndex')||
    !mesh.geometry?.getAttribute('skinWeight')||
    typeof mesh.boneTransform!=='function')return null;
  const n=position.count;
  return [...new Set([0,Math.floor(n/4),Math.floor(n/2),
    Math.floor(3*n/4),n-1])].filter(i=>i>=0&&i<n).map(index=>{
    const value=mesh.boneTransform(index,new THREE.Vector3());
    return {index,position:value.clone()};
  });
};
const assertSkinUnchanged=(mesh,samples)=>{
  if(!samples)return;
  for(const s of samples){
    const next=mesh.boneTransform(s.index,new THREE.Vector3());
    if(next.distanceTo(s.position)>1e-4*Math.max(1,s.position.length()))
      throw new Error('La consolidación modificó el skinning de «'+
        (mesh.name||'malla')+'». Se conserva el rig original sin exportar.');
  }
};

export function consolidateEquivalentSkinRigs(root){
  if(!root)throw new Error('No se recibió una escena para consolidar.');
  const meshes=[];
  root.traverse(node=>{if(node.isSkinnedMesh)meshes.push(node);});
  if(!meshes.length)throw new Error('La escena no contiene mallas con esqueleto.');
  const original=new Set();
  for(const mesh of meshes)for(const bone of mesh.skeleton?.bones||[]){
    if(!bone?.isBone||!bone.name)
      throw new Error('Hay referencias a huesos vacíos/sin nombre: no se puede unificar el rig.');
    original.add(bone);
  }
  const originalBoneObjects=original.size;
  const names=new Set([...original].map(b=>b.name));
  const uniqueNamedBones=names.size;
  if(originalBoneObjects===uniqueNamedBones)
    return {consolidated:false,bonesBefore:originalBoneObjects,
      bonesAfter:originalBoneObjects,meshes:meshes.length};
  root.updateWorldMatrix(true,true);
  // Use the most complete rig as the canonical tree; other skins may use
  // a subset but may not introduce extra bones or an unrelated skeleton.
  const main=meshes.slice().sort((a,b)=>
    (b.skeleton?.bones.length||0)-(a.skeleton?.bones.length||0))[0];
  const canonical=new Map();
  for(const bone of main.skeleton.bones){
    if(canonical.has(bone.name))
      throw new Error('Hay huesos repetidos dentro de una misma malla («'+
        bone.name+'»). No se puede consolidar con seguridad.');
    canonical.set(bone.name,bone);
  }
  for(const bone of original){
    const target=canonical.get(bone.name);
    if(!target)throw new Error('Los accesorios contienen huesos adicionales («'+
      bone.name+'») que no pertenecen al esqueleto principal. No se unificaron.');
    if(structure(bone)!==structure(target))
      throw new Error('«'+bone.name+'» tiene padres diferentes entre las mallas. Hay rigs incompatibles.');
    if(matrixDelta(bone.matrixWorld,target.matrixWorld)>1e-3)
      throw new Error('«'+bone.name+'» tiene posiciones de referencia diferentes entre las mallas. Hay rigs incompatibles.');
  }
  const canonicalSet=new Set(canonical.values());
  const redundant=new Set([...original].filter(b=>!canonicalSet.has(b)));
  // Never delete an accessory, helper or canonical bone just to get a lower
  // count. Duplicate subtrees may contain ONLY redundant Bone children.
  for(const bone of redundant)for(const child of bone.children){
    if(!child.isBone||!redundant.has(child))
      throw new Error('Un hueso duplicado («'+bone.name+
        '») contiene elementos propios. No se pueden borrar de la copia.');
  }
  const before=meshes.map(mesh=>sampledWorldSkin(mesh));
  const backups=meshes.map(mesh=>mesh.skeleton);
  try{
    for(const mesh of meshes){
      const old=mesh.skeleton;
      const replacements=old.bones.map(b=>canonical.get(b.name));
      const inverses=old.boneInverses.map(m=>m.clone());
      // Preserve the original per-mesh skin matrices and index order.
      mesh.skeleton=new THREE.Skeleton(replacements,inverses);
    }
    meshes.forEach((mesh,i)=>assertSkinUnchanged(mesh,before[i]));
    // Remove only topmost redundant branches; descendants follow them.
    for(const bone of redundant){
      if(!bone.parent)continue;
      if(bone.parent.isBone&&redundant.has(bone.parent))continue;
      bone.parent.remove(bone);
    }
    root.updateWorldMatrix(true,true);
    const after=new Set();
    meshes.forEach(mesh=>mesh.skeleton.bones.forEach(b=>after.add(b)));
    if(after.size!==canonicalSet.size)
      throw new Error('Los skins no comparten un único conjunto de huesos.');
    for(const bone of canonicalSet)if(!after.has(bone))
      throw new Error('Se perdió un hueso canónico durante la consolidación.');
    return {consolidated:true,bonesBefore:originalBoneObjects,
      bonesAfter:canonicalSet.size,meshes:meshes.length};
  }catch(error){
    // The clone will be discarded by the caller, but avoid leaving inconsistent
    // skin assignments if diagnostics inspect it.
    for(let i=0;i<meshes.length;i++)meshes[i].skeleton=backups[i];
    throw error;
  }
}
