import * as THREE from 'three';
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// A deliberately small, local-only Mixamo preparation tool.
// We do not decimate skinned geometry or modify bind poses automatically.
export const skinnedMeshes = root => {
  const found=[];
  root?.traverse?.(node=>{
    if(!node.isSkinnedMesh || !node.geometry?.getAttribute?.('position')) return;
    const vertices=node.geometry.getAttribute('position').count;
    const triangles=node.geometry.index ? Math.floor(node.geometry.index.count/3) : Math.floor(vertices/3);
    if(vertices)found.push({id:node.uuid,name:node.name||('Malla '+(found.length+1)),vertices,triangles});
  });
  return found;
};
const unwanted=/hair|cabello|pelo|eyebrow|eyelash|accessory|accessories|glasses|hat|sombrero|ornament|weapon|earring|shoe|skirt|cloth|outfit|jacket/i;
const useful=/body|skin|torso|bust|head|face|brazo|pierna|cuerpo|mesh/i;
export function suggestLightMeshes(meshes){
  if(!meshes?.length)return [];
  const likely=meshes.filter(m=>useful.test(m.name) && !unwanted.test(m.name));
  if(likely.length)return likely.map(m=>m.id);
  const candidate=[...meshes].filter(m=>!unwanted.test(m.name)).sort((a,b)=>b.vertices-a.vertices)[0];
  return [candidate?.id||[...meshes].sort((a,b)=>b.vertices-a.vertices)[0].id];
}
export const skinBoneCount = root => {
  const bones=new Set();
  root?.traverse?.(node=>{
    if(node.isSkinnedMesh)for(const bone of node.skeleton?.bones||[])if(bone?.isBone)bones.add(bone);
  });
  return bones.size;
};
function allBoneCount(root){let count=0;root?.traverse?.(node=>{if(node.isBone)count++;});return count;}

/**
 * Produces a body-only, untextured source for Blender->FBX->Mixamo.
 * Keeps original bone names, hierarchy and skin indices. Never changes
 * the live model; SkeletonUtils.clone rebinds cloned skinned meshes to
 * cloned bone nodes.
 */
export function makeLightweightClone(root,selectedIds){
  if(!root)throw new Error('Primero carga un personaje riggeado.');
  const source=skinnedMeshes(root);
  if(!source.length)throw new Error('Este modelo no contiene mallas vinculadas a huesos (SkinnedMesh). No puede prepararse para Mixamo conservando su rig.');
  const selected=new Set(selectedIds||[]);
  if(!selected.size)throw new Error('Selecciona al menos una malla corporal para conservar.');
  const kept=source.filter(m=>selected.has(m.id));
  if(!kept.length)throw new Error('Las mallas seleccionadas ya no pertenecen al personaje cargado.');
  const model=cloneRig(root);
  const targets=[];model.traverse(node=>{if(node.isMesh)targets.push(node);});
  const sourceMeshes=[];root.traverse(node=>{if(node.isMesh)sourceMeshes.push(node);});
  if(targets.length!==sourceMeshes.length)throw new Error('No se pudo validar la clonación de la jerarquía de mallas.');
  let removed=0,remaining=0;
  for(let i=0;i<targets.length;i++){
    const node=targets[i], src=sourceMeshes[i];
    if(!node.isSkinnedMesh || !selected.has(src.uuid)){
      node.parent?.remove(node);
      removed++;continue;
    }
    // Only the mesh, weights and skeleton are needed for Mixamo. 
    // Materials, textures and facial morph targets are omitted.
    const geometry=node.geometry.clone();
    geometry.morphAttributes={};
    geometry.morphTargetsRelative=false;
    node.geometry=geometry;
    node.morphTargetInfluences=undefined;
    node.morphTargetDictionary=undefined;
    node.material=new THREE.MeshStandardMaterial({color:0xc2cbd8,roughness:1,metalness:0,skinning:true});
    node.visible=true;
    node.pose(); // bind pose, on CLONED bones only
    remaining++;
  }
  const originalCount=skinBoneCount(root);
  const cloneCount=skinBoneCount(model);
  if(!remaining || cloneCount<originalCount)
    throw new Error('No se pudieron conservar todos los huesos vinculados al personaje.');
  return {model,kept,removed,sourceBones:originalCount,cloneBones:cloneCount,sceneBones:allBoneCount(root)};
}
export async function exportLightweightGLB(root,selectedIds){
  const prepared=makeLightweightClone(root,selectedIds);
  const bin=await new GLTFExporter().parseAsync(prepared.model,{
    binary:true,onlyVisible:false,trs:true,animations:[],
  });
  if(!(bin instanceof ArrayBuffer))throw new Error('No se pudo crear el GLB ligero.');
  const roundtrip=await new GLTFLoader().parseAsync(bin,'');
  const actualBones=skinBoneCount(roundtrip.scene);
  if(actualBones!==prepared.sourceBones){
    throw new Error('El GLB ligero no conservó todos los huesos del skin (original: '+
      prepared.sourceBones+', exportado: '+actualBones+'). Prueba otra selección de mallas.');
  }
  if(roundtrip.animations.length)throw new Error('El GLB ligero no debe incluir animaciones.');
  if(!skinnedMeshes(roundtrip.scene).length)throw new Error('El GLB ligero no contiene un cuerpo riggeado.');
  return {buffer:bin,bytes:bin.byteLength,sourceBones:prepared.sourceBones,bones:actualBones,
    meshes:skinnedMeshes(roundtrip.scene).length,removed:prepared.removed,animations:0};
}
