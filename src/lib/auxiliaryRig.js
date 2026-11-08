import * as THREE from 'three';

// MOTION-05B: one humanoid rig + a DISTINCT small accessory rig (e.g. Mint
// Swimsuit ChestBow) cannot be merged by matching only the "root" name.
// For Mixamo, explicitly freeze the accessory in its current bind/reference
// geometry and parent that visual mesh to the torso bone of the primary rig.
// All actions operate exclusively on an already cloned scene.
const ACCESSORY_NAME=/(?:chest[_ -]?bow|bow|ribbon|ornament|accessor|lazo|brooch)/i;
const MAX_ACCESSORY_BONES=96;
const MAX_WORLD_ERROR=0.0005;
const getSkinMeshes=root=>{
  const out=[];root.traverse(n=>{if(n.isSkinnedMesh)out.push(n);});
  return out;
};
const bonesOf=mesh=>new Set(mesh.skeleton?.bones||[]);
const closestBoneAncestor=node=>{
  let n=node?.parent;
  while(n&&!n.isBone)n=n.parent;
  return n||null;
};
function findChestBone(mesh){
  const bones=mesh.skeleton?.bones||[];
  const priorities=[
    /(?:^|[-_:])spine0?2$/i,/^spine0?2$/i,/(?:^|[-_:])chest$/i,
    /(?:^|[-_:])spine0?1$/i,/^spine0?1$/i,
    /(?:^|[-_:])spine$/i,/^spine$/i,
  ];
  for(const pattern of priorities){
    const matches=bones.filter(b=>pattern.test(b.name||''));
    if(matches.length===1)return matches[0];
  }
  return null;
}
function requireSupportedGeometry(mesh){
  const geom=mesh.geometry;
  if(!geom?.getAttribute('position')?.count||
    !geom.getAttribute('skinIndex')||!geom.getAttribute('skinWeight')||
    typeof mesh.getVertexPosition!=='function'||
    typeof mesh.applyBoneTransform!=='function')
    throw new Error('El accesorio «'+mesh.name+'» no tiene geometría y pesos verificables.');
  return geom;
}
function snapshotWorldPositions(mesh,geom){
  const positions=[],sample=new THREE.Vector3();
  // Baking all vertices is necessary: checking only a few might overlook
  // ribbons whose vertices are driven by multiple independent cloth bones.
  for(let i=0,n=geom.getAttribute('position').count;i<n;i++){
    mesh.getVertexPosition(i,sample);
    mesh.applyBoneTransform(i,sample);
    positions.push(sample.clone());
  }
  return positions;
}
function validateParentedVisual(mesh,referenceWorld,points){
  mesh.updateWorldMatrix(true,false);
  const test=new THREE.Vector3();
  const threshold=MAX_WORLD_ERROR;
  let maxError=0;
  for(let i=0;i<points.length;i++){
    test.copy(points[i]).applyMatrix4(mesh.matrixWorld);
    const expected=points[i].clone().applyMatrix4(referenceWorld);
    const error=test.distanceTo(expected);
    maxError=Math.max(maxError,error);
    if(error>threshold*Math.max(1,expected.length()))
      throw new Error('Vincular «'+mesh.name+
        '» al pecho alteraría su posición visible ('+error.toFixed(5)+
        ' unidades). No se exportó un accesorio deformado.');
  }
  return maxError;
}
function removeUnusedAuxBoneTree(root,auxBones,mainBones){
  for(const bone of auxBones){
    if(mainBones.has(bone))
      throw new Error('Los esqueletos comparten objetos Bone reales; no se puede separar este accesorio.');
    for(const child of bone.children){
      if(child.isBone&&auxBones.has(child))continue;
      throw new Error('El hueso auxiliar «'+bone.name+
        '» contiene objetos adicionales. Se bloqueó para no perder accesorios.');
    }
  }
  const topLevel=[...auxBones].filter(b=>!auxBones.has(b.parent));
  if(topLevel.length!==1)
    throw new Error('El accesorio tiene más de una raíz ósea auxiliar.');
  if(!topLevel[0].parent||!root.getObjectById?.(topLevel[0].id))
    throw new Error('La raíz auxiliar no pertenece a la escena.');
  topLevel[0].parent.remove(topLevel[0]);
}
function inspectIndependentAccessoryRig(root){
  const skins=getSkinMeshes(root);
  if(skins.length!==2)
    throw new Error('Esta preparación exige exactamente dos mallas riggeadas: cuerpo principal y un accesorio.');
  const sorted=skins.slice().sort((a,b)=>(b.skeleton?.bones?.length||0)-
    (a.skeleton?.bones?.length||0));
  const [main,accessory]=sorted;
  const mainBones=bonesOf(main),auxBones=bonesOf(accessory);
  if(mainBones.size<6||auxBones.size<2||auxBones.size>MAX_ACCESSORY_BONES||
    auxBones.size>=mainBones.size)
    throw new Error('No se distingue un esqueleto corporal principal de un pequeño rig auxiliar.');
  if(!ACCESSORY_NAME.test(accessory.name||''))
    throw new Error('La malla «'+accessory.name+
      '» no se identificó con certeza como accesorio. No se permite excluirla o congelarla.');
  const sharedObjects=[...auxBones].filter(b=>mainBones.has(b));
  if(sharedObjects.length)
    throw new Error('El accesorio comparte huesos físicos con el personaje; no debe convertirse en un objeto separado.');
  const namesMain=new Set([...mainBones].map(b=>b.name));
  const overlapping=[...auxBones].filter(b=>namesMain.has(b.name));
  if(overlapping.some(b=>b.name!=='root')||overlapping.length>1)
    throw new Error('Los esqueletos comparten más huesos que una raíz homónima; requieren auditoría especial.');
  // Only a same-named ROOT, with no bone parent on either side, can be
  // considered a coincidental collision. No skeleton fusion is attempted.
  if(overlapping.some(b=>closestBoneAncestor(b)))
    throw new Error('La raíz compartida de nombre no es un hueso raíz independiente.');
  return {main,accessory,mainBones,auxBones};
}
export function prepareAuxiliaryRigForMixamo(root,{handling='strict'}={}){
  if(!['strict','rigid','exclude'].includes(handling))
    throw new Error('Tratamiento de accesorio no reconocido.');
  if(handling==='strict')return {handling:'strict',changed:false};
  const skins=getSkinMeshes(root);
  if(skins.length===1)return {handling,changed:false};
  const {main,accessory,mainBones,auxBones}=inspectIndependentAccessoryRig(root);
  root.updateWorldMatrix(true,true);
  const target=handling==='rigid'?findChestBone(main):null;
  if(handling==='rigid'&&!target)
    throw new Error('No se reconoció una articulación de pecho/columna del esqueleto principal para fijar «'+
      accessory.name+'». Prueba «Solo cuerpo» o proporciona el rig original.');
  const geometry=requireSupportedGeometry(accessory);
  let frozen=null,maxError=0;
  if(handling==='rigid'){
    const points=snapshotWorldPositions(accessory,geometry);
    const oldMatrix=accessory.matrixWorld.clone();
    const cloned=geometry.clone();
    const pos=cloned.getAttribute('position');
    for(let i=0;i<points.length;i++)pos.setXYZ(i,points[i].x,points[i].y,points[i].z);
    pos.needsUpdate=true;
    cloned.deleteAttribute('skinIndex');
    cloned.deleteAttribute('skinWeight');
    cloned.deleteAttribute('skinIndex2');
    cloned.deleteAttribute('skinWeight2');
    cloned.morphAttributes={};cloned.morphTargetsRelative=false;
    // Recompute normals so the skin transforms do not leave stale normals.
    cloned.deleteAttribute('tangent');
    cloned.computeVertexNormals();
    frozen=new THREE.Mesh(cloned,accessory.material);
    frozen.name=accessory.name;
    frozen.visible=accessory.visible;
    frozen.renderOrder=accessory.renderOrder;
    frozen.position.copy(accessory.position);
    frozen.quaternion.copy(accessory.quaternion);
    frozen.scale.copy(accessory.scale);
    frozen.frustumCulled=accessory.frustumCulled;
    if(!accessory.parent)
      throw new Error('El accesorio no tiene nodo padre para conservar su posición.');
    accessory.parent.add(frozen);
    root.updateWorldMatrix(true,true);
    maxError=validateParentedVisual(frozen,oldMatrix,points);
    // Reparent into MAIN armature, with world geometry stable. During Mixamo
    // playback this static accessory follows the upper torso rigidly.
    target.attach(frozen);
    root.updateWorldMatrix(true,true);
    maxError=Math.max(maxError,
      validateParentedVisual(frozen,oldMatrix,points));
  }
  accessory.parent?.remove(accessory);
  removeUnusedAuxBoneTree(root,auxBones,mainBones);
  root.updateWorldMatrix(true,true);
  const remaining=getSkinMeshes(root);
  if(remaining.length!==1||remaining[0]!==main)
    throw new Error('La copia perdió el skin corporal durante la preparación.');
  return {handling,changed:true,
    accessoryName:accessory.name,bodyName:main.name,
    accessoryBones:auxBones.size,bodyBones:mainBones.size,
    rigidParent:target?.name||null,maxPositionError:maxError};
}
