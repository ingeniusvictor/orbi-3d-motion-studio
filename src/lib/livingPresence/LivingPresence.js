import * as THREE from 'three';
import { sampleIdlePose, springStep } from './motionPrimitives.js';

// LP-01: reversible, low-amplitude idle prototype; not a locomotion/IK solution.
export class LivingPresence {
  constructor(vrm) {
    this.vrm = vrm;
    this.enabled = false;
    this.intensity = 0.55;
    this.time = 0;
    this.fade = {x:0,v:0};
    this.states = new Map();
    this.applied = new Map();
    this.euler = new THREE.Euler(0,0,0,'XYZ');
    this.offset = new THREE.Quaternion();
  }
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.beforeFrame();
      this.fade = {x:0,v:0};
      this.states.clear();
    }
  }
  setIntensity(intensity) {
    const n = Number(intensity);
    if (Number.isFinite(n)) this.intensity = Math.max(0,Math.min(1,n));
  }
  beforeFrame() {
    // Remove only overlays that WE previously applied; never wipe animation
    // or externally edited poses. The mixer then writes a clean base each frame.
    for (const {node,base,applied} of this.applied.values()) {
      if (node.quaternion.angleTo(applied) < 0.0001) node.quaternion.copy(base);
    }
    this.applied.clear();
  }
  update(deltaSeconds,{clipPlaying=false}={}) {
    const dt=Math.max(0,Math.min(0.1,Number(deltaSeconds)||0));
    this.time += dt;
    const target = this.enabled && !clipPlaying ? this.intensity : 0;
    this.fade = springStep(this.fade,target,dt,1.25);
    if (this.fade.x < 0.00001) return;
    const pose = sampleIdlePose(this.time,Math.max(0,Math.min(1,this.fade.x)));
    for (const [role,angles] of Object.entries(pose)) {
      const node=this.vrm?.humanoid?.getNormalizedBoneNode?.(role);
      if (!node) continue;
      const channels=this.states.get(role) || [{x:0,v:0},{x:0,v:0},{x:0,v:0}];
      for (let axis=0;axis<3;axis+=1) channels[axis]=springStep(channels[axis],angles[axis],dt,2.4);
      this.states.set(role,channels);
      const [x,y,z]=channels.map(c=>c.x);
      this.euler.set(x,y,z);
      this.offset.setFromEuler(this.euler);
      const base=node.quaternion.clone();
      node.quaternion.multiply(this.offset).normalize();
      this.applied.set(role,{node,base,applied:node.quaternion.clone()});
    }
  }
  dispose() {
    this.beforeFrame();
    this.states.clear();
    this.vrm=null;
  }
}