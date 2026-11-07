import {useEffect,useState} from 'react';
import {Activity,HeartPulse,ShieldCheck} from 'lucide-react';
import {describePresenceGate} from './lib/livingPresence/activationGate.js';

const FINGERS=[['Thumb','Pulgar'],['Index','Índice'],['Middle','Medio'],['Ring','Anular'],['Little','Meñique']];

// LP-01: all model analysis and motion stay on-device; this panel never uploads.
export default function LivingPresenceLab({model,generation,getViewer,activeClip=null}) {
  const [enabled,setEnabled]=useState(false);
  const [composerRequested,setComposerRequested]=useState(false);
  const [composerIntensity,setComposerIntensity]=useState(65);
  const [intensity,setIntensity]=useState(55);
  const [motorEnabled,setMotorEnabled]=useState(false);
  const [motorIntensity,setMotorIntensity]=useState(42);
  const [motorMode,setMotorMode]=useState('resting');
  const [posture,setPosture]=useState(92);
  const [handRelaxation,setHandRelaxation]=useState(88);
  const [legIntensity,setLegIntensity]=useState(45);
  const [swayIntensity,setSwayIntensity]=useState(35);
  const [swaySpeed,setSwaySpeed]=useState(65);
  const [softenFbX,setSoftenFbx]=useState(true);
  const [softening,setSoftening]=useState(60);
  const [legDiagnostics,setLegDiagnostics]=useState(null);
  const [reverseCurl,setReverseCurl]=useState({left:false,right:false});
  const [fingerOverrides,setFingerOverrides]=useState({left:{},right:{}});
  const [fingerPreset,setFingerPreset]=useState('');
  const [calibration,setCalibration]=useState([]);
  const [audit,setAudit]=useState(null);
  const [capabilities,setCapabilities]=useState(null);
  const [options,setOptions]=useState({hands:true,gaze:true,blink:true,head:true,elbows:true,legs:false,diagnostic:false});
  useEffect(()=>{
    setEnabled(false);
    setMotorEnabled(false);
    setMotorIntensity(42);
    setMotorMode('resting');
    getViewer()?.setLivingMotorCoordination(false);
    getViewer()?.setLivingMotorIntensity(0.42);
    getViewer()?.setLivingMotorMode('resting');
    setComposerRequested(false);
    setComposerIntensity(65);
    getViewer()?.setLivingComposerEnabled(false);
    getViewer()?.setLivingComposerIntensity(0.65);
    setAudit(null);
    setCapabilities(null);
    setOptions({hands:true,gaze:true,blink:true,head:true,elbows:true,legs:false,diagnostic:false});
    setCalibration([]);
    setPosture(92);
    setHandRelaxation(88);
    setLegIntensity(45);
    setSwayIntensity(35);
    setSwaySpeed(65);
    setSoftenFbx(true);
    setSoftening(60);
    setLegDiagnostics(getViewer()?.getLivingLegDiagnostics()||null);
    const hands=getViewer()?.getLivingFingerCalibration();
    setReverseCurl({left:hands?.directions?.left===-1,right:hands?.directions?.right===-1});
    setFingerOverrides(hands?.fingers||{left:{},right:{}});
    setFingerPreset(hands?.preset||'');
    getViewer()?.setLivingPresence(false);
  },[generation,getViewer]);
  useEffect(()=>{
    // New clip must be independently approved for procedural composition.
    setComposerRequested(false);
    getViewer()?.setLivingComposerEnabled(false);
  },[activeClip,getViewer]);
  const canUse=Boolean(model?.format==='VRM');
  const clipComposition=getViewer()?.getLivingComposerStatus()||null;
  const canCompose=Boolean(canUse&&enabled&&clipComposition?.eligible);
  const presenceGate=describePresenceGate({
    vrmReady:canUse,presenceEnabled:enabled,
    clipSelected:Boolean(clipComposition?.clipSelected),
    composerEligible:Boolean(clipComposition?.eligible),
    composerActive:Boolean(clipComposition?.active),
    composerEnabled:Boolean(clipComposition?.enabled),
  });
  const inspect=()=>{
    setAudit(getViewer()?.getLivingRigAudit()||null);
    setCalibration(getViewer()?.getLivingPoseDiagnostics()||[]);
    setCapabilities(getViewer()?.getLivingCapabilities()||null);
    setLegDiagnostics(getViewer()?.getLivingLegDiagnostics()||null);
  };
  const toggle=event=>{
    const next=event.target.checked;
    setEnabled(next);
    getViewer()?.setLivingPresence(next);
  };
  const changeComposerRequested=event=>{
    const next=Boolean(event.target.checked);
    setComposerRequested(next);
    getViewer()?.setLivingComposerEnabled(next);
  };
  const activateComposerForMotor=()=>{
    // Only a direct click can authorize an idle FBX overlay.
    if(!canCompose||composerIntensity<=0)return;
    getViewer()?.setLivingComposerIntensity(composerIntensity/100);
    const accepted=getViewer()?.setLivingComposerEnabled(true);
    if(accepted)setComposerRequested(true);
  };
  const changeComposerIntensity=event=>{
    const next=Number(event.target.value);
    setComposerIntensity(next);
    getViewer()?.setLivingComposerIntensity(next/100);
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
  const changeMotorEnabled=event=>{
    const next=Boolean(event.target.checked);
    setMotorEnabled(next);
    getViewer()?.setLivingMotorCoordination(next);
  };
  const changeMotorIntensity=event=>{
    const next=Number(event.target.value);
    setMotorIntensity(next);
    getViewer()?.setLivingMotorIntensity(next/100);
  };
  const changeMotorMode=event=>{
    const next=event.target.value;
    if(getViewer()?.setLivingMotorMode(next))setMotorMode(next);
  };
  const changeSwayIntensity=event=>{
    const next=Number(event.target.value);
    setSwayIntensity(next);
    getViewer()?.setLivingSwayIntensity(next/100);
  };
  const changeSwaySpeed=event=>{
    const next=Number(event.target.value);
    setSwaySpeed(next);
    getViewer()?.setLivingSwaySpeed(next/100);
  };
  const changeSoftening=event=>{
    const next=Number(event.target.value);
    setSoftening(next);
    getViewer()?.setLivingTorsoSoftening(next/100);
  };
  const changeSoftenFbx=event=>{
    const next=event.target.checked;
    setSoftenFbx(next);
    getViewer()?.setLivingTorsoSofteningEnabled(next);
  };
  const changeLegIntensity=event=>{
    const next=Number(event.target.value);
    setLegIntensity(next);
    getViewer()?.setLivingLegIntensity(next/100);
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
  const changeFingerOverride=(side,finger,checked)=>{
    setFingerOverrides(current=>({...current,[side]:{...current[side],[finger]:checked}}));
    getViewer()?.setLivingFingerOverride(side,finger,checked);
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
      <div style={{display:'grid',gap:9,borderTop:'1px solid #284158',paddingTop:12}}>
        <strong style={{fontSize:12}}>LP-03A · Cerebelo motor experimental</strong>
        <small style={{opacity:0.8,lineHeight:1.5}}>
          Coordina suavemente cabeza, pecho, hombros, muñecas y codos mediante
          pequeñas respuestas retrasadas. No añade animaciones repetitivas ni
          traslada la pelvis o los pies. Desactivado por defecto para proteger
          el reposo LP-02C.2 que ya funciona.
        </small>
        <small style={{opacity:0.78,lineHeight:1.55}}>
          Los ojos y el parpadeo vienen de Living Presence (LP-02D);
          LP-03A coordina sus respuestas corporales. Cuando hay un FBX
          seleccionado, LP-02C.1 debe estar activo para permitir ambas capas.
        </small>
        {clipComposition?.clipSelected&&<div role="status"
          style={{display:'grid',gap:7,padding:10,border:'1px solid #31516a',borderRadius:7}}>
          <small style={{lineHeight:1.55}}>
            {presenceGate.running
              ? 'Motor de presencia habilitado sobre el FBX: mirada y coordinación disponibles.'
              : presenceGate.reason}
          </small>
          {presenceGate.needsComposer&&<button type="button" className="outline-btn"
            disabled={!canCompose||composerIntensity<=0} onClick={activateComposerForMotor}>
            Activar LP-02C.1 para este Idle
          </button>}
        </div>}
        <label style={{display:'flex',gap:8,alignItems:'center',fontSize:12}}>
          <input type="checkbox" checked={motorEnabled}
            disabled={!canUse||!enabled} onChange={changeMotorEnabled}/>
          Coordinar movimientos del cuerpo (A/B)
        </label>
        <label style={{display:'grid',gap:5,fontSize:12}}>
          Intensidad de coordinación: {motorIntensity}%
          <input type="range" min="0" max="100" step="5" value={motorIntensity}
            disabled={!canUse||!enabled||!motorEnabled} onChange={changeMotorIntensity}/>
        </label>
        <label style={{display:'grid',gap:5,fontSize:12}}>
          Estado motor de prueba
          <select value={motorMode} disabled={!canUse||!enabled||!motorEnabled}
            onChange={changeMotorMode} style={{padding:'7px',borderRadius:6}}>
            <option value="resting">Reposo</option>
            <option value="attentive">Escuchando</option>
            <option value="thinking">Pensando</option>
            <option value="explaining">Explicando</option>
          </select>
        </label>
        <small style={{opacity:0.72,lineHeight:1.5}}>
          Estos estados son simulaciones manuales para QA: todavía no están
          conectados a Qwen ni al audio. Recomendación: 30–45% de coordinación.
        </small>
      </div>
      <div style={{display:'grid',gap:9,borderTop:'1px solid #284158',paddingTop:12}}>
        <strong style={{fontSize:12}}>LP-02C.2 · Balanceo corporal vivo</strong>
        <small style={{opacity:0.8,lineHeight:1.5}}>
          Oscilación lateral lenta e irregular del torso con compensación de cabeza,
          sin desplazar caderas, raíz ni zapatos. Movimiento intencionalmente discreto.
        </small>
        <label style={{display:'flex',gap:8,alignItems:'center',fontSize:12}}>
          <input type="checkbox" checked={options.sway!==false}
            disabled={!canUse} onChange={e=>changeOption('sway',e.target.checked)}/>
          Balanceo natural lento (A/B)
        </label>
        <label style={{display:'grid',gap:5,fontSize:12}}>
          Amplitud del balanceo: {swayIntensity}%
          <input type="range" min="0" max="100" step="5" value={swayIntensity}
            disabled={!canUse||options.sway===false} onChange={changeSwayIntensity}/>
        </label>
        <label style={{display:'grid',gap:5,fontSize:12}}>
          Velocidad del balanceo: {swaySpeed}%
          <input type="range" min="15" max="150" step="5" value={swaySpeed}
            disabled={!canUse||options.sway===false} onChange={changeSwaySpeed}/>
        </label>
        <small style={{opacity:0.72,lineHeight:1.5}}>
          Sugerencia: amplitud 30–40 %, velocidad 50–70 %. No es una marcha
          ni movimiento físico de pelvis: es una corrección suave del torso.
        </small>
      </div>
      <div style={{display:'grid',gap:9,borderTop:'1px solid #284158',paddingTop:12}}>
        <strong style={{fontSize:12}}>LP-02C.1 · Mixamo + Presencia viva</strong>
        <small style={{opacity:0.76,lineHeight:1.55}}>
          Compositor posterior a AnimationMixer: añade respiración, mirada y dedos
          únicamente cuando eliges un clip identificado como reposo.
          Caminar, gestos y acciones conservan el control completo del esqueleto.
        </small>
        <div style={{fontSize:11,lineHeight:1.6,opacity:0.86}}>
          <strong>Clip seleccionado:</strong> {clipComposition?.clipName||'Ninguno'}
          <div>{clipComposition?.reason||'Carga un VRM y una animación FBX.'}</div>
        </div>
        <label style={{display:'flex',gap:9,alignItems:'center',fontSize:12}}>
          <input type="checkbox" checked={composerRequested}
            disabled={!canCompose} onChange={changeComposerRequested}/>
          Superponer presencia natural sobre el reposo FBX (A/B)
        </label>
        <label style={{display:'grid',gap:5,fontSize:12}}>
          Intensidad de mezcla procedural: {composerIntensity}%
          <input type="range" min="0" max="100" step="5" value={composerIntensity}
            disabled={!canCompose||!composerRequested} onChange={changeComposerIntensity}/>
        </label>
        <label style={{display:'flex',gap:8,alignItems:'center',fontSize:12}}>
          <input type="checkbox" checked={softenFbX}
            disabled={!canCompose||!composerRequested}
            onChange={changeSoftenFbx}/>
          Atenuar inclinación lateral exagerada del FBX
        </label>
        <label style={{display:'grid',gap:5,fontSize:12}}>
          Suavizado de inclinación del clip: {softening}%
          <input type="range" min="0" max="100" step="5" value={softening}
            disabled={!canCompose||!composerRequested||!softenFbX}
            onChange={changeSoftening}/>
        </label>
        <small style={{opacity:0.76,lineHeight:1.5}}>
          Atenúa únicamente el giro lateral de columna y pecho que exista en
          el FBX, con límites estrictos. No corrige inclinaciones causadas por
          caderas/raíz. Usa la velocidad del reproductor (por ejemplo, 0,5×)
          si también deseas ralentizar toda la animación original.
        </small>
        {clipComposition?.clipSelected&&<small style={{opacity:0.72,lineHeight:1.5}}>
          Pistas de dedos: {clipComposition.fingerTracks.static} estáticas,
          {' '}{clipComposition.fingerTracks.animated} animadas,
          {' '}{clipComposition.fingerTracks.missing} sin pista.
          Las pistas animadas conservan prioridad; caderas, rodillas y pies
          siguen controlados exclusivamente por el FBX.
        </small>}
        <small style={{opacity:0.72,lineHeight:1.5}}>
          El efecto es solo de vista previa: no modifica los clips originales
          ni se incluye en archivos exportados. Funciona también en pausa,
          respetando la pose congelada como base.
        </small>
      </div>
      <div style={{display:'grid',gap:7,borderTop:'1px solid #284158',paddingTop:10}}>
        <strong style={{fontSize:12}}>LP-02D · Atención y reajustes vivos</strong>
        <small style={{opacity:0.78,lineHeight:1.5}}>
          Mirada con fijaciones variables y pequeños giros de cabeza; codos que se reajustan
          de forma esporádica; una pierna puede flexionarse o levantar mínimamente un pie
          mientras el otro permanece apoyado.
        </small>
        <label style={{display:'grid',gap:5,fontSize:12}}>
          Intensidad de piernas y pies: {legIntensity}%
          <input type="range" min="0" max="100" step="5" value={legIntensity}
            disabled={!canUse||capabilities?.legIK===false} onChange={changeLegIntensity}/>
        </label>
        {legDiagnostics&&<small style={{opacity:0.72,lineHeight:1.5}}>
          Contacto de pies (IK experimental): {legDiagnostics.available?'2 tobillos reconocidos':'no disponible'}.
          {legDiagnostics.failureReason?' '+legDiagnostics.failureReason:''}
          {' '}Un pie debe conservar apoyo cuando el otro se reajusta.
        </small>}
        <strong style={{fontSize:12,marginTop:8}}>Manos y dedos relajados</strong>
        <label style={{display:'grid',gap:5,fontSize:12}}>
          Curvatura natural de los dedos: {handRelaxation}%
          <input type="range" min="0" max="100" step="5" value={handRelaxation}
            disabled={!canUse} onChange={changeHandRelaxation}/>
        </label>
        <small style={{opacity:0.76,lineHeight:1.5}}>
          Los dedos descansan ligeramente curvados, no extendidos.
          Es diferente a la intensidad de los microgestos.
        </small>
        <div style={{fontSize:11,lineHeight:1.6,opacity:0.83}} role="status">
          Calibración: {fingerPreset||'carga un VRM para detectar el perfil'}.
          {fingerPreset.startsWith('Vita.vrm')?' Se invirtieron ambas manos automáticamente para este archivo.':''}
        </div>
        <details style={{fontSize:12}}>
          <summary style={{cursor:'pointer'}}>Calibrar el sentido de flexión</summary>
          <div style={{display:'grid',gap:7,paddingTop:9}}>
            {[['left','Invertir mano izquierda'],['right','Invertir mano derecha']].map(([side,label])=><label key={side}
              style={{display:'flex',gap:7,alignItems:'center'}}>
              <input type="checkbox" checked={reverseCurl[side]} disabled={!canUse}
                onChange={e=>changeCurlDirection(side,e.target.checked)}/>{label}
            </label>)}
            <small>En Vita las dos manos comienzan invertidas por la prueba visual anterior. Si alguna falange se dobla al revés, cambia solo la mano afectada.</small>
            <details style={{fontSize:12}}>
              <summary style={{cursor:'pointer'}}>Corrección individual por dedo</summary>
              <div style={{display:'grid',gap:11,paddingTop:9}}>
                {[['left','Izquierda'],['right','Derecha']].map(([side,label])=><div key={side}>
                  <strong>{label}</strong>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7,marginTop:6}}>
                    {FINGERS.map(([finger,name])=><label key={side+finger}
                      style={{display:'flex',alignItems:'center',gap:6}}>
                      <input type="checkbox" checked={Boolean(fingerOverrides[side]?.[finger])}
                        disabled={!canUse} onChange={e=>changeFingerOverride(side,finger,e.target.checked)}/>
                      Invertir {name.toLowerCase()}
                    </label>)}
                  </div>
                </div>)}
              </div>
              <small>Estos cambios invierten cada dedo respecto a la dirección general de su mano. No modifican el VRM original.</small>
            </details>
          </div>
        </details>
        {[
          ['hands','Manos, muñecas y dedos'],
          ['elbows','Semiflexiones de codos'],
          ['head','Giros suaves de cabeza'],
          ['gaze','Miradas a objetivos variables'],
          ['blink','Parpadeo natural'],
          ['legs','Rodillas y pies (IK experimental)'],
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
        LP-02C.1: el reposo FBX puede combinarse con microgestos mediante un
        compositor opt-in. Al utilizar clips, nunca se modifican caderas,
        rodillas, pies o la raíz. La cinemática corporal completa, las colisiones
        y la actuación ligada a la voz siguen pendientes.
      </small>
      {!canUse&&<small>Carga un VRM para habilitar este laboratorio.</small>}
    </div>
  </section>;
}