// VIEWER-COMPAT-01. Install decoder assets from the project's pinned
// Three.js package locally. Nothing is fetched from an external CDN at runtime.
import {cpSync,existsSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';

const base=resolve('node_modules/three/examples/jsm/libs');
const dest=resolve('public/decoders');
for(const [source,target] of [['draco/gltf','draco'],['basis','basis']]){
  const from=resolve(base,source),to=resolve(dest,target);
  if(!existsSync(from))throw new Error(
    'No se encontraron decodificadores Three.js en '+from+
    '. Ejecuta npm install antes de iniciar ORBI.');
  mkdirSync(to,{recursive:true});
  cpSync(from,to,{recursive:true,force:true});
}
console.log('[ORBI VIEWER] Decodificadores Draco y KTX2 preparados localmente.');
