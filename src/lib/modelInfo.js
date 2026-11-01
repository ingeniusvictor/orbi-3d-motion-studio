export const SUPPORTED_EXTENSIONS = new Set(['glb', 'gltf', 'fbx', 'vrm']);
export const extensionOf = (name = '') => name.split('.').pop()?.toLowerCase() || '';
export const isSupportedModel = (name) => SUPPORTED_EXTENSIONS.has(extensionOf(name));
export const formatBytes = (value) => {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value < 1024) return `${value} B`;
  const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), 3);
  return `${(value / 1024 ** unit).toFixed(unit > 1 ? 1 : 0)} ${['B', 'KB', 'MB', 'GB'][unit]}`;
};
export const uniqueClipName = (existing, desired = 'Animación') => {
  const name = String(desired).trim() || 'Animación';
  const seen = new Set(existing.map(item => item.toLowerCase()));
  if (!seen.has(name.toLowerCase())) return name;
  let index = 2;
  while (seen.has(`${name} (${index})`.toLowerCase())) index += 1;
  return `${name} (${index})`;
};
export const boneKey = name => String(name || '').split(/[|:]/).pop().trim().toLowerCase();
export const boneIndex = model => {
  const map = new Map();
  model.traverse(node => {
    if (node.isBone) {
      const key = boneKey(node.name);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(node);
    }
  });
  return map;
};
// Strict same-rig validation with a narrowly permitted neutral auxiliary root.
const optionalRoots = new Set(['root','armature']);
const near = (x,y) => Number.isFinite(x) && Math.abs(x-y)<0.0001;
const boneParent = bone => {
  let p=bone.parent; while(p&&!p.isBone)p=p.parent; return p||null;
};
const ancestor = (a,b) => {
  for(let p=b.parent;p;p=p.parent)if(p===a)return true;
  return false;
};
const neutralBone = bone =>
  [bone.position.x,bone.position.y,bone.position.z].every(v=>near(v,0)) &&
  [bone.quaternion.x,bone.quaternion.y,bone.quaternion.z].every(v=>near(v,0)) &&
  near(Math.abs(bone.quaternion.w),1) &&
  [bone.scale.x,bone.scale.y,bone.scale.z].every(v=>near(v,1));
