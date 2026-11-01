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
const selectedRig = root => {
  const full=boneIndex(root);
  let best=null, bestCount=0;
  root.traverse(node=>{
    const bones=node.isSkinnedMesh?node.skeleton?.bones:null;
    if(!bones?.length)return;
    const unique=new Set(bones.filter(x=>x?.isBone).map(x=>boneKey(x.name)));
    if(unique.size>bestCount){ bestCount=unique.size; best=bones; }
  });
  if(!best || bestCount<2)return full;
  const selected=new Map();
  for(const bone of best) {
    if(!bone?.isBone)continue;
    const key=boneKey(bone.name);
    if(!selected.has(key))selected.set(key,[]);
    if(!selected.get(key).includes(bone))selected.get(key).push(bone);
  }
  return selected;
};
export const inspectRigCompatibility = (base, imported, clips) => {
  const target=selectedRig(base),source=selectedRig(imported);
  if(!target.size||!source.size)return {ok:false,reason:'Ambos archivos deben tener un esqueleto con huesos.'};
  // Nodes named root or armature are often duplicated by Mixamo/FBX exports.
  // They may only be ignored if their rest transform and animation are neutral.
  const nonHelper = index => new Set([...index.keys()].filter(k=>!optionalRoots.has(k)));
  const sourceCore=nonHelper(source),targetCore=nonHelper(target);
  if(!sourceCore.size||!targetCore.size)return {ok:false,reason:'No se encontró un esqueleto principal reconocible.'};
  for(const [side,index] of [['personaje',target],['animación',source]]) {
    for(const [key,bones] of index) {
      if(!key)return {ok:false,reason:'Hay un hueso sin nombre en el '+side+'.'};
      if(optionalRoots.has(key)){
        // Multiple neutral helper roots are fine; animation tracks are checked below.
        if(bones.length>1 && bones.some(b=>!neutralBone(b)))
          return {ok:false,reason:'El archivo de '+side+' contiene varios huesos «'+key+'» con transformaciones distintas. No se puede elegir automáticamente uno.'};
      } else if(bones.length!==1){
        return {ok:false,reason:'El hueso «'+key+'» aparece repetido en '+side+'. Necesitamos un rig único para integrarlo con seguridad.'};
      }
    }
  }
  const missing=[...sourceCore].filter(k=>!targetCore.has(k));
  const extra=[...targetCore].filter(k=>!sourceCore.has(k));
  if(missing.length||extra.length)return {ok:false,reason:
    'Los esqueletos no son idénticos: '+(missing.length?'falta en base «'+missing[0]+'»; ':'')+
    (extra.length?'falta en animación «'+extra[0]+'».':'')+' Comprueba que descargaste ambas versiones del mismo rig.'};
  const skipOptionalParent=bone=>{
    let parent=boneParent(bone);
    while(parent && optionalRoots.has(boneKey(parent.name))){
      if(!neutralBone(parent))return '__nonneutral_wrapper__';
      parent=boneParent(parent);
    }
    return parent?boneKey(parent.name):null;
  };
  for(const key of sourceCore){
    const src=source.get(key)[0],dst=target.get(key)[0];
    if(skipOptionalParent(src)!==skipOptionalParent(dst))
      return {ok:false,reason:'La jerarquía del hueso «'+key+'» no coincide.'};
  }
  // Additional helper roots can only be considered neutral wrappers. Do not
  // discard animated body translations or rotations under any circumstances.
  const mappedTracks=[],skippedTracks=[];
  for(const clip of clips){
    let valid=0;
    for(const track of clip.tracks){
      const found=/^(.+)\.(position|quaternion|scale)$/.exec(track.name);
      if(!found)return {ok:false,reason:'Canal de animación no compatible: '+track.name};
      const key=boneKey(found[1]),property=found[2];
      if(optionalRoots.has(key)){
        const src=source.get(key)||[],dst=target.get(key)||[];
        if(src.length===1 && dst.length===1 &&
           skipOptionalParent(src[0])===skipOptionalParent(dst[0]) &&
           src[0].quaternion.angleTo(dst[0].quaternion)<0.01 &&
           src[0].position.distanceTo(dst[0].position)<0.001 &&
           src[0].scale.distanceTo(dst[0].scale)<0.001){
          mappedTracks.push([track,dst[0],property]);valid++;continue;
        }
        if(!neutralChannel(track,property)){
          return {ok:false,reason:'La pista «'+track.name+'» mueve una raíz duplicada o distinta. Para conservar el movimiento correctamente se necesita el mismo rig exportado de Mixamo.'};
        }
        // Neutral channels on redundant wrappers are safe to discard.
        skippedTracks.push(track);continue;
      }
      const src=source.get(key)?.[0],dst=target.get(key)?.[0];
      if(!src||!dst)return {ok:false,reason:'La pista «'+track.name+'» no tiene un hueso correspondiente en el personaje.'};
      mappedTracks.push([track,dst,property]);valid++;
    }
    if(!valid)return {ok:false,reason:'La animación «'+clip.name+'» no contiene canales para el personaje.'};
  }
  return {ok:true,mappedTracks,skippedTracks,advisory:
    skippedTracks.length?'Se omitieron solo pistas neutras de raíces auxiliares. Revisa el movimiento antes de exportar.':null};
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
