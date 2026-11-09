// LP-02B.1: a natural *rest shape*, not a grasping animation.
// The human hand rests with MCP/PIP/DIP flexion and asymmetry; one flat
// angle per finger (the previous LP-02B approach) leaves a "stiff fan".
// Joint targets are intentionally modest and require per-avatar visual QA.
const PROFILE=Object.freeze({
  Thumb:  Object.freeze([12,15,10]),
  Index:  Object.freeze([21,25,12]),
  Middle: Object.freeze([25,30,15]),
  Ring:   Object.freeze([30,34,17]),
  Little: Object.freeze([32,37,18]),
});
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export const HAND_FINGERS=Object.freeze(Object.keys(PROFILE));
export const JOINT_NAMES=Object.freeze({
  Thumb:Object.freeze(['Metacarpal','Proximal','Distal']),
  Index:Object.freeze(['Proximal','Intermediate','Distal']),
  Middle:Object.freeze(['Proximal','Intermediate','Distal']),
  Ring:Object.freeze(['Proximal','Intermediate','Distal']),
  Little:Object.freeze(['Proximal','Intermediate','Distal']),
});
export function relaxedFingerAngleDegrees({
  finger,jointIndex,relaxation=0.85,blend=1,activity=0,
  individualPulse=0,sharedPulse=0,side='left',
}={}) {
  const targets=PROFILE[finger];
  if(!targets||!Number.isInteger(jointIndex)||jointIndex<0||jointIndex>2)return 0;
  const amount=clamp(Number(relaxation)||0,0,1)*clamp(Number(blend)||0,0,1);
  const energy=clamp(Number(activity)||0,0,2.4);
  // Left/right aren't duplicates even when all pulse values are zero.
  const sided=side==='right'?0.96:1;
  const baseline=targets[jointIndex]*amount*sided;
  const articulation=jointIndex===0?0.8:jointIndex===1?1:0.65;
  const pulse=(Number(individualPulse)||0)*0.76+(Number(sharedPulse)||0)*0.24;
  const perturb=5.2*pulse*energy*articulation;
  return clamp(baseline+perturb,0,48);
}
export function relaxedHandProfile(finger) {
  return PROFILE[finger] ? [...PROFILE[finger]] : null;
}
