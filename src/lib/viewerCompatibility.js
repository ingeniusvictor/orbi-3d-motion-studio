// VIEWER-COMPAT-01: inspection-only helpers. Never rewrite the source asset.
// Distinguish static models from animation-only files and unsupported codecs.
export const VIEWABLE_FORMATS=Object.freeze({
  glb:'glTF 2.0 binario',gltf:'glTF 2.0 + recursos externos',
  vrm:'Avatar VRM',fbx:'Autodesk FBX',obj:'Wavefront OBJ',
  stl:'STL (geometría)',ply:'PLY (geometría)',
  dae:'Collada DAE', '3ds':'3D Studio (3DS)',
});
export const VIEWABLE_EXTENSIONS=Object.freeze(Object.keys(VIEWABLE_FORMATS));
export const extensionOfViewable=name=>String(name||'').split('.').pop().toLowerCase();
export const describeModelFormat=name=>VIEWABLE_FORMATS[extensionOfViewable(name)]||null;
export function choosePrimaryModel(files){
  const list=Array.from(files||[]);
  return list.find(f=>f?.name&&VIEWABLE_FORMATS[extensionOfViewable(f.name)])||null;
}
function parseVersion(major,minor){return major+'.'+minor;}
export function inspectGLBHeader(bytes){
  if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<20)
    return {ok:false,reason:'Cabecera GLB incompleta.'};
  const view=new DataView(bytes);
  if(view.getUint32(0,true)!==0x46546c67)
    return {ok:false,reason:'Firma GLB inválida: este archivo no es glTF binario.'};
  const version=view.getUint32(4,true);
  if(version!==2)return {ok:false,reason:'Se requiere GLB 2.0; versión detectada: '+version+'.'};
  const declared=view.getUint32(8,true);
  const jsonBytes=view.getUint32(12,true);
  const jsonKind=view.getUint32(16,true);
  if(jsonKind!==0x4e4f534a)return {ok:false,reason:'No se encontró el bloque JSON glTF.'};
  if(jsonBytes<2||jsonBytes>32*1024*1024)
    return {ok:false,reason:'Tamaño del bloque JSON glTF fuera del límite de análisis.'};
  if(declared<20+jsonBytes)
    return {ok:false,reason:'El bloque JSON excede el tamaño declarado por GLB.'};
  return {ok:true,version,declared,jsonBytes};
}
export function inspectGLTFJson(document){
  if(!document||typeof document!=='object'||Array.isArray(document))
    throw new Error('Documento glTF inválido.');
  const asset=document.asset;
  if(!asset||typeof asset.version!=='string'||!asset.version.startsWith('2.'))
    throw new Error('Solo se admiten documentos glTF 2.0.');
  const extensions=document.extensionsUsed||[];
  if(!Array.isArray(extensions))throw new Error('Lista de extensiones glTF inválida.');
  const required=document.extensionsRequired||[];
  if(!Array.isArray(required))throw new Error('Extensiones obligatorias glTF inválidas.');
  return {
    version:asset.version,
    generator:asset.generator||null,
    nodes:Array.isArray(document.nodes)?document.nodes.length:0,
    meshes:Array.isArray(document.meshes)?document.meshes.length:0,
    skins:Array.isArray(document.skins)?document.skins.length:0,
    animations:Array.isArray(document.animations)?document.animations.length:0,
    images:Array.isArray(document.images)?document.images.length:0,
    extensions:[...extensions],requiredExtensions:[...required],
    needsDraco:extensions.includes('KHR_draco_mesh_compression'),
    needsKtx2:extensions.includes('KHR_texture_basisu'),
    needsMeshopt:extensions.includes('EXT_meshopt_compression'),
  };
}
export async function inspectGLTFFile(file){
  const ext=extensionOfViewable(file?.name);
  if(!file||!['glb','gltf','vrm'].includes(ext))return null;
  const decoder=new TextDecoder('utf-8',{fatal:true});
  let doc;
  if(ext==='gltf'){
    const text=await file.text();
    if(text.length>32*1024*1024)
      throw new Error('Documento glTF demasiado grande para inspeccionar.');
    doc=JSON.parse(text);
  }else{
    const header=inspectGLBHeader(await file.slice(0,20).arrayBuffer());
    if(!header.ok)throw new Error(header.reason);
    if(header.declared!==file.size)
      throw new Error('GLB incompleto: el tamaño declarado no coincide con el archivo.');
    const bytes=await file.slice(20,20+header.jsonBytes).arrayBuffer();
    doc=JSON.parse(decoder.decode(bytes).trim());
  }
  return inspectGLTFJson(doc);
}
export function explainImportError(extension,error){
  const message=error?.message||String(error||'Error desconocido');
  if(/draco|decoder/i.test(message))
    return 'No se pudo decodificar la geometría Draco. Verifica los decodificadores locales instalados. Detalle: '+message;
  if(/basis|ktx2|transcoder/i.test(message))
    return 'No se pudo decodificar la textura KTX2/Basis. Detalle: '+message;
  if(/meshopt/i.test(message))
    return 'No se pudo decodificar la compresión Meshopt. Detalle: '+message;
  if(/fetch|404|not found|failed to load|networkerror/i.test(message)&&
     ['gltf','obj','dae','3ds'].includes(extension))
    return 'Faltan archivos auxiliares (BIN, texturas o MTL). Selecciona todos juntos. Detalle: '+message;
  return message;
}
