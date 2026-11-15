import {useState} from 'react';
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
  if(!model)return null;
  const allowed=model.bones===346 && model.format==='GLB';
  const run=async()=>{
    if(!file||!allowed||busy)return;
    setBusy(true);setError('');setResult(null);
    try{
      const viewer=getViewer?.();
      if(!viewer?.addLumiaMixamoRetarget)
        throw new Error('El visor no dispone del motor MOTION-06.');
      const report=await viewer.addLumiaMixamoRetarget(file,{pivot,toes});
      setResult(report);
      onComplete?.(report);
    }catch(e){setError(e.message||String(e));}
    finally{setBusy(false);}
  };
  return <details className="motion-extractor">
    <summary><Film size={15}/> MOTION-06 · Mixamo 155/D162 → LUMIA V06B</summary>
    <div className="motion-extractor-content">
      <p><ShieldCheck size={14} style={{verticalAlign:'middle'}}/>
        {' '}Conversión opcional. No sustituye el rig, las 41 expresiones,
        la geometría ni las animaciones existentes.</p>
      {!allowed&&<p role="note" style={{color:'#ffcc88'}}>
        Necesitas cargar el GLB maestro de LUMIA V06B con 346 huesos.
        Este perfil no admite modelos arbitrarios.</p>}
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
