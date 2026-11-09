import {useEffect,useState} from 'react';
import {Eye,ScanFace,Smile,X,Focus,RotateCcw,Volume2,Square} from 'lucide-react';
import {canRunFacialQuickAction} from './lib/livingPresence/facialQuickActions.js';

const ROWS=Object.freeze([
  {key:'blink',label:'Parpadear',group:'face',feature:'blink'},
  {key:'left',label:'Mirar izquierda',group:'face',feature:'gaze'},
  {key:'right',label:'Mirar derecha',group:'face',feature:'gaze'},
  {key:'up',label:'Mirar arriba',group:'face',feature:'gaze'},
  {key:'down',label:'Mirar abajo',group:'face',feature:'gaze'},
  {key:'brows',label:'Cejas',group:'face',feature:'browLift'},
  {key:'smile',label:'Sonrisa',group:'face',feature:'smile'},
  {key:'cheeks',label:'Mejillas',group:'face',feature:'cheeks'},
  {key:'eyelids',label:'Entrecerrar',group:'face',feature:'squint'},
  {key:'jaw',label:'Mandíbula',group:'face',feature:'jaw'},
]);
const VOWELS=Object.freeze(['a','e','i','o','u']);
function snapshot(viewer){
  return {
    face:viewer?.getLivingFacialDiagnostics?.()||null,
    lip:viewer?.getLivingLipDiagnostics?.()||null,
    fbx:Boolean(viewer?.fbxFace),
    presenceEnabled:Boolean(viewer?.presence?.enabled||viewer?.fbxFace?.enabled),
  };
}
export default function FaceQuickDock({getViewer,model,open,onClose,voiceState,onSpeak,onStopVoice}){
  const [tab,setTab]=useState('face');
  const [data,setData]=useState({face:null,lip:null,presenceEnabled:false});
  const [feedback,setFeedback]=useState('');
  const [mapping,setMapping]=useState(null);
  const [mappingRole,setMappingRole]=useState('eyeLeft');
  const [boneFilter,setBoneFilter]=useState('');
  const [boneChoice,setBoneChoice]=useState(null);
  useEffect(()=>{
    if(!open||!model)return;
    const refresh=()=>setData(snapshot(getViewer()));
    refresh();
    const id=setInterval(refresh,180);
    return ()=>clearInterval(id);
  },[open,model?.format,getViewer]);
  useEffect(()=>{
    setFeedback('');setTab('face');setBoneChoice(null);setBoneFilter('');
    setMapping(model?.format==='VRM'?null:getViewer()?.getFbxFaceMapping?.()||null);
  },[model?.filename,model?.format,getViewer]);

  if(!open||!model)return null;
  const {face,lip,presenceEnabled}=data;
  const mappedBone=boneChoice===null
    ?(mapping?.mapping?.[mappingRole]||''):boneChoice;
  const filteredBones=(mapping?.bones||[]).filter(b=>
    !boneFilter||b.name.toLowerCase().includes(boneFilter.trim().toLowerCase())
  ).slice(0,110);
  const currentBone=(mapping?.bones||[]).find(b=>b.id===mappedBone);
  const displayBones=currentBone&&!filteredBones.some(b=>b.id===currentBone.id)
    ?[currentBone,...filteredBones]:filteredBones;
  const refreshMapping=()=>{
    setMapping(getViewer()?.getFbxFaceMapping?.()||null);
    setData(snapshot(getViewer()));
  };
  const assignBone=(value)=>{
    const result=getViewer()?.setFbxFaceMapping?.(mappingRole,value);
    setFeedback(result?.reason||'No se pudo cambiar el mapeo.');
    if(result?.ok){setBoneChoice(null);refreshMapping();}
  };
  const speaking=Boolean(lip?.active||face?.speaking);
  const trigger=action=>{
    const viewer=getViewer();
    let ok=false;
    if(action.group==='mouth')ok=Boolean(viewer?.previewLivingVowel?.(action.key));
    else if(action.key==='blink')ok=Boolean(viewer?.previewLivingBlink?.());
    else if(action.feature==='gaze')ok=Boolean(viewer?.previewLivingGaze?.(action.key));
    else ok=Boolean(viewer?.previewLivingFace?.(action.key));
    setFeedback(ok?'Prueba: '+action.label+'. Observa el rostro de '+(model?.format==='VRM'?'Vita':'Mint')+'.':
      'Ese canal no se reconoció o no está activado. Consulta el diagnóstico facial.');
  };
  const status=speaking?
    'Voz activa: observa labios, ojos, cejas y recuperación al finalizar.':
    (presenceEnabled?'Control facial de prueba activado':'Activa los controles faciales en LP-03D para realizar pruebas.');
  return <div className="face-quick-dock" role="region" aria-label="Controles rápidos de rostro junto al modelo">
    <div className="face-quick-head">
      <div><strong><ScanFace size={15}/> Rostro · QA rápido</strong>
        <small>Prueba y observa sin desplazarte</small></div>
      <button type="button" className="face-quick-close" onClick={onClose} aria-label="Cerrar controles rápidos"><X size={16}/></button>
    </div>
    {model?.format!=='VRM'&&<>
      <small className="face-quick-voice-hint">
        FBX · conectores óseos de prueba. La detección por nombres es
        orientativa; no equivale a un rig VRM. La animación V8 permanece intacta.
      </small>
      <label style={{display:'flex',alignItems:'center',gap:6,fontSize:11,
        color:'#d9f4ff',margin:'6px 0'}}>
        <input type="checkbox" checked={Boolean(face?.enabled)}
          disabled={!face?.supported}
          onChange={e=>{
            getViewer()?.setLivingFacialEnabled?.(e.target.checked);
            setData(snapshot(getViewer()));
          }}/>
        Activar pruebas faciales reversibles
      </label>
      <details className="lp-accordion">
        <summary>Mapear huesos faciales · {mapping?.totalBones||0} disponibles</summary>
        <div style={{display:'grid',gap:7,padding:'10px 4px',fontSize:11}}>
          <small>Selecciona el rol, busca el hueso por su nombre y asígnalo.
            Para ojos, párpados, cejas, sonrisa y mejillas se necesitan parejas.
            Las direcciones aún requieren inspección visual; los controles
            se aplican solo durante la prueba y no se exportan.</small>
          <label style={{display:'grid',gap:4}}>
            Región facial
            <select style={{width:'100%',background:'#17273b',color:'#e1f3fa',
              border:'1px solid #315064',borderRadius:5,padding:5}}
              value={mappingRole} onChange={e=>{
                setMappingRole(e.target.value);setBoneFilter('');setBoneChoice(null);
              }}>
              {Object.entries(mapping?.roles||{}).map(([role,label])=>
                <option key={role} value={role}>{label}</option>)}
            </select>
          </label>
          <label style={{display:'grid',gap:4}}>
            Filtrar huesos ({mapping?.bones?.length||0})
            <input type="search" value={boneFilter}
              placeholder="Buscar eye, lip, jaw, brow..."
              onChange={e=>setBoneFilter(e.target.value)}
              style={{width:'100%',background:'#17273b',color:'#e1f3fa',
                border:'1px solid #315064',borderRadius:5,padding:5}}/>
          </label>
          <select aria-label="Hueso asignado a la región facial"
            value={mappedBone}
            onChange={e=>setBoneChoice(e.target.value)}
            style={{width:'100%',background:'#17273b',color:'#e1f3fa',
              border:'1px solid #315064',borderRadius:5,padding:5}}>
            <option value="">Sin asignar</option>
            {displayBones.map(b=><option key={b.id} value={b.id}>
              {b.name}</option>)}
          </select>
          <small>Actual: {mapping?.names?.[mappingRole]||'sin hueso reconocido'}.
            {' '}Las primeras coincidencias son sugerencias, no asignaciones verificadas.</small>
          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
            <button type="button" disabled={!mappedBone}
              onClick={()=>assignBone(mappedBone)}>Asignar hueso</button>
            <button type="button" onClick={()=>assignBone('')}>Desactivar rol</button>
            <button type="button" onClick={()=>assignBone('auto')}>
              Detectar automáticamente
            </button>
          </div>
          <small>Canales actuales: {Object.entries(mapping?.controls||{})
            .filter(([,active])=>active).map(([name])=>name).join(', ')||'ninguno'}.
            {' '}Los mapeos manuales pertenecen solo a esta sesión de prueba.</small>
          <button type="button" onClick={async()=>{
            try{
              const report=await getViewer()?.exportRigDiagnosticJSON?.();
              setFeedback(report?.filename
                ?'Diagnóstico guardado: '+report.filename+
                  '. Compártelo para preparar el mapeo definitivo de Mint.'
                :'No se pudo generar el diagnóstico para este archivo.');
            }catch(error){
              setFeedback('Falló el diagnóstico: '+(error?.message||error));
            }
          }}>Descargar diagnóstico del rig (JSON)</button>
        </div>
      </details>
    </>}
    <div className="face-quick-camera">
      <button type="button" onClick={()=>{
        const ok=getViewer()?.focusFace?.();
        setFeedback(ok?'Cámara centrada en el rostro; sigue la cabeza.':'No se pudo localizar el rostro visible.');
      }}><Focus size={13}/> Acercar rostro</button>
      <button type="button" onClick={()=>{getViewer()?.resetCamera?.();setFeedback('Vista general restaurada.');}}>
        <RotateCcw size={13}/> Vista general
      </button>
    </div>
    <div className="face-quick-voice">
      <button type="button" disabled={!voiceState?.ready||voiceState?.status==='speaking'||
        voiceState?.status==='queued'||voiceState?.status==='paused'}
        onClick={onSpeak} title="Reproducir la respuesta preparada con Qwen o la demostración">
        <Volume2 size={13}/> Reproducir respuesta
      </button>
      <button type="button" disabled={voiceState?.status==='idle'}
        onClick={onStopVoice} title="Detener y volver al reposo facial">
        <Square size={12}/> Detener
      </button>
    </div>
    {!voiceState?.ready&&voiceState?.status==='idle'&&
      <small className="face-quick-voice-hint">
        Prepara una respuesta una vez en LP-03C. Después podrás reproducirla aquí.
      </small>}
    <div className="face-quick-tabs" role="group" aria-label="Categoría de pruebas">
      <button type="button" className={tab==='face'?'selected':''} onClick={()=>setTab('face')}>
        <Eye size={13}/> Ojos y expresiones
      </button>
      <button type="button" className={tab==='mouth'?'selected':''} onClick={()=>setTab('mouth')}>
        <Smile size={13}/> Labios
      </button>
    </div>
    <div className="face-quick-grid">
      {tab==='face'?
        ROWS.map(action=><button type="button" key={action.key}
          title={action.label} disabled={speaking||!canRunFacialQuickAction(action,data)}
          onClick={()=>trigger(action)}>{action.label}</button>):
        VOWELS.map(vowel=><button type="button" key={vowel}
          disabled={speaking||!canRunFacialQuickAction({key:vowel,group:'mouth'},data)}
          onClick={()=>trigger({group:'mouth',key:vowel,label:'Vocal '+vowel.toUpperCase()})}>
          Vocal {vowel.toUpperCase()}</button>)}
    </div>
    <div className="face-quick-status" role="status">
      {feedback||status}
    </div>
    <div className="face-quick-meter">
      <span>{speaking?'HABLANDO':'EN REPOSO'}</span>
      <span>{lip?.supported?('Labios '+Math.round((lip.opening||0)*100)+' %'):'Sin control labial compatible'}</span>
    </div>
  </div>;
}
