import { isTextureFile } from './textureStudio.js';
import { normalizeTokens, normalizedPath } from './textureAuto.js';

/** MOTION-04E1: inventory is pure metadata; it never opens, uploads or mutates files. */
const IMAGE_EXT = /\.(png|jpe?g|webp|dds)$/i;
const NON_COLOR = /(?:^|[_\s.-])(normal(?:gl|dx)?|nrm|norm|bump|height|displacement|rough(?:ness)?|metal(?:lic|ness)?|ao|occlusion|ambientocclusion|orm|arm|spec(?:ular)?|gloss(?:iness)?|emissive|emission|emit|glow|opacity|alpha|transparent|mask)(?:$|[_\s.-])/i;
const SHORT_NON_COLOR=/(?:^|[_\s.-])(n|r|m|h|s|orm|ao)(?:$|[_\s.-])/i;
const COLOR_SUFFIX=/(?:^|[_\s.-])(basecolor|base_color|albedo|diffuse|color|colour|col|diff|d)(?:$|[_\s.-])/i;
const SUFFIXES=new Set(['basecolor','base','albedo','diffuse','color','colour','col','diff','d',
 'normal','normalgl','normaldx','nrm','norm','n','rough','roughness','r','metal','metallic',
 'metalness','m','ao','occlusion','orm','arm','spec','specular','gloss','glossiness',
 'emission','emissive','emit','glow','alpha','opacity','mask','h','height','bump','s']);
const cleanName=name=>String(name||'').replace(IMAGE_EXT,'');
export function detectGlobalColorCandidate(file){
 const stem=cleanName(file?.name||'');
 if(!isTextureFile(file))return {eligible:false,channel:'invalid',reason:'Archivo no compatible'};
 if(NON_COLOR.test(stem)||SHORT_NON_COLOR.test(stem))
   return {eligible:false,channel:'data',reason:'Mapa PBR o de datos: no es albedo'};
 return COLOR_SUFFIX.test(stem)
   ? {eligible:true,channel:'map',ambiguous:false}
   : {eligible:true,channel:'map',ambiguous:true,reason:'Canal de color no identificado; solo evaluación visual'};
}
export function textureFamilyName(file){
 const path=normalizedPath(file);
 const dirs=path.split('/').slice(0,-1);
 const stem=cleanName(file?.name||'');
 const words=stem.replace(/([a-z])([A-Z])/g,'$1 $2')
   .split(/[^A-Za-z0-9]+/).filter(Boolean)
   .filter(token=>!SUFFIXES.has(token.toLowerCase()));
 const fallback=dirs.length?dirs[dirs.length-1]:'sin-familia';
 return (words.join('_')||fallback).toLowerCase();
}
const normName=s=>normalizeTokens(s).filter(x=>!/^material\d*$/.test(x)&&!/^mesh\d*$/.test(x));
function tokensForImage(item){
 const base=normName(cleanName(item.name));
 const folders=normName(item.path.split('/').slice(0,-1).join('/'));
 return {base,folders};
}
export function buildGlobalTextureInventory(materials,files){
 const slots=(materials||[]).filter(m=>m?.id).map(m=>({
   materialId:m.id,materialName:m.name||'Material sin nombre',type:m.type||'',
   meshCount:m.meshes||0,meshNames:[...(m.meshNames||[])],
   hasUV:Boolean(m.hasUV),hasColor:Boolean(m.channels?.includes('Color / Albedo')),
   existingChannels:[...(m.channels||[])],
   references:[...(m.textureReferences||[])],
 }));
 const images=[],excluded=[],groups=new Map();
 for(let i=0;i<(files||[]).length;i++){
   const file=files[i],decision=detectGlobalColorCandidate(file);
   const row={fileIndex:i,name:file.name,path:normalizedPath(file),
     bytes:file.size||0,family:textureFamilyName(file),ambiguous:Boolean(decision.ambiguous)};
   if(!decision.eligible){excluded.push({...row,reason:decision.reason});continue;}
   images.push(row);
   if(!groups.has(row.family))groups.set(row.family,[]);
   groups.get(row.family).push(i);
 }
 return {slots,images,excluded,
   families:[...groups].map(([name,indices])=>({name,indices})),
   counts:{materials:slots.length,meshes:slots.reduce((n,m)=>n+m.meshCount,0),
     images:images.length,excluded:excluded.length,withoutUV:slots.filter(x=>!x.hasUV).length,
     existing:slots.filter(x=>x.hasColor).length}};
}
export function rankGlobalCandidates(slot,images){
 const materialTokens=normName(slot.materialName);
 const meshTokens=(slot.meshNames||[]).flatMap(normName);
 const materialSet=new Set([...materialTokens,...meshTokens]);
 const refs=(slot.references||[]).map(x=>String(x).replaceAll('\\','/').split('/').pop().toLowerCase());
 return [...images].map(img=>{
   const {base,folders}=tokensForImage(img);
   let rank=0;const evidence=[];
   if(refs.includes(img.name.toLowerCase())){rank+=100;evidence.push('Referencia explícita');}
   const matched=base.filter(x=>materialSet.has(x));
   if(matched.length){rank+=matched.length*14;evidence.push('Coincidencia de nombre');}
   if(base.length&&materialTokens.length&&base.every(x=>materialTokens.includes(x))){
     rank+=35;evidence.push('Material relacionado');
   }
   if(folders.some(x=>materialSet.has(x))){rank+=12;evidence.push('Carpeta relacionada');}
   // Unknown filenames are still considered, but cannot be marked safe.
   if(img.ambiguous)rank-=6;
   return {...img,rank,evidence};
 }).sort((a,b)=>b.rank-a.rank||a.path.localeCompare(b.path));
}
/** Every color candidate is considered. If the session is too large, reject
 * it explicitly instead of silently ignoring unreviewed images.
 */
export function planGlobalVisionTasks(inventory,{perRequest=8,maxTasks=160}={}){
 if(!Number.isInteger(perRequest)||perRequest<1||perRequest>8)
   throw new Error('Se admiten de 1 a 8 imágenes por consulta.');
 if(inventory.slots.length>100)
   throw new Error('Esta versión analiza hasta 100 materiales por sesión. Divide el personaje por grupos.');
 const tasks=[],skipped=[];
 for(const slot of inventory.slots){
   if(!slot.hasUV){skipped.push({materialId:slot.materialId,status:'blocked',reason:'Sin UV'});continue;}
   if(slot.hasColor){skipped.push({materialId:slot.materialId,status:'existing',reason:'Ya tiene albedo; no se sobrescribe'});continue;}
   const candidates=rankGlobalCandidates(slot,inventory.images);
   if(!candidates.length){skipped.push({materialId:slot.materialId,status:'none',reason:'No hay imágenes de color'});continue;}
   for(let i=0;i<candidates.length;i+=perRequest){
     tasks.push({materialId:slot.materialId,materialName:slot.materialName,
       meshNames:slot.meshNames,round:Math.floor(i/perRequest)+1,
       candidates:candidates.slice(i,i+perRequest)});
     if(tasks.length>maxTasks)throw new Error(
       'El paquete requiere más de '+maxTasks+' consultas visuales. Reduce imágenes no relacionadas o divide el paquete antes de iniciar; no se omitirá ninguna silenciosamente.');
   }
 }
 return {tasks,skipped,materials:inventory.slots.length,colorImages:inventory.images.length,
   requests:tasks.length};
}