const neutralChannel = (track,property) => {
  const size=property==='quaternion'?4:3,values=track.values;
  if(!values?.length||values.length%size!==0)return false;
  for(let i=0;i<values.length;i+=size){
    if(property==='quaternion'){
      if(![0,1,2].every(j=>near(values[i+j],0))||!near(Math.abs(values[i+3]),1))return false;
    }else if(![0,1,2].every(j=>near(values[i+j],property==='scale'?1:0)))return false;
  }
  return true;
};
export const inspectRigCompatibility = (base, imported, clips) => {
  const target=boneIndex(base), source=boneIndex(imported);
  if(!target.size||!source.size)return {ok:false,reason:'Ambos archivos deben tener un esqueleto con huesos.'};
  for(const [key,nodes] of [...target,...source]){
    if(!key||nodes.length!==1)return {ok:false,reason:'El esqueleto tiene huesos repetidos o sin nombre ('+(key||'sin nombre')+').'};
  }
  const sourceExtra=new Set([...source.keys()].filter(k=>!target.has(k)));
  const targetExtra=new Set([...target.keys()].filter(k=>!source.has(k)));
  const shared=[...source.keys()].filter(k=>target.has(k));
  const count='(base: '+target.size+' huesos; importado: '+source.size+')';
  if(shared.length<1)return {ok:false,reason:'No hay huesos comunes '+count};
  const checkExtras=(extras,map,side)=>{
    for(const key of extras){
      if(!optionalRoots.has(key))return 'La estructura es distinta: el hueso «'+key+'» solo aparece en '+side+' '+count;
      const root=map.get(key)[0];
      if(shared.length<2||!shared.every(k=>ancestor(root,map.get(k)[0])))
        return 'La raíz «'+key+'» de '+side+' no es una envoltura auxiliar del esqueleto completo.';
      if(!neutralBone(root))
        return 'La raíz «'+key+'» de '+side+' tiene escala o transformación propia. No se puede omitir de forma segura.';
    }
    return null;
  };
  const error=checkExtras(sourceExtra,source,'el FBX nuevo')||checkExtras(targetExtra,target,'el personaje base');
  if(error)return {ok:false,reason:error};
  const parentKey=(bone,extras)=>{
    let p=boneParent(bone);
    while(p&&extras.has(boneKey(p.name)))p=boneParent(p);
    return p?boneKey(p.name):null;
  };
  for(const k of shared){
    if(parentKey(source.get(k)[0],sourceExtra)!==parentKey(target.get(k)[0],targetExtra))
      return {ok:false,reason:'La jerarquía del hueso «'+k+'» es distinta; no se realiza retargeting.'};
  }
  const mappedTracks=[],skippedTracks=[];
  for(const clip of clips){
    let valid=0;
    for(const track of clip.tracks){
      const found=/^(.+)\.(position|quaternion|scale)$/.exec(track.name);
      if(!found)return {ok:false,reason:'Canal no compatible: '+track.name};
      const k=boneKey(found[1]);
      if(sourceExtra.has(k)){
        if(!neutralChannel(track,found[2]))return {ok:false,reason:'La pista «'+track.name+'» mueve la raíz adicional. No es seguro ignorarla.'};
        skippedTracks.push(track);continue;
      }
      if(!source.has(k))return {ok:false,reason:'Pista sin hueso de origen: '+track.name};
      const destination=target.get(k)?.[0];
      if(!destination)return {ok:false,reason:'Falta hueso en el personaje base: '+k};
      mappedTracks.push([track,destination,found[2]]);valid++;
    }
    if(!valid)return {ok:false,reason:'La animación no contiene movimiento aplicable al personaje base.'};
  }
  return {ok:true,mappedTracks,skippedTracks,advisory:sourceExtra.size||targetExtra.size?
    'Raíz auxiliar neutra ignorada. Comprueba visualmente el movimiento antes de exportar.':null};
};

/** A Mixamo 'Without Skin' FBX has animation tracks but no model to draw. */
export const summarizeRenderableGeometry = root => {
  let meshes = 0, drawableMeshes = 0, vertices = 0;
  root?.traverse?.(node => {
    if (!node.isMesh) return;
    meshes += 1;
    const count = node.geometry?.getAttribute?.('position')?.count || 0;
    vertices += count;
    if (count && node.visible && node.layers?.isEnabled?.(0) !== false) {
      // Parent visibility is relevant: FBX sometimes hides entire hierarchies.
      let visible = true, parent = node.parent;
      while (parent) { if (!parent.visible) { visible = false; break; } parent = parent.parent; }
      if (visible) drawableMeshes += 1;
    }
  });
  return { meshes, drawableMeshes, vertices, hasGeometry: vertices > 0 };
};

/** A file may be a complete visible model or an animation-only Mixamo FBX. */
export function validateLoadedContent(geometry, clipCount, animationSource = false) {
  if (animationSource) {
    return clipCount > 0 ? null : 'Este FBX no contiene animaciones.';
  }
  if (!geometry.hasGeometry) {
    return clipCount > 0
      ? 'Este archivo contiene animaciones pero no una malla visible. Los FBX de Mixamo descargados «Without Skin» son solo movimientos: carga primero el personaje FBX «With Skin» o su GLB y luego usa «Añadir animaciones FBX».'
      : 'El archivo no contiene geometría 3D que pueda mostrarse. Comprueba que exportaste la malla del personaje.';
  }
  if (!geometry.drawableMeshes) {
    return 'El archivo contiene mallas, pero están ocultas en la jerarquía. Hazlas visibles antes de exportar desde tu editor 3D.';
  }
  return null;
}
