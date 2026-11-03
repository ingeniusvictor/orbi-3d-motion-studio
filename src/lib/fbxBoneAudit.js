/**
 * Read *physical* LimbNode models and OO parent connections from FBX 7400.
 * FBXLoader makes per-mesh runtime Bone proxies: 155 × 17 does not mean the
 * FBX contains 2635 physical skeleton bones. This parser audits the binary.
 */
export function readPhysicalFbxRig(input) {
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  const magic=[75,97,121,100,97,114,97,32,70,66,88,32,66,105,110,97,114,121,32,32,0,26,0];
  if(bytes.length<40||!magic.every((v,i)=>bytes[i]===v))
    throw new Error('Archivo FBX binario no válido.');
  const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const version=data.getUint32(23,true);
  if(version!==7400)throw new Error('La auditoría del esqueleto FBX requiere versión 7400; versión: '+version);
  const decode=new TextDecoder();
  const modelById=new Map(), boneIds=new Set(), connections=new Map();
  let visited=0;
  const str=(start,limit)=>{
    if(start+5>limit||bytes[start]!==83)throw new Error('Propiedad de texto FBX inválida.');
    const len=data.getUint32(start+1,true);
    if(len>1024*1024||start+5+len>limit)throw new Error('Texto FBX fuera de límites.');
    return {value:decode.decode(bytes.subarray(start+5,start+5+len)),next:start+5+len};
  };
  const id=(start,limit)=>{
    if(start+9>limit||bytes[start]!==76)throw new Error('Identificador de FBX inválido.');
    return {value:data.getBigInt64(start+1,true).toString(),next:start+9};
  };
  const read=(pos,stop,depth)=>{
    if(depth>80)throw new Error('Jerarquía FBX demasiado profunda.');
    while(pos+13<=stop){
      let zero=true;
      for(let k=0;k<13;k++)if(bytes[pos+k]!==0){zero=false;break;}
      if(zero)return;
      if(++visited>250000)throw new Error('Demasiados nodos FBX.');
      const end=data.getUint32(pos,true),count=data.getUint32(pos+4,true);
      const size=data.getUint32(pos+8,true),len=bytes[pos+12];
      const propStart=pos+13+len,propEnd=propStart+size;
      if(end<=pos||end>stop||propEnd>end||propEnd>bytes.length)
        throw new Error('Nodo FBX dañado o fuera de límites.');
      const name=decode.decode(bytes.subarray(pos+13,propStart));
      if(name==='Model' && count>=3){
        let cursor=propStart;
        const modelId=id(cursor,propEnd);cursor=modelId.next;
        const named=str(cursor,propEnd);cursor=named.next;
        const kind=str(cursor,propEnd);
        const modelName=named.value.split('\u0000')[0];
        if(modelById.has(modelId.value))throw new Error('Identificador FBX Model repetido.');
        modelById.set(modelId.value,{name:modelName,kind:kind.value});
        if(kind.value==='LimbNode')boneIds.add(modelId.value);
      }
      if(name==='C'&&count>=3){
        let cursor=propStart;
        const kind=str(cursor,propEnd);cursor=kind.next;
        if(kind.value==='OO'){
          const child=id(cursor,propEnd);cursor=child.next;
          const parent=id(cursor,propEnd);
          if(connections.has(child.value)&&connections.get(child.value)!==parent.value)
            throw new Error('Modelo FBX con múltiples padres físicos.');
          connections.set(child.value,parent.value);
        }
      }
      if(propEnd<end)read(propEnd,end,depth+1);
      pos=end;
    }
    if(pos!==stop)throw new Error('Lista de nodos FBX desalineada.');
  };
  read(27,bytes.length,0);
  const rig=new Map();
  for(const boneId of boneIds){
    const name=modelById.get(boneId)?.name;
    if(!name)throw new Error('Hueso FBX sin nombre.');
    if(rig.has(name))throw new Error('El FBX tiene dos huesos físicos llamados «'+name+'».');
    let parentId=connections.get(boneId)||'0';
    const visitedParents=new Set();
    // Climb non-bone root/armature wrappers to the closest actual LimbNode.
    while(parentId!=='0' && !boneIds.has(parentId)){
      if(visitedParents.has(parentId))throw new Error('Ciclo en la jerarquía del FBX.');
      visitedParents.add(parentId);
      parentId=connections.get(parentId)||'0';
    }
    const parent=parentId==='0'?null:modelById.get(parentId)?.name||null;
    rig.set(name,parent);
  }
  if(!rig.size)throw new Error('El FBX no contiene huesos físicos LimbNode.');
  return rig;
}
export const readPhysicalFbxBoneNames = input => new Set(readPhysicalFbxRig(input).keys());
