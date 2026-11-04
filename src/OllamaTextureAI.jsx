import { useEffect,useMemo,useRef,useState } from 'react';
import { Brain,CheckCircle2,Image,ShieldCheck,RefreshCcw,AlertTriangle } from 'lucide-react';
import { getInstalledOllamaModels,askOllamaVisual,OLLAMA_MODEL,ollamaOriginHelp } from './lib/ollamaVision.js';
import { textureContactSheet } from './lib/visionImages.js';
import { inferTextureChannel,isTextureFile } from './lib/textureStudio.js';

const selectStyle={width:'100%',padding:8,borderRadius:7,background:'#17273b',
 color:'#e0f2ff',border:'1px solid #315064'};
export default function OllamaTextureAI({model,materials,files,busy,onCapture,onBatch}){
  const [status,setStatus]=useState('disconnected');
  const [models,setModels]=useState([]);
  const [modelName,setModelName]=useState(OLLAMA_MODEL);
  const [materialId,setMaterialId]=useState('');
  const [candidateIds,setCandidateIds]=useState([]);
  const [result,setResult]=useState(null);
  const [error,setError]=useState('');
  const [processing,setProcessing]=useState(false);
  const [replace,setReplace]=useState(false);
  const control=useRef(null);
  const eligible=useMemo(()=>files.map((file,index)=>({file,index}))
    .filter(x=>isTextureFile(x.file) && inferTextureChannel(x.file.name)==='map' &&
      !/(?:normaldx|gloss|spec|bump|height)/i.test(x.file.name)),[files]);
  const material=materials.find(m=>m.id===materialId);
  const origin=typeof window==='undefined'?'':window.location.origin;
  useEffect(()=>{
    if(!materials.some(m=>m.id===materialId))setMaterialId(materials[0]?.id||'');
  },[materials,materialId]);
  useEffect(()=>{
    setCandidateIds(eligible.slice(0,8).map(x=>x.index));
    setResult(null);
  },[eligible]);
  useEffect(()=>{setResult(null);setReplace(false);},[materialId]);
  useEffect(()=>()=>control.current?.abort(),[]);
  const stop=()=>control.current?.abort();
  const connect=async()=>{
    setProcessing(true);setError('');
    const ctrl=new AbortController();control.current=ctrl;
    try{
      const list=await getInstalledOllamaModels({signal:ctrl.signal});
      setModels(list);setStatus('connected');
      if(!list.includes(modelName)){
        const preferred=list.find(m=>m.toLowerCase().startsWith('qwen3.5:0.8b'));
        setModelName(preferred||list[0]||OLLAMA_MODEL);
      }
      if(!list.length)setError('Ollama respondió, pero no aparecen modelos instalados. Comprueba «ollama list» en PowerShell.');
    }catch(e){setStatus('disconnected');setError(e.message||String(e));}
    finally{setProcessing(false);control.current=null;}
  };
  const toggleCandidate=index=>{
    setCandidateIds(old=>{
      if(old.includes(index))return old.filter(x=>x!==index);
      if(old.length>=8){setError('Máximo ocho imágenes por consulta para proteger la memoria de Qwen 0.8B.');return old;}
      setError('');return [...old,index];
    });
    setResult(null);
  };
  const analyze=async()=>{
    if(!material || !model || !candidateIds.length)return;
    const candidateFiles=candidateIds.map(i=>files[i]).filter(Boolean);
    if(!candidateFiles.length)return;
    setProcessing(true);setError('');setResult(null);
    const ctrl=new AbortController();control.current=ctrl;
    const limit=setTimeout(()=>ctrl.abort(),120000);
    try{
      const view=onCapture(material.id);
      const sheet=await textureContactSheet(candidateFiles);
      if(ctrl.signal.aborted)throw new Error('Operación cancelada.');
      const answer=await askOllamaVisual({model:modelName,meshImage:view,textureImage:sheet,
        materialName:material.name,meshNames:material.meshNames,
        candidates:candidateFiles.map(f=>({name:f.name})),signal:ctrl.signal});
      if(answer.candidateIndex===null){
        setResult({file:null,answer,materialId:material.id});
      }else{
        const index=candidateIds[answer.candidateIndex];
        setResult({file:files[index],index,answer,materialId:material.id});
      }
    }catch(e){setError(e.message||String(e));}
    finally{clearTimeout(limit);setProcessing(false);control.current=null;}
  };
  const apply=async()=>{
    if(!result?.file||!material||material.id!==result.materialId)return;
    if(material.channels.includes('Color / Albedo')&&!replace){
      setError('Este material ya tiene color. Marca la casilla para autorizar su sustitución.');
      return;
    }
    setProcessing(true);setError('');
    try{
      await onBatch([{file:result.file,materialId:material.id,channel:'map'}]);
      setResult(null);setReplace(false);
    }catch(e){setError(e.message||String(e));}
    finally{setProcessing(false);}
  };
  return <section style={{border:'1px solid #30516a',borderRadius:11,
   padding:12,margin:'13px 0',background:'rgba(24,38,55,0.65)'}}>
   <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:7}}>
    <Brain size={18} color="#6bdfcb"/>
    <strong style={{fontSize:14}}>Qwen Visual · Ollama local</strong>
   </div>
   <p style={{fontSize:11,color:'#a9bed0',lineHeight:1.6,margin:'5px 0 10px'}}>
    MOTION-04D — IA experimental. Analiza una pieza 3D y hasta ocho texturas a la vez.
    Las sugerencias requieren tu aprobación; la IA no verifica UV ni aplica cambios sola.
   </p>
   <div style={{display:'flex',gap:8,alignItems:'center',margin:'6px 0 10px'}}>
    <button type="button" className="outline-btn" onClick={connect} disabled={Boolean(busy)||processing}
      style={{display:'flex',alignItems:'center',gap:5,flex:1}}>
     <RefreshCcw size={14}/> {status==='connected'?'Actualizar conexión':'Conectar Ollama'}
    </button>
    <span style={{fontSize:11,color:status==='connected'?'#70d7c4':'#aac2d8'}}>
      {status==='connected'?'Conectado':'Sin conectar'}
    </span>
   </div>
   {status==='connected'&&<label style={{fontSize:11,color:'#c5d7e8',display:'grid',gap:5}}>
    Modelo instalado
    <select style={selectStyle} value={modelName} onChange={e=>setModelName(e.target.value)}>
      {models.map(name=><option value={name} key={name}>{name}</option>)}
    </select>
   </label>}
   {status==='connected'&&model&&<>
     <label style={{fontSize:11,color:'#c5d7e8',display:'grid',gap:5,marginTop:8}}>
      Pieza o material para analizar
      <select style={selectStyle} value={materialId} onChange={e=>setMaterialId(e.target.value)}>
        {materials.map(m=><option key={m.id} value={m.id}>{m.name} ({m.meshes} mallas)</option>)}
      </select>
     </label>
     {material&&<p style={{fontSize:11,color:'#8fb0c6',margin:'8px 0'}}>
      {material.meshNames.slice(0,4).join(', ')} · {material.hasUV?'Con UV':'Sin UV'}
     </p>}
     <details style={{marginBottom:9}}>
      <summary style={{fontSize:11,cursor:'pointer',color:'#c2d7e6'}}>
       Elegir imágenes candidatas ({candidateIds.length} de {eligible.length} disponibles)
      </summary>
      <div style={{maxHeight:155,overflowY:'auto',marginTop:7}}>
       {eligible.map(({file,index})=><label key={index} style={{display:'flex',gap:7,
         fontSize:11,padding:'4px 0',color:'#b7cadd',overflowWrap:'anywhere'}}>
         <input type="checkbox" checked={candidateIds.includes(index)}
          onChange={()=>toggleCandidate(index)} disabled={processing}/>
         {file.name}
       </label>)}
      </div>
     </details>
     <div style={{display:'flex',gap:7}}>
      <button type="button" className="export-btn" disabled={Boolean(busy)||processing||!material?.hasUV||!candidateIds.length}
       onClick={analyze} style={{flex:1,display:'flex',gap:6,alignItems:'center',justifyContent:'center'}}>
       <Image size={15}/> Analizar con Qwen
      </button>
      {processing&&<button type="button" className="outline-btn" onClick={stop}>Cancelar</button>}
     </div>
   </>}
   {error&&<p role="alert" style={{fontSize:11,color:'#ffb4a7',lineHeight:1.6}}>
     <AlertTriangle size={13}/> {error}
   </p>}
   {result&&<div style={{marginTop:10,border:'1px solid #376c70',borderRadius:8,padding:10}}>
    <div style={{fontSize:12,fontWeight:650}}>
     {result.file?'Sugerencia: '+result.file.name:'Qwen no identificó una textura apropiada'}
    </div>
    <p style={{fontSize:11,color:'#bcd5df',lineHeight:1.65}}>
     {result.answer.reason} {result.answer.part?'· Pieza: '+result.answer.part:''}
     {' · Confianza declarada: '+result.answer.confidence+' (no verificada)'}
    </p>
    {result.file&&material?.id===result.materialId&&<>
      {material.channels.includes('Color / Albedo')&&<label style={{display:'flex',gap:8,fontSize:11,marginBottom:9}}>
       <input type="checkbox" checked={replace} onChange={e=>setReplace(e.target.checked)}/>
       Autorizar sustituir la textura de color actual
      </label>}
      <button className="outline-btn" type="button" onClick={apply} disabled={Boolean(busy)||processing||!material.hasUV}>
       <CheckCircle2 size={15}/> Confirmar y aplicar esta textura
      </button>
    </>}
   </div>}
   {status!=='connected'&&<details style={{marginTop:10,fontSize:11,color:'#b3c9dc'}}>
    <summary style={{cursor:'pointer'}}>Ayuda de conexión en Windows</summary>
    <p>1. Comprueba en PowerShell: <code>ollama list</code> y <code>ollama serve</code> si el servicio no está activo.
      2. La web necesita autorización de origen para hablar con el Ollama de tu propia laptop.
      3. Configura el origen exacto de esta página y reinicia Ollama desde la bandeja del sistema.
      No uses <code>OLLAMA_ORIGINS=*</code> ni expongas el puerto 11434 a Internet.</p>
    <pre style={{fontSize:10,overflowX:'auto',padding:8,background:'#101b29'}}>
     {ollamaOriginHelp(origin)}
    </pre>
    <p>En Windows, cierra Ollama completamente y ábrelo otra vez después de cambiar esta variable.
     El navegador también puede solicitar permiso para acceder a dispositivos o servicios locales.</p>
   </details>}
   <div style={{display:'flex',alignItems:'center',gap:6,color:'#8dbec0',
    fontSize:10,marginTop:10}}>
    <ShieldCheck size={13}/> Las imágenes se envían solo a 127.0.0.1:11434 en tu equipo.
   </div>
  </section>;
}
