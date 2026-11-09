import * as THREE from 'three';

// LP-02A: derive rest-pose arm offsets from the actual normalized humanoid.
// No hard-coded left/right bone axes: works with a rotated VRM0 root as well.
export function buildRelaxedArmOffsets(vrm, maximumDropDegrees = 72) {
  const offsets = new Map();
  const diagnostics = [];
  const humanoid = vrm?.humanoid;
  if (!vrm?.scene || !humanoid?.getNormalizedBoneNode) return { offsets, diagnostics };
  vrm.scene.updateWorldMatrix(true, true);
  const down = new THREE.Vector3(0, -1, 0);
  const maxRadians = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(maximumDropDegrees, 0, 85));
  for (const side of ['left', 'right']) {
    const role = side + 'UpperArm';
    const upper = humanoid.getNormalizedBoneNode(role);
    const lower = humanoid.getNormalizedBoneNode(side + 'LowerArm');
    if (!upper || !lower) {
      diagnostics.push(side + ': faltan huesos para calibrar la postura.');
      continue;
    }
    const shoulder = upper.getWorldPosition(new THREE.Vector3());
    const elbow = lower.getWorldPosition(new THREE.Vector3());
    const direction = elbow.sub(shoulder);
    if (direction.lengthSq() < 1e-10) {
      diagnostics.push(side + ': segmento de brazo sin longitud medible.');
      continue;
    }
    direction.normalize();
    // Move each arm toward global gravity direction, never through it.
    const angleToDown = direction.angleTo(down);
    const rotation = Math.min(maxRadians, angleToDown);
    const axis = new THREE.Vector3().crossVectors(direction, down);
    if (rotation < 1e-6 || axis.lengthSq() < 1e-10) {
      diagnostics.push(side + ': brazo ya vertical; no se requiere corrección.');
      continue;
    }
    axis.normalize();
    const worldDelta = new THREE.Quaternion().setFromAxisAngle(axis, rotation);
    const worldRest = upper.getWorldQuaternion(new THREE.Quaternion());
    // Convert world-space correction to the bone's local post-multiply offset.
    const localDelta = worldRest.clone().invert().multiply(worldDelta).multiply(worldRest).normalize();
    offsets.set(role, localDelta);
    diagnostics.push(side + ': descenso de brazo ' + Math.round(THREE.MathUtils.radToDeg(rotation)) + '°.');
    // A small forward elbow flex prevents a rigid straight-arm A-pose.
    // Determine the bend direction from the avatar-facing local +Z instead of
    // assuming identical bone local axes on VRM 0.x and 1.0.
    const wrist = humanoid.getNormalizedBoneNode(side + 'Hand');
    if (wrist) {
      const forearm = wrist.getWorldPosition(new THREE.Vector3())
        .sub(lower.getWorldPosition(new THREE.Vector3()));
      const face = new THREE.Vector3(0, 0, 1)
        .applyQuaternion(vrm.scene.getWorldQuaternion(new THREE.Quaternion())).normalize();
      if (forearm.lengthSq() > 1e-10) {
        forearm.normalize();
        const axisFlex = new THREE.Vector3().crossVectors(forearm, face);
        const angleFlex = Math.min(THREE.MathUtils.degToRad(13), forearm.angleTo(face));
        if (axisFlex.lengthSq() > 1e-10 && angleFlex > 1e-6) {
          const worldBend = new THREE.Quaternion().setFromAxisAngle(axisFlex.normalize(), angleFlex);
          const lowerWorld = lower.getWorldQuaternion(new THREE.Quaternion());
          const lowerOffset = lowerWorld.clone().invert().multiply(worldBend).multiply(lowerWorld).normalize();
          offsets.set(side + 'LowerArm', lowerOffset);
          diagnostics.push(side + ': flexión ligera de codo ' + Math.round(THREE.MathUtils.radToDeg(angleFlex)) + '°.');
        }
      }
    }
  }
  return { offsets, diagnostics };
}
