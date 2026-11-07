// LP-01: Small, deterministic, renderer-independent motion primitives.
// Original ORBI implementation; no external motion model, dataset or asset.
const TWO_PI = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function hash01(cell, seed) {
  let x = (Math.imul(cell | 0, 374761393) + Math.imul(seed | 0, 668265263)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967295;
}

// Continuous, bounded, deterministic value noise. Incommensurate rates prevent
// short, perfectly repeating left/right cycles during idle.
export function smoothNoise(seconds, seed = 0) {
  if (!Number.isFinite(seconds)) return 0;
  const cell = Math.floor(seconds);
  const phase = seconds - cell;
  const u = phase * phase * (3 - 2 * phase);
  const a = hash01(cell, seed), b = hash01(cell + 1, seed);
  return (a + (b - a) * u) * 2 - 1;
}

export function springStep(state, goal, deltaSeconds, frequencyHz = 2.5) {
  let x = Number.isFinite(state?.x) ? state.x : 0;
  let v = Number.isFinite(state?.v) ? state.v : 0;
  if (!Number.isFinite(goal)) goal = 0;
  const dt = clamp(Number(deltaSeconds) || 0, 0, 0.1);
  const omega = TWO_PI * clamp(frequencyHz, 0.25, 8);
  // Substeps keep the damped second-order system stable across frame drops.
  const count = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / count;
  for (let k = 0; k < count; k += 1) {
    v += (omega * omega * (goal - x) - 2 * omega * v) * h;
    x += v * h;
  }
  return { x, v };
}

export function sampleIdlePose(seconds, intensity = 1) {
  const t = Number.isFinite(seconds) ? seconds : 0;
  const gain = clamp(Number(intensity) || 0, 0, 1);
  const weight = smoothNoise(t * 0.16, 23);
  const twist = smoothNoise(t * 0.11, 17);
  const head = smoothNoise(t * 0.19, 41);
  const armL = smoothNoise(t * 0.23, 83);
  const armR = smoothNoise(t * 0.17, 97);
  const breathPhase = TWO_PI * (t * 0.23 + smoothNoise(t * 0.07, 11) * 0.026);
  const breath = Math.sin(breathPhase);
  const scale = a => a.map(x => x * gain);
  // Normalized VRM humanoid local Euler offsets (radians). Small on purpose.
  // Weight-shift / foot contact IK is a separate LP milestone; we do not fake it here.
  return {
    hips: scale([0.002 * twist, 0, 0.012 * weight]),
    spine: scale([0.005 * breath, 0.004 * twist, -0.009 * weight]),
    chest: scale([0.008 * breath, 0.003 * twist, -0.005 * weight]),
    upperChest: scale([0.006 * breath, 0.003 * twist, 0.003 * weight]),
    neck: scale([0.003 * head, 0.006 * head, -0.003 * weight]),
    leftShoulder: scale([0.004 * breath, 0, 0.004 * armL]),
    rightShoulder: scale([0.004 * breath, 0, -0.004 * armR]),
    leftUpperArm: scale([0.007 * armL, 0, 0.004 * armL]),
    rightUpperArm: scale([0.007 * armR, 0, -0.004 * armR]),
    leftLowerArm: scale([0.004 * armL, 0, 0]),
    rightLowerArm: scale([0.004 * armR, 0, 0]),
  };
}