import * as THREE from 'three';
import { sampleIdlePose, springStep } from './motionPrimitives.js';
import { buildRelaxedArmOffsets } from './neutralPose.js';

const clamp01 = x => Math.max(0, Math.min(1, Number(x) || 0));

// LP-02A: a neutral standing pose plus subtle dynamic presence; reversible.
// No changes to FBX clips, root translation, saved VRM data or physical spring bones.
export class LivingPresence {
  constructor(vrm) {
    this.vrm = vrm;
    this.enabled = false;
    this.intensity = 0.55; // microgestures independent of rest posture
    this.posture = 0.92; // proportion of the calibrated 72-degree T-to-rest arm drop
    this.time = 0;
    this.fade = {x:0,v:0};
    this.states = new Map();
    this.applied = new Map();
    this.calibration = buildRelaxedArmOffsets(vrm);
    this.euler = new THREE.Euler(0,0,0,'XYZ');
    this.offset = new THREE.Quaternion();
    this.restOffset = new THREE.Quaternion();
    this.blended = new THREE.Quaternion();
    this.identity = new THREE.Quaternion();
  }
  getDiagnostics() {
    return [...this.calibration.diagnostics];
  }
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      // Exact A/B baseline is restored immediately. Never leave a tilted arm.
      this.beforeFrame();
      this.fade = {x:0,v:0};
      this.states.clear();
    }
  }
  setIntensity(intensity) {
    const n = Number(intensity);
    if (Number.isFinite(n)) this.intensity = clamp01(n);
  }
  setPosture(amount) {
    const n = Number(amount);
    if (Number.isFinite(n)) this.posture = clamp01(n);
  }
  beforeFrame() {
    // Undo only transforms still matching our last applied overlay.
    // If a separate animation has taken ownership, do not erase its pose.
    for (const {node,base,applied} of this.applied.values()) {
      if (node.quaternion.angleTo(applied) < 0.0001) node.quaternion.copy(base);
    }
    this.applied.clear();
  }
  update(deltaSeconds, {clipPlaying=false}={}) {
    const dt = Math.max(0,Math.min(0.1,Number(deltaSeconds)||0));
    this.time += dt;
    // Existing FBX/VRM clip has exclusive priority, including when paused.
    // Do not impose standing pose over a captured motion.
    if (clipPlaying) {
      this.fade={x:0,v:0};
      this.states.clear();
      return;
    }
    this.fade = springStep(this.fade,this.enabled ? 1 : 0,dt,0.85);
    const blend=clamp01(this.fade.x);
    if (blend < 0.00001) return;
    const micro = sampleIdlePose(this.time,blend*this.intensity);
    const roles = new Set([...Object.keys(micro),...this.calibration.offsets.keys()]);
    for (const role of roles) {
      const node=this.vrm?.humanoid?.getNormalizedBoneNode?.(role);
      if (!node) continue;
      const angles=micro[role]||[0,0,0];
      const channels=this.states.get(role)||[{x:0,v:0},{x:0,v:0},{x:0,v:0}];
      for(let axis=0;axis<3;axis++) channels[axis]=springStep(channels[axis],angles[axis],dt,2.4);
      this.states.set(role,channels);
      const [x,y,z]=channels.map(c=>c.x);
      this.euler.set(x,y,z);
      this.offset.setFromEuler(this.euler);
      const base=node.quaternion.clone();
      const resting=this.calibration.offsets.get(role);
      if (resting) {
        this.restOffset.copy(this.identity).slerp(resting,blend*this.posture);
        node.quaternion.multiply(this.restOffset);
      }
      node.quaternion.multiply(this.offset).normalize();
      this.applied.set(role,{node,base,applied:node.quaternion.clone()});
    }
  }
  dispose() {
    this.beforeFrame();
    this.states.clear();
    this.applied.clear();
    this.vrm=null;
  }
}