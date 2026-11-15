import {useMemo,useState} from 'react';
import {inspectLumiaMasterRest} from './lib/autoRig/lumiaMasterProfile.js';
import {Film,ShieldCheck,UploadCloud} from 'lucide-react';

// Separate from existing AUTORIG-02F controls. Uses the already loaded GLB
// as destination and preserves every original clip and source asset.
const field={width:'100%',padding:8,borderRadius:7,
  border:'1px solid #37526a',background:'#15263a',color:'#e6f7fa'};
export default function MixamoRetargetLab({model,getViewer,onComplete}){
  const [file,setFile]=useState(null);
  const [pivot,setPivot]=useState('anchored');
  const [toes,setToes]=useState('auto');
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState(null);
  const [error,setError]=useState('');
  const detected=useMemo(()=>inspectLumiaMasterRest(getViewer?.()?.model),
    [model?.filename,getViewer]);
  const targetVersion=detected.ok?detected.version:'v06b';
  if(!model)return null;
  const allowed=model.bones===346 && model.format==='GLB';
  const run=async()=>{
    if(!file||!allowed||busy)return;
    setBusy(true);setError('');setResult(null);
    try{
      const viewer=getViewer?.();
      if(!viewer?.addLumiaMixamoRetarget)
        throw new Error('El visor no dispone del motor MOTION-06.');
      const report=await viewer.addLumiaMixamoRetarget(file,{
        pivot,toes,targetVersion,
      });
      setResult(report);
      onComplete?.(report);
    }catch(e){setError(e.message||String(e));}
    finally{setBusy(false);}
  };
  return <details className="motion-extractor">
    <summary><Film size={15}/> MOTION-06/07 · Mixamo 155/D162 → LUMIA 346</summary>
    <div className="motion-extractor-content">
      <p><ShieldCheck size={14} style={{verticalAlign:'middle'}}/>
        {' '}Conversión opcional. No sustituye el rig, las 41 expresiones,
        la geometría ni las animaciones existentes.</p>
      {allowed&&<p role="status" style={{color:'#b7eee3'}}>
        Destino: {detected.ok
          ?(detected.version==='claude-v09'?
             'Claude V09 · reposo identificado':'V06B · reposo identificado')
          :'perfil V06B heredado (sin identificación de reposo; revisar rigurosamente)'}.
        {detected.version==='claude-v09'
          ?' Se usarán las matrices de reposo V09, distintas de V06B.':''}
      </p>}
      {!allowed&&<p role="note" style={{color:'#ffcc88'}}>
        Necesitas cargar un GLB maestro LUMIA reconocido de 346 huesos.
        No se admite un rig genérico.</p>}
      <label style={{display:'grid',gap:5,fontSize:12}}>Archivo Mixamo FBX del rig LUMIA 155 o D162
        <input type="file" accept=".fbx" disabled={!allowed||busy}
          onChange={e=>{setFile(e.target.files?.[0]||null);setResult(null);}}/>
      </label>
      <label style={{display:'grid',gap:5,fontSize:12}}>Pivote
        <select value={pivot} style={field} disabled={busy||!allowed}
          onChange={e=>setPivot(e.target.value)}>
          <option value="anchored">Pelvis centrada — corregir órbita X/Z</option>
          <option value="preserve-stage">Conservar recorrido original (experimental)</option>
        </select>
      </label>
      <label style={{display:'grid',gap:5,fontSize:12}}>Puntas de los pies
        <select value={toes} style={field} disabled={busy||!allowed}
          onChange={e=>setToes(e.target.value)}>
          <option value="auto">Detectar saltos anómalos</option>
          <option value="keep">Mantener toda la flexión original</option>
          <option value="lock">Neutralizar rotación independiente de ambas puntas</option>
        </select>
      </label>
      <button type="button" className="outline-btn"
        disabled={!allowed||!file||busy} onClick={run}>
        <UploadCloud size={15}/> {busy?'Convirtiendo…':'Probar retarget en ORBI'}
      </button>
      {result&&<div role="status" style={{fontSize:12,color:'#b7eee3'}}>
        Añadida: {result.name}. {result.samples} muestras, {result.tracks} pistas,
        origen {result.sourceBones} → {result.targetBones} huesos.
        {result.lockedToes?' Puntas estabilizadas.':''}
        {' '}Previsualiza el resultado y expórtalo con la función GLB existente.
      </div>}
      {error&&<p role="alert" style={{fontSize:12,color:'#ff9d91'}}>{error}</p>}
      <small>Adaptador web experimental: no se ha certificado su equivalencia exacta
        con el motor Python Golden V4. La conversión local Python ya validada
        sigue siendo la referencia para producir resultados definitivos.
        No se cargan archivos a un servidor.</small>
    </div>
  </details>;
}
