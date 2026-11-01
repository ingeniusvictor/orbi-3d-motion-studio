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
const parentBone = bone => {
  let parent = bone.parent;
  while (parent && !parent.isBone) parent = parent.parent;
  return parent ? boneKey(parent.name) : null;
};
export const inspectRigCompatibility = (base, imported, clips) => {
  const target = boneIndex(base);
  const source = boneIndex(imported);
  if (!target.size || !source.size) return {ok: false, reason: 'Ambos archivos deben tener un esqueleto con huesos.'};
  for (const [name, nodes] of source) {
    const candidates = target.get(name);
    if (!candidates || candidates.length !== 1 || nodes.length !== 1) {
      return {ok: false, reason: `La estructura de huesos no coincide (${name}).`};
    }
    const sourceParent = parentBone(nodes[0]);
    const targetParent = parentBone(candidates[0]);
    if (sourceParent !== targetParent) {
      return {ok: false, reason: `Jerarquía diferente en el hueso ${name}.`};
    }
  }
  // Do not accept partial skeleton matches; this tool deliberately does no retargeting.
  if (source.size !== target.size) return {ok:false, reason:'Los esqueletos tienen distinta cantidad de huesos.'};
  const tracks = [];
  for (const clip of clips) for (const track of clip.tracks) {
    const match = /^(.+)\.(position|quaternion|scale)$/.exec(track.name);
    if (!match) return {ok:false, reason:`Canal de animación no compatible: ${track.name}`};
    const key = boneKey(match[1]);
    const targetBone = target.get(key);
    if (!targetBone || targetBone.length !== 1) return {ok:false, reason:`No existe el hueso de destino ${match[1]}.`};
    tracks.push([track, targetBone[0], match[2]]);
  }
  if (!tracks.length) return {ok:false, reason:'No hay pistas de animación óseas compatibles.'};
  return {ok:true, mappedTracks:tracks};
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
