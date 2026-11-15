import {useEffect,useState} from 'react';
import {Download,RotateCcw,Film,ShieldCheck} from 'lucide-react';
import {DEFAULT_MOTION_ADJUSTMENTS,normalizeMotionAdjustments}
  from './lib/autoRig/motionAdjustments.js';

// Independent from AUTORIG-02A/B: an existing rig must NEVER be rebound.
const field={width:'100%',background:'#15263a',color:'#e6f7fa',
  border:'1px solid #37526a',borderRadius:8,padding:9};
const button={margin:0,minHeight:35,justifyContent:'center'};
const defaults=()=>({...DEFAULT_MOTION_ADJUSTMENTS,overdrive:1});
const roles=[
  ['leftUpperArm','Brazo superior izquierdo'],
  ['rightUpperArm','Brazo superior derecho'],
  ['head','Cabeza'],
];
export default function ExistingRigMotionLab({model,getViewer,compact=false,visible=true}){
  const status=getViewer?.()?.getExistingRigMotionStatus?.()||{ok:false,bones:[],detected:{}};
  const [clipIndex,setClipIndex]=useState(()=>Math.max(0,getViewer?.()?.current??0));
  const [settings,setSettings]=useState(defaults);
  const [overrides,setOverrides]=useState(null);
  const [mappingOpen,setMappingOpen]=useState(()=>{
    const mapped=status.detected||{};
    return !mapped.leftUpperArm||!mapped.rightUpperArm;
  });
  const [note,setNote]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [isEdited,setIsEdited]=useState(false);
  const [vrmConsent,setVrmConsent]=useState(false);
  const [time,setTime]=useState(0);
  const [playing,setPlaying]=useState(Boolean(getViewer?.()?.playing));
  useEffect(()=>{
    if(!visible)return undefined;
    let frame=0,last=0,running=true;
    const refresh=now=>{
      if(!running)return;
      if(now-last>=150){
        last=now;
        const viewer=getViewer?.();
        if(Number.isInteger(viewer?.current)&&viewer?.current!==clipIndex&&
          viewer.clips[viewer.current]){
          const chosen=viewer.clips[viewer.current];
          setClipIndex(viewer.current);
          setSettings(chosen.adjustments||defaults());
          setOverrides(null);
          setIsEdited(Boolean(chosen.modified));
          setTime(0);
        }else{
          const clip=viewer?.clips?.[clipIndex]?.clip;
          if(viewer?.current===clipIndex&&clip?.duration>0){
            const seconds=((viewer.mixer?.time||0)%clip.duration+clip.duration)%clip.duration;
            setTime(t=>Math.abs(t-seconds)>.045?seconds:t);
            setPlaying(Boolean(viewer.playing));
          }
        }
      }
      frame=requestAnimationFrame(refresh);
    };
    frame=requestAnimationFrame(refresh);
    return ()=>{running=false;cancelAnimationFrame(frame);};
  },[clipIndex,getViewer,visible]);
  if(!model||model.bones<1)return null;
  const active=status.clips?.[clipIndex];
  const names=overrides||status.detected||{};
  const missingArmRoles=['leftUpperArm','rightUpperArm'].filter(role=>!names[role]);
  const missingHead=!names.head;
  const apply=(newSettings,targets=names)=>{
    const viewer=getViewer?.();
    if(!status.ok||!viewer)return;
    const v=normalizeMotionAdjustments(newSettings);
    const result=viewer.editExistingRigAnimation(clipIndex,v,targets);
    setSettings(v);setOverrides({...targets});setIsEdited(result.changed);
    setPlaying(Boolean(viewer.playing));
    setError('');
    setNote(result.changed
      ?'Vista actualizada en el personaje: '+(result.targets.join(', ')||
        'recorte / espejo')+'. El clip fuente permanece conservado.'
      :'Movimiento original restaurado sin alterar el rig.');
  };
  const change=(name,value)=>{
    const v={...settings,[name]:value};
    if(name==='trimStart')v.trimEnd=Math.max(v.trimEnd,value+5);
    if(name==='trimEnd')v.trimStart=Math.min(v.trimStart,value-5);
    try{apply(v);}
    catch(e){setError(e.message||String(e));}
  };
  const selectClip=index=>{
    const i=Number(index);
    const viewer=getViewer?.();
    if(!viewer?.clips[i])return;
    viewer.play(i);
    setClipIndex(i);
    setTime(0);setPlaying(true);
    setSettings(viewer.clips[i].adjustments||defaults());
    setOverrides({...status.detected});
    setIsEdited(Boolean(viewer.clips[i].modified));
    setError('');setNote('Clip seleccionado: '+viewer.clips[i].name);
  };
  const changeBone=(role,boneName)=>{
    const next={...names,[role]:boneName};
    const pending=Object.keys(DEFAULT_MOTION_ADJUSTMENTS).some(
      k=>settings[k]!==DEFAULT_MOTION_ADJUSTMENTS[k])||
      settings.overdrive!==1;
    try{
      if(pending)apply(settings,next);
      else {setOverrides(next);setError('');}
      const stillMissing=['leftUpperArm','rightUpperArm','head']
        .some(role=>!next[role]);
      if(!stillMissing)setMappingOpen(false);
    }catch(e){setError(e.message||String(e));}
  };
  const save=async()=>{
    const viewer=getViewer?.();
    if(!viewer||busy)return;
    setBusy(true);setError('');setNote('');
    try{
      if(model.format==='VRM'&&!vrmConsent)
        throw new Error('Para un VRM confirma la exportación como GLB estándar (no VRM).');
      const result=await viewer.exportGLB({
        allowApproximateVRM:model.format==='VRM'&&vrmConsent,
      });
      setNote('Descargado '+result.filename+' con '+
        result.animations+' animación(es). Comprueba el GLB reimportándolo en ORBI.'+
        (result.warning?' '+result.warning:''));
    }catch(e){setError('No se pudo exportar: '+(e.message||String(e)));}
    finally{setBusy(false);}
  };
  const currentSettings=Object.keys(DEFAULT_MOTION_ADJUSTMENTS).every(
    k=>settings[k]===DEFAULT_MOTION_ADJUSTMENTS[k])&&settings.overdrive===1;
  const boneSelectors=roles.map(([role,label])=><label key={role}
        style={{color:'#bfdae3',fontSize:11}}>
        {label}
        <select style={{...field,marginTop:4}}
          value={status.bones.find(b=>b.uuid===names[role]||b.name===names[role])?.uuid||''}
          onChange={e=>changeBone(role,e.target.value)}>
          <option value="">— Sin identificar —</option>
          {status.bones.map(b=><option key={b.uuid} value={b.uuid}>
            {b.name||'(sin nombre)'} · {b.uuid.slice(0,8)}
          </option>)}
        </select>
      </label>);
  return <div style={{display:'grid',gap:compact?9:12,
    padding:compact?'9px 10px 12px':'14px 15px',
    borderTop:compact?'none':'1px solid #304455'}}>
    {!compact&&<><div style={{display:'flex',alignItems:'center',gap:8,
      color:'#d7f4ed',fontWeight:700,fontSize:13}}>
      <Film size={18}/> AUTORIG-02D · Editor de animaciones existentes
    </div>
    <div style={{background:'#113b3a',border:'1px solid #286b61',
      color:'#b7eee3',padding:10,borderRadius:7,fontSize:11,lineHeight:1.6}}>
      <ShieldCheck size={15} style={{verticalAlign:'middle',marginRight:6}}/>
      Rig existente detectado. No se recalculan pesos ni se reemplazan huesos.
      Puedes modificar una animación y exportar un nuevo GLB.
    </div></>}
    {!status.ok?<div style={{color:'#edca95',fontSize:12,lineHeight:1.5}}>
      {status.reason||'No hay animaciones disponibles.'}
    </div>:<>
      <label style={{color:'#c8e5e5',fontSize:11}}>Animación que deseas corregir
        <select style={{...field,marginTop:5}} value={clipIndex}
          onChange={e=>selectClip(e.target.value)}>
          {status.clips.map((clip,i)=>
            <option key={i} value={i}>{clip.name} · {clip.duration}s
              {clip.modified?' (modificada)':''}</option>)}
        </select>
      </label>
      <div style={{display:'grid',gap:6,border:'1px solid #385267',
        padding:9,borderRadius:8}}>
        <div style={{display:'flex',gap:7}}>
          <button type="button" className="outline-btn" style={{...button,flex:1}}
            onClick={()=>{
              const viewer=getViewer?.();
              if(!viewer)return;
              if(viewer.current!==clipIndex)viewer.play(clipIndex);
              else viewer.setPlaying(!viewer.playing);
              setPlaying(Boolean(viewer.playing));
            }}>{playing?'⏸ Pausar movimiento':'▶ Reproducir movimiento'}</button>
          <button type="button" className="outline-btn" style={button}
            onClick={()=>{
              try{setTime(getViewer().seekExistingRigAnimation(clipIndex,0));
                setPlaying(false);}
              catch(e){setError(e.message||String(e));}
            }}>↶ Inicio</button>
        </div>
        <label style={{fontSize:11,color:'#c6e0e4'}}>
          Inspección fotograma a fotograma · {time.toFixed(2)} /
          {' '}{(active?.duration||0).toFixed(2)} s
          <input type="range" min="0" max={active?.duration||1}
            step=".02" value={Math.min(time,active?.duration||1)}
            style={{width:'100%',marginTop:6}}
            onChange={e=>{
              try{
                setTime(getViewer().seekExistingRigAnimation(
                  clipIndex,Number(e.target.value)));
                setPlaying(false);
              }catch(err){setError(err.message||String(err));}
            }}/>
        </label>
      </div>
      {compact?<details className="lp-accordion" open={mappingOpen}
        onToggle={e=>setMappingOpen(e.currentTarget.open)}>
        <summary>Asignación de huesos (avanzado)
          {missingArmRoles.length||missingHead?' · requiere revisión':' · correcta'}
        </summary>
        <div style={{display:'grid',gap:7}}>
          <small style={{fontSize:10,color:'#a8bdca',lineHeight:1.5}}>
            Si los brazos no están identificados, elige los huesos de tu
            personaje para habilitar los ajustes.
          </small>
          {boneSelectors}
        </div>
      </details>:<>
        <small style={{fontSize:10,color:'#a8bdca',lineHeight:1.55}}>
          Las articulaciones se detectan por nombre. Si alguna no coincide,
          asígnala manualmente al hueso correspondiente.
        </small>
        {boneSelectors}
      </>}
      <div style={{display:'grid',gap:9,padding:9,
        border:'1px solid #35556b',borderRadius:8}}>
        <strong style={{fontSize:12,color:'#c7eee8'}}>Ajustes en vivo</strong>
        {!!error&&<div role="alert" style={{
          color:'#ffd9cd',background:'#562f35',border:'1px solid #b37378',
          borderRadius:6,padding:9,fontSize:11,lineHeight:1.5
        }}>
          <strong>No se pudo aplicar el ajuste:</strong> {error}
          {(missingArmRoles.length||missingHead)&&
            <button type="button" className="outline-btn"
              style={{...button,marginTop:7}}
              onClick={()=>setMappingOpen(true)}>
              Asignar huesos ahora
            </button>}
        </div>}
        {!!missingArmRoles.length&&<div role="status"
          style={{fontSize:10,lineHeight:1.55,color:'#f8d99d'}}>
          ORBI aún no identifica {missingArmRoles.length===2?
          'los dos brazos superiores':'uno de los brazos superiores'}.
          Los controles de separación y amplitud necesitan esos huesos.
          <button type="button" className="outline-btn"
            style={{...button,marginTop:5}} onClick={()=>setMappingOpen(true)}>
            Identificar brazos
          </button>
        </div>}
        {[
          ['armSpace','Character Arm-Space · separación de brazos',0,100,5],
          ['armSwing','Arms · amplitud del movimiento (%)',0,150,5],
        ].map(([name,label,min,max,step])=>
          <label key={name} style={{fontSize:11,color:'#cce5e9'}}>
            <span style={{display:'flex',justifyContent:'space-between',gap:7}}>
              <span>{label}</span><strong>{settings[name]}</strong>
            </span>
            <input type="range" min={min} max={max} step={step}
              value={settings[name]} onChange={e=>change(name,Number(e.target.value))}
              style={{width:'100%',marginTop:7}}/>
          </label>)}
        <small style={{fontSize:10,color:'#aecbd1',lineHeight:1.5}}>
          Character Arm-Space: 50 neutro. Prueba 65–75 cuando las manos
          atraviesen las piernas.
        </small>
        <details className="lp-accordion">
          <summary>Más ajustes · Look, Overdrive, Trim y Mirror</summary>
          <div style={{display:'grid',gap:9}}>
        {!!missingHead&&<div role="status" style={{fontSize:10,
          color:'#f8d99d',lineHeight:1.5}}>
          Look requiere identificar el hueso de la cabeza.
          <button type="button" className="outline-btn"
            style={{...button,marginTop:5}} onClick={()=>setMappingOpen(true)}>
            Identificar cabeza
          </button>
        </div>}
        {[
          ['look','Look · giro horizontal de cabeza',0,100,5],
          ['overdrive','Overdrive · ritmo que se guarda al exportar',.25,2,.05],
        ].map(([name,label,min,max,step])=>
          <label key={name} style={{fontSize:11,color:'#cce5e9'}}>
            <span style={{display:'flex',justifyContent:'space-between',gap:7}}>
              <span>{label}</span><strong>{settings[name]}</strong>
            </span>
            <input type="range" min={min} max={max} step={step}
              value={settings[name]} onChange={e=>change(name,Number(e.target.value))}
              style={{width:'100%',marginTop:7}}/>
          </label>)}
        <div style={{display:'grid',gap:5}}>
          <strong style={{fontSize:11,color:'#cce5e9'}}>
            Trim · conservar {settings.trimStart}%–{settings.trimEnd}%
          </strong>
          <label style={{fontSize:10,color:'#c7d9e0'}}>
            Inicio ({settings.trimStart}%)
            <input type="range" min="0" max="95" step="5"
              value={settings.trimStart}
              onChange={e=>change('trimStart',Number(e.target.value))}
              style={{width:'100%'}}/>
          </label>
          <label style={{fontSize:10,color:'#c7d9e0'}}>
            Fin ({settings.trimEnd}%)
            <input type="range" min="5" max="100" step="5"
              value={settings.trimEnd}
              onChange={e=>change('trimEnd',Number(e.target.value))}
              style={{width:'100%'}}/>
          </label>
        </div>
        <label style={{display:'flex',alignItems:'center',gap:8,
          fontSize:11,color:'#cce5e9'}}>
          <input type="checkbox" checked={settings.mirror}
            onChange={e=>change('mirror',e.target.checked)}/>
          Mirror (experimental) · reflejar izquierda/derecha
        </label>
        <small style={{color:'#edc991',fontSize:10,lineHeight:1.5}}>
          Overdrive se guarda dentro de la nueva animación, cambiando
          su duración. El control global de velocidad en Biblioteca de
          animaciones solo afecta la reproducción. Mirror y los ajustes
          angulares son aproximados: revisa frente y perfil.
        </small>
          </div>
        </details>
        <button type="button" className="outline-btn" style={button}
          disabled={currentSettings} onClick={()=>{
            try{apply(defaults());}catch(e){setError(e.message||String(e));}
          }}><RotateCcw size={14}/> Restaurar movimiento original</button>
      </div>
      {model.format==='VRM'&&<label style={{display:'flex',gap:8,
        fontSize:11,lineHeight:1.5,color:'#efce9e'}}>
        <input type="checkbox" checked={vrmConsent}
          onChange={e=>setVrmConsent(e.target.checked)}/>
        Acepto exportar un GLB estándar aproximado (no conserva todas
        las funciones propias de VRM).
      </label>}
      <button type="button" className="outline-btn"
        style={{...button,background:'#205449',color:'#e2fff6'}}
        disabled={busy||!status.ok||!active}
        onClick={save}>
        <Download size={16}/>
        {busy?'Exportando y verificando…':'Exportar personaje con animación corregida (GLB)'}
      </button>
      <small style={{color:'#a6bfc9',fontSize:10,lineHeight:1.55}}>
        Se exporta el personaje completo con sus animaciones; el archivo
        original no se sobrescribe. Tras la descarga, vuelve a abrir el
        GLB y comprueba las flexiones, texturas, esqueleto y movimiento.
      </small>
      {!!note&&<div style={{color:'#9be7c8',fontSize:11,lineHeight:1.5}}>{note}</div>}
      {!compact&&!!error&&<div role="alert" style={{color:'#ffad9b',fontSize:11,
        lineHeight:1.5}}>{error}</div>}
    </>}
  </div>;
}
