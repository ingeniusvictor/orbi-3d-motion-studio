import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

// Export STANDARD glTF/GLB, not VRM: bake the visible normalized humanoid pose
// onto the original skin's RAW bones, then export a disposable skeleton clone.
// This deliberately does not recreate VRMC_vrm, spring bones or MToon.
const SAMPLE_FPS = 24;
const MAX_SAMPLES = 7200;
const MAX_BONES = 350;

function capture(root, vrm) {
  const nodes = new Set();
  root.traverse(node => nodes.add(node));
  for (const bone of Object.values(vrm.humanoid?.normalizedHumanBones || {})) {
    if (bone?.node) nodes.add(bone.node);
  }
  return Array.from(nodes).map(node => ({
    node,
    position: node.position.clone(),
    quaternion: node.quaternion.clone(),
    scale: node.scale.clone(),
  }));
}
function restore(states) {
  for (const state of states) {
    state.node.position.copy(state.position);
    state.node.quaternion.copy(state.quaternion);
    state.node.scale.copy(state.scale);
  }
}
function skinBones(root) {
  const bones = new Set();
  root.traverse(node => {
    if (node.isSkinnedMesh) {
      for (const bone of node.skeleton?.bones || []) if (bone?.isBone) bones.add(bone);
    }
  });
  return [...bones];
}
const near3 = (a,b,tolerance = 0.00005) =>
  Math.abs(a[0]-b[0])<tolerance && Math.abs(a[1]-b[1])<tolerance && Math.abs(a[2]-b[2])<tolerance;
const near4 = (a,b,tolerance = 0.00005) =>
  Math.abs(Math.abs(a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3])-1)<tolerance;

function standardMaterial(mat) {
  if (!mat?.isShaderMaterial) return mat;
  // VRM's MToon is ShaderMaterial; GLTFExporter supports standard PBR materials.
  // Reconstruct a portable approximation from the MToon lit color and base map.
  const color = mat.color?.isColor ? mat.color.clone() : new THREE.Color(0xffffff);
  const material = new THREE.MeshStandardMaterial({
    name: mat.name || 'ORBI converted VRM material',
    color,
    map: mat.map?.isTexture ? mat.map : null,
    normalMap: mat.normalMap?.isTexture ? mat.normalMap : null,
    normalScale: mat.normalScale?.isVector2 ? mat.normalScale.clone() : undefined,
    emissive: mat.emissive?.isColor ? mat.emissive.clone() : 0x000000,
    emissiveMap: mat.emissiveMap?.isTexture ? mat.emissiveMap : null,
    emissiveIntensity: Number.isFinite(mat.emissiveIntensity) ? mat.emissiveIntensity : 1,
    metalness: 0,
    roughness: 1,
    transparent: Boolean(mat.transparent),
    opacity: Number.isFinite(mat.opacity) ? mat.opacity : 1,
    alphaTest: Number.isFinite(mat.alphaTest) ? mat.alphaTest : 0,
    side: mat.side ?? THREE.FrontSide,
    depthWrite: mat.depthWrite !== false,
  });
  material.userData = { orbiConvertedFrom: mat.type || 'ShaderMaterial' };
  return material;
}
export function convertVrmMaterials(root) {
  let converted = 0;
  const cache = new Map();
  root.traverse(node => {
    if (!node.isMesh) return;
    const remap = mat => {
      if (!mat?.isShaderMaterial) return mat;
      if (!cache.has(mat)) {
        cache.set(mat, standardMaterial(mat));
        converted++;
      }
      return cache.get(mat);
    };
    node.material = Array.isArray(node.material) ? node.material.map(remap) : remap(node.material);
  });
  return converted;
}

