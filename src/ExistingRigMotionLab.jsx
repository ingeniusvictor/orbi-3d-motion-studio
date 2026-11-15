import {useState} from 'react';
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
export default function ExistingRigMotionLab({model,getViewer}){
  const status=getViewer?.()?.getExistingRigMotionStatus?.()||{ok:false,bones:[],detected:{}};
  const [clipIndex,setClipIndex]=useState(0);
  const [settings,setSettings]=useState(defaults);
  const [overrides,setOverrides]=useState(null);
  const [note,setNote]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [isEdited,setIsEdited]=useState(false);
  const [vrmConsent,setVrmConsent]=useState(false);
  if(!model||model.bones<1)return null;
  const active=status.clips?.[clipIndex];
  const names=overrides||status.detected||{};
  const apply=(newSettings,targets=names)=>{
    const viewer=getViewer?.();
    if(!status.ok||!viewer)return;
    const v=normalizeMotionAdjustments(newSettings);
    const result=viewer.editExistingRigAnimation(clipIndex,v,targets);
    setSettings(v);setOverrides({...targets});setIsEdited(result.changed);
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
    setSettings(viewer.clips[i].adjustments||defaults());
    setOverrides({...status.detected});
    setIsEdited(Boolean(viewer.clips[i].modified));
    setError('');setNote('Clip seleccionado: '+viewer.clips[i].name);
  };
  const changeBone=(role,boneName)=>{
    const next={...names,[role]:boneName};
    const pending=Object.keys(settings).some(
      k=>settings[k]!==DEFAULT_MOTION_ADJUSTMENTS[k]);
    try{
      if(pending)apply(settings,next);
      else {setOverrides(next);setError('');}
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
  return <div style={{display:'grid',gap:12,padding:'14px 15px',
    borderTop:'1px solid #304455'}}>
    <div style={{display:'flex',alignItems:'center',gap:8,
      color:'#d7f4ed',fontWeight:700,fontSize:13}}>
      <Film size={18}/> AUTORIG-02D · Editor de animaciones existentes
    </div>
    <div style={{background:'#113b3a',border:'1px solid #286b61',
      color:'#b7eee3',padding:10,borderRadius:7,fontSize:11,lineHeight:1.6}}>
      <ShieldCheck size={15} style={{verticalAlign:'middle',marginRight:6}}/>
      Rig existente detectado. No se recalculan pesos ni se reemplazan huesos.
      Puedes modificar una animación y exportar un nuevo GLB.
    </div>
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
      <small style={{fontSize:10,color:'#a8bdca',lineHeight:1.55}}>
        Las articulaciones se detectan por nombre. Si alguna no coincide,
        asígnala manualmente al hueso correspondiente antes de modificar el
        movimiento.
      </small>
      {roles.map(([role,label])=><label key={role}
        style={{color:'#bfdae3',fontSize:11}}>
        {label}
        <select style={{...field,marginTop:4}} value={names[role]||''}
          onChange={e=>changeBone(role,e.target.value)}>
          <option value="">— Sin identificar —</option>
          {status.bones.map(b=><option key={b.uuid} value={b.name}>{b.name}</option>)}
        </select>
      </label>)}
      <div style={{display:'grid',gap:9,padding:9,
        border:'1px solid #35556b',borderRadius:8}}>
        <strong style={{fontSize:12,color:'#c7eee8'}}>Ajustes en vivo</strong>
        {[
          ['armSpace','Character Arm-Space · separación de brazos',0,100,5],
          ['armSwing','Arms · amplitud del movimiento (%)',0,150,5],
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
        <small style={{fontSize:10,color:'#aecbd1',lineHeight:1.5}}>
          Character Arm-Space: 50 neutro. Prueba 65–75 cuando las manos
          atraviesen las piernas.
        </small>
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
      {!!error&&<div role="alert" style={{color:'#ffad9b',fontSize:11,
        lineHeight:1.5}}>{error}</div>}
    </>}
  </div>;
}
