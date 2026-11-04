import { askOllamaVisual } from './ollamaVision.js';
import { textureContactSheet } from './visionImages.js';

/**
 * MOTION-04E2: all calls occur sequentially during the active browser session.
 * This stage builds review-only recommendations; it NEVER applies textures.
 */
export class GlobalVisionCancelled extends Error {
 constructor(){super('Análisis global cancelado; el personaje permanece sin cambios.');this.name='AbortError';}
}
export const GLOBAL_REQUEST_TIMEOUT_MS=120000;
function checkCancelled(signal){if(signal?.aborted)throw new GlobalVisionCancelled();}
export async function requestVisualWithTimeout({
 task,model,meshImage,textureImage,signal,advise,timeoutMs
}){
 checkCancelled(signal);
 const ctrl=new AbortController();
 const abort=()=>ctrl.abort();
 signal?.addEventListener('abort',abort,{once:true});
 const timeout=setTimeout(()=>ctrl.abort(),timeoutMs);
 try{
   return await advise({model,meshImage,textureImage,materialName:task.materialName,
     meshNames:task.meshNames,candidates:task.candidates.map(c=>({name:c.name})),
     signal:ctrl.signal});
 }catch(error){
   if(signal?.aborted)throw new GlobalVisionCancelled();
   if(ctrl.signal.aborted)throw new Error('La consulta de '+task.materialName+' agotó el tiempo máximo.');
   throw error;
 }finally{
   clearTimeout(timeout);signal?.removeEventListener('abort',abort);
 }
}
const toPreview=(task,answer)=>answer?.candidateIndex===null?null:
 Number.isInteger(answer?.candidateIndex)&&answer.candidateIndex>=0&&answer.candidateIndex<task.candidates.length
 ? task.candidates[answer.candidateIndex]:null;
