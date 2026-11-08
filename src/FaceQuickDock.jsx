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
    presenceEnabled:Boolean(viewer?.presence?.enabled),
  };
}
export default function FaceQuickDock({getViewer,model,open,onClose,voiceState,onSpeak,onStopVoice}){
  const [tab,setTab]=useState('face');
  const [data,setData]=useState({face:null,lip:null,presenceEnabled:false});
  const [feedback,setFeedback]=useState('');
  useEffect(()=>{
    if(!open||model?.format!=='VRM')return;
    const refresh=()=>setData(snapshot(getViewer()));
    refresh();
    const id=setInterval(refresh,180);
    return ()=>clearInterval(id);
  },[open,model?.format,getViewer]);
  useEffect(()=>{setFeedback('');setTab('face');},[model?.filename]);

  if(!open||model?.format!=='VRM')return null;
  const {face,lip,presenceEnabled}=data;
  const speaking=Boolean(lip?.active||face?.speaking);
  const trigger=action=>{
    const viewer=getViewer();
    let ok=false;
    if(action.group==='mouth')ok=Boolean(viewer?.previewLivingVowel?.(action.key));
    else if(action.key==='blink')ok=Boolean(viewer?.previewLivingBlink?.());
    else if(action.feature==='gaze')ok=Boolean(viewer?.previewLivingGaze?.(action.key));
    else ok=Boolean(viewer?.previewLivingFace?.(action.key));
    setFeedback(ok?'Prueba: '+action.label+'. Mira el rostro de Vita.':
      'No disponible. Revisa los controles del VRM o activa Presencia A/B.');
  };
  const status=speaking?
    'Voz activa: observa labios, ojos, cejas y recuperación al finalizar.':
    (presenceEnabled?'Presencia natural activa':'Activa Presencia natural A/B en el inspector para mirada/parpadeo.');
  return <div className="face-quick-dock" role="region" aria-label="Controles rápidos de rostro junto al modelo">
    <div className="face-quick-head">
      <div><strong><ScanFace size={15}/> Rostro · QA rápido</strong>
        <small>Prueba y observa sin desplazarte</small></div>
      <button type="button" className="face-quick-close" onClick={onClose} aria-label="Cerrar controles rápidos"><X size={16}/></button>
    </div>
    <div className="face-quick-camera">
      <button type="button" onClick={()=>{
        const ok=getViewer()?.focusFace?.();
        setFeedback(ok?'Cámara acercada al rostro de Vita.':'No se pudo localizar la cabeza VRM.');
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
      <span>{lip?.supported?('Labios '+Math.round((lip.opening||0)*100)+' %'):'Sin visemas VRM'}</span>
    </div>
  </div>;
}
