// LP-01: No mutations; inspect the loaded VRM entirely in browser memory.
export const CRITICAL_ROLES = Object.freeze([
  'hips','spine','head','leftUpperArm','rightUpperArm',
  'leftUpperLeg','rightUpperLeg','leftLowerLeg','rightLowerLeg','leftFoot','rightFoot',
]);
const OPTIONAL_ROLES = Object.freeze([
  'chest','upperChest','neck','leftEye','rightEye','jaw',
  'leftShoulder','rightShoulder','leftLowerArm','rightLowerArm','leftHand','rightHand',
  'leftToes','rightToes',
]);
const FINGER_NAMES = ['ThumbMetacarpal','ThumbProximal','ThumbDistal',
  'IndexProximal','IndexIntermediate','IndexDistal','MiddleProximal',
  'MiddleIntermediate','MiddleDistal','RingProximal','RingIntermediate',
  'RingDistal','LittleProximal','LittleIntermediate','LittleDistal'];
const FINGER_ROLES = ['left','right'].flatMap(side => FINGER_NAMES.map(name => side + name));
export const STANDARD_ROLES = Object.freeze([...CRITICAL_ROLES,...OPTIONAL_ROLES,...FINGER_ROLES]);

export function auditVrmRig(vrm) {
  if (!vrm?.scene?.traverse || typeof vrm?.humanoid?.getNormalizedBoneNode !== 'function') {
    return {ok:false,reason:'Se necesita un avatar VRM con esqueleto humanoide normalizado.'};
  }
  const boneNames=[], counts=new Map();
  let skinnedMeshes=0, morphSlots=0;
  vrm.scene.traverse(node => {
    if (node.isBone) {
      const name=node.name || '(sin nombre)';
      boneNames.push(name);
      counts.set(name,(counts.get(name)||0)+1);
    }
    if (node.isSkinnedMesh) skinnedMeshes += 1;
    if (node.isMesh && Array.isArray(node.morphTargetInfluences))
      morphSlots += node.morphTargetInfluences.length;
  });
  const mapped=STANDARD_ROLES.filter(role => Boolean(vrm.humanoid.getNormalizedBoneNode(role)));
  const missingCritical=CRITICAL_ROLES.filter(role => !mapped.includes(role));
  const duplicateNames=[...counts].filter(([name,n])=>n>1).map(([name])=>name);
  const warnings=[];
  if (missingCritical.length) warnings.push('Faltan roles humanoides esenciales: '+missingCritical.join(', '));
  if (duplicateNames.length) warnings.push('Hay nombres de huesos repetidos; revisar tracks de animación.');
  if (!vrm.springBoneManager) warnings.push('No hay gestor de spring bones activo en este modelo.');
  return {
    ok:missingCritical.length===0,
    totalBones:boneNames.length,
    mappedHumanoidRoles:mapped.length,
    supportedRoleCount:STANDARD_ROLES.length,
    fingerRoles:mapped.filter(role=>FINGER_ROLES.includes(role)).length,
    missingCritical,
    duplicateNames,
    skinnedMeshes,
    morphSlots,
    springBonesAvailable:Boolean(vrm.springBoneManager),
    expressionsAvailable:Boolean(vrm.expressionManager),
    vrmVersion:String(vrm.meta?.metaVersion ?? 'no especificada'),
    warnings,
  };
}