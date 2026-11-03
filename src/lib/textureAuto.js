import { isTextureFile } from './textureStudio.js';

/**
 * Pure, deterministic matching; no file reads, network, mutation or AI API.
 * Confidence values are rule scores, not statistical probabilities.
 */
const GENERIC=new Set(['material','mat','mesh','texture','tex','textures','image','img','map','maps',
 'pbr','standard','diffuse','albedo','basecolor','base','color','colour','normal','normalgl',
 'nrm','norm','roughness','rough','metalness','metallic','metal','ao','occlusion','ambient',
 'emissive','emission','emit','glow','alpha','opacity','transparent','mask','orm','arm',
 'png','jpg','jpeg','webp','dds','assets','asset','images','maps','fbx','model','models','default']);
const CHANNELS=[
 ['orm',/(?:^|[_\W])(orm|arm|occlusionroughnessmetallic)(?:$|[_\W])/i],
 ['normalMap',/(?:^|[_\W])(normal|nrm|norm|normalgl)(?:$|[_\W])/i],
 ['roughnessMap',/(?:^|[_\W])(roughness|rough)(?:$|[_\W])/i],
 ['metalnessMap',/(?:^|[_\W])(metalness|metallic|metal)(?:$|[_\W])/i],
 ['aoMap',/(?:^|[_\W])(ao|occlusion|ambientocclusion)(?:$|[_\W])/i],
 ['emissiveMap',/(?:^|[_\W])(emission|emissive|emit|glow)(?:$|[_\W])/i],
 ['alphaMap',/(?:^|[_\W])(opacity|alpha|transparent|mask)(?:$|[_\W])/i],
 ['map',/(?:^|[_\W])(basecolor|base_color|albedo|diffuse|color|colour)(?:$|[_\W])/i],
];
const PATH_SEPARATOR=/[\\/]+/;
export function normalizedPath(file) {
 const raw=String(file?.orbiRelativePath||file?.webkitRelativePath||file?.name||'');
 return raw.replace(/\\/g,'/').replace(/^\.\/+/,'');
}
export function normalizeTokens(input){
 return String(input||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase()
  .replace(/\.[a-z0-9]{2,5}$/,'').split(/[^a-z0-9]+/)
  .filter(Boolean).filter(t=>!GENERIC.has(t));
}
const clean=x=>normalizeTokens(x).join('');
const sameSet=(a,b)=>a.length===b.length&&a.every(x=>b.includes(x));
const materialSlots=m=>[
 m.name||'',...(m.meshNames||[]),
 ...(m.textureReferences||[])
];
function infoChannel(path){
 const stem=path.split(PATH_SEPARATOR).pop().replace(/\.[^.]+$/,'').toLowerCase();
 if(/(?:^|[_\W])(normaldx|dxnormal|directx|gloss|glossiness|spec|specular|bump|height|displacement)(?:$|[_\W])/i.test(stem))
   return {channel:null,issue:'Este mapa necesita conversión o revisión (NormalDX, gloss, specular o bump).'};
 const hit=CHANNELS.find(([,regex])=>regex.test(stem));
 return hit?{channel:hit[0],explicit:true}:{channel:'map',explicit:false};
}
function scoreFile(file,material,channelInfo,materialCount) {
 const path=normalizedPath(file).toLowerCase();
 const parts=path.split('/');
 const stem=parts.pop().replace(/\.[^.]+$/,'');
 const imageTokens=normalizeTokens(stem);
 const folderTokens=parts.flatMap(normalizeTokens).filter(x=>x!=='textures');
 const modelName=normalizeTokens(material.name);
 const meshNames=(material.meshNames||[]).map(normalizeTokens);
 const texRefs=material.textureReferences||[];
 let score=0,reason='Sin relación fiable con el material';
 if(texRefs.some(ref=> {
   const base=String(ref).split(PATH_SEPARATOR).pop();
   return base && base.toLowerCase()===file.name.toLowerCase();
 })){score=100;reason='Referencia explícita de textura en el material';}
 if(modelName.length && sameSet(imageTokens,modelName) && score<98){
   score=98;reason='El nombre del material coincide exactamente con la textura';
 }
 if(imageTokens.length&&modelName.length && imageTokens.every(t=>modelName.includes(t)) && score<96){
   score=96;reason='Nombre del material y canal de textura reconocidos';
 }
 if(imageTokens.length&&meshNames.some(tokens=>tokens.length&&imageTokens.every(t=>tokens.includes(t))) && score<94){
   score=94;reason='Coincidencia inequívoca con el nombre de una malla';
 }
 if(folderTokens.length&&modelName.length&&modelName.every(t=>folderTokens.includes(t))&&score<92){
   score=92;reason='La carpeta identifica exactamente el material';
 }
 if(folderTokens.length&&meshNames.some(tokens=>tokens.length&&tokens.every(t=>folderTokens.includes(t)))&&score<90){
   score=90;reason='Carpeta asociada a la malla';
 }
 const all=new Set([...modelName,...meshNames.flat()]);
 const overlap=imageTokens.filter(t=>all.has(t)).length;
 if(score<80 && overlap>0){
   score=overlap===imageTokens.length?80:70;
   reason='Coincidencia parcial por nombres';
 }
 // Single-material generic "diffuse" is an informed suggestion, not safe auto-apply.
 if(!score && materialCount===1){score=70;reason='Único material; revisar la imagen antes de aplicar';}
 if(!channelInfo.explicit && score>=90 && !texRefs.length){
   score=Math.min(score,88);reason+='; canal de color inferido';
 }
 return {score,reason};
}
function existingChannel(material,channel){
 const c=channel==='map'?'Color / Albedo':
  ({normalMap:'Normal / Relieve',roughnessMap:'Rugosidad',metalnessMap:'Metalizado',
   aoMap:'Oclusión / AO',emissiveMap:'Emisión',alphaMap:'Transparencia',
   orm:'ORM combinado (AO, rugosidad, metalizado)'})[channel];
 if(channel==='orm')return ['Oclusión / AO','Rugosidad','Metalizado'].some(x=>material.channels?.includes(x));
 return Boolean(material.channels?.includes(c));
}
const compatible=(m,channel)=>{
 if(!m.hasUV)return 'La malla no tiene coordenadas UV';
 const needsPBR=['roughnessMap','metalnessMap','aoMap','orm'].includes(channel);
 if(needsPBR && !['MeshStandardMaterial','MeshPhysicalMaterial','MeshPhongMaterial','MeshLambertMaterial'].includes(m.type))
   return 'El material especial no admite este mapa sin conversión';
 return null;
};
/**
 * Each candidate is scored against all materials, then conflicts are resolved
 * per material+channel. Pure: does not touch meshes, textures or files.
 */
export function buildTexturePlan(files,materials){
 const entries=(files||[]).map((file,fileIndex)=>{
   const path=normalizedPath(file);
   const channelInfo=infoChannel(path);
   const original={fileIndex,path,filename:file?.name||'',channel:channelInfo.channel,
     score:0,level:'low',status:'unmatched',materialId:null,materialName:null,
     reason:'',candidates:[]};
   if(!isTextureFile(file))return {...original,reason:'Formato o tamaño de archivo no admitido'};
   if(channelInfo.issue)return {...original,reason:channelInfo.issue};
   const options=(materials||[]).map(m=>({
     materialId:m.id,materialName:m.name, ...scoreFile(file,m,channelInfo,materials.length),
     blocker:compatible(m,channelInfo.channel),existing:existingChannel(m,channelInfo.channel),
   })).sort((a,b)=>b.score-a.score||a.materialName.localeCompare(b.materialName));
   const first=options[0],second=options[1];
   if(!first||first.score<65)return {...original,reason:'No se encontró una asociación suficiente'};
   const tied=Boolean(second&&first.score-second.score<15);
   const reason=first.blocker || (first.existing?'El material ya tiene una textura en este canal':
     tied?'Hay más de un material posible':first.reason);
   const level=first.blocker?'low':tied||first.existing||first.score<90?'medium':'high';
   return {...original,materialId:first.materialId,materialName:first.materialName,
     score:first.score,level,status:level==='high'?'safe':'review',reason,
     candidates:options.filter(m=>m.score>=65).slice(0,5),
     blocked:Boolean(first.blocker),overwrite:Boolean(first.existing)};
 });
 const slots=new Map();
 for(const item of entries){
   if(!item.materialId||item.status==='unmatched')continue;
   const k=item.materialId+'|'+item.channel;
   if(!slots.has(k))slots.set(k,[]);
   slots.get(k).push(item);
 }
 for(const slot of slots.values()){
   if(slot.length<=1)continue;
   for(const item of slot){
     item.status='review';item.level='medium';item.reason='Varias imágenes compiten por el mismo material y canal';
   }
 }
 return entries;
}
export function summarizeTexturePlan(plan){
 const rows=plan||[];
 return {detected:rows.length,safe:rows.filter(x=>x.status==='safe').length,
   review:rows.filter(x=>x.status==='review').length,
   unmatched:rows.filter(x=>x.status==='unmatched').length};
}
