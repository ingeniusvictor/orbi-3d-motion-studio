// LP-02D: pseudorandom, reproducible visual fixations (not framewise jitter).
// An eye movement is a saccade followed by a genuine hold on a target.
const clamp=(n,low,high)=>Math.max(low,Math.min(high,n));
const smooth=x=>{const t=clamp(x,0,1);return t*t*(3-2*t);};
function rng(seed){
  let x=seed>>>0;
  return ()=>{
    x=(x+0x6D2B79F5)>>>0;
    let t=x;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
const rad=degrees=>degrees*Math.PI/180;
export class AttentionDirector{
  constructor(seed=20261107){
    this.random=rng(seed);
    this.from={yaw:0,pitch:0};
    this.to={yaw:0,pitch:0};
    this.start=0;
    this.end=0;
    this.next=1.2+this.random()*2.7;
    this.lastTime=0;
    this.fingerprint=[];
    this.events=0;
  }
  at(t){
    if(t<=this.start)return {...this.from};
    if(t>=this.end)return {...this.to};
    const f=smooth((t-this.start)/Math.max(0.01,this.end-this.start));
    return {yaw:this.from.yaw+(this.to.yaw-this.from.yaw)*f,
      pitch:this.from.pitch+(this.to.pitch-this.from.pitch)*f};
  }
  chooseTarget(){
    // Some fixations return to the interlocutor/camera; others roam nearby.
    if(this.random()<0.23)return {yaw:0,pitch:0};
    let yaw=0,pitch=0;
    for(let i=0;i<6;i++){
      yaw=rad((this.random()*2-1)*12);
      pitch=rad((this.random()*2-1)*6);
      if(Math.abs(yaw-this.to.yaw)>rad(2.5)||
         Math.abs(pitch-this.to.pitch)>rad(1.5))break;
    }
    return {yaw,pitch};
  }
  sample(seconds){
    if(!Number.isFinite(seconds))return this.at(this.lastTime);
    const t=Math.max(0,seconds);
    if(t<this.lastTime){
      this.from={yaw:0,pitch:0};this.to={yaw:0,pitch:0};
      this.start=t;this.end=t;this.next=t+1.5+this.random()*2;
    }
    this.lastTime=t;
    // Bound catch-up after browser suspension. Do not barrage the avatar
    // with dozens of skipped glances on a resumed foreground tab.
    if(t>=this.next){
      this.from=this.at(this.next);
      this.to=this.chooseTarget();
      this.start=t;
      this.end=t+0.11+this.random()*0.18; // rapid eyes, slow head later
      this.next=this.end+1.5+this.random()*4.8;
      this.events++;
      this.fingerprint.push({yaw:this.to.yaw,pitch:this.to.pitch,start:this.start});
      if(this.fingerprint.length>16)this.fingerprint.shift();
    }
    return this.at(t);
  }
}
