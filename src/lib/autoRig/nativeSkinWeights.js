// AUTORIG-02C.1 — geometrical CPU weights, independent of Blender and Three.js.
// This is a TEST CANDIDATE only: proximity cannot identify skin/garment topology.
export const MAX_INFLUENCES=4;
const finite3=point=>Array.isArray(point)&&point.length===3&&point.every(Number.isFinite);
const len2=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

export function prepareBoneSegments(bones){
  if(!Array.isArray(bones)||bones.length<1||bones.length>65535)
    throw new Error('El esqueleto no contiene una cantidad válida de huesos.');
  const names=new Set();
  return bones.map((bone,index)=>{
    if(typeof bone?.name!=='string'||!bone.name||names.has(bone.name))
      throw new Error('Hueso duplicado o sin nombre.');
    names.add(bone.name);
    if(!finite3(bone.head)||!finite3(bone.tail))
      throw new Error('Coordenadas no finitas en '+bone.name);
    const ax=bone.head[0],ay=bone.head[1],az=bone.head[2];
    const vx=bone.tail[0]-ax,vy=bone.tail[1]-ay,vz=bone.tail[2]-az;
    const l2=vx*vx+vy*vy+vz*vz;
    if(l2<1e-14)throw new Error('Hueso de longitud cero: '+bone.name);
    return {index,name:bone.name,ax,ay,az,vx,vy,vz,l2};
  });
}

function distanceSqToBone(x,y,z,b){
  const dx=x-b.ax,dy=y-b.ay,dz=z-b.az;
  const t=Math.max(0,Math.min(1,(dx*b.vx+dy*b.vy+dz*b.vz)/b.l2));
  const qx=dx-t*b.vx,qy=dy-t*b.vy,qz=dz-t*b.vz;
  return qx*qx+qy*qy+qz*qz;
}

export function computeSkinWeights(positions,bones,{
  softness,
  maxInfluences=MAX_INFLUENCES,
}={}){
  if(!ArrayBuffer.isView(positions)&&!Array.isArray(positions))
    throw new Error('Se requieren posiciones XYZ de vértices.');
  if(!Number.isSafeInteger(positions.length)||positions.length%3!==0||positions.length<3)
    throw new Error('Las posiciones deben ser ternas XYZ no vacías.');
  if(!Number.isInteger(maxInfluences)||maxInfluences<1||maxInfluences>4)
    throw new Error('Se permiten entre 1 y 4 influencias.');
  const segments=prepareBoneSegments(bones);
  const range=Math.max(...segments.flatMap(b=>[b.ay,b.ay+b.vy]))-
    Math.min(...segments.flatMap(b=>[b.ay,b.ay+b.vy]));
  const s=(softness===undefined?Math.max(range*.016,1e-5):softness);
  if(!Number.isFinite(s)||s<=0)throw new Error('Suavizado no válido.');
  const count=positions.length/3;
  if(count>300000)throw new Error('El piloto limita cada malla a 300.000 vértices.');
  const indices=new Uint16Array(count*4);
  const weights=new Float32Array(count*4);
  const boneVertices=new Uint32Array(segments.length);
  const boneInfluenceSum=new Float64Array(segments.length);
  let minimumDominance=1,maximumDominance=0,dominanceTotal=0;
  const candidates=[];
  const softnessSq=s*s;
  for(let i=0;i<count;i++){
    const x=positions[i*3],y=positions[i*3+1],z=positions[i*3+2];
    if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z))
      throw new Error('Vértice no finito en índice '+i);
    candidates.length=0;
    for(const b of segments)
      candidates.push({index:b.index,d2:distanceSqToBone(x,y,z,b)});
    candidates.sort((a,b)=>a.d2-b.d2||a.index-b.index);
    const near=candidates.slice(0,maxInfluences);
    const base=near[0].d2+softnessSq;
    const raw=near.map(b=>({index:b.index,w:Math.pow(base/(b.d2+softnessSq),2)}))
      .filter(b=>b.w>=.001);
    const sum=raw.reduce((total,b)=>total+b.w,0);
    if(!Number.isFinite(sum)||sum<=0)throw new Error('No se pudieron normalizar pesos.');
    let dominance=0;
    for(let k=0;k<raw.length;k++){
      const idx=i*4+k;
      const w=raw[k].w/sum;
      indices[idx]=raw[k].index;
      weights[idx]=w;
      boneVertices[raw[k].index]++;
      boneInfluenceSum[raw[k].index]+=w;
      if(w>dominance)dominance=w;
    }
    minimumDominance=Math.min(minimumDominance,dominance);
    maximumDominance=Math.max(maximumDominance,dominance);
    dominanceTotal+=dominance;
  }
  const audit={
    vertices:count,
    influencedVertices:count,
    maxInfluences,
    sourceMethod:'distance-approximation',
    requiresDeformationQA:true,
    minDominance:minimumDominance,
    maxDominance:maximumDominance,
    meanDominance:dominanceTotal/count,
    coveredBones:Array.from(boneVertices).filter(v=>v>0).length,
    totalBones:segments.length,
    boneVertices:Array.from(boneVertices),
    boneInfluenceSum:Array.from(boneInfluenceSum),
  };
  return {indices,weights,audit};
}

export function validateWeightBuffers(indices,weights,boneCount){
  if(!indices||!weights||indices.length!==weights.length||
    indices.length<4||indices.length%4!==0)
    return {ok:false,reason:'Matrices de pesos e índices incompatibles.'};
  for(let i=0;i<indices.length;i+=4){
    let sum=0;
    for(let k=0;k<4;k++){
      const w=weights[i+k],idx=indices[i+k];
      if(!Number.isFinite(w)||w<0||w>1.00001||!Number.isInteger(idx)||idx>=boneCount)
        return {ok:false,reason:'Peso o índice inválido en el vértice '+i/4};
      sum+=w;
    }
    if(Math.abs(sum-1)>1e-4)
      return {ok:false,reason:'Pesos desnormalizados en el vértice '+i/4};
  }
  return {ok:true,vertices:indices.length/4};
}
