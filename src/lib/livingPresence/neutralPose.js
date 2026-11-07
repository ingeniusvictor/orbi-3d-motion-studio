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
    diagnostics.push(side + ': postura calibrada; descenso objetivo ' + Math.round(THREE.MathUtils.radToDeg(rotation)) + '°.');
  }
  return { offsets, diagnostics };
}
