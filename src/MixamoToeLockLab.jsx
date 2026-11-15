import {useMemo,useState} from 'react';
import {Download,Eye,Footprints,ShieldCheck,UploadCloud} from 'lucide-react';
import {
  inspectToeLockV4,applyToeLockV4,TOELOCK_V4,
} from './lib/autoRig/toeWeightTransfer.js';
import {inspectLumiaMasterRest} from './lib/autoRig/lumiaMasterProfile.js';
import {makeToeLockMixamoPackage} from './lib/toeLockMixamoPackage.js';
import ToeLockMiniPreview from './ToeLockMiniPreview.jsx';

// Separate MOTION-07 panel: it changes only a downloaded D162 COPY.
// The displayed 346-bone LUMIA master and Motion-06 clips stay untouched.
const field={display:'grid',gap:5,fontSize:12};
function download(bytes,filename,type){
  const blob=new Blob([bytes],{type});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),12000);
}
export default function MixamoToeLockLab({model,getViewer}){
  const [proxy,setProxy]=useState(null);
  const [kit,setKit]=useState(null);
  const [buffer,setBuffer]=useState(null);
  const [report,setReport]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [preview,setPreview]=useState(false);
  const [message,setMessage]=useState('');
  const master=useMemo(()=>inspectLumiaMasterRest(getViewer?.()?.model),
    [model?.filename,getViewer]);
  const compatible=Boolean(model?.format==='GLB'&&master.ok&&
    master.version==='claude-v09');
  const clearPrepared=()=>{
    setBuffer(null);setReport(null);setPreview(false);setMessage('');
  };
  const prepare=async()=>{
    if(!proxy||!compatible||busy)return;
    setBusy(true);setError('');setMessage('');
    try{
      if(proxy.size>24*1024*1024)
        throw new Error('El perfil V4 original no supera 24 MB; archivo inesperado.');
      const original=await proxy.arrayBuffer();
      const inspection=await inspectToeLockV4(original);
      const result=await applyToeLockV4(original);
      setBuffer(result.buffer);
      setReport({...result.report,sourceFile:proxy.name,
        expected:TOELOCK_V4});
      setMessage(inspection.alreadyCorrected
        ?'La copia D162 ya era la V4 certificada. No se alteraron pesos.'
        :'ToeLock V4 generado: las 3.708 influencias fueron transferidas y el SHA coincide con el Golden.');
    }catch(e){
      clearPrepared();setError(e.message||String(e));
    }finally{setBusy(false);}
  };
  const downloadModel=()=>{
    if(!buffer)return;
    download(buffer,'LUMIA_CLAUDE_MIXAMO_D162_TOELOCK_V4.glb','model/gltf-binary');
  };
  const downloadQA=()=>{
    if(!report)return;
    download(JSON.stringify({
      schema:'orbi/motion-07/toelock-v4',
      ...report,
      blender:'PENDIENTE_VALIDACION_LOCAL',
      mixamo:'PENDIENTE_VALIDACION_MANUAL',
    },null,2),'QA_TOELOCK_V4_ORBI.json','application/json');
  };
  const downloadBlenderKit=async()=>{
    if(!kit||!buffer||!report||busy)return;
    setBusy(true);setError('');setMessage('Preparando paquete Blender del kit original…');
    try{
      if(kit.size>20*1024*1024)
        throw new Error('ZIP V4 demasiado grande. Comprueba que seleccionaste el kit correcto.');
      const archive=await makeToeLockMixamoPackage({
        kitBuffer:await kit.arrayBuffer(),glbBuffer:buffer,report,
      });
      download(archive,'ORBI_MOTION_07_TOELOCK_V4_MIXAMO.zip','application/zip');
      setMessage('Paquete listo: contiene la copia D162 V4, exportador y CMD verificados. Ejecuta Blender en Windows.');
    }catch(e){setError(e.message||String(e));}
    finally{setBusy(false);}
  };
  if(!model)return null;
  return <details className="motion-extractor">
    <summary><Footprints size={15}/> MOTION-07 · Preparar D162 ToeLock V4 para Mixamo</summary>
    <div className="motion-extractor-content" style={{display:'grid',gap:12}}>
      <p><ShieldCheck size={14} style={{verticalAlign:'middle'}}/>
        {' '}Se transfieren exclusivamente pesos ToeBase → Foot en una COPIA
        temporal D162. Los 162 huesos permanecen; la maestra 346 y sus
        41 expresiones faciales nunca se modifican.</p>
      <p style={{fontSize:12,color:compatible?'#b2efda':'#ffcf9a'}}>
        {compatible
          ?'Maestra LUMIA Claude V09 reconocida por las matrices de reposo ('+
            master.pelvisY.toFixed(4)+' m pelvis / '+
            master.headY.toFixed(4)+' m cabeza).'
          :'Primero carga LUMIA_CLAUDE_MAESTRA_346.glb. '+(
            master.reason||'Este perfil solo admite la maestra Claude V09 validada.') }
      </p>
      <label style={field}>Copia de transporte D162 (GLB original o ToeLock V4)
        <input type="file" accept=".glb" disabled={busy||!compatible}
          onChange={e=>{
            setProxy(e.target.files?.[0]||null);clearPrepared();setError('');
          }}/>
      </label>
      <button type="button" className="outline-btn"
        disabled={!compatible||!proxy||busy} onClick={prepare}>
        <UploadCloud size={15}/> {busy?'Procesando…':'Auditar y preparar copia ToeLock V4'}
      </button>
      {report&&<div role="status" style={{
        border:'1px solid #33685b',borderRadius:7,padding:11,
        background:'#102e30',color:'#c7f8e4',fontSize:12,lineHeight:1.7,
      }}>
        <strong>{report.alreadyCorrected?'ToeLock V4 ya aplicado':'ToeLock V4 verificado byte a byte'}</strong>
        <div>Origen: {report.sourceFile}</div>
        <div>Huesos D162: {report.bones} · Vértices: {report.vertices.toLocaleString('es-CL')}
          · Triángulos: {report.triangles.toLocaleString('es-CL')}</div>
        <div>Pesos transferidos: izquierdo {report.moved.J_Bip_L_ToeBase},
          derecho {report.moved.J_Bip_R_ToeBase}</div>
        <div>SHA V4: {report.targetSha256.slice(0,16)}… ·
          error máximo pesos: {report.maxWeightSumError}</div>
        <small>La flexión independiente de ToeBase queda sin influencia en la
          geometría de transporte; MOTION-06 keep/auto/lock en las pistas
          descargadas sigue siendo una reparación diferente.</small>
      </div>}
      {report&&<div style={{display:'flex',flexWrap:'wrap',gap:8}}>
        <button type="button" className="outline-btn" onClick={downloadModel}>
          <Download size={14}/> Descargar D162 V4</button>
        <button type="button" className="outline-btn" onClick={downloadQA}>
          <Download size={14}/> Informe QA</button>
        <button type="button" className="outline-btn"
          onClick={()=>setPreview(value=>!value)}>
          <Eye size={14}/> {preview?'Cerrar previsualización':'Previsualizar D162'}
        </button>
      </div>}
      {preview&&buffer&&<ToeLockMiniPreview buffer={buffer}/>}
      {report&&<div style={{display:'grid',gap:9}}>
        <label style={field}>Kit ToeLock V4 original (incluye el exportador Blender aprobado)
          <input type="file" accept=".zip" disabled={busy}
            onChange={e=>{setKit(e.target.files?.[0]||null);setError('');}}/>
        </label>
        <button type="button" className="outline-btn"
          disabled={!kit||busy} onClick={downloadBlenderKit}>
          <Download size={15}/> Crear paquete de FBX COMPAT y COLOR (Blender)
        </button>
        <small>El navegador prepara el ZIP con los scripts originales
          verificados. Ejecuta CREAR_FBX_MIXAMO.cmd en Windows con Blender 5.2.
          ORBI no ejecuta Blender ni crea esos FBX por sí solo.</small>
      </div>}
      {message&&<p role="status" style={{color:'#b5efd5',fontSize:12}}>
        {message}</p>}
      {error&&<p role="alert" style={{color:'#ff9d91',fontSize:12}}>
        {error}</p>}
      <small>Perfil autorizado por SHA del archivo D162 real. No se aplica
        automáticamente a otros personajes. La aprobación visual en Mixamo de
        los FBX generados mediante este flujo permanece pendiente.</small>
    </div>
  </details>;
}
