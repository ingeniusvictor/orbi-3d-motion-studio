import {useEffect,useState} from 'react';
import {Activity,HeartPulse,ShieldCheck} from 'lucide-react';

// LP-01: all model analysis and motion stay on-device; this panel never uploads.
export default function LivingPresenceLab({model,generation,getViewer}) {
  const [enabled,setEnabled]=useState(false);
  const [intensity,setIntensity]=useState(55);
  const [posture,setPosture]=useState(92);
  const [handRelaxation,setHandRelaxation]=useState(88);
  const [reverseCurl,setReverseCurl]=useState({left:false,right:false});
  const [calibration,setCalibration]=useState([]);
  const [audit,setAudit]=useState(null);
  const [capabilities,setCapabilities]=useState(null);
  const [options,setOptions]=useState({hands:true,gaze:true,blink:true,diagnostic:false});
  useEffect(()=>{
    setEnabled(false);
    setAudit(null);
    setCapabilities(null);
    setOptions({hands:true,gaze:true,blink:true,diagnostic:false});
    setCalibration([]);
    setPosture(92);
    setHandRelaxation(88);
    setReverseCurl({left:false,right:false});
    getViewer()?.setLivingPresence(false);
  },[generation,getViewer]);
  const canUse=Boolean(model?.format==='VRM');
  const inspect=()=>{
    setAudit(getViewer()?.getLivingRigAudit()||null);
    setCalibration(getViewer()?.getLivingPoseDiagnostics()||[]);
    setCapabilities(getViewer()?.getLivingCapabilities()||null);
  };
  const toggle=event=>{
    const next=event.target.checked;
    setEnabled(next);
    getViewer()?.setLivingPresence(next);
  };
  const changeIntensity=event=>{
    const next=Number(event.target.value);
    setIntensity(next);
    getViewer()?.setLivingPresenceIntensity(next/100);
  };
  const changeOption=(name,checked)=>{
    const next={...options,[name]:checked};
    setOptions(next);
    getViewer()?.setLivingOptions(next);
  };
  const changeHandRelaxation=event=>{
    const next=Number(event.target.value);
    setHandRelaxation(next);
    getViewer()?.setLivingHandRelaxation(next/100);
  };
  const changeCurlDirection=(side,checked)=>{
    setReverseCurl(current=>({...current,[side]:checked}));
    getViewer()?.setLivingFingerDirection(side,checked);
  };
  const changePosture=event=>{
    const next=Number(event.target.value);
    setPosture(next);
    getViewer()?.setLivingPosture(next/100);
  };
  return <section className="panel inspector-panel" aria-label="LUMIA Living Presence Lab">
    <div className="panel-header"><div>
      <div className="section-icon"><HeartPulse size={19}/></div>
      <div><h3>Living Presence Lab</h3>
      <p>LUMIA · Movimiento natural experimental</p></div>
    </div></div>
    <div style={{padding:'14px 16px',display:'grid',gap:12}}>
      <div className="compat-note"><ShieldCheck size={16}/>
        <span>Modo de laboratorio reversible. No edita el VRM, los FBX ni las exportaciones.</span>
      </div>
      <button className="outline-btn" disabled={!canUse}
        onClick={inspect}>
        <Activity size={16}/> Auditar esqueleto VRM
      </button>
      {audit&&<div style={{fontSize:12,lineHeight:1.7}}>
        {audit.reason?<p>{audit.reason}</p>:<>
          <strong>{audit.totalBones} huesos · {audit.mappedHumanoidRoles}/{audit.supportedRoleCount} roles humanoides</strong>
          <div>Dedos reconocidos: {audit.fingerRoles} · Mallas skinned: {audit.skinnedMeshes}</div>
          {audit.missingOptional?.length>0&&<div style={{color:'#aabed2'}}>Rol opcional no disponible: {audit.missingOptional.join(', ')}</div>}
          <div>Spring bones: {audit.springBonesAvailable?'Detectados':'No detectados'} · Expresiones: {audit.expressionsAvailable?'Disponibles':'No detectadas'}</div>
          {audit.warnings.map((warning,i)=><div key={i} style={{color:'#e7ad68'}}>⚠ {warning}</div>)}
        </>}
      </div>}
      <label style={{display:'flex',gap:10,alignItems:'center',fontSize:13}}>
        <input type="checkbox" checked={enabled} disabled={!canUse}
          onChange={toggle}/>
        Presencia natural · vista A/B
      </label>
      <label style={{display:'grid',gap:5,fontSize:12}}>
        Postura de brazos relajados: {posture}%
        <input type="range" min="0" max="100" step="5" value={posture}
          disabled={!canUse} onChange={changePosture}/>
      </label>
      <label style={{display:'grid',gap:5,fontSize:12}}>
        Intensidad de respiración y microgestos: {intensity}%
        <input type="range" min="0" max="100" step="5" value={intensity}
          disabled={!canUse} onChange={changeIntensity}/>
      </label>
      <div style={{display:'grid',gap:7,borderTop:'1px solid #284158',paddingTop:10}}>
        <strong style={{fontSize:12}}>LP-02B.1 · Manos vivas en reposo</strong>
        <label style={{display:'grid',gap:5,fontSize:12}}>
          Curvatura natural de los dedos: {handRelaxation}%
          <input type="range" min="0" max="100" step="5" value={handRelaxation}
            disabled={!canUse} onChange={changeHandRelaxation}/>
        </label>
        <small style={{opacity:0.76,lineHeight:1.5}}>
          Los dedos descansan ligeramente curvados, no extendidos.
          Es diferente a la intensidad de los microgestos.
        </small>
        <details style={{fontSize:12}}>
          <summary style={{cursor:'pointer'}}>Calibrar el sentido de flexión</summary>
          <div style={{display:'grid',gap:7,paddingTop:9}}>
            {[['left','Invertir mano izquierda'],['right','Invertir mano derecha']].map(([side,label])=><label key={side}
              style={{display:'flex',gap:7,alignItems:'center'}}>
              <input type="checkbox" checked={reverseCurl[side]} disabled={!canUse}
                onChange={e=>changeCurlDirection(side,e.target.checked)}/>{label}
            </label>)}
            <small>Utiliza estas opciones solamente si los dedos se arquean hacia fuera de la palma.</small>
          </div>
        </details>
        {[
          ['hands','Manos, muñecas, codos y dedos'],
          ['gaze','Microcambios de mirada'],
          ['blink','Parpadeo natural'],
          ['diagnostic','Inspección ampliada (×2,4)'],
        ].map(([name,label])=><label key={name}
          style={{display:'flex',gap:9,alignItems:'center',fontSize:12}}>
          <input type="checkbox" checked={options[name]} disabled={!canUse}
            onChange={e=>changeOption(name,e.target.checked)}/>{label}
        </label>)}
        <small style={{opacity:0.72,lineHeight:1.5}}>
          {capabilities?`Articulaciones de dedos calibradas: ${capabilities.calibratedFingers}/30 · Mirada VRM: ${capabilities.lookAt?'sí':'no'} · Parpadeo VRM: ${capabilities.blinking?'sí':'no'}`:'Audita el esqueleto para identificar las capacidades de mirada y dedos.'}
        </small>
      </div>
      {calibration.length>0&&<div style={{fontSize:11,opacity:0.75,lineHeight:1.5}}>
        {calibration.map((item,i)=><div key={i}>{item}</div>)}
      </div>}
      <small style={{lineHeight:1.5,opacity:0.78}}>
        LP-02B.1: mano relajada con nudillos y falanges flexionados de forma diferenciada,
        movimientos independientes, parpadeo variable y mirada. Acerca la cámara a las manos.
        El modo de inspección es deliberadamente amplificado; no está destinado
        a la versión final. Con un FBX seleccionado, la prioridad es del clip.
        Equilibrio físico, foot IK y gestos ligados al habla aún están pendientes.
      </small>
      {!canUse&&<small>Carga un VRM para habilitar este laboratorio.</small>}
    </div>
  </section>;
}