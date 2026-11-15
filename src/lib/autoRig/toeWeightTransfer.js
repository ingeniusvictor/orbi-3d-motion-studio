// MOTION-07 — ToeLock V4. Binary GLB adapter of the approved user-owned
// fix_toe_weights_glb.py, for the *temporary* 162-bone Mixamo proxy only.
// Never transform the original 346-bone artistic master.
// Fail closed on unknown rigs, extension buffers or additional joint sets.
const SOURCE_SHA='a58a5061c9e2db63370b90d5f985078efb727ec2ef2a2fe49b46b058e293c5fa';
const GOLDEN_SHA='b85dc554a54d442ea2a9c375f21468349501fd11f568afbd2848b2b8766c0ec0';
export const TOELOCK_V4=Object.freeze({
  sourceSha256:SOURCE_SHA,correctedSha256:GOLDEN_SHA,bones:162,
  vertices:47386,triangles:73157,
  left:'J_Bip_L_ToeBase',right:'J_Bip_R_ToeBase',
  leftFoot:'J_Bip_L_Foot',rightFoot:'J_Bip_R_Foot',
});
const enc=new TextDecoder();
const E=(msg)=>{throw new Error('ToeLock V4: '+msg);};
const u32=(v,o)=>v.getUint32(o,true);
const ct={5121:[1,'getUint8','setUint8'],5123:[2,'getUint16','setUint16'],
  5125:[4,'getUint32','setUint32'],5126:[4,'getFloat32','setFloat32']};
