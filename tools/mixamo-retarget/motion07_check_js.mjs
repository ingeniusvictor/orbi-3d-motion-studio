#!/usr/bin/env node
// Reproduce browser MOTION-07 on local real assets without uploading them.
// Node >=20.19, run from the repository root after npm install.
import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,extname,dirname,basename} from 'node:path';
import {applyToeLockV4,TOELOCK_V4} from '../../src/lib/autoRig/toeWeightTransfer.js';
function help(){
  console.log('Uso: node tools/mixamo-retarget/motion07_check_js.mjs ORIGINAL_D162.glb NUEVO_D162_V4.glb');
}
async function main(args){
  if(args.length!==2){help();process.exitCode=2;return;}
  const source=resolve(args[0]),destination=resolve(args[1]);
  if(source===destination||extname(source).toLowerCase()!=='.glb'||
     extname(destination).toLowerCase()!=='.glb')
    throw new Error('Prohibido sobrescribir la fuente. Ambas rutas deben ser GLB.');
  try{await stat(destination);throw new Error('La salida ya existe. No se sobrescribirá.');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const sourceBytes=await readFile(source);
  const ab=sourceBytes.buffer.slice(sourceBytes.byteOffset,
    sourceBytes.byteOffset+sourceBytes.byteLength);
  const output=await applyToeLockV4(ab);
  if(output.report.targetSha256!==TOELOCK_V4.correctedSha256)
    throw new Error('No coincide el SHA Golden V4.');
  await writeFile(destination,new Uint8Array(output.buffer),{flag:'wx'});
  const audit={
    ...output.report,sourceFile:basename(source),targetFile:basename(destination),
    blender:'PENDIENTE',mixamo:'PENDIENTE',
  };
  console.log(JSON.stringify(audit,null,2));
  console.log('GLB V4 escrito. No se tocó el maestro de 346 huesos.');
}
main(process.argv.slice(2)).catch(error=>{
  console.error('MOTION-07 ERROR:',error.message);
  process.exitCode=1;
});