export function bakeVrmForGlb(vrm, entries, {fps = SAMPLE_FPS} = {}) {
  if (!vrm?.scene || !vrm?.humanoid) throw new Error('Se necesita un VRM humanoide para exportar GLB.');
  if (!entries?.length) throw new Error('Primero añade o carga al menos una animación.');
  const bones = skinBones(vrm.scene);
  if (!bones.length) throw new Error('El VRM no contiene ninguna malla vinculada a un esqueleto exportable.');
  if (bones.length > MAX_BONES) throw new Error('Este personaje supera el límite de huesos de la exportación básica.');
  const names = bones.map(b => b.name);
  if (names.some(n => !n) || new Set(names).size !== names.length) {
    throw new Error('El VRM tiene nombres de huesos repetidos; no es seguro exportar animaciones GLB.');
  }
  const totalSamples = entries.reduce((sum,item)=>{
    const duration=item.clip?.duration;
    if (!(duration>0) || !Number.isFinite(duration)) throw new Error('Existe un clip sin duración válida.');
    return sum+Math.ceil(duration*fps)+1;
  },0);
  if (totalSamples > MAX_SAMPLES) throw new Error('Demasiados fotogramas para exportar en el navegador. Prueba con menos animaciones.');
  const original = capture(vrm.scene,vrm);
  const auto = vrm.humanoid.autoUpdateHumanBones;
  const baked = [];
  let converted = 0;
  let meshClone;
  try {
    for (const entry of entries) {
      const isNormalized = entry.source?.includes('VRM / Mixamo');
      restore(original);
      if (isNormalized && vrm.humanoid.resetNormalizedPose) {
        vrm.humanoid.resetNormalizedPose();
      }
      vrm.humanoid.autoUpdateHumanBones = isNormalized;
      if (isNormalized) vrm.humanoid.update();
      const baseline = bones.map(node => ({position:node.position.toArray(),quaternion:node.quaternion.toArray()}));
      const count = Math.max(2,Math.ceil(entry.clip.duration*fps)+1);
      const times = [];
      const positions = bones.map(()=>[]);
      const quaternions = bones.map(()=>[]);
      const mixer = new THREE.AnimationMixer(vrm.scene);
      const action=mixer.clipAction(entry.clip);
      action.reset().setLoop(THREE.LoopOnce,1);
      action.clampWhenFinished=true;
      action.play();
      for (let i=0;i<count;i++) {
        const t=Math.min(entry.clip.duration,i/fps);
        times.push(t);
        mixer.setTime(t);
        if (isNormalized) vrm.humanoid.update();
        for (let j=0;j<bones.length;j++) {
          const bone=bones[j];
          positions[j].push(bone.position.x,bone.position.y,bone.position.z);
          quaternions[j].push(bone.quaternion.x,bone.quaternion.y,bone.quaternion.z,bone.quaternion.w);
        }
      }
      mixer.stopAllAction();
      mixer.uncacheRoot(vrm.scene);
      const tracks=[];
      for (let j=0;j<bones.length;j++) {
        let movingPosition=false, movingRotation=false;
        for (let i=0;i<count;i++) {
          if (!near3(positions[j].slice(i*3,i*3+3),baseline[j].position)) movingPosition=true;
          if (!near4(quaternions[j].slice(i*4,i*4+4),baseline[j].quaternion)) movingRotation=true;
          if(movingPosition && movingRotation) break;
        }
        const name=bones[j].name;
        if(movingPosition) tracks.push(new THREE.VectorKeyframeTrack(name+'.position',times,positions[j]));
        if(movingRotation) tracks.push(new THREE.QuaternionKeyframeTrack(name+'.quaternion',times,quaternions[j]));
      }
      if (!tracks.length) throw new Error('La animación «'+entry.name+'» no produjo movimiento de huesos exportable.');
      baked.push(new THREE.AnimationClip(entry.name,entry.clip.duration,tracks));
    }
    // Clone while the original skeleton is in its genuine rest pose. This
    // prevents preview-frame transforms from becoming the GLB default pose.
    restore(original);
    vrm.humanoid.resetNormalizedPose?.();
    vrm.humanoid.autoUpdateHumanBones=true;
    vrm.humanoid.update();
    vrm.scene.updateWorldMatrix(true,true);
    meshClone=cloneSkeleton(vrm.scene);
    // Prevent VRM runtime helper objects from being mistaken for skinned data.
    converted=convertVrmMaterials(meshClone);
    return {model:meshClone,clips:baked,convertedMaterials:converted,samples:totalSamples};
  } finally {
    restore(original);
    vrm.humanoid.autoUpdateHumanBones=auto;
    vrm.scene.updateWorldMatrix(true,true);
  }
}
