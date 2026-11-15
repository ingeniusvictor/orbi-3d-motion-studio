import * as THREE from 'three';

// AUTORIG-02C.4: local, reversible adjustments of already-retargeted humanoid clips.
// The controls are ORBI approximations inspired by Mixamo's animation UI,
// NOT Mixamo's proprietary procedural authoring algorithms.
export const DEFAULT_MOTION_ADJUSTMENTS=Object.freeze({
  armSpace:50,        // 50 neutral; >50 increases clearance from torso/legs
  armSwing:100,       // 100% original upper-arm motion, 0% suppresses it
  look:50,            // neutral head turn at 50
  trimStart:0,        // percentage of source clip duration
  trimEnd:100,
  mirror:false,
});
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const AXIS_Z=new THREE.Vector3(0,0,1);
const AXIS_Y=new THREE.Vector3(0,1,0);
const IDENTITY=new THREE.Quaternion();

export function normalizeMotionAdjustments(options={}){
  if(!options||typeof options!=='object'||Array.isArray(options))
    throw new Error('Ajustes de movimiento inválidos.');
  const v={...DEFAULT_MOTION_ADJUSTMENTS,...options};
  for(const [key,lo,hi] of [
    ['armSpace',0,100],['armSwing',0,150],['look',0,100],
    ['trimStart',0,95],['trimEnd',5,100],
  ]){
    if(typeof v[key]!=='number'||!Number.isFinite(v[key]))
      throw new Error('Ajuste no numérico: '+key);
    if(v[key]<lo||v[key]>hi)
      throw new Error('Valor fuera del rango permitido: '+key);
  }
  if(v.trimEnd-v.trimStart<5)
    throw new Error('El recorte debe conservar al menos el 5 % de la animación.');
  if(typeof v.mirror!=='boolean')throw new Error('Mirror debe ser verdadero o falso.');
  return v;
}
const mirrorRole=role=>role.startsWith('left')?'right'+role.slice(4):
  role.startsWith('right')?'left'+role.slice(5):role;

function armSpaceRadians(value){
  const d=value-50;
  return THREE.MathUtils.degToRad(d>=0?d*.70:d*.40); // -20° .. +35°
}

export function adjustHumanoidMotionClip(source,options={}){
  if(!(source instanceof THREE.AnimationClip)||!Number.isFinite(source.duration)||
    source.duration<=0||source.duration>600||!source.tracks.length)
    throw new Error('Se requiere un clip humanoide animado válido.');
  const settings=normalizeMotionAdjustments(options);
  const unchanged=Object.keys(DEFAULT_MOTION_ADJUSTMENTS).every(
    key=>settings[key]===DEFAULT_MOTION_ADJUSTMENTS[key]);
  if(unchanged)return {clip:source,adjusted:false,settings};
  const begin=source.duration*(settings.trimStart/100);
  const duration=source.duration*(settings.trimEnd-settings.trimStart)/100;
  if(duration<.05)throw new Error('El recorte resultante es demasiado corto.');
  const fps=30,frames=Math.max(2,Math.ceil(duration*fps));
  if(frames>18000)throw new Error('La animación supera el límite de muestras.');
  const times=new Float32Array(frames+1);
  for(let i=0;i<=frames;i++)times[i]=duration*i/frames;
  const hasRole=new Set();
  const tracks=[];
  const delta=new THREE.Quaternion(),q=new THREE.Quaternion();
  const space=armSpaceRadians(settings.armSpace);
  const look=THREE.MathUtils.degToRad((settings.look-50)*.5);
  const build=(role,interpolant=null)=>{
    const mapped=settings.mirror?mirrorRole(role):role;
    if(hasRole.has(mapped))throw new Error('Canal animado duplicado: '+mapped);
    hasRole.add(mapped);
    const values=new Float32Array((frames+1)*4);
    for(let i=0;i<=frames;i++){
      if(interpolant)q.fromArray(interpolant.evaluate(begin+times[i]));
      else q.identity();
      if(![q.x,q.y,q.z,q.w].every(Number.isFinite)||q.lengthSq()<1e-10)
        throw new Error('Movimiento contiene cuaterniones no válidos.');
      q.normalize();
      if(settings.mirror){
        // Reflection in the YZ plane: M*R*M, determinant remains +1.
        q.set(q.x,-q.y,-q.z,q.w);
      }
      const isUpperArm=mapped==='leftUpperArm'||mapped==='rightUpperArm';
      if(isUpperArm&&settings.armSwing!==100)
        q.slerpQuaternions(IDENTITY,q,settings.armSwing/100);
      if(isUpperArm&&space!==0){
        const sign=mapped==='leftUpperArm'?-1:1;
        delta.setFromAxisAngle(AXIS_Z,sign*space);
        q.premultiply(delta);
      }
      if(mapped==='head'&&look!==0){
        delta.setFromAxisAngle(AXIS_Y,look);
        q.premultiply(delta);
      }
      q.normalize().toArray(values,i*4);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(
      mapped+'.quaternion',times,values));
  };
  for(const track of source.tracks){
    const match=/^(.+)\.quaternion$/.exec(track.name);
    if(!match)throw new Error('Canal no compatible para editar: '+track.name);
    if(!track.times?.length||track.values?.length!==track.times.length*4)
      throw new Error('Pista de rotación dañada: '+track.name);
    build(match[1],track.createInterpolant());
  }
  // Make look and arm clearance work even if Mixamo omitted these channels.
  const present=new Set(source.tracks.map(t=>t.name.replace(/\.quaternion$/,'')));
  for(const role of ['leftUpperArm','rightUpperArm','head']){
    const mapped=settings.mirror?mirrorRole(role):role;
    const needed=(role==='head'&&look!==0)||
      ((role==='leftUpperArm'||role==='rightUpperArm')&&space!==0);
    if(needed&&!present.has(role)&&!hasRole.has(mapped))
      build(role);
  }
  const clip=new THREE.AnimationClip(
    source.name+' / ajustes ORBI',duration,tracks);
  return {clip,adjusted:true,settings};
}
