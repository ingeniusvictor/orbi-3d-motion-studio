import {useEffect,useRef,useState} from 'react';
import {Bone,CheckCircle2,Download,ShieldAlert,ShieldCheck,MousePointer2} from 'lucide-react';
import {autoRigEligibility} from './lib/autoRig/eligibility.js';
import {NativeRigEditor} from './lib/autoRig/NativeRigEditor.js';
import {LANDMARK_NAMES,validateMarkers,exportRigDraft,importRigDraft} from './lib/autoRig/nativeRig.js';

const PREPARE='.\\tools\\autorig01_windows.ps1 -Step prepare';
const RIG='.\\tools\\autorig01_windows.ps1 -Step rig';
const btn={margin:0,minHeight:34,justifyContent:'center'};
const field={width:'100%',background:'#15263a',color:'#e6f7fa',
  border:'1px solid #37526a',borderRadius:8,padding:9};

function downloadJson(data,filename){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}

export default function AutoRigLab({model,getViewer}){
  const eligible=autoRigEligibility(model);
  const editorRef=useRef(null);
  const fileRef=useRef(null);
  const [editing,setEditing]=useState(false);
  const [selected,setSelected]=useState('pelvis');
  const [markers,setMarkers]=useState(null);
  const [audit,setAudit]=useState(null);
  const [preview,setPreview]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');

  useEffect(()=>{
    if(!editing||!eligible.ok)return;
    const viewer=getViewer?.();
    if(!viewer?.model){setError('El visor no tiene un modelo cargado.');return;}
    let editor;
    try{
      editor=new NativeRigEditor(viewer,{
        onMarkers(next)=>{setMarkers(next);setAudit(validateMarkers(next));},
        onSelect(name)=>setSelected(name),
      });
      editorRef.current=editor;
      setPreview(false);setError('');
      setNotice('Editor 3D activo. Selecciona un punto y arrastra el control XYZ.');
    }catch(e){setError(e.message||String(e));setEditing(false);}
    return ()=>{editor?.dispose();if(editorRef.current===editor)editorRef.current=null;};
  },[editing,model,getViewer]);

  useEffect(()=>{if(editorRef.current&&selected)editorRef.current.select(selected);},[selected]);
  const selectPoint=name=>{setSelected(name);editorRef.current?.select(name);};
  const applyMirror=()=>{
    try{
      const partner=editorRef.current?.reflectSelected();
      if(partner){setNotice('Marcador reflejado: '+partner);setError('');}
    }catch(e){setError(e.message);}
  };
  const createSkeleton=()=>{
    try{
      const bones=editorRef.current.createSkeletonPreview();
      setPreview(true);
      setError('');
      setNotice(bones.length+' huesos generados en vista previa, SIN skinning ni cambios al GLB.');
    }catch(e){setError(e.message);}
  };
  const exportDraft=()=>{
    try{
      if(!editorRef.current)throw new Error('Primero activa la edición.');
      const draft=exportRigDraft(editorRef.current.getMarkers(),model.filename);
      downloadJson(draft,(model.filename||'personaje').replace(/\.[^.]+$/,'')+'-orbi-autorig02.json');
      setError('');setNotice('Proyecto JSON guardado: marcadores y 19 huesos, sin skinning.');
    }catch(e){setError(e.message);}
  };
  const loadDraft=async file=>{
    if(!file)return;
    try{
      if(file.size>200000)throw new Error('El JSON excede el límite de 200 KB.');
      const data=JSON.parse(await file.text());
      if(data.sourceFilename&&data.sourceFilename!==model.filename)
        throw new Error('Este proyecto corresponde a otro modelo. Abre primero '+data.sourceFilename);
      const next=importRigDraft(data);
      editorRef.current.setMarkers(next);
      setError('');setNotice('Proyecto de marcadores cargado para el mismo modelo.');
    }catch(e){setError(e.message||String(e));}
  };
  return <section className="panel inspector-panel" aria-label="ORBI AutoRig Studio">
    <div className="panel-header"><div>
      <div className="section-icon mint"><Bone size={19}/></div>
      <div><h3>AutoRig Studio</h3><p>AUTORIG-02A/B · Editor nativo experimental</p></div>
    </div></div>
    <div style={{padding:'14px 15px',display:'grid',gap:12}}>
      <div className="compat-note" style={{margin:0,alignItems:'flex-start'}}>
        {eligible.ok?<ShieldCheck size={17}/>:<ShieldAlert size={17}/>}
        <span>{eligible.reason}</span>
      </div>
      <small style={{fontSize:11,lineHeight:1.65,color:'#a8bdc9'}}>
        Sin Blender: coloca 22 puntos y crea un esqueleto de 19 huesos en el visor.
        Etapa 02A/B: NO calcula pesos, NO deforma la malla, NO exporta un personaje riggeado.
        El GLB original y los rigs de Vita/Mint permanecen intactos.
      </small>
      <button className="outline-btn" style={btn}
        onClick={()=>{setEditing(v=>!v);setError('');setNotice('');}}
        disabled={!eligible.ok}>
        <MousePointer2 size={16}/>{editing?'Cerrar editor de marcadores':'Iniciar editor 3D sin Blender'}
      </button>
      {editing&&<div style={{display:'grid',gap:10}}>
        <div style={{fontSize:11,color:'#b6cbd6',lineHeight:1.6}}>
          Selecciona una esfera directamente en el visor o elige su nombre.
          Arrastra las flechas del gizmo para mover el punto.
          <strong> Mayús + clic</strong> sobre la superficie coloca el punto seleccionado.
          Gira la cámara para comprobar la profundidad.
        </div>
        <label style={{fontSize:12,color:'#d7eced'}}>Articulación seleccionada
          <select value={selected} onChange={e=>selectPoint(e.target.value)} style={{...field,marginTop:5}}>
            {LANDMARK_NAMES.map(name=><option value={name} key={name}>{name}</option>)}
          </select>
        </label>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:6}}>
          {['X','Y','Z'].map((axis,index)=><label key={axis} style={{color:'#9eb8c7',fontSize:10}}>
            {axis} (m)
            <input type="number" step="any" style={{...field,padding:6,marginTop:3,fontSize:11}}
              value={markers?.[selected]?.[index]??''}
              onChange={e=>{
                const value=Number(e.target.value);
                if(e.target.value.trim()===''||!Number.isFinite(value))return;
                const point=[...(editorRef.current?.getMarkers()[selected]||[0,0,0])];
                point[index]=value;editorRef.current?.setMarker(selected,point);
              }}/>
          </label>)}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
          <button className="outline-btn" style={btn}
            disabled={!selected.startsWith('left')&&!selected.startsWith('right')}
            onClick={applyMirror}>Reflejar simetría</button>
          <button className="outline-btn" style={btn}
            onClick={()=>{editorRef.current?.setMarkers(editorRef.current.initial);
              setNotice('Restaurado el preset geométrico de este modelo.');}}>
            Restaurar puntos</button>
        </div>
        <div style={{fontSize:11,color:audit?.ok?'#72d9b4':'#ffad95'}}>
          {audit?.ok?'22 marcadores finitos · esqueleto candidato':
            audit?.errors.join(' · ')||'Sin auditoría'}
        </div>
        {!!audit?.warnings?.length&&<div style={{fontSize:11,color:'#f0c979'}}>
          Revisar: {audit.warnings.join(' · ')}
        </div>}
        <button className="outline-btn" style={btn}
          disabled={!audit?.ok} onClick={createSkeleton}>
          <Bone size={16}/> {preview?'Actualizar':'Generar'} esqueleto de 19 huesos
        </button>
        {preview&&<div style={{fontSize:11,color:'#a6d2cc'}}>
          Esqueleto anatómico en vista previa. Los huesos aún NO controlan la malla.
        </div>}
        <button className="outline-btn" style={btn} disabled={!audit?.ok}
          onClick={exportDraft}><Download size={16}/> Guardar proyecto AUTORIG-02 (JSON)</button>
        <button className="outline-btn" style={btn} onClick={()=>fileRef.current?.click()}>
          Abrir proyecto de marcadores (JSON)</button>
        <input ref={fileRef} type="file" hidden accept=".json,application/json"
          onChange={e=>{loadDraft(e.target.files?.[0]);e.target.value='';}}/>
      </div>}
      {!!error&&<div role="alert" style={{fontSize:11,color:'#ff9e96'}}>{error}</div>}
      {!!notice&&<div role="status" style={{fontSize:11,color:'#9adccc'}}>{notice}</div>}
      <details className="lp-accordion">
        <summary>Ruta anterior AUTORIG-01 (Blender opcional)</summary>
        <div style={{padding:10,display:'grid',gap:8,fontSize:11,lineHeight:1.6}}>
          <span>Esta opción heredada no es necesaria para colocar marcadores en AUTORIG-02.
            Sigue disponible solo para ensayos de generación de pesos.</span>
          <code style={{wordBreak:'break-all',color:'#83ddcd'}}>{PREPARE}</code>
          <code style={{wordBreak:'break-all',color:'#83ddcd'}}>{RIG}</code>
          <span>La vía heredada puede fallar con mallas abiertas o accesorios; no garantiza
            un rig válido, y bloquea exportaciones ante fallos de integridad.</span>
        </div>
      </details>
      <a className="outline-btn" style={{...btn,textDecoration:'none',display:'flex'}}
        href="/autorig01/humanoid_tpose.json" download="humanoid_tpose.json">
        <Download size={15}/> Preset anatómico AUTORIG-01
      </a>
      <div style={{display:'flex',gap:7,fontSize:10,lineHeight:1.6,color:'#93aec0'}}>
        <CheckCircle2 size={14}/>
        <span>Solo GLB sin rig ni animaciones. El editor es temporal: guarda JSON
          antes de cerrar o cambiar el modelo. No modifica archivos de origen.</span>
      </div>
    </div>
  </section>;
}
