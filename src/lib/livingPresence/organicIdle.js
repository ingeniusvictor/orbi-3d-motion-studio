// LP-02B — independent, seeded, sparse events: movement, holds and recovery.
// A believable idle is not several simultaneous periodic loops.
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const ease = x => { const t=clamp(x,0,1);return t*t*(3-2*t); };
function seeded(seed) {
  let value=seed>>>0;
  return () => {
    value=(value+0x6D2B79F5)>>>0;
    let t=value;
    t=Math.imul(t^(t>>>15),t|1);
    t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
export class SparseMotionLane {
  constructor(seed, {gap=[1,4],duration=[0.8,2.5],attack=0.78,release=0.86}={}) {
    this.random=seeded(seed);
    this.gap=gap;this.duration=duration;
    this.attack=attack;this.release=release;
    this.event=null;
    this.nextStart=this.range(gap);
    this.lastTime=0;
    this.eventsStarted=0;
  }
  range([low,high]) {return low+(high-low)*this.random();}
  sample(t) {
    if(!Number.isFinite(t))return 0;
    // On a clock reset, reset the pending event (never generate NaN).
    if(t<this.lastTime){this.event=null;this.nextStart=t+this.range(this.gap);}
    this.lastTime=t;
    for(let i=0;i<12;i++){
      if(this.event&&t>=this.event.end){
        this.event=null;
        this.nextStart+=this.range(this.gap);
      }
      if(!this.event&&t>=this.nextStart){
        const duration=this.range(this.duration);
        this.event={start:this.nextStart,end:this.nextStart+duration,
          amount:this.random()*1.8-0.9};
        this.nextStart=this.event.end;
        this.eventsStarted++;
      }
      if(!this.event||t<this.event.end)break;
    }
    if(!this.event)return 0;
    const e=this.event;
    const inTime=(t-e.start)/Math.max(0.01,this.attack);
    const outTime=(e.end-t)/Math.max(0.01,this.release);
    return e.amount*ease(inTime)*ease(outTime);
  }
}
const FINGERS=['Thumb','Index','Middle','Ring','Little'];
export class OrganicIdleScore {
  constructor(seed=7026) {
    this.lanes=new Map();
    const add=(name,offset,opts)=>this.lanes.set(name,new SparseMotionLane(seed+offset,opts));
    add('leftWrist',11,{gap:[0.8,2.8],duration:[1.5,3.6]});
    add('rightWrist',23,{gap:[1.3,3.6],duration:[1.7,4.1]});
    add('leftElbow',31,{gap:[3,8],duration:[2.2,4.5]});
    add('rightElbow',47,{gap:[4,9],duration:[2.5,4.7]});
    add('leftShoulder',59,{gap:[4,9],duration:[1.8,4]});
    add('rightShoulder',61,{gap:[4,10],duration:[1.9,4.4]});
    add('headYaw',73,{gap:[4,10],duration:[2.5,5.5],attack:0.6,release:0.9});
    add('headTilt',79,{gap:[5,12],duration:[2.3,5.6],attack:0.7,release:1.0});
    add('neck',89,{gap:[5,12],duration:[1.8,4.1]});
    for(const [side,sideIndex] of [['left',0],['right',1]]){
      add(side+'Fingers',103+sideIndex*211,{gap:[0.5,2.6],duration:[1,3.1]});
      for(let i=0;i<FINGERS.length;i++){
        add(side+FINGERS[i],127+sideIndex*211+i*13,
          {gap:[1,4.8],duration:[0.9,2.6],attack:0.3,release:0.5});
      }
    }
    add('gazeX',901,{gap:[0.5,3.6],duration:[0.7,2.2],attack:0.08,release:0.17});
    add('gazeY',909,{gap:[1.1,4.1],duration:[0.8,2.2],attack:0.08,release:0.17});
  }
  sample(t) {
    const values={};
    for(const [name,lane] of this.lanes)values[name]=lane.sample(t);
    return values;
  }
}
export class NaturalBlink {
  constructor(seed=599){
    this.random=seeded(seed);
    this.next=1.1+this.random()*2.2;
    this.start=Infinity;
    this.duration=0.14;
    this.doublePending=false;
  }
  sample(t) {
    if(!Number.isFinite(t)||t<0)return 0;
    if(t>=this.next){
      this.start=this.next;
      this.duration=0.12+this.random()*0.1;
      this.next=Infinity;
    }
    if(!Number.isFinite(this.start))return 0;
    const phase=(t-this.start)/this.duration;
    if(phase>=1){
      if(this.doublePending) {
        // A rare second closure completed: return to a longer restful interval.
        this.doublePending=false;
        this.next=this.start+this.duration+2.3+this.random()*4.9;
      } else {
        this.doublePending=this.random()<0.12;
        this.next=this.start+this.duration+(this.doublePending?0.13:2.3+this.random()*4.9);
      }
      this.start=Infinity;
      return 0;
    }
    // Fast lid closing, slightly slower reopening.
    return phase<0.42?ease(phase/0.42):1-ease((phase-0.42)/0.58);
  }
}
