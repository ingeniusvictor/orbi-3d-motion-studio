import { exportFbx, exportCharacterFbx } from 'three-js-fbx-exporter';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { makeLightweightClone, skinBoneCount, skinnedMeshes } from './lightweight.js';
import { readPhysicalFbxBoneNames } from './fbxBoneAudit.js';

const magic=[75,97,121,100,97,114,97,32,70,66,88,32,66,105,110,97,114,121,32,32,0,26,0];
export function isBinaryFBX(bytes) {
  return bytes instanceof Uint8Array && bytes.length>64 &&
    magic.every((value,index)=>bytes[index]===value);
}
function rigSignature(root) {
  const items=new Map();
  root.traverse(node=>{
    if(!node.isSkinnedMesh)return;
    for(const bone of node.skeleton?.bones||[]) {
      if(!bone?.isBone)continue;
      let parent=bone.parent;
      while(parent&&!parent.isBone)parent=parent.parent;
      const name=bone.name,ancestor=parent?.name||null;
      if(!name)throw new Error('El esqueleto tiene huesos sin nombre.');
      if(items.has(name)&&items.get(name)!==ancestor)throw new Error('El esqueleto tiene huesos homónimos con jerarquías distintas: '+name);
      items.set(name,ancestor);
    }
  });
  return items;
}
export function validateBinaryFBX(bytes,expectedBones,reference=null) {
  if(!isBinaryFBX(bytes))throw new Error('El exportador no produjo un FBX binario válido.');
  let group;
  try{
    group=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  }catch(error){
    throw new Error('El FBX generado no se pudo reabrir: '+(error.message||error));
  }
  // Count limb models from the FBX binary itself, not JS Bone objects created
  // by FBXLoader. With 17 meshes FBXLoader can report 155×17=2635 proxies.
  const physicalBones=readPhysicalFbxBoneNames(bytes);
  const rig=physicalBones.size;
  const meshes=skinnedMeshes(group);
  if(!meshes.length)throw new Error('El FBX binario no conserva una malla vinculada a huesos.');
  if(rig!==expectedBones)throw new Error(
    'El FBX binario contiene '+rig+' huesos físicos LimbNode, pero se esperaban '+
    expectedBones+'. No se descargará.');
  if(reference) {
    const expected=rigSignature(reference);
    const actual=rigSignature(group);
    if(expected.size!==expectedBones)throw new Error('La referencia no tiene un rig único que pueda verificarse.');
    for(const [name,parent] of expected) {
      if(!physicalBones.has(name))throw new Error('El FBX binario perdió o renombró el hueso físico «'+name+'».');
      if(!actual.has(name))throw new Error('El lector FBX no reconoció el hueso «'+name+'».');
      if(actual.get(name)!==parent)throw new Error('Cambió la jerarquía del hueso «'+name+'» en el FBX.');
    }
    if(actual.size!==expected.size)throw new Error('El FBX reimportado contiene nombres de huesos inesperados.');
  }
  return {bones:rig,meshBoneProxies:skinBoneCount(group),meshes:meshes.length,model:group};
}
export function lightweightBinaryFBX(source,ids) {
  const prepared=makeLightweightClone(source,ids);
  // Source geometry is already stripped of textures, animation and morph targets.
  // FBX is directly built on the CLONED character hierarchy.
  const warnings=[];
  const bytes=exportFbx(prepared.model,{
    format:'binary',version:7400,target:'threejs',embedTextures:false,
    animations:[],bakeAnimations:false,
    onWarning:warning=>warnings.push(String(warning?.message||warning)),
  });
  const verified=validateBinaryFBX(bytes,prepared.sourceBones,prepared.model);
  return {bytes,bytesLength:bytes.byteLength,bones:verified.bones,
    meshes:verified.meshes,removed:prepared.removed,warnings};
}
/** Beta: export animated standard FBX from an existing GLB or baked VRM clone. */
export function animatedBinaryFBX(model,clips) {
  if(!model)throw new Error('Primero carga un personaje riggeado.');
  if(!clips?.length)throw new Error('Selecciona al menos una animación.');
  const expected=skinBoneCount(model);
  if(!expected)throw new Error('El modelo no tiene un esqueleto skinned exportable.');
  const warnings=[];
  const bytes=exportFbx(model,{
    format:'binary',version:7400,target:'threejs',animations:clips,frameRate:30,
    bakeAnimations:true,embedTextures:false,
    onWarning:warning=>warnings.push(String(warning?.message||warning)),
  });
  const verified=validateBinaryFBX(bytes,expected,model);
  if(verified.model.animations?.length && verified.model.animations.length!==clips.length) {
    throw new Error('La cantidad de clips del FBX no coincide con la selección.');
  }
  // Some FBXLoader releases do not reconstruct separate takes. A warning must
  // be propagated rather than claiming the animations were fully checked.
  if(!verified.model.animations?.length)warnings.push(
    'El FBX conserva el skin, pero este lector no pudo verificar sus clips. Revísalos en Blender.');
  return {bytes,bytesLength:bytes.byteLength,bones:verified.bones,meshes:verified.meshes,warnings};
}
