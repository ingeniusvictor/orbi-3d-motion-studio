import {useEffect,useState} from 'react';
import {Activity,Hand,HeartPulse,ShieldCheck} from 'lucide-react';

const DEFAULT_OPTIONS={breathing:true,head:true,arms:false,fingers:false};
const CHOICES=[
  ['breathing','Respiración suave','Columna, sin mover pelvis ni piernas'],
  ['head','Cabeza y cuello','Micromovimientos locales, no seguimiento ocular'],
  ['arms','Brazos y muñecas · experimental','Oscilación leve; comprobar ropa y hombros'],
  ['fingers','Dedos · experimental','Flexión mínima; ejes pendientes de revisión visual'],
];

// One explicit opt-in, with a different motor from the certified VRM LP-01.
// The panel persists in STUDIO-09's viewport drawer; switching tools is safe.
export default function LumiaV09BodyLab({model,generation,getViewer}){
  const [enabled,setEnabled]=useState(false);
  const [intensity,setIntensity]=useState(32);
  const [speed,setSpeed]=useState(100);
  const [options,setOptions]=useState({...DEFAULT_OPTIONS});
  const [message,setMessage]=useState('');
  useEffect(()=>{
    getViewer?.()?.setLumiaV09BodyEnabled?.(false);
    getViewer?.()?.setLumiaV09BodyOptions?.({...DEFAULT_OPTIONS});
    getViewer?.()?.setLumiaV09BodyIntensity?.(.32);
    getViewer?.()?.setLumiaV09BodySpeed?.(1);
    setEnabled(false);setIntensity(32);setSpeed(100);
    setOptions({...DEFAULT_OPTIONS});setMessage('');
  },[generation,getViewer]);
  if(!model||model.format==='VRM')return null;
  const status=getViewer?.()?.getLumiaV09BodyStatus?.()||{supported:false,
    reason:'El motor LP-04 aún no está disponible.'};
  const capable=Boolean(status.supported);
  const suspended=Boolean(status.suspendedForClip);
  const toggle=value=>{
    const desired=Boolean(value);
    const ok=getViewer?.()?.setLumiaV09BodyEnabled?.(desired);
    const next=desired&&Boolean(ok);
    setEnabled(next);
    setMessage(next
      ?'Vista previa activada: movimiento discreto y reversible.'
      :desired?'El rig no superó la auditoría. No se aplicarán movimientos.':
        'Movimiento experimental desactivado; pose restaurada.');
  };
  const setOption=(name,value)=>{
    const next={...options,[name]:Boolean(value)};
    setOptions(next);
    getViewer?.()?.setLumiaV09BodyOptions?.(next);
  };
  return <section className="lumia-body-presence" aria-label="LP-04 · Presencia natural Claude V09">
    <div className="lumia-body-presence-heading">
      <HeartPulse size={18}/><div>
        <strong>LP-04 · LUMIA Claude V09</strong>
        <small>Respiración y micromovimientos corporales</small>
      </div>
    </div>
    <div className="compat-note"><ShieldCheck size={15}/>
      <span>Vista previa no destructiva. Las animaciones importadas tienen
        prioridad sobre todos estos movimientos.</span>
    </div>
    {capable?<div className="lumia-body-presence-status" role="status">
      <Activity size={14}/>
      <span>Rig identificado: 346 huesos · dedos candidatos
        {status.fingersRecognized??0}/10.
        {suspended?' Un clip controla el esqueleto: LP-04 está suspendido.':''}
      </span>
    </div>:<div role="status" className="lumia-body-presence-warning">
      <strong>Motor no disponible en este modelo.</strong>
      <div>{status.reason}</div>
    </div>}
    <label className="lumia-body-presence-toggle">
      <input type="checkbox" checked={enabled} disabled={!capable}
        onChange={event=>toggle(event.target.checked)}/>
      Activar presencia natural V09 (prueba A/B)
    </label>
    <div className="lumia-body-presence-options">
      {CHOICES.map(([id,label,description])=><label key={id}>
        <input type="checkbox" checked={Boolean(options[id])} disabled={!capable}
          onChange={event=>setOption(id,event.target.checked)}/>
        <div><strong>{label}</strong><small>{description}</small></div>
        {id==='fingers'&&<Hand size={15} aria-hidden="true"/>}
      </label>)}
    </div>
    <label className="lumia-body-presence-range">
      Intensidad de micromovimientos: {intensity} %
      <input type="range" min="0" max="65" step="1" value={intensity}
        disabled={!capable} onChange={event=>{
          const v=Number(event.target.value);setIntensity(v);
          getViewer?.()?.setLumiaV09BodyIntensity?.(v/100);
        }}/>
    </label>
    <label className="lumia-body-presence-range">
      Velocidad relativa: {speed} %
      <input type="range" min="30" max="150" step="5" value={speed}
        disabled={!capable} onChange={event=>{
          const v=Number(event.target.value);setSpeed(v);
          getViewer?.()?.setLumiaV09BodySpeed?.(v/100);
        }}/>
    </label>
    {message&&<small className="lumia-body-presence-feedback" role="status">
      {message}</small>}
    <small className="lumia-body-presence-footnote">
      Respiración y cabeza no modifican el GLB. Brazos y dedos están apagados
      inicialmente porque todavía requieren revisión visual de ejes.
      LP-02 y los gestos/IK completos permanecen bajo controles VRM.
    </small>
  </section>;
}
