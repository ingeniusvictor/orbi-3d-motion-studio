import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {retargetMixamoClip} from './fullBodyMotion.js';

// Animation-only Mixamo FBX ("Without Skin") is recommended.
// Local File API only: do not submit files to a server.
export async function loadMixamoMotionFile(file){
  if(!file?.name||typeof file.arrayBuffer!=='function')
    throw new Error('Selecciona un archivo de animación Mixamo.');
  const extension=file.name.toLowerCase().split('.').pop();
  if(extension!=='fbx'&&extension!=='glb')
    throw new Error('Formato no admitido. Usa Mixamo FBX o GLB con animaciones.');
  if(!Number.isFinite(file.size)||file.size<1||file.size>60*1024*1024)
    throw new Error('El archivo debe ocupar entre 1 byte y 60 MB.');
  const buffer=await file.arrayBuffer();
  let root,clips;
  if(extension==='fbx'){
    const object=new FBXLoader().parse(buffer,'');
    root=object;clips=object.animations||[];
  }else{
    const data=await new Promise((resolve,reject)=>
      new GLTFLoader().parse(buffer,'',resolve,reject));
    root=data.scene;clips=data.animations||[];
  }
  if(!root||!Array.isArray(clips)||!clips.length)
    throw new Error('El archivo no contiene movimientos animados.');
  if(clips.length>30)throw new Error('El archivo contiene demasiadas animaciones.');
  return {filename:file.name,root,clips};
}

export async function loadAndRetargetMixamo(file){
  const {root,clips,filename}=await loadMixamoMotionFile(file);
  const compatible=[],skipped=[];
  for(const clip of clips){
    try{compatible.push(retargetMixamoClip(root,clip));}
    catch(e){skipped.push({name:clip.name||'(sin nombre)',reason:e.message});}
  }
  if(!compatible.length)
    throw new Error('No se pudo adaptar ninguna animación. '+
      (skipped[0]?.reason||'Revisa que la descarga sea Mixamo FBX Without Skin.'));
  return {filename,compatible,skipped};
}
