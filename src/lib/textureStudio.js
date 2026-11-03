import * as THREE from 'three';

const IMAGE_EXT=/\.(png|jpg|jpeg|webp)$/i;
export const TEXTURE_CHANNELS=[
  {key:'map',label:'Color / Albedo'},
  {key:'normalMap',label:'Normal / Relieve'},
  {key:'roughnessMap',label:'Rugosidad'},
  {key:'metalnessMap',label:'Metalizado'},
  {key:'emissiveMap',label:'Emisión'},
  {key:'aoMap',label:'Oclusión / AO'},
  {key:'alphaMap',label:'Transparencia'},
  {key:'orm',label:'ORM combinado (AO, rugosidad, metalizado)'},
];
const tokens=s=>String(s||'').replace(/([a-z])([A-Z])/g,'$1 $2')
  .toLowerCase().replace(/\.[^.]+$/,'').split(/[^a-z0-9]+/)
  .filter(x=>x.length>1&&!['material','mat','mesh','texture','tex','image','img','png','jpg','jpeg','webp',
    'map','body','model','default','standard','pbr'].includes(x));
const key=s=>tokens(s).join('');
export function inferTextureChannel(filename){
  const stem=String(filename||'').replace(/\.(png|jpe?g|webp)$/i,'').toLowerCase();
  if(/(?:^|[_\s.\-])(orm|arm|occlusionroughnessmetallic)(?:$|[_\s.\-])/.test(stem))return 'orm';
  if(/(?:^|[_\s.\-])(normal|nrm|norm|normalgl|normaldx|bump)(?:$|[_\s.\-])/.test(stem))return 'normalMap';
  if(/(?:^|[_\s.\-])(rough|roughness)(?:$|[_\s.\-])/.test(stem))return 'roughnessMap';
  if(/(?:^|[_\s.\-])(metallic|metalness|metal)(?:$|[_\s.\-])/.test(stem))return 'metalnessMap';
  if(/(?:^|[_\s.\-])(emissive|emission|emit|glow)(?:$|[_\s.\-])/.test(stem))return 'emissiveMap';
  if(/(?:^|[_\s.\-])(ao|occlusion|ambientocclusion)(?:$|[_\s.\-])/.test(stem))return 'aoMap';
  if(/(?:^|[_\s.\-])(alpha|opacity|transparent|mask)(?:$|[_\s.\-])/.test(stem))return 'alphaMap';
  return 'map';
}
export function isTextureFile(file){
  return Boolean(file&&IMAGE_EXT.test(file.name)&&file.size>0&&file.size<=50*1024*1024);
}
export function catalogMaterials(root){
  if(!root)return [];
  const found=new Map();
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const list=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    list.forEach(material=>{
      if(!material?.uuid)return;
      if(!found.has(material.uuid))found.set(material.uuid,{
        id:material.uuid,name:material.name||'Material sin nombre',type:material.type,
        meshNames:[],hasUV:false,channels:[],meshes:0,
      });
      const record=found.get(material.uuid);
      record.meshes++;
      record.hasUV ||= Boolean(mesh.geometry?.getAttribute('uv'));
      if(record.meshNames.length<5)record.meshNames.push(mesh.name||'Malla sin nombre');
    });
  });
  for(const result of found.values()){
    const material=findMaterial(root,result.id);
    result.channels=TEXTURE_CHANNELS.filter(x=>x.key!=='orm'&&material[x.key]?.isTexture).map(x=>x.label);
  }
  return [...found.values()];
}
function findMaterial(root,id){
  let found=null;
  root.traverse(mesh=>{
    if(!mesh.isMesh||found)return;
    for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
      if(mat?.uuid===id){found=mat;break;}
    }
  });
  return found;
}
export function suggestTextureMatches(files,materials){
  if(!files?.length||!materials?.length)return [];
  const suggestions=[];
  for(let index=0;index<files.length;index++){
    const file=files[index];
    if(!isTextureFile(file))continue;
    const nameTokens=new Set(tokens(file.name));
    const scored=materials.map(m=>{
      const labels=[m.name,...m.meshNames];
      const relevant=new Set(labels.flatMap(tokens));
      const score=[...nameTokens].reduce((v,t)=>v+(relevant.has(t)?1:0),0);
      const full=labels.some(label=>key(label)&&key(file.name).includes(key(label)));
      return {m,score:score+(full?2:0)};
    }).sort((a,b)=>b.score-a.score);
    const winner=scored[0],runner=scored[1];
    const unique=winner && (materials.length===1 || (winner.score>0 && winner.score>(runner?.score||0)));
    if(unique&&winner.m.hasUV)suggestions.push({fileIndex:index,materialId:winner.m.id,channel:inferTextureChannel(file.name),filename:file.name});
  }
  return suggestions;
}
function asPBR(root,material){
  const replacement=new THREE.MeshStandardMaterial({
    name:material.name,color:material.color?.isColor?material.color.clone():0xffffff,
    map:material.map||null,normalMap:material.normalMap||null,emissive:material.emissive?.clone?.()||0x000000,
    emissiveMap:material.emissiveMap||null,alphaMap:material.alphaMap||null,
    transparent:material.transparent,opacity:material.opacity,alphaTest:material.alphaTest,
    side:material.side,depthWrite:material.depthWrite,wireframe:material.wireframe,
    metalness:0,roughness:1,vertexColors:material.vertexColors,
  });
  // Use one shared converted material for all meshes that referenced the old one.
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    if(Array.isArray(mesh.material))mesh.material=mesh.material.map(m=>m===material?replacement:m);
    else if(mesh.material===material)mesh.material=replacement;
  });
  return replacement;
}
/** Assigns a local image to a named material. Edits the in-memory preview only. */
export async function applyTextureToMaterial(root,id,channel,file,{format='FBX'}={}){
  if(!root)throw new Error('Primero carga un personaje 3D.');
  if(!isTextureFile(file))throw new Error('Usa imágenes PNG, JPG o WebP válidas (máximo 50 MB por imagen).');
  const record=catalogMaterials(root).find(m=>m.id===id);
  if(!record)throw new Error('El material seleccionado ya no existe.');
  if(!record.hasUV)throw new Error('La malla de este material no tiene coordenadas UV. Necesita UV mapping antes de aplicar imágenes.');
  let material=findMaterial(root,id);
  const pbrChannels=new Set(['roughnessMap','metalnessMap','aoMap','orm']);
  if(pbrChannels.has(channel)&&!material.isMeshStandardMaterial&&!material.isMeshPhysicalMaterial){
    if(format!=='FBX')throw new Error('Este material no es PBR estándar. No se modificará automáticamente el material especial de VRM/GLB.');
  }
  if(!TEXTURE_CHANNELS.some(x=>x.key===channel))throw new Error('Tipo de textura no compatible.');
  const url=URL.createObjectURL(file);
  let texture;
  try{
    texture=await new THREE.TextureLoader().loadAsync(url);
    texture.name=file.name;
    texture.flipY=!['GLB','GLTF','VRM'].includes(String(format).toUpperCase());
    texture.colorSpace=['map','emissiveMap'].includes(channel)?THREE.SRGBColorSpace:THREE.NoColorSpace;
    texture.needsUpdate=true;
    if(pbrChannels.has(channel)&&!material.isMeshStandardMaterial&&!material.isMeshPhysicalMaterial)
      material=asPBR(root,material);
    if(channel==='orm'){
      material.aoMap=texture;material.roughnessMap=texture;material.metalnessMap=texture;
    }else{
      if(!(channel in material))throw new Error('El material '+material.type+' no admite este canal.');
      material[channel]=texture;
    }
    if(channel==='map'&&material.color?.isColor&&format==='FBX')material.color.set(0xffffff);
    if(channel==='alphaMap')material.transparent=true;
    if(channel==='emissiveMap'&&material.emissive?.isColor&&material.emissive.getHex()===0)
      material.emissive.set(0xffffff);
    material.needsUpdate=true;
    return {url,materialId:material.uuid,channel,fileName:file.name};
  }catch(error){
    URL.revokeObjectURL(url);
    texture?.dispose();
    throw error;
  }
}
