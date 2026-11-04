import { useEffect,useMemo,useRef,useState } from 'react';
import { Brain,CheckCircle2,Layers3,Play,Square,AlertTriangle } from 'lucide-react';
import { buildGlobalTextureInventory,planGlobalVisionTasks } from './lib/globalTextureInventory.js';
import { runGlobalVision,summarizeGlobalResults } from './lib/globalVisionQueue.js';

const shade={review:'#ffd7a8',none:'#9fb4c5',error:'#ffb5a5',
  existing:'#9adbcf',blocked:'#f2b2af'};
export default function GlobalTextureAI({
 model,materials,files,modelName,onCapture,onBatch,busy,onActiveChange
}){
 const [includeTextured,setIncludeTextured]=useState(true);
 const [confirmReplacement,setConfirmReplacement]=useState(false);
 const [allowReuse,setAllowReuse]=useState(false);
 const [appliedCount,setAppliedCount]=useState(0);
 const inventory=useMemo(()=>buildGlobalTextureInventory(materials,files),[materials,files]);
 const plan=useMemo(()=>{
   try{return {...planGlobalVisionTasks(inventory,{includeTextured}),error:null};}
   catch(error){return {error:error.message,tasks:[],skipped:[],requests:0};}
 },[inventory,includeTextured]);
 const [running,setRunning]=useState(false);
 const [progress,setProgress]=useState({stage:'pendiente',completed:0,total:0,material:null});
 const [rows,setRows]=useState([]);
 const [error,setError]=useState('');
 const [approved,setApproved]=useState([]);
 const [modelUsed,setModelUsed]=useState('');
 const controller=useRef(null);
 const working=Boolean(busy)||running;
 const totals=useMemo(()=>summarizeGlobalResults(rows),[rows]);
 // The parent keys TextureStudio by modelGeneration; invalidating package or
 // refreshed materials also invalidates stale recommendations.
 useEffect(()=>{
   controller.current?.abort();
   controller.current=null;
   setRunning(false);setRows([]);setApproved([]);setConfirmReplacement(false);setAllowReuse(false);setAppliedCount(0);
   setError('');setProgress({stage:'pendiente',completed:0,total:0,material:null});
 },[inventory,modelName,model,includeTextured]);
 useEffect(()=>()=>controller.current?.abort(),[]);
 const run=async()=>{
   if(running||plan.error||!model||!plan.requests)return;
   const ctrl=new AbortController();controller.current=ctrl;
   setRunning(true);onActiveChange?.(true);setRows([]);setApproved([]);setError('');setConfirmReplacement(false);setAllowReuse(false);setAppliedCount(0);
   setModelUsed(modelName);
   setProgress({stage:'inventario',completed:0,total:plan.requests,material:null});
   try{
     const result=await runGlobalVision({
       plan,files,model:modelName,
       capture:materialId=>onCapture(materialId),
       signal:ctrl.signal,
       onProgress:value=>{if(!ctrl.signal.aborted)setProgress(value);},
       onRow:row=>{if(!ctrl.signal.aborted)setRows(old=>[...old.filter(x=>x.materialId!==row.materialId),row]);}
     });
     if(result.networkError)setError('Conexión Ollama interrumpida: '+result.networkError);
   }catch(e){
     if(e.name==='AbortError'||ctrl.signal.aborted){
       setProgress(old=>({...old,stage:'cancelado'}));
     }else{
       setError('No se pudo completar el análisis global: '+(e.message||e));
       setProgress(old=>({...old,stage:'error'}));
     }
   }finally{
     if(controller.current===ctrl)controller.current=null;
     setRunning(false);onActiveChange?.(false);
   }
 };
 const cancel=()=>controller.current?.abort();
 const review=rows.filter(x=>x.status==='review'&&x.fileIndex!==null);
 const approvedRows=review.filter(x=>approved.includes(x.materialId));
 const replaceRows=approvedRows.filter(x=>x.hadColor);
 const repeated=new Set(),reuses=[];
 for(const row of approvedRows){
   if(repeated.has(row.fileIndex))reuses.push(row.filename);
   repeated.add(row.fileIndex);
 }
 const applyReviewed=async()=>{
   if(!approvedRows.length||reuses.length&&!allowReuse||replaceRows.length&&!confirmReplacement)return;
   setError('');
   try{
     const outcome=await onBatch(approvedRows.map(row=>({
       file:files[row.fileIndex],materialId:row.materialId,channel:'map'
     })));
     setAppliedCount(outcome?.length||approvedRows.length);
     setApproved([]);setConfirmReplacement(false);setAllowReuse(false);
   }catch(e){setError('No se pudieron aplicar las seleccionadas: '+(e.message||e));}
 };
 const display=[...rows].sort((a,b)=>
   String(a.materialName||a.materialId).localeCompare(String(b.materialName||b.materialId)));
 return <section style={{border:'1px solid #39766e',borderRadius:10,
    padding:12,margin:'12px 0',background:'rgba(14,37,40,0.6)'}}>
   <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:6}}>
     <Layers3 size={18} color="#6ce5c6"/>
     <strong style={{fontSize:14}}>MOTION-04E · Personaje completo</strong>
   </div>
   <p style={{fontSize:11,lineHeight:1.6,color:'#a9cbcd',margin:'4px 0 10px'}}>
     Analiza todos los materiales del personaje y las imágenes de color de la carpeta.
     Qwen ejecuta consultas secuenciales y propone asignaciones para revisar, sin modificar nada durante el análisis.
   </p>
   <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:6,marginBottom:9}}>
     {[[inventory.counts.materials,'Materiales'],
       [inventory.counts.images,'Color posible'],
       [inventory.counts.excluded,'Otros mapas']].map(([number,label])=>
       <div key={label} style={{border:'1px solid #315354',borderRadius:8,
         padding:'8px 2px',textAlign:'center'}}>
         <strong style={{fontSize:18,display:'block'}}>{number}</strong>
         <span style={{fontSize:10,color:'#a8c6cc'}}>{label}</span>
       </div>)}
   </div>
   <p style={{fontSize:11,color:'#94bdc4',margin:'5px 0'}}>
     {inventory.families.length} familias de imágenes · {inventory.counts.withoutUV} materiales sin UV ·
     {' '}{inventory.counts.existing} materiales con color existente
   </p>
   <label style={{display:'flex',alignItems:'flex-start',gap:8,fontSize:11,
     lineHeight:1.55,color:'#d5e5df',margin:'9px 0',padding:'9px 8px',
     border:'1px solid #35665f',borderRadius:7}}>
     <input type="checkbox" checked={includeTextured} disabled={working}
       onChange={e=>setIncludeTextured(e.target.checked)}/>
     <span>Analizar también los {inventory.counts.existing} materiales con color existente.
       <span style={{display:'block',color:'#95bfb8'}}>Qwen podrá compararlos, pero
         no se reemplazará ninguna textura sin tu autorización posterior.</span>
     </span>
   </label>
   <p style={{fontSize:11,color:'#94bdc4',margin:'5px 0 10px'}}>
     {plan.error?'No se puede iniciar esta sesión':
       plan.requests+' consultas iniciales planificadas · '+(plan.skipped?.length||0)+' materiales sin consulta'}
     {plan.requests>1?' · Comparación adicional de finalistas cuando corresponda':''}
     {plan.requests===0&&inventory.counts.images>0&&inventory.counts.existing>0&&!includeTextured?
       ' · Activa la opción superior para analizar los materiales ya texturizados.':''}
   </p>
   {plan.error&&<p role="alert" style={{color:'#ffb4a7',fontSize:11}}>{plan.error}</p>}
   <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:7}}>
     <button className="export-btn" type="button" disabled={working||!model||
       !files.length||!plan.requests||Boolean(plan.error)}
       onClick={run} style={{display:'flex',gap:7,alignItems:'center',justifyContent:'center',flex:'1 1 165px'}}>
       <Brain size={16}/> {running?'Analizando personaje…':'Analizar personaje completo'}
     </button>
     {running&&<button className="outline-btn" type="button" onClick={cancel}
       style={{display:'flex',gap:6,alignItems:'center'}}><Square size={13}/> Cancelar</button>}
   </div>
   {running&&<div style={{fontSize:11,color:'#b6dcda',marginBottom:8}}>
      <div>{progress.stage} · {progress.completed}/{progress.total}
         {progress.material?' · '+progress.material:''}</div>
      <progress value={progress.completed} max={Math.max(progress.total,1)}
        style={{width:'100%',height:8,marginTop:6}}/>
   </div>}
   {!running&&progress.stage!=='pendiente'&&<p style={{fontSize:11,color:'#b9d9d8',margin:'5px 0'}}>
      Estado: {progress.stage} · {progress.completed}/{progress.total} consultas iniciales.
      {modelUsed?' Modelo: '+modelUsed:''}
   </p>}
   {error&&<p role="alert" style={{color:'#ffb4a7',fontSize:11,lineHeight:1.5}}>
     <AlertTriangle size={13}/> {error}
   </p>}
   {appliedCount>0&&<p role="status" style={{fontSize:11,color:'#8de5bd'}}>
      Aplicación solicitada: {appliedCount} textura(s). Verifica el personaje y utiliza «Deshacer lote» si es necesario.
    </p>}
   {rows.length>0&&<>
     <div style={{fontSize:11,color:'#b5d7d1',margin:'10px 0'}}>
       {totals.review} sugerencias por revisar · {totals.none} sin propuesta ·
       {' '}{totals.existing} ya texturizados · {totals.blocked} sin UV · {totals.errors} errores
     </div>
     <div style={{maxHeight:360,overflowY:'auto',display:'grid',gap:5}}>
       {display.map(row=><div key={row.materialId} style={{border:'1px solid #305456',
          borderRadius:7,padding:9}}>
          <div style={{display:'flex',alignItems:'center',gap:7}}>
            {row.status==='review'&&<input type="checkbox"
             aria-label={'Aprobar propuesta para '+row.materialName}
             checked={approved.includes(row.materialId)} disabled={working}
             onChange={e=>setApproved(old=>e.target.checked?[...old,row.materialId]:
               old.filter(id=>id!==row.materialId))}/>}
            <strong style={{fontSize:11,flex:1,overflowWrap:'anywhere'}}>
              {row.materialName||row.materialId}
            </strong>
            <span style={{fontSize:10,color:shade[row.status]||'#aabecb'}}>
              {row.status==='review'?'Revisar':row.status==='none'?'Sin propuesta':
               row.status==='existing'?'Ya texturizado':row.status==='blocked'?'Sin UV':'Error'}
            </span>
          </div>
          {row.status==='review'&&row.hadColor&&
            <div style={{fontSize:10,color:'#ffcf9e',marginTop:5}}>
              Requiere reemplazar la textura de color que ya tiene este material
            </div>}
          {row.filename&&<div style={{color:'#d9eaf1',fontSize:11,marginTop:3,overflowWrap:'anywhere'}}>
            {row.filename} {row.aiConfidence?'· confianza declarada: '+row.aiConfidence:''}
          </div>}
          <div style={{fontSize:10,color:'#99bec7',marginTop:3,lineHeight:1.55}}>
            {row.reason}
          </div>
        </div>)}
     </div>
     {replaceRows.length>0&&<label style={{display:'flex',gap:8,alignItems:'flex-start',
        margin:'10px 0',fontSize:11,color:'#ffd7aa',lineHeight:1.5}}>
       <input type="checkbox" checked={confirmReplacement}
         disabled={working} onChange={e=>setConfirmReplacement(e.target.checked)}/>
       Autorizo reemplazar las texturas actuales de los {replaceRows.length}
       materiales seleccionados. Podré deshacer el último lote.
     </label>}
     <button type="button" className="outline-btn" onClick={applyReviewed}
       disabled={working||!approvedRows.length||reuses.length>0&&!allowReuse||replaceRows.length>0&&!confirmReplacement}
       style={{width:'100%',display:'flex',gap:7,alignItems:'center',
         justifyContent:'center',marginTop:9}}>
        <CheckCircle2 size={15}/> Confirmar y aplicar {approvedRows.length} revisadas
     </button>
     {review.length>0&&!approvedRows.length&&
       <p style={{fontSize:11,color:'#a5c3c2'}}>
         Marca las propuestas correctas de la tabla para habilitar su aplicación.
       </p>}
     {reuses.length>0&&<div style={{fontSize:11,color:'#ffcf9e',lineHeight:1.5,marginTop:8}}>
       La misma imagen fue recomendada para varios materiales:
       {' '}{[...new Set(reuses)].join(', ')}.
       <label style={{display:'flex',gap:8,alignItems:'flex-start',marginTop:6}}>
         <input type="checkbox" checked={allowReuse} disabled={working}
           onChange={e=>setAllowReuse(e.target.checked)}/>
         Autorizo reutilizar esas imágenes en varios materiales porque he revisado
         que son atlas compartidos. Si no estoy seguro, aplicaré las propuestas por separado.
       </label>
     </div>}
   </>}
   <p style={{fontSize:10,lineHeight:1.6,color:'#9bbdb8',margin:'9px 0 0'}}>
     Seguridad: ninguna sugerencia exclusivamente visual se considera «segura» automáticamente.
     Las asignaciones seleccionadas requieren tu aprobación. Solo color/albedo en esta fase.
     La matriz global de conflictos avanzada y las verificaciones UV completas corresponden a MOTION-04E3.
   </p>
 </section>;
}