const tri=prim=>prim.mode==null||prim.mode===4;
const aligned=(v,n)=>(v%n)===0;
const cloneBuffer=arg=>{
  if(arg instanceof ArrayBuffer)return arg.slice(0);
  if(ArrayBuffer.isView(arg))return arg.buffer.slice(
    arg.byteOffset,arg.byteOffset+arg.byteLength);
  E('Se necesita un ArrayBuffer de archivo GLB.');
};
export async function sha256Hex(arrayBuffer){
  if(!globalThis.crypto?.subtle)E('Web Crypto SHA-256 no está disponible.');
  const digest=await globalThis.crypto.subtle.digest('SHA-256',arrayBuffer);
  return [...new Uint8Array(digest)]
    .map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function parseToeLockGLB(buffer){
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<36)
    E('Archivo GLB truncado.');
  const view=new DataView(buffer);
  if(u32(view,0)!==0x46546c67||u32(view,4)!==2||
      u32(view,8)!==buffer.byteLength)
    E('GLB 2.0 inválido o tamaño declarado incorrecto.');
  const jsonBytes=u32(view,12),jsonType=u32(view,16);
  if(jsonType!==0x4e4f534a||jsonBytes<4||20+jsonBytes+8>buffer.byteLength)
    E('Bloque JSON GLB inválido.');
  let doc;
  try{doc=JSON.parse(enc.decode(new Uint8Array(buffer,20,jsonBytes)));}
  catch{E('No se puede interpretar el JSON glTF.');}
  const binHead=20+jsonBytes,binBytes=u32(view,binHead);
  if(u32(view,binHead+4)!==0x004e4942||
    binHead+8+binBytes!==buffer.byteLength)
    E('Se requiere un único bloque BIN completo, sin chunks adicionales.');
  const binStart=binHead+8;
  if(doc.buffers?.length!==1||doc.buffers[0].byteLength>binBytes)
    E('Buffers GLB inesperados.');
  if(doc.extensionsRequired?.length)
    E('Extensiones obligatorias sin auditar: '+doc.extensionsRequired.join(', '));
  return {view,doc,binStart,binBytes};
}
function accessor(glb,id,kind){
  const {doc,view,binStart,binBytes}=glb;
  const a=doc.accessors?.[id];
  if(!a||a.sparse||a.normalized)E('Accessor sparse/normalized o ausente: '+id);
  const pair=ct[a.componentType];
  if(!pair||a.type!=='VEC4'||(kind==='weights'&&a.componentType!==5126)||
      (kind==='joints'&&a.componentType===5126))
    E('JOINTS_0 debe ser entero VEC4 y WEIGHTS_0 float32 VEC4.');
  const b=doc.bufferViews?.[a.bufferView];
  if(!b||b.buffer!==0)E('BufferView no compatible: '+id);
  const [unit,readName,writeName]=pair,packed=unit*4;
  const stride=b.byteStride||packed;
  if(stride<packed||stride%unit)E('Stride inválido: '+id);
  const base=(b.byteOffset||0)+(a.byteOffset||0);
  const end=base+(a.count-1)*stride+packed;
  if(a.count<=0||!Number.isSafeInteger(base)||!Number.isSafeInteger(end)||
      end>(b.byteOffset||0)+b.byteLength||end>binBytes||
      !aligned(binStart+base,unit))
    E('Accessor excede el BIN o no está alineado: '+id);
  return {
    id,count:a.count,unit,stride,base:binStart+base,
    get:(row,slot)=>view[readName](binStart+base+row*stride+slot*unit,unit===1?undefined:true),
    set:(row,slot,value)=>view[writeName](
      binStart+base+row*stride+slot*unit,value,unit===1?undefined:true),
    byteOffset:(row,slot)=>binStart+base+row*stride+slot*unit,
  };
}
function indexValidated(glb){
  const {doc}=glb;
  if(doc.skins?.length!==1||doc.skins[0].joints?.length!==162)
    E('Perfil incompatible: se exige un único skin de 162 huesos.');
  const skin=doc.skins[0],nodes=doc.nodes||[];
  const names=skin.joints.map(i=>nodes[i]?.name);
  if(names.some(n=>typeof n!=='string'||!n)||new Set(names).size!==162)
    E('Nombres de huesos duplicados o faltantes.');
  const index=new Map(names.map((n,i)=>[n,i]));
  const pairs=[
    [TOELOCK_V4.left,TOELOCK_V4.leftFoot],
    [TOELOCK_V4.right,TOELOCK_V4.rightFoot],
  ];
  const parents=new Map();
  for(let i=0;i<nodes.length;i++)
    for(const child of nodes[i].children||[]){
      if(parents.has(child))E('Jerarquía de huesos con más de un padre.');
      parents.set(child,i);
    }
  for(const [toe,foot] of pairs){
    if(!index.has(toe)||!index.has(foot)||
       parents.get(skin.joints[index.get(toe)])!==skin.joints[index.get(foot)])
      E('La jerarquía ToeBase/Foot no es la D162 aprobada: '+toe);
  }
  if(doc.meshes?.length!==2)E('El kit V4 requiere dos mallas lógicas.');
  let vertices=0,triangles=0;
  const entries=[],used=new Set();
  for(const m of doc.meshes){
    for(const p of m.primitives||[]){
      if(!tri(p)||p.indices==null)E('Se requieren primitivas trianguladas e indexadas.');
      const a=p.attributes||{};
      if('JOINTS_1'in a||'WEIGHTS_1'in a)
        E('JOINTS_1/WEIGHTS_1 requiere adaptación auditada, no se omitirá.');
      if(a.JOINTS_0==null||a.WEIGHTS_0==null||a.POSITION==null)
        E('Malla sin skinning o posiciones.');
      if(used.has(a.JOINTS_0)||used.has(a.WEIGHTS_0))
        E('Accessors de skin compartidos; es necesario un tratamiento específico.');
      used.add(a.JOINTS_0);used.add(a.WEIGHTS_0);
      const j=accessor(glb,a.JOINTS_0,'joints');
      const w=accessor(glb,a.WEIGHTS_0,'weights');
      const positions=doc.accessors[a.POSITION],indices=doc.accessors[p.indices];
      if(!positions||!indices||positions.count!==j.count||w.count!==j.count||
         indices.count%3)
        E('Longitudes de atributos o índices incompatibles.');
      vertices+=j.count;triangles+=indices.count/3;
      entries.push({name:m.name||'',j,w,count:j.count});
    }
  }
  if(vertices!==TOELOCK_V4.vertices||triangles!==TOELOCK_V4.triangles)
    E('Topología distinta de la referencia: '+vertices+' vértices y '+triangles+' triángulos.');
  return {index,pairs,entries,vertices,triangles,names};
}
function countPositive(glb,rig){
  const counts=Object.fromEntries(rig.pairs.map(([toe])=>[toe,0]));
  const perMesh=new Map();
  for(const entry of rig.entries){
    let n=0;
    for(let i=0;i<entry.count;i++)
      for(let s=0;s<4;s++){
        const weight=entry.w.get(i,s),joint=entry.j.get(i,s);
        if(!Number.isFinite(weight)||weight<0||joint>=162)
          E('Pesos no finitos, negativos o índices de hueso inválidos.');
        if(weight>1e-7)
          for(const [toe] of rig.pairs)if(joint===rig.index.get(toe)){
            counts[toe]++;n++;
          }
      }
    perMesh.set(entry.name,(perMesh.get(entry.name)||0)+n);
  }
  return {counts,perMesh:[...perMesh].map(([mesh,toeInfluences])=>({mesh,toeInfluences}))};
}
function rowWeights(entry,row){
  return [0,1,2,3].map(s=>entry.w.get(row,s));
}
function sumWeights(weights){
  return weights.reduce((s,v)=>Math.fround(s+v),Math.fround(0));
}
// Pure row operation shared with the binary adapter; useful for testing rigs
// with double toe weights and an existing Foot slot. Never mutates inputs.
export function transferToeWeightSlots(joints,weights,toeIndex,footIndex){
  if(joints?.length!==4||weights?.length!==4||
    ![toeIndex,footIndex].every(Number.isInteger)||toeIndex===footIndex)
    E('La fila skinning debe tener cuatro influencias y huesos distintos.');
  const j=[...joints],w=[...weights];
  let moved=0;
  for(let slot=0;slot<4;slot++){
    const weight=w[slot];
    if(j[slot]!==toeIndex||weight<=1e-7)continue;
    moved++;
    const matching=[];
    for(let k=0;k<4;k++)if(j[k]===footIndex&&w[k]>1e-7)matching.push(k);
    if(matching.length>1)E('La fila contiene varias influencias Foot positivas.');
    if(matching.length===1){
      const dest=matching[0];
      if(dest===slot)E('Skin toe-foot duplicado inesperado.');
      w[dest]=Math.fround(w[dest]+weight);
      w[slot]=0;
      j[slot]=0;
    }else j[slot]=footIndex;
  }
  return {joints:j,weights:w,moved};
}

