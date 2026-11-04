import { useEffect,useMemo,useState } from 'react';
import { ImagePlus,Images,WandSparkles,ShieldCheck,FolderOpen,Archive,
  RotateCcw,AlertTriangle,ClipboardCheck } from 'lucide-react';
import { TEXTURE_CHANNELS,isTextureFile } from './lib/textureStudio.js';
import { buildTexturePlan,summarizeTexturePlan,normalizedPath } from './lib/textureAuto.js';
import { extractTextureZip,validateTexturePackage,filesFromDrop } from './lib/texturePackage.js';
import OllamaTextureAI from './OllamaTextureAI.jsx';

const selectStyle={width:'100%',minWidth:0,background:'#17273b',color:'#deedf9',
  border:'1px solid #315064',borderRadius:7,padding:9,fontSize:12};
const buttonStyle={display:'flex',alignItems:'center',gap:7,justifyContent:'center'};
const labelColor={high:'#69ddca',medium:'#ffcd8a',low:'#a9bdcb'};

export default function TextureStudio({model,materials,busy,onApply,onBatch,onUndo,canUndo,onCapture}) {
 const [files,setFiles]=useState([]);
 const [materialId,setMaterialId]=useState('');
 const [channel,setChannel]=useState('map');
 const [fileIndex,setFileIndex]=useState(0);
 const [working,setWorking]=useState(false);
 const [error,setError]=useState('');
 const [analyzed,setAnalyzed]=useState(false);
 const [approval,setApproval]=useState([]);
 const [overrides,setOverrides]=useState({});
 const [previewUrls,setPreviewUrls]=useState({});
 const [showMore,setShowMore]=useState(false);
 const [applied,setApplied]=useState(0);
 const plan=useMemo(()=>analyzed?buildTexturePlan(files,materials):[],[analyzed,files,materials]);
 const summary=useMemo(()=>summarizeTexturePlan(plan),[plan]);
 const selected=new Set(approval);
 const disabled=Boolean(busy)||working;
 useEffect(()=>{if(!materials.some(x=>x.id===materialId))setMaterialId(materials[0]?.id||'');},[materials,materialId]);
 useEffect(()=>{
   const next={};
   files.slice(0,50).forEach((file,index)=>{
     if(!/\.dds$/i.test(file.name))next[index]=URL.createObjectURL(file);
   });
   setPreviewUrls(next);
   return ()=>Object.values(next).forEach(url=>URL.revokeObjectURL(url));
 },[files]);
 const record=filesIn=>{
   const next=validateTexturePackage(filesIn);
   setFiles(old=>validateTexturePackage([...old,...next]));
   setError('');setAnalyzed(false);setApproval([]);setOverrides({});setApplied(0);
 };
 const accept=event=>{
   try{record([...event.target.files||[]]);}catch(e){setError(e.message||String(e));}
   event.target.value='';
 };
 const importZip=async event=>{
   const zip=event.target.files?.[0];
   event.target.value='';
   if(!zip)return;
   setWorking(true);setError('');
   try{record(await extractTextureZip(zip));}
   catch(e){setError('No se pudo leer el ZIP: '+(e.message||e));}
   finally{setWorking(false);}
 };
 const dropFiles=async event=>{
   event.preventDefault();
   if(!model||disabled)return;
   setWorking(true);setError('');
   try{
     const zip=[...event.dataTransfer.files||[]].filter(f=>/\.zip$/i.test(f.name));
     const ordinary=await filesFromDrop(event.dataTransfer);
     const archives=[];
     for(const item of zip)archives.push(...await extractTextureZip(item));
     record([...ordinary,...archives]);
   }
   catch(e){setError('No se pudo importar el paquete: '+(e.message||e));}
   finally{setWorking(false);}
 };
 const analyze=()=>{
   setApproval([]);setOverrides({});setAnalyzed(true);setApplied(0);setError('');
 };
 const assignments=rows=>rows.map(p=>({
   file:files[p.fileIndex],materialId:overrides[p.fileIndex]||p.materialId,channel:p.channel,
 })).filter(x=>x.file&&x.materialId&&x.channel);
 const execute=async rows=>{
   if(!rows.length)return;
   setWorking(true);setError('');
   try{
     const results=await onBatch(assignments(rows));
     setApplied(results?.length||0);
     setApproval([]);
   }catch(e){setError('No se aplicó el lote: '+(e.message||e));}
   finally{setWorking(false);}
 };
 const safe=plan.filter(x=>x.status==='safe');
 const review=plan.filter(x=>x.status==='review');
 const confirm=review.filter(x=>selected.has(x.fileIndex)&&!x.blocked&&x.materialId);
 const applyManual=async()=>{
   const file=files[fileIndex];if(!file||!materialId)return;
   setWorking(true);setError('');
   try{const ok=await onApply(file,materialId,channel);if(ok)setApplied(x=>x+1);}
   catch(e){setError(e.message||String(e));}
   finally{setWorking(false);}
 };
 const undo=async()=>{
   setWorking(true);setError('');
   try{const ok=await onUndo();if(ok)setApplied(0);}
   catch(e){setError(e.message||String(e));}
   finally{setWorking(false);}
 };
 const show=showMore?plan:plan.slice(0,24);
 return <section className="panel" onDragOver={event=>{if(model)event.preventDefault();}} onDrop={dropFiles}
  style={{padding:16,marginBottom:14}}>
  <div style={{display:'flex',gap:10,alignItems:'flex-start',marginBottom:10}}>
   <div className="section-icon mint"><Images size={19}/></div>
   <div><h3 style={{fontSize:16,margin:'0 0 4px'}}>Texturas inteligentes · MOTION-04C</h3>
    <p style={{fontSize:12,color:'#9bb6ca',margin:0,lineHeight:1.5}}>
     Carga el paquete y deja que ORBI proponga las coincidencias antes de modificar materiales.</p></div>
  </div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:7}}>
   <label className="outline-btn" style={{...buttonStyle,cursor:model&&!disabled?'pointer':'not-allowed'}}>
    <ImagePlus size={15}/> Imágenes
    <input type="file" accept=".png,.jpg,.jpeg,.webp,.dds" multiple style={{display:'none'}}
      disabled={!model||disabled} onChange={accept}/>
   </label>
   <label className="outline-btn" style={{...buttonStyle,cursor:model&&!disabled?'pointer':'not-allowed'}}>
    <FolderOpen size={15}/> Carpeta
    <input type="file" webkitdirectory="" directory="" multiple style={{display:'none'}}
      disabled={!model||disabled} onChange={accept}/>
   </label>
   <label className="outline-btn" style={{...buttonStyle,cursor:model&&!disabled?'pointer':'not-allowed'}}>
    <Archive size={15}/> ZIP
    <input type="file" accept=".zip,application/zip" style={{display:'none'}}
      disabled={!model||disabled} onChange={importZip}/>
   </label>
  </div>
  <div style={{padding:'12px 8px',border:'1px dashed #355568',borderRadius:9,
   margin:'10px 0',textAlign:'center',fontSize:11,color:'#9dbacd'}}>
   Arrastra aquí imágenes o una carpeta · Procesamiento local · Sin subir archivos
  </div>
  {model?<p style={{fontSize:11,color:'#a2c6d6',margin:'7px 0'}}>
   {materials.length} materiales · {files.length} imágenes · {materials.filter(m=>!m.hasUV).length} sin UV
  </p>:<p style={{fontSize:12,color:'#a2b4ca'}}>Carga un personaje 3D para activar las texturas.</p>}
  {Boolean(error)&&<p role="alert" style={{fontSize:12,color:'#ffb49a',overflowWrap:'anywhere'}}><AlertTriangle size={15}/> {error}</p>}
  {files.length>0&&<div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
   <button type="button" className="export-btn" disabled={disabled} onClick={analyze}
    style={{flex:'1 1 160px',...buttonStyle}}><WandSparkles size={16}/> Analizar {files.length} imágenes</button>
   <button type="button" className="outline-btn" disabled={disabled} onClick={()=>{
    setFiles([]);setAnalyzed(false);setApproval([]);setApplied(0);setError('');
   }}>Vaciar selección</button>
  </div>}
  {analyzed&&<>
   <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',
      gap:6,margin:'8px 0 12px'}}>
    {[
     [summary.detected,'Detectadas'],[summary.safe,'Seguras'],
     [summary.review,'Por revisar'],[summary.unmatched,'Sin relación']
    ].map(([value,name])=><div key={name} style={{border:'1px solid #2b4758',
      borderRadius:8,padding:'10px 3px',textAlign:'center'}}>
      <strong style={{fontSize:18,display:'block'}}>{value}</strong>
      <span style={{fontSize:10,color:'#9bb5c7'}}>{name}</span>
     </div>)}
   </div>
   <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:12}}>
    <button type="button" className="export-btn" disabled={disabled||!safe.length}
     onClick={()=>execute(safe)} style={{flex:'1 1 170px',...buttonStyle}}>
     <ClipboardCheck size={16}/> Aplicar {safe.length} seguras
    </button>
    <button type="button" className="outline-btn" disabled={disabled||!confirm.length}
     onClick={()=>execute(confirm)} style={{flex:'1 1 170px',...buttonStyle}}>
     Confirmar {confirm.length} seleccionadas
    </button>
    <button type="button" className="outline-btn" disabled={disabled||!canUndo}
     onClick={undo} style={{...buttonStyle}}>
     <RotateCcw size={15}/> Deshacer lote
    </button>
   </div>
   {applied>0&&<p style={{color:'#73e4c3',fontSize:12}}>
    {applied} textura(s) aplicada(s). Puedes revisar el visor y deshacer el último lote.</p>}
   <div style={{maxHeight:390,overflowY:'auto',display:'grid',gap:7}}>
    {show.map(p=><div key={p.fileIndex} style={{border:'1px solid #2b455a',
      borderRadius:9,padding:9,display:'flex',gap:9,alignItems:'flex-start'}}>
     <div style={{width:45,height:45,flexShrink:0,background:'#203448',borderRadius:6,
       display:'grid',placeItems:'center',overflow:'hidden'}}>
      {previewUrls[p.fileIndex]?<img src={previewUrls[p.fileIndex]} alt=""
       style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<Images size={21}/>}
     </div>
     <div style={{flex:1,minWidth:0}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:8}}>
       <strong style={{fontSize:12,overflowWrap:'anywhere'}}>{p.filename}</strong>
       <span style={{color:labelColor[p.level],fontSize:11,whiteSpace:'nowrap'}}>
        {p.status==='safe'?'Segura':p.status==='review'?'Revisión':'Sin relación'} {p.score||''}
       </span>
      </div>
      <div style={{fontSize:11,color:'#bfd7e5',marginTop:3}}>
       {p.materialName||'Sin material'} {p.channel?'· '+(TEXTURE_CHANNELS.find(x=>x.key===p.channel)?.label||p.channel):''}
      </div>
      <div style={{fontSize:11,color:'#8eaec5',lineHeight:1.55}}>{p.reason}</div>
      {p.status==='review'&&!p.blocked&&<div style={{display:'flex',alignItems:'center',gap:7,marginTop:6}}>
       <input type="checkbox" checked={selected.has(p.fileIndex)} disabled={disabled}
        onChange={e=>setApproval(current=>e.target.checked?[...current,p.fileIndex]:current.filter(x=>x!==p.fileIndex))}/>
       <select aria-label={'Material para '+p.filename} style={{...selectStyle,flex:1,padding:5}}
        value={overrides[p.fileIndex]||p.materialId||''}
        onChange={e=>setOverrides(x=>({...x,[p.fileIndex]:e.target.value}))} disabled={disabled}>
        {materials.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
       </select>
      </div>}
     </div>
    </div>)}
   </div>
   {plan.length>24&&<button className="outline-btn" type="button"
     onClick={()=>setShowMore(v=>!v)}>{showMore?'Ver menos':'Ver todas las '+plan.length+' imágenes'}</button>}
  </>}
  <OllamaTextureAI model={model} materials={materials} files={files} busy={busy} onCapture={onCapture} onBatch={onBatch}/>
  <details style={{marginTop:12,fontSize:12,color:'#b6cada'}}>
   <summary style={{cursor:'pointer',fontWeight:650}}>Asignación manual y tutorial</summary>
   <div style={{display:'grid',gap:8,marginTop:10}}>
    <label>Material
     <select style={selectStyle} value={materialId} onChange={e=>setMaterialId(e.target.value)}>
      {materials.map(m=><option value={m.id} key={m.id}>{m.name}{!m.hasUV?' · Sin UV':''}</option>)}
     </select>
    </label>
    <label>Canal
     <select style={selectStyle} value={channel} onChange={e=>setChannel(e.target.value)}>
      {TEXTURE_CHANNELS.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}
     </select>
    </label>
    <label>Imagen
     <select style={selectStyle} value={fileIndex} onChange={e=>setFileIndex(Number(e.target.value))}>
      {files.map((file,i)=><option value={i} key={i}>{normalizedPath(file)}</option>)}
     </select>
    </label>
    <button className="outline-btn" type="button" disabled={disabled||!files.length||!materialId} onClick={applyManual}>
     Aplicar imagen seleccionada
    </button>
   </div>
   <p style={{fontSize:11,lineHeight:1.7,color:'#a8c1d2'}}>
    1. Carga un FBX, GLB o VRM. 2. Selecciona imágenes, carpeta o ZIP. 3. Pulsa Analizar imágenes.
    4. Revisa los nombres y canales: las coincidencias seguras se aplican con un solo botón.
    5. Confirma por separado las ambiguas; no se sobrescriben materiales existentes automáticamente.
    6. Revisa colores, ojos, piel y ropa en el visor. 7. Si algo no luce bien, usa Deshacer lote.
    8. Exporta GLB para conservar texturas en un único archivo. Las imágenes DDS se convierten
    localmente; ZIP, cubemaps, texturas sin UV o compresiones no admitidas mostrarán advertencias.
    El FBX directo sigue siendo experimental y puede requerir imágenes externas.
   </p>
  </details>
  <div style={{display:'flex',alignItems:'center',gap:7,fontSize:11,color:'#92bdbd',marginTop:10}}>
   <ShieldCheck size={15}/> El análisis no modifica huesos, animaciones ni archivos originales.
  </div>
 </section>;
}
