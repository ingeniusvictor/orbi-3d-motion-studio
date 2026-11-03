/**
 * Read the actual FBX "Model"/"LimbNode" entries from a binary FBX 7400.
 * Three.js FBXLoader may create a separate JavaScript Bone proxy for each
 * skinned mesh/deformer; counting those objects is NOT the number of
 * independent bones in the FBX file.
 *
 * The writer used by ORBI exports 7400. Fail closed on malformed structure,
 * duplicated physical bone names, unsupported versions and incomplete rigs.
 */
export function readPhysicalFbxBoneNames(input) {
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  if(bytes.length<40)throw new Error('Archivo FBX incompleto.');
  const magic=[75,97,121,100,97,114,97,32,70,66,88,32,66,105,110,97,114,121,32,32,0,26,0];
  if(!magic.every((v,i)=>bytes[i]===v))throw new Error('Archivo FBX binario no válido.');
  const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const version=data.getUint32(23,true);
  if(version!==7400)throw new Error('La auditoría del esqueleto FBX requiere versión 7400; versión detectada: '+version);
  const decoder=new TextDecoder();
  const names=new Set();
  const readString=(pos,limit)=>{
    if(pos+5>limit || bytes[pos]!==83)throw new Error('Propiedad FBX String inválida.');
    const length=data.getUint32(pos+1,true);
    if(length>1024*1024||pos+5+length>limit)throw new Error('Cadena FBX fuera de límites.');
    return {value:decoder.decode(bytes.subarray(pos+5,pos+5+length)),end:pos+5+length};
  };
  let visited=0;
  const parseChildren=(start,stop,depth)=>{
    if(depth>80)throw new Error('Jerarquía FBX demasiado profunda.');
    let pos=start;
    while(pos+13<=stop){
      let empty=true;
      for(let i=0;i<13;i++)if(bytes[pos+i]!==0){empty=false;break;}
      if(empty)return;
      if(++visited>200000)throw new Error('Archivo FBX con demasiados nodos.');
      const end=data.getUint32(pos,true);
      const propertyCount=data.getUint32(pos+4,true);
      const propertyLength=data.getUint32(pos+8,true);
      const nameLength=bytes[pos+12];
      const nameStart=pos+13,propStart=nameStart+nameLength;
      const propEnd=propStart+propertyLength;
      if(end<=pos||end>stop||nameLength>255||propEnd>end||propEnd>bytes.length)
        throw new Error('Nodo FBX con tamaño inválido.');
      const nodeName=decoder.decode(bytes.subarray(nameStart,propStart));
      if(nodeName==='Model' && propertyCount>=3){
        let cursor=propStart;
        if(bytes[cursor]!==76||cursor+9>propEnd)throw new Error('Identificador FBX Model inválido.');
        cursor+=9; // L (int64 model id)
        const named=readString(cursor,propEnd);cursor=named.end;
        const kind=readString(cursor,propEnd);
        if(kind.value==='LimbNode'){
          const boneName=named.value.split('\u0000')[0];
          if(!boneName)throw new Error('Modelo de hueso FBX sin nombre.');
          if(names.has(boneName))
            throw new Error('El FBX contiene dos huesos físicos llamados «'+boneName+'».');
          names.add(boneName);
        }
      }
      if(propEnd<end)parseChildren(propEnd,end,depth+1);
      pos=end;
    }
    if(pos!==stop)throw new Error('Desalineación de nodos en FBX.');
  };
  parseChildren(27,bytes.length,0);
  if(!names.size)throw new Error('El archivo FBX no contiene ningún hueso físico LimbNode.');
  return names;
}
