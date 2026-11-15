import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {MTLLoader} from 'three/addons/loaders/MTLLoader.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {PLYLoader} from 'three/addons/loaders/PLYLoader.js';
import {ColladaLoader} from 'three/addons/loaders/ColladaLoader.js';
import {TDSLoader} from 'three/addons/loaders/TDSLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {VRMLoaderPlugin,VRMUtils} from '@pixiv/three-vrm';
import {inspectGLTFFile,extensionOfViewable} from './viewerCompatibility.js';

function geometryGroup(geometry,name,pointCloud=false){
  if(!geometry?.getAttribute?.('position')?.count)
    throw new Error('El archivo no contiene vértices para mostrar.');
  const hasVertexColors=Boolean(geometry.getAttribute('color'));
  const material=pointCloud
    ?new THREE.PointsMaterial({size:0.015,sizeAttenuation:true,
      vertexColors:hasVertexColors,color:0xffffff})
    :new THREE.MeshStandardMaterial({color:0xffffff,side:THREE.DoubleSide,
      vertexColors:hasVertexColors,metalness:0,roughness:.85});
  const object=pointCloud
    ?new THREE.Points(geometry,material)
    :new THREE.Mesh(geometry,material);
  object.name=name.replace(/\.[^.]+$/,'')||'Modelo importado';
  const scene=new THREE.Group();scene.name=object.name;
  scene.add(object);
  return scene;
}
export function detectPLYPointCloudHeader(headerText){
  const head=String(headerText||'').slice(0,8192).split(/end_header/i)[0];
  const match=/(?:^|\n)element\s+face\s+(\d+)\s*(?:\r?\n|$)/i.exec(head);
  return !match||Number(match[1])===0;
}
export async function createCompatibleModelLoader(extension,{
  manager,renderer,preflight=null,
}={}){
  const type=String(extension).toLowerCase();
  if(['glb','gltf','vrm'].includes(type)){
    const loader=new GLTFLoader(manager);
    loader.register(parser=>new VRMLoaderPlugin(parser));
    loader.setMeshoptDecoder(MeshoptDecoder);
    const base=(import.meta.env?.BASE_URL||'/').replace(/\/?$/,'/');
    // Decoder files are copied locally from the same installed Three.js
    // package by scripts/prepare-viewer-decoders.mjs (no third-party CDN).
    const draco=new DRACOLoader(manager);
    draco.setDecoderPath(base+'decoders/draco/');
    loader.setDRACOLoader(draco);
    let ktx2=null;
    if(preflight?.needsKtx2){
      if(!renderer)throw new Error(
        'KTX2/Basis requiere un contexto WebGL para determinar compatibilidad.');
      ktx2=new KTX2Loader(manager);
      ktx2.setTranscoderPath(base+'decoders/basis/');
      ktx2.detectSupport(renderer);
      loader.setKTX2Loader(ktx2);
    }
    return {loader,dispose:()=>{draco.dispose();ktx2?.dispose();}};
  }
  const types={
    fbx:()=>new FBXLoader(manager),
    obj:()=>new OBJLoader(manager),
    stl:()=>new STLLoader(manager),
    ply:()=>new PLYLoader(manager),
    dae:()=>new ColladaLoader(manager),
    '3ds':()=>new TDSLoader(manager),
  };
  if(!types[type])throw new Error('Formato de visualización no soportado: .'+type);
  return {loader:types[type](),dispose:()=>{}};
}
// A universal preview DOES NOT infer a human rig or invent animations.
export async function loadCompatibleModel({
  primary,manager,resources,files,renderer,animationSource=false,
}){
  if(!primary?.name)throw new Error('No se seleccionó un modelo.');
  const extension=extensionOfViewable(primary.name);
  const source=resources.get(primary.name.toLowerCase());
  if(!source)throw new Error('No se encontró el archivo principal.');
  const preflight=await inspectGLTFFile(primary);
  const {loader,dispose}=await createCompatibleModelLoader(extension,{
    manager,renderer,preflight,
  });
  try{
    let loaded,model,clips=[],vrm=null;
    if(extension==='obj'){
      const mtl=(files||[]).find(f=>extensionOfViewable(f?.name)==='mtl');
      if(mtl){
        const companion=new MTLLoader(manager);
        // Use a relative resourcePath so manager can resolve included textures
        // by filename rather than attempting to resolve relative to blob URLs.
        companion.setResourcePath('./');
        const materials=await companion.loadAsync(resources.get(mtl.name.toLowerCase()));
        materials.preload();
        loader.setMaterials(materials);
      }
    }
    loaded=await loader.loadAsync(source);
    if(['glb','gltf','vrm'].includes(extension)){
      vrm=loaded.userData?.vrm||null;
      if(extension==='vrm'&&!vrm)
        throw new Error('El archivo VRM no incluye metadatos VRM compatibles.');
      if(vrm)VRMUtils.rotateVRM0(vrm);
      model=vrm?.scene||loaded.scene;
      clips=loaded.animations||[];
    }else if(extension==='dae'){
      model=loaded.scene;clips=loaded.animations||[];
    }else if(extension==='stl'||extension==='ply'){
      let pointCloud=false;
      if(extension==='ply'){
        const start=new TextDecoder().decode(await primary.slice(0,8192).arrayBuffer());
        pointCloud=detectPLYPointCloudHeader(start);
      }
      model=geometryGroup(loaded,primary.name,pointCloud);
    }else{
      model=loaded;
      clips=loaded.animations||[];
    }
    if(!model?.traverse)
      throw new Error('El cargador no devolvió una escena 3D válida.');
    return {model,clips:clips.map(c=>c.clone()),vrm,
      preflight,extension,animationSource};
  }finally{
    dispose();
  }
}
