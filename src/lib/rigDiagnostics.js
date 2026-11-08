// MOTION-05A.4 — user-initiated, LOCAL-ONLY skeletal diagnostic.
// Never includes vertex geometry, skin weights, textures, materials, keys,
// animation frames, or any raw FBX bytes.
const round=n=>Number.isFinite(n)?Number(n.toFixed(5)):null;
const parentBone=bone=>{
  let p=bone.parent;
  while(p&&!p.isBone)p=p.parent;
  return p||null;
};
export function buildRigDiagnostic(root,{filename='modelo'}={}){
  if(!root)throw new Error('Carga un personaje antes del diagnóstico.');
  root.updateWorldMatrix(true,true);
  const meshes=[];
  root.traverse(n=>{if(n.isSkinnedMesh)meshes.push(n);});
  const groups=new Map(),boneObjects=new Set();
  const indexedMeshes=meshes.map((mesh,index)=>{
    const bones=mesh.skeleton?.bones||[],inverses=mesh.skeleton?.boneInverses||[];
    const rows=bones.slice(0,6000).map((bone,i)=>{
      if(!bone?.isBone)return {index:i,invalid:true};
      boneObjects.add(bone);
      const world=bone.matrixWorld.elements;
      const inverse=inverses[i]?.elements||null;
      const key=bone.name||'[sin nombre]';
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push({meshIndex:index,node:bone,
        parent:parentBone(bone)?.name||null,position:[round(world[12]),
          round(world[13]),round(world[14])]});
      return {name:key,parent:parentBone(bone)?.name||null,index:i,
        worldPosition:[round(world[12]),round(world[13]),round(world[14])],
        worldMatrix:world.map(round),
        inverseBindTranslation:inverse?[round(inverse[12]),round(inverse[13]),
          round(inverse[14])]:null};
    });
    return {index,name:mesh.name||'Malla '+(index+1),
      boneCount:bones.length,bones:rows,truncated:bones.length>6000};
  });
  const differences=[];
  let duplicated=0;
  for(const [name,appearances] of groups){
    if(appearances.length<2)continue;
    duplicated++;
    const ref=appearances[0];
    const mismatch=appearances.some(item=>
      item.parent!==ref.parent||
      item.position.some((v,i)=>Math.abs(v-ref.position[i])>0.0001));
    if(mismatch&&differences.length<120)
      differences.push({name,instances:appearances.map(item=>({
        meshIndex:item.meshIndex,parent:item.parent,worldPosition:item.position,
      }))});
  }
  return {
    format:'orbi.motion.rig-diagnostic.v1',
    filename:String(filename).slice(0,160),
    privacy:'Generado localmente al pulsar. Contiene nombres y transformaciones de huesos; NO contiene mallas, vértices, texturas, materiales ni pistas de animación.',
    summary:{skinnedMeshes:meshes.length,uniqueBoneObjects:boneObjects.size,
      uniqueBoneNames:groups.size,duplicatedNames:duplicated,
      namesWithDifferentParentsOrWorldPositions:differences.length},
    differences,
    meshes:indexedMeshes,
  };
}
