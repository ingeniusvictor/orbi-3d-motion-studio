// LP-03B.1 — intention-led, one-shot gesture timelines.
// The director is rendering-framework-independent and never generates
// unrequested random gestures. Its output is a small local joint delta.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const ease=x=>{const t=clamp(x,0,1);return t*t*(3-2*t);};
const deg=x=>x*Math.PI/180;

export const GESTURE_CATALOG=Object.freeze({
  acknowledge:Object.freeze({
    label:'Asentir suavemente',
    phases:Object.freeze([0.30,0.48,0.17,0.82]),
    // Slight anticipation, gentle head dip, torso counter-movement.
    joints:Object.freeze({
      head:Object.freeze([deg(3.2),0,0]),
      neck:Object.freeze([deg(0.95),0,0]),
      chest:Object.freeze([deg(-0.35),0,0]),
    }),
    lookAt:Object.freeze({yaw:0,pitch:deg(-1.0)}),
  }),
  curious:Object.freeze({
    label:'Mirar con curiosidad',
    phases:Object.freeze([0.34,0.66,0.58,1.04]),
    joints:Object.freeze({
      head:Object.freeze([0,deg(2.9),deg(1.75)]),
      neck:Object.freeze([0,deg(0.9),deg(0.3)]),
      upperChest:Object.freeze([0,deg(0.55),0]),
    }),
    lookAt:Object.freeze({yaw:deg(6.7),pitch:deg(1.4)}),
  }),
  emphasize:Object.freeze({
    label:'Énfasis discreto',
    phases:Object.freeze([0.34,0.59,0.28,1.07]),
    // Never rotate legs, hips, root, or force a hand-to-object contact.
    joints:Object.freeze({
      chest:Object.freeze([deg(0.55),0,0]),
      leftUpperArm:Object.freeze([0,0,deg(-2.0)]),
      rightUpperArm:Object.freeze([0,0,deg(1.9)]),
      leftHand:Object.freeze([0,deg(0.7),0]),
      rightHand:Object.freeze([0,deg(-0.7),0]),
    }),
    lookAt:Object.freeze({yaw:deg(-0.8),pitch:0}),
  }),
});

const idle=()=>({name:null,phase:'idle',weight:0,lookWeight:0,pose:{},lookAt:null});

export function gestureEnvelope(elapsed,phases) {
  const t=Number.isFinite(elapsed)?Math.max(0,elapsed):0;
  const [anticipation,action,hold,recovery]=phases;
  const t1=anticipation,t2=t1+action,t3=t2+hold,t4=t3+recovery;
  if(t<t1)return {phase:'anticipation',weight:t===0?0:-0.12*ease(t/t1)};
  if(t<t2)return {phase:'action',weight:-0.12+1.12*ease((t-t1)/action)};
  if(t<t3)return {phase:'hold',weight:1};
  if(t<t4)return {phase:'recovery',weight:1-ease((t-t3)/recovery)};
  return {phase:'idle',weight:0};
}

export class GestureDirector {
  constructor(){
    this.enabled=false;
    this.intensity=0.58;
    this.elapsed=0;
    this.current=null;
    this.lastCompleted=null;
    this.lastOutput=idle();
  }
  setEnabled(value){
    this.enabled=Boolean(value);
    if(!this.enabled)this.reset();
  }
  setIntensity(value){
    if(Number.isFinite(Number(value)))this.intensity=clamp(Number(value),0,1);
  }
  trigger(name){
    if(!this.enabled||this.current||!Object.hasOwn(GESTURE_CATALOG,name))return false;
    this.current=name;
    this.elapsed=0;
    this.lastOutput=idle();
    return true;
  }
  reset(){
    this.current=null;
    this.elapsed=0;
    this.lastOutput=idle();
  }
  getStatus(){
    return {
      enabled:this.enabled,
      intensity:this.intensity,
      current:this.current,
      phase:this.lastOutput.phase,
      lastCompleted:this.lastCompleted,
      available:Object.keys(GESTURE_CATALOG),
    };
  }
  update(dt){
    if(!this.enabled||!this.current){
      this.lastOutput=idle();
      return this.lastOutput;
    }
    const spec=GESTURE_CATALOG[this.current];
    // Bound dt after browser tab throttling. A single long frame must not
    // jump past all phases or cause a large angular discontinuity.
    this.elapsed+=clamp(Number.isFinite(dt)?dt:0,0,0.1);
    const e=gestureEnvelope(this.elapsed,spec.phases);
    if(e.phase==='idle'){
      this.lastCompleted=this.current;
      this.current=null;
      this.lastOutput=idle();
      return this.lastOutput;
    }
    const weight=this.intensity*e.weight;
    const pose={};
    for(const [role,angles] of Object.entries(spec.joints)) {
      pose[role]=angles.map(value=>value*weight);
    }
    // Gaze is a direct intention cue, but never jumps during anticipation.
    const lookWeight=clamp(weight,0,1);
    this.lastOutput={
      name:this.current,
      phase:e.phase,
      weight,
      lookWeight,
      pose,
      lookAt:lookWeight>0?{
        yaw:spec.lookAt.yaw*lookWeight,
        pitch:spec.lookAt.pitch*lookWeight,
      }:null,
    };
    return this.lastOutput;
  }
}
