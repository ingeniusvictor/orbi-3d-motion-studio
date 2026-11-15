// MOTION-07: reconstruct a Blender-ready folder using only scripts from the
// V4 kit the user selects locally. Do not reimplement or download a different
// FBX exporter; preserve the user-approved original script byte for byte.
import {unzipSync,zip} from 'fflate';
import {sha256Hex} from './autoRig/toeWeightTransfer.js';

export const TOELOCK_V4_KIT_SCRIPTS=Object.freeze({
  'CREAR_FBX_MIXAMO.cmd':
    'c98bf30830172f63ea7aaf91747f65ce261d3a2e22a137ae2b5d3695515f7b40',
  'tools/exportar_claude_D162_fbx.py':
    '48730c28430f0bbd3147f274d9fd9bc40ab789652a1eaa5519d46499aead29ee',
  'tools/fix_toe_weights_glb.py':
    '4d462dcc5e49f95d117293c0d91acfdc4ed72f69e0f12de9ec9251936dc4939e',
});
const decoder=new TextEncoder();
const toBytes=data=>data instanceof Uint8Array
  ?data:new Uint8Array(data);
export async function inspectToeLockKit(input){
  const bytes=toBytes(input);
  if(bytes.byteLength>20*1024*1024)
    throw new Error('El ZIP del kit ToeLock V4 supera 20 MB. No se abrirá.');
  // Check the complete certified ZIP before decompression to avoid
  // zip bombs, tampered scripts or arbitrary Blender payloads.
  const hash=await sha256Hex(bytes.buffer.slice(
    bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  if(hash!=='c316cc4820091af201d560005e3b1a1fdda5193814d57d9b0bb01ad60b0fff7e')
    throw new Error('El ZIP no coincide con el kit V4 íntegro aprobado.');
  let files;
  try{files=unzipSync(bytes);}
  catch{throw new Error('No se pudo abrir el ZIP ToeLock V4.');}
  if(Object.keys(files).length>20)
    throw new Error('El ZIP contiene archivos inesperados; se requiere revisión.');
  const scripts={};
  for(const [name,expected] of Object.entries(TOELOCK_V4_KIT_SCRIPTS)){
    const data=files[name];
    if(!data||data.length>100*1024)
      throw new Error('Falta el script de referencia V4: '+name);
    const sha=await sha256Hex(data.buffer.slice(
      data.byteOffset,data.byteOffset+data.byteLength));
    if(sha!==expected)
      throw new Error('El script difiere del V4 aprobado: '+name);
    scripts[name]=new Uint8Array(data);
  }
  return {scripts,sourceEntries:Object.keys(files),
    certified:true,version:'LUMIA Claude D162 ToeLock V4'};
}
export function zipToeLockFiles(files){
  return new Promise((resolve,reject)=>{
    zip(files,{level:6},(error,result)=>{
      if(error)reject(error);else resolve(result);
    });
  });
}
export async function makeToeLockMixamoPackage({
  kitBuffer,glbBuffer,report,
}){
  if(!glbBuffer||!report?.targetSha256||
     report.targetSha256!=='b85dc554a54d442ea2a9c375f21468349501fd11f568afbd2848b2b8766c0ec0')
    throw new Error('Primero debes obtener la copia D162 V4 con SHA certificado.');
  const {scripts}=await inspectToeLockKit(kitBuffer);
  const model=toBytes(glbBuffer);
  if(await sha256Hex(model.buffer.slice(
    model.byteOffset,model.byteOffset+model.byteLength))!==report.targetSha256)
    throw new Error('El GLB preparado no coincide con el SHA registrado.');
  const audit=JSON.stringify({
    schema:'orbi/motion-07/toelock-v4',...report,
    exporterScriptsValidated:true,
    mixamoValidation:'PENDIENTE_PRUEBA_MANUAL_DE_LOS_FBX_GENERADOS',
    blenderValidation:'PENDIENTE_EJECUCION_WINDOWS',
  },null,2);
  const readme=[
    'ORBI MOTION-07 / LUMIA CLAUDE D162 TOELOCK V4',
    '',
    '1. Descomprime este paquete en una carpeta de Windows.',
    '2. Ejecuta CREAR_FBX_MIXAMO.cmd con Blender 5.2 instalado.',
    '3. Los FBX COMPAT y COLOR apareceran en FBX_GENERADOS.',
    '4. Sube COMPAT a Mixamo, prueba ambos pies, luego COLOR.',
    '5. Si Blender falla, conserva EXPORTAR_FBX_LOG.txt.',
    '',
    'IMPORTANTE: esta es la COPIA temporal D162 para Mixamo.',
    'No modifiques el modelo maestro LUMIA Claude 346.',
    'El bloqueo de ToeBase a Foot es intencional SOLO en la copia.',
    'El postprocesamiento keep/auto/lock de MOTION-06 es independiente.',
    'Este paquete reutiliza scripts exactos del kit V4 aprobado.',
  ].join('\r\n');
  const files={
    ...scripts,
    'LUMIA_CLAUDE_MIXAMO_D162.glb':model,
    'QA_TOELOCK_V4_ORBI.json':decoder.encode(audit),
    'LEEME_ORBI_MOTION_07.txt':decoder.encode(readme),
  };
  return zipToeLockFiles(files);
}