const isNetworkError=e=>/Failed to fetch|Ollama HTTP|red local|localhost|CORS|conectar al servicio local/i.test(String(e?.message||''));
export function summarizeGlobalResults(rows){
 const result=rows||[];
 return {total:result.length,review:result.filter(x=>x.status==='review').length,
   none:result.filter(x=>x.status==='none').length,
   blocked:result.filter(x=>x.status==='blocked').length,
   existing:result.filter(x=>x.status==='existing').length,
   errors:result.filter(x=>x.status==='error').length};
}
export async function runGlobalVision({
 plan,files,model,capture,makeSheet=textureContactSheet,advise=askOllamaVisual,
 signal,onProgress=()=>{},onRow=()=>{},timeoutMs=GLOBAL_REQUEST_TIMEOUT_MS
}){
 if(!plan?.tasks||!Array.isArray(plan.tasks))throw new Error('Primero genera el plan global.');
 if(typeof capture!=='function')throw new Error('Falta la captura de la escena.');
 checkCancelled(signal);
 const started=Date.now(),rows=new Map();
 const sheetCache=new Map();
 const groups=new Map();
 for(const task of plan.tasks){
   if(!groups.has(task.materialId))groups.set(task.materialId,[]);
   groups.get(task.materialId).push(task);
 }
 for(const skipped of plan.skipped||[]){
   const row={...skipped,materialName:'',fileIndex:null};
   rows.set(row.materialId,row);onRow(row);
 }
 const totalRounds=plan.tasks.length;
 let finished=0,failedNetwork=null;
 onProgress({stage:'inventario',completed:0,total:totalRounds,material:null});
 for(const [materialId,tasks] of groups){
   checkCancelled(signal);
   const first=tasks[0];
   let meshImage;
   try{meshImage=await capture(materialId);}
   catch(error){
     const row={materialId,materialName:first.materialName,hadColor:Boolean(first.hadColor),status:'error',
       reason:'No se pudo capturar esta malla: '+(error.message||error),fileIndex:null};
     rows.set(materialId,row);onRow(row);
     finished+=tasks.length;
     onProgress({stage:'visión',completed:finished,total:totalRounds,material:first.materialName});
     continue;
   }
   let finalists=[],problem=null;
   // All eligible color images are represented across rounds, max 8 per request.
   for(const task of tasks){
     checkCancelled(signal);
     try{
       const groupFiles=task.candidates.map(c=>files[c.fileIndex]);
       if(groupFiles.some(x=>!x))throw new Error('Cambió el paquete de imágenes durante el análisis.');
       const key=task.candidates.map(c=>c.fileIndex).join(',');
       let sheet=sheetCache.get(key);
       if(!sheet){
         sheet=await makeSheet(groupFiles,{strict:true});
         if(sheetCache.size<40)sheetCache.set(key,sheet);
       }
       const answer=await requestVisualWithTimeout({task,model,meshImage,
         textureImage:sheet,signal,advise,timeoutMs});
       const candidate=toPreview(task,answer);
       if(candidate)finalists.push({candidate,answer});
     }catch(error){
       if(signal?.aborted)throw new GlobalVisionCancelled();
       problem=error;
       if(isNetworkError(error)){failedNetwork=error;break;}
       // A bad image/model response only affects this material: keep processing.
     }finally{
       finished++;
       onProgress({stage:'visión',completed:finished,total:totalRounds,
         material:first.materialName,round:task.round});
     }
   }
   if(failedNetwork){
     const row={materialId,materialName:first.materialName,hadColor:Boolean(first.hadColor),status:'error',
       reason:failedNetwork.message,fileIndex:null};
     rows.set(materialId,row);onRow(row);break;
   }
   // Compare winners from different rounds, instead of equating unrelated
   // model self-confidence scores. If >8 finalists use a reduction tournament.
   while(finalists.length>1){
     checkCancelled(signal);
     const next=[];
     for(let i=0;i<finalists.length;i+=8){
       const part=finalists.slice(i,i+8);
       if(part.length===1){next.push(part[0]);continue;}
       const task={...first,candidates:part.map(x=>x.candidate)};
       try{
         const sheet=await makeSheet(task.candidates.map(c=>files[c.fileIndex]),{strict:true});
         const answer=await requestVisualWithTimeout({task,model,meshImage,
           textureImage:sheet,signal,advise,timeoutMs});
         if(answer.candidateIndex!==null && toPreview(task,answer)){
           next.push({candidate:toPreview(task,answer),answer});
         }
       }catch(error){
         if(signal?.aborted)throw new GlobalVisionCancelled();
         problem=error;
         if(isNetworkError(error)){failedNetwork=error;break;}
       }
       onProgress({stage:'comparación',completed:finished,total:totalRounds,material:first.materialName});
     }
     if(failedNetwork)break;
     if(next.length===finalists.length){ // defensive termination
       problem=new Error('No se pudo resolver la comparación de finalistas.');
       break;
     }
     finalists=next;
   }
   if(failedNetwork)break;
   const winner=finalists[0];
   const row={materialId,materialName:first.materialName,hadColor:Boolean(first.hadColor),
     status:winner?'review':problem?'error':'none',
     fileIndex:winner?.candidate.fileIndex??null,
     filename:winner?.candidate.name??null,
     sourcePath:winner?.candidate.path??null,
     family:winner?.candidate.family??null,
     aiConfidence:winner?.answer.confidence||null,
     reason:winner?'Sugerencia visual de Qwen (requiere revisión): '+winner.answer.reason:
       problem?'No se pudo completar la comparación: '+(problem.message||problem):
       'Qwen no encontró una coincidencia convincente',
     rounds:tasks.length,elapsedMs:Date.now()-started};
   rows.set(materialId,row);onRow(row);
 }
 const result={rows:[...rows.values()],completed:finished,total:totalRounds,
   cancelled:false,networkError:failedNetwork?.message||null,elapsedMs:Date.now()-started,
   model};
 onProgress({stage:failedNetwork?'interrumpido':'terminado',
   completed:finished,total:totalRounds,material:null});
 return result;
}