function patch(glb,rig){
  const moved=Object.fromEntries(rig.pairs.map(([toe])=>[toe,0]));
  let maxDelta=0;
  for(const entry of rig.entries){
    const {j,w,count}=entry;
    for(let row=0;row<count;row++){
      const orig=rowWeights(entry,row),oldSum=sumWeights(orig);
      for(const [toe,foot] of rig.pairs){
        const toeIndex=rig.index.get(toe),footIndex=rig.index.get(foot);
        const joints=[0,1,2,3].map(slot=>j.get(row,slot));
        const weights=rowWeights(entry,row);
        const after=transferToeWeightSlots(joints,weights,toeIndex,footIndex);
        moved[toe]+=after.moved;
        for(let slot=0;slot<4;slot++){
          if(after.joints[slot]!==joints[slot])j.set(row,slot,after.joints[slot]);
          if(after.weights[slot]!==weights[slot])w.set(row,slot,after.weights[slot]);
        }
      }
      const newSum=sumWeights(rowWeights(entry,row));
      maxDelta=Math.max(maxDelta,Math.abs(newSum-oldSum));
      if(maxDelta>2e-6)E('La suma de pesos cambió más de 2e-6.');
    }
  }
  return {moved,maxDelta};
}
async function approvedIdentity(buffer){
  const hash=await sha256Hex(buffer);
  if(hash!==SOURCE_SHA&&hash!==GOLDEN_SHA)
    E('La identidad SHA-256 no coincide con la D162 V4 aprobada. No se modificará el rig desconocido.');
  return hash;
}
export async function inspectToeLockV4(source){
  const copy=cloneBuffer(source),hash=await approvedIdentity(copy);
  const glb=parseToeLockGLB(copy),rig=indexValidated(glb);
  const existing=countPositive(glb,rig);
  return {
    profile:'LUMIA_CLAUDE_D162_V4',sha256:hash,
    alreadyCorrected:hash===GOLDEN_SHA,
    ...existing,vertices:rig.vertices,triangles:rig.triangles,
    bones:162,expectedSha256:GOLDEN_SHA,
    sourceIsApproved:hash===SOURCE_SHA,
  };
}
export async function applyToeLockV4(source){
  const input=cloneBuffer(source);
  const sourceHash=await approvedIdentity(input);
  const glb=parseToeLockGLB(input),rig=indexValidated(glb);
  const before=countPositive(glb,rig);
  if(sourceHash===GOLDEN_SHA){
    if(Object.values(before.counts).some(Boolean))
      E('El archivo aprobado aún contiene influencias ToeBase inesperadas.');
    return {buffer:input,report:{
      profile:'LUMIA_CLAUDE_D162_V4',alreadyCorrected:true,
      sourceSha256:sourceHash,targetSha256:sourceHash,
      moved:Object.fromEntries(rig.pairs.map(([toe])=>[toe,0])),
      maxWeightSumError:0,bones:162,vertices:rig.vertices,triangles:rig.triangles,
      before:before.counts,after:before.counts,
    }};
  }
  if(Object.values(before.counts).some(x=>x<=0))
    E('No se encontraron influencias originales en ambos ToeBase.');
  const {moved,maxDelta}=patch(glb,rig);
  const after=countPositive(glb,rig);
  if(Object.values(after.counts).some(Boolean))
    E('Persisten pesos deformantes en ToeBase.');
  const sha=await sha256Hex(input);
  if(sha!==GOLDEN_SHA)
    E('El resultado no coincide byte a byte con la V4 certificada. No exportar.');
  return {
    buffer:input,
    report:{
      profile:'LUMIA_CLAUDE_D162_V4',
      alreadyCorrected:false,sourceSha256:sourceHash,targetSha256:sha,
      moved,maxWeightSumError:maxDelta,bones:162,
      vertices:rig.vertices,triangles:rig.triangles,
      before:before.counts,after:after.counts,
      geometryChanged:false,materialsChanged:false,
      bindMatricesChanged:false,animationsChanged:false,
      message:'Copia D162 de transporte a Mixamo; la maestra 346 no se modifica.',
    },
  };
}
