import { exportFbx, exportCharacterFbx } from 'three-js-fbx-exporter';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { makeLightweightClone, skinBoneCount, skinnedMeshes } from './lightweight.js';
import { readPhysicalFbxRig } from './fbxBoneAudit.js';
import { prepareMixamoRig } from './motionExtraction.js';

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
  // Audit physical LimbNode Models and their parent connections directly.
  // FBXLoader may return 155×17 runtime proxies for 17 skinned meshes.
  const physicalRig=readPhysicalFbxRig(bytes);
  const rig=physicalRig.size;
  const meshes=skinnedMeshes(group);
  if(!meshes.length)throw new Error('El FBX binario no conserva una malla vinculada a huesos.');
  if(rig!==expectedBones)throw new Error(
    'El FBX binario contiene '+rig+' huesos físicos LimbNode, pero se esperaban '+
    expectedBones+'. No se descargará.');
  if(reference) {
    const expected=rigSignature(reference);
    if(expected.size!==expectedBones)throw new Error(
      'El personaje contiene '+expectedBones+' objetos de hueso vinculados, pero solo '+
      expected.size+' nombres óseos únicos. Las copias de esqueleto no son equivalentes o no se pudieron consolidar. No se exportó un rig ambiguo.');
    for(const [name,parent] of expected) {
      if(!physicalRig.has(name))throw new Error('El FBX perdió o renombró el hueso físico «'+name+'».');
      if(physicalRig.get(name)!==parent)
        throw new Error('La jerarquía física del hueso «'+name+'» cambió al generar el FBX.');
    }
    // The FBXLoader can clone each skin's bone objects internally; never
    // treat those runtime proxies as additional physical bones.
    if(physicalRig.size!==expected.size)throw new Error('Aparecieron huesos físicos adicionales en el FBX.');
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

/**
 * MOTION-05: export an existing rigged character in its original reference
 * pose or an explicitly calibrated A/T pose, without clips. Never mutate the model.
 */
export function cleanRiggedMixamoFBX(source,referencePose,{pose='reference',accessoryHandling='strict'}={}){
  const prepared=prepareMixamoRig(source,referencePose,{pose,accessoryHandling});
  const warnings=[];
  const bytes=exportFbx(prepared.model,{
    format:'binary',version:7400,target:'threejs',
    animations:[],bakeAnimations:false,
    embedTextures:false,
    onWarning:warning=>warnings.push(String(warning?.message||warning)),
  });
  const verified=validateBinaryFBX(bytes,prepared.bones,prepared.model);
  if(verified.model.animations?.length)
    throw new Error('El FBX todavía contiene animaciones. Se canceló la descarga.');
  if(verified.meshes<1)
    throw new Error('El FBX perdió todas las mallas riggeadas.');
  if(prepared.accessory?.handling==='rigid'&&prepared.accessory.changed){
    const staticMeshes=[];
    verified.model.traverse(n=>{
      if(n.isMesh&&!n.isSkinnedMesh&&n.geometry?.getAttribute('position')?.count)
        staticMeshes.push(n);
    });
    if(!staticMeshes.some(n=>n.name===prepared.accessory.accessoryName||
      n.name.includes(prepared.accessory.accessoryName)))
      throw new Error('El FBX reimportado perdió el adorno rígido «'+
        prepared.accessory.accessoryName+'». Se canceló para no perder piezas.');
    warnings.push('El accesorio '+prepared.accessory.accessoryName+
      ' se conservó visualmente como malla rígida unida al torso. Sus  movimientos internos de tela ya no son animables.');
  }
  if(prepared.accessory?.handling==='exclude'&&prepared.accessory.changed)
    warnings.push('Se excluyó el accesorio '+prepared.accessory.accessoryName+
      ' SOLO de esta copia para Mixamo. El FBX original no se modificó.');
  const physicalRig=readPhysicalFbxRig(bytes);
  const roots=[...physicalRig.values()].filter(parent=>parent===null);
  if(roots.length!==1)
    throw new Error('El FBX limpio tiene '+roots.length+
      ' raíces óseas distintas. Mixamo necesita un esqueleto principal; no se descargó un personaje multirig como si fuese único.');
  return {
    bytes,bytesLength:bytes.byteLength,bones:verified.bones,
    meshes:verified.meshes,animations:0,pose:prepared.pose,
    adjustments:prepared.adjustments,consolidation:prepared.consolidation,
    accessory:prepared.accessory,warnings,
  };
}
