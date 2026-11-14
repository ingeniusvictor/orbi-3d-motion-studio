// AUTORIG-02C.2 — non-destructive bone influence inspection.
// Diagnostic colors describe numerical skin weights, NOT animation quality.
const STOPS=[
  [0.00,[0.035,0.08,0.22]],   // zero / dark blue
  [0.20,[0.04,0.32,0.84]],    // low / blue
  [0.45,[0.02,0.84,0.72]],    // medium / cyan-green
  [0.70,[0.98,0.80,0.12]],    // high / yellow
  [1.00,[1.00,0.18,0.09]],    // full / red
];

export function influenceColor(value){
  if(!Number.isFinite(value)||value<0||value>1)
    throw new Error('La influencia debe estar entre 0 y 1.');
  for(let i=1;i<STOPS.length;i++){
    if(value<=STOPS[i][0]){
      const [a,ca]=STOPS[i-1], [b,cb]=STOPS[i];
      const t=(value-a)/(b-a);
      return ca.map((v,k)=>v+(cb[k]-v)*t);
    }
  }
  return [...STOPS.at(-1)[1]];
}

export function boneInfluenceHeatmap(indices,weights,boneIndex){
  if(!Number.isInteger(boneIndex)||boneIndex<0||boneIndex>65535)
    throw new Error('Índice de hueso no válido.');
  if(!indices||!weights||indices.length!==weights.length||
      indices.length<4||indices.length%4!==0)
    throw new Error('Buffers de skinning incompletos.');
  const total=indices.length/4;
  const colors=new Float32Array(total*3);
  let influenced=0,strong=0,sum=0,max=0;
  for(let v=0;v<total;v++){
    let influence=0;
    for(let k=0;k<4;k++){
      const index=indices[v*4+k],weight=weights[v*4+k];
      if(!Number.isFinite(index)||!Number.isInteger(index)||index<0||
          !Number.isFinite(weight)||weight<0||weight>1.00001)
        throw new Error('Datos de influencia inválidos en vértice '+v);
      if(index===boneIndex)influence+=weight;
    }
    if(influence>1.0001)throw new Error('Influencia acumulada excede 1.');
    influence=Math.min(1,influence);
    if(influence>.001)influenced++;
    if(influence>=.5)strong++;
    sum+=influence;max=Math.max(max,influence);
    colors.set(influenceColor(influence),v*3);
  }
  return {
    colors,
    stats:{
      vertices:total,
      influencedVertices:influenced,
      strongVertices:strong,
      influenceSum:sum,
      averageInfluence:sum/total,
      maximumInfluence:max,
    },
  };
}

export function combineInfluenceAudits(items){
  if(!Array.isArray(items)||!items.length)
    return {vertices:0,influencedVertices:0,strongVertices:0,
      influenceSum:0,averageInfluence:0,maximumInfluence:0};
  const out={vertices:0,influencedVertices:0,strongVertices:0,
    influenceSum:0,averageInfluence:0,maximumInfluence:0};
  for(const item of items){
    for(const key of ['vertices','influencedVertices','strongVertices','influenceSum'])
      out[key]+=item[key];
    out.maximumInfluence=Math.max(out.maximumInfluence,item.maximumInfluence);
  }
  out.averageInfluence=out.vertices?out.influenceSum/out.vertices:0;
  return out;
}
