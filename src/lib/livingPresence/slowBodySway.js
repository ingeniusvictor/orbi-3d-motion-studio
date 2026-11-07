// LP-02C.2 — slow, aperiodic postural sway.  The torso shifts above a stable
// pelvis: this is NOT a pelvis/foot translation or a locomotion solver.
import {smoothNoise,springStep} from './motionPrimitives.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const radians=d=>d*Math.PI/180;

export class SlowBodySway {
  constructor(seed=1001) {
    this.seed=seed>>>0;
    this.state={roll:{x:0,v:0},yaw:{x:0,v:0}};
  }
  sample(seconds,dt,{intensity=0.35,speed=0.65}={}) {
    const gain=clamp(Number(intensity)||0,0,1);
    const rate=clamp(Number(speed)||0,0.15,1.5);
    const t=Math.max(0,Number(seconds)||0);
    // Two very slow continuous noise fields, deliberately not a sine loop.
    // ~14–30+ seconds per shift; intermittent near-zero movement is normal.
    const leftRight=0.70*smoothNoise(t*0.050*rate,this.seed+17)+
       0.30*smoothNoise(t*0.088*rate,this.seed+41);
    const twist=0.62*smoothNoise(t*0.041*rate,this.seed+73)+
       0.38*smoothNoise(t*0.072*rate,this.seed+97);
    // Full-intensity maximum: 1.65° lateral inclination across the upper
    // body; realistic default ~0.58°. No root displacement.
    const goalRoll=radians(1.65)*gain*leftRight;
    const goalYaw=radians(0.65)*gain*twist;
    this.state.roll=springStep(this.state.roll,goalRoll,dt,0.17);
    this.state.yaw=springStep(this.state.yaw,goalYaw,dt,0.14);
    return {roll:this.state.roll.x,yaw:this.state.yaw.x};
  }
  reset(){
    this.state={roll:{x:0,v:0},yaw:{x:0,v:0}};
  }
}
