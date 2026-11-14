import {useEffect,useRef,useState} from 'react';
import {Bone,CheckCircle2,Download,ShieldAlert,ShieldCheck,MousePointer2} from 'lucide-react';
import {autoRigEligibility} from './lib/autoRig/eligibility.js';
import {NativeRigEditor} from './lib/autoRig/NativeRigEditor.js';
import {createNativeSkinPreview} from './lib/autoRig/nativeSkinPreview.js';
import {createOrbiMotionSamples} from './lib/autoRig/fullBodyMotion.js';
import {loadAndRetargetMixamo} from './lib/autoRig/loadMixamoMotion.js';
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
  const skinRef=useRef(null);
  const skinAbortRef=useRef(null);
  const motionFileRef=useRef(null);
  const motionClipsRef=useRef([]);
  const [editing,setEditing]=useState(false);
  const [selected,setSelected]=useState('pelvis');
  const [markers,setMarkers]=useState(null);
  const [audit,setAudit]=useState(null);
  const [preview,setPreview]=useState(false);
  const [skin,setSkin]=useState({status:'idle',progress:null,audits:null,vertices:0});
  const [pose,setPose]=useState({joint:'leftLowerArm',axis:'Z',angle:0});
  const [heatmapBone,setHeatmapBone]=useState('');
  const [heatmapStats,setHeatmapStats]=useState(null);
  const [motionOptions,setMotionOptions]=useState([]);
  const [motion,setMotion]=useState({
    selected:'',playing:false,speed:1,time:0,duration:0,importing:false,warning:'',
  });
  const [viewState,setViewState]=useState({view:'front',axes:'XY',cameraLocked:true});
  const [history,setHistory]=useState({canUndo:false,canRedo:false,undoCount:0,redoCount:0});
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');

  useEffect(()=>{
    if(!editing||!eligible.ok)return;
    const viewer=getViewer?.();
    if(!viewer?.model){setError('El visor no tiene un modelo cargado.');return;}
    let editor;
    try{
      editor=new NativeRigEditor(viewer,{
        onMarkers: next =>{
          setMarkers(next);setAudit(validateMarkers(next));
          if(skinRef.current||skinAbortRef.current){
            skinAbortRef.current?.abort();skinAbortRef.current=null;
            skinRef.current?.dispose();skinRef.current=null;
            editorRef.current?.setEditingPaused(false);
            setSkin({status:'idle',progress:null,audits:null,vertices:0});
            setHeatmapBone('');setHeatmapStats(null);
            motionClipsRef.current=[];setMotionOptions([]);
            setMotion({selected:'',playing:false,speed:1,time:0,duration:0,
              importing:false,warning:''});
          }
        },
        onSelect: name =>setSelected(name),
        onView: state =>setViewState(state),
        onHistory: state =>setHistory(state),
      });
      editorRef.current=editor;
      setPreview(false);setError('');
      setNotice('Vista frontal y plano XY bloqueados. La profundidad Z no cambiará por accidente.');
    }catch(e){setError(e.message||String(e));setEditing(false);}
    return ()=>{
      skinAbortRef.current?.abort();skinAbortRef.current=null;
      skinRef.current?.dispose();skinRef.current=null;
      editor?.dispose();
      if(editorRef.current===editor)editorRef.current=null;
    };
  },[editing,model,getViewer]);

  useEffect(()=>{if(editorRef.current&&selected)editorRef.current.select(selected);},[selected]);
  const selectPoint=name=>{setSelected(name);editorRef.current?.select(name);};
  const changeView=view=>{
    try{editorRef.current?.setView(view);setError('');
      setNotice('Vista '+view+' fijada. Ejes permitidos ajustados automáticamente.');}
    catch(e){setError(e.message||String(e));}
  };
  const changeAxes=axes=>{
    try{editorRef.current?.setPlacementAxes(axes);setError('');}
    catch(e){setError(e.message||String(e));}
  };
  const changeCameraLock=()=>{
    const next=!viewState.cameraLocked;
    editorRef.current?.setCameraLock(next);
    setNotice(next?'Cámara bloqueada: solo se moverán los marcadores.':
      'Cámara libre: puedes orbitar. Vuelve a elegir una vista fija para alinearla.');
  };
  const undo=()=>{if(editorRef.current?.undo())setNotice('Último movimiento deshecho.');};
  const redo=()=>{if(editorRef.current?.redo())setNotice('Movimiento restaurado.');};
  const resetPoint=()=>{
    editorRef.current?.resetSelected();
    setNotice('Articulación '+selected+' restaurada a su posición inicial.');
  };
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
  const stopSkin=()=>{
    skinAbortRef.current?.abort();
    skinAbortRef.current=null;
    skinRef.current?.dispose();
    skinRef.current=null;
    editorRef.current?.setEditingPaused(false);
    setSkin({status:'idle',progress:null,audits:null,vertices:0});
    setHeatmapBone('');setHeatmapStats(null);
    motionClipsRef.current=[];setMotionOptions([]);
    setMotion({selected:'',playing:false,speed:1,time:0,duration:0,
      importing:false,warning:''});
    setPose({joint:'leftLowerArm',axis:'Z',angle:0});
    setNotice('Vista experimental cerrada. Modelo y marcadores originales restaurados.');
  };
  const generateSkin=async()=>{
    const editor=editorRef.current,viewer=getViewer?.();
    if(!editor||!viewer)return;
    const controller=new AbortController();
    skinAbortRef.current?.abort();
    skinAbortRef.current=controller;
    setError('');
    setSkin({status:'working',progress:null,audits:null,vertices:0});
    setHeatmapBone('');setHeatmapStats(null);
    motionClipsRef.current=[];setMotionOptions([]);
    setNotice('Calculando influencias por vértice en CPU local, sin Blender.');
    try{
      const pilot=await createNativeSkinPreview(viewer,editor.getMarkers(),{
        signal:controller.signal,
        onProgress: progress=>{
          if(!controller.signal.aborted)setSkin(current=>({...current,progress}));
        },
      });
      if(controller.signal.aborted||editorRef.current!==editor){
        pilot.dispose();
        return;
      }
      skinRef.current=pilot;
      editor.setEditingPaused(true);
      setPose({joint:'leftLowerArm',axis:'Z',angle:0});
      const demos=createOrbiMotionSamples().map((clip,i)=>({
        id:'orbi-'+i,kind:'demo',label:clip.name,clip,
        warning:'Animación original de diagnóstico ORBI, no un clip descargado de Mixamo.',
      }));
      motionClipsRef.current=demos;
      setMotionOptions(demos.map(({id,label})=>({id,label})));
      const first=pilot.loadMotion(demos[0].clip);
      pilot.setMotionPlaying(true);
      setMotion({selected:demos[0].id,playing:true,speed:1,time:0,
        duration:first.duration,importing:false,warning:demos[0].warning});
      setSkin({status:'ready',progress:null,audits:pilot.audits,
        vertices:pilot.vertexCount});
      setNotice('Rig experimental listo: LUMIA está reproduciendo una marcha completa de diagnóstico.');
    }catch(e){
      if(!controller.signal.aborted){
        setError('No se generó la vista de skinning: '+(e.message||String(e)));
        setSkin({status:'idle',progress:null,audits:null,vertices:0});
      }
    }finally{
      if(skinAbortRef.current===controller)skinAbortRef.current=null;
    }
  };
  const updatePose=(field,value)=>{
    const next={...pose,[field]:field==='angle'?Number(value):value};
    setPose(next);
    try{
      skinRef.current?.setJointAngle(next.joint,next.axis,next.angle);
      setMotion(m=>({...m,playing:false}));
    }catch(e){setError(e.message||String(e));}
  };
  const selectFullBodyMotion=id=>{
    const pilot=skinRef.current,chosen=motionClipsRef.current.find(x=>x.id===id);
    if(!pilot||!chosen)return;
    try{
      const info=pilot.loadMotion(chosen.clip);
      pilot.setMotionSpeed(motion.speed);
      pilot.setMotionPlaying(true);
      setMotion(m=>({...m,selected:id,playing:true,time:0,
        duration:info.duration,warning:chosen.warning}));
      setError('');
    }catch(e){setError('Animación no compatible: '+(e.message||String(e)));}
  };
  const toggleMotion=()=>{
    try{
      const playing=!motion.playing;
      skinRef.current?.setMotionPlaying(playing);
      setMotion(m=>({...m,playing}));
    }catch(e){setError(e.message||String(e));}
  };
  const changeMotionSpeed=value=>{
    const speed=Number(value);
    try{skinRef.current?.setMotionSpeed(speed);
      setMotion(m=>({...m,speed}));}
    catch(e){setError(e.message||String(e));}
  };
  const seekMotion=value=>{
    try{
      const time=skinRef.current?.seekMotion(Number(value))??0;
      setMotion(m=>({...m,time,playing:false}));
    }catch(e){setError(e.message||String(e));}
  };
  const importMixamo=async file=>{
    if(!file||!skinRef.current)return;
    const pilot=skinRef.current;
    setMotion(m=>({...m,importing:true}));setError('');
    try{
      const result=await loadAndRetargetMixamo(file);
      if(pilot!==skinRef.current)return;
      const imported=result.compatible.map((item,i)=>({
        id:'mixamo-'+i,kind:'imported',
        label:'Mixamo / '+result.filename+' / '+item.clip.name,
        clip:item.clip,warning:item.warning,
      }));
      motionClipsRef.current=[
        ...motionClipsRef.current.filter(item=>item.kind==='demo'),
        ...imported,
      ];
      setMotionOptions(motionClipsRef.current.map(({id,label})=>({id,label})));
      const first=imported[0];
      const info=pilot.loadMotion(first.clip);
      pilot.setMotionSpeed(motion.speed);
      pilot.setMotionPlaying(true);
      setMotion(m=>({...m,selected:first.id,playing:true,time:0,
        duration:info.duration,warning:first.warning,importing:false}));
      setNotice(result.compatible.length+' animación(es) Mixamo adaptada(s). '+
        (result.skipped.length?result.skipped.length+' descartada(s). ':'')+
        'Verifica cuerpo completo, ropa, articulaciones y perfil.');
    }catch(e){
      if(pilot===skinRef.current){
        setError('No se pudo importar Mixamo: '+(e.message||String(e)));
        setMotion(m=>({...m,importing:false}));
      }
    }
  };
  useEffect(()=>{
    if(skin.status!=='ready')return;
    let raf=0,last=0,lastUi=0,active=true;
    const loop=now=>{
      if(!active)return;
      const delta=last?Math.min((now-last)/1000,.12):0;
      last=now;
      const pilot=skinRef.current;
      if(pilot){
        const time=pilot.updateMotion(delta);
        if(now-lastUi>180){
          setMotion(m=>m.playing?({...m,time}):m);
          lastUi=now;
        }
      }
      raf=requestAnimationFrame(loop);
    };
    raf=requestAnimationFrame(loop);
    return ()=>{active=false;cancelAnimationFrame(raf);};
  },[skin.status]);
  const changeHeatmap=boneName=>{
    try{
      const result=skinRef.current?.setWeightHeatmap(boneName||null)??null;
      setHeatmapBone(boneName);
      setHeatmapStats(result);
      setError('');
    }catch(e){setError('No se pudo visualizar pesos: '+(e.message||String(e)));}
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
          <strong>Modo seguro:</strong> cámara fija y movimiento limitado por ejes.
          <strong> Mayús + clic</strong> coloca el marcador sobre el plano de la vista,
          conservando la coordenada bloqueada. El modelo original permanece inmóvil.
        </div>
        <label style={{fontSize:12,color:'#d7eced'}}>Vista fija del personaje</label>
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,minmax(0,1fr))',gap:4}}>
          {[['front','Frente'],['back','Atrás'],['left','Izq.'],['right','Der.'],['top','Arriba']].map(([value,label])=>
            <button key={value} type="button" aria-pressed={viewState.view===value}
              className="outline-btn"
              style={{...btn,padding:'7px 3px',fontSize:10,
                background:viewState.view===value?'#25594f':'#15273a'}}
              onClick={()=>changeView(value)}>{label}</button>)}
        </div>
        <button type="button" className="outline-btn" style={{...btn,
            background:viewState.cameraLocked?'#214840':'#483926'}}
          aria-pressed={viewState.cameraLocked} onClick={changeCameraLock}>
          {viewState.cameraLocked?'🔒 Cámara bloqueada (recomendado)':
            '🔓 Cámara libre — clic para bloquear'}
        </button>
        <label style={{fontSize:12,color:'#d7eced'}}>Movimiento permitido (ejes mundiales)
          <select style={{...field,marginTop:5}} value={viewState.axes}
            onChange={e=>changeAxes(e.target.value)}>
            <option value="XY">Plano XY — izquierda/derecha y altura; Z bloqueado</option>
            <option value="YZ">Plano YZ — altura y profundidad; X bloqueado</option>
            <option value="XZ">Plano XZ — horizontal y profundidad; Y bloqueado</option>
            <option value="X">Solo X — izquierda/derecha</option>
            <option value="Y">Solo Y — altura</option>
            <option value="Z">Solo Z — profundidad</option>
            <option value="XYZ">XYZ — libre (avanzado)</option>
          </select>
        </label>
        <div style={{fontSize:11,color:'#a9d0ca',lineHeight:1.6}}>
          {viewState.view==='front'||viewState.view==='back'?
            'Frente/espalda: coloca primero el punto en XY. Para profundidad usa Solo Z.':
            viewState.view==='left'||viewState.view==='right'?
            'Perfil: ajusta altura y profundidad en YZ; no se altera X.':
            'Vista superior: trabaja en XZ; la altura Y queda congelada.'}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
          <button type="button" className="outline-btn" style={btn}
            disabled={!history.canUndo} onClick={undo}>↶ Deshacer</button>
          <button type="button" className="outline-btn" style={btn}
            disabled={!history.canRedo} onClick={redo}>↷ Rehacer</button>
        </div>
        <label style={{fontSize:12,color:'#d7eced'}}>Articulación seleccionada
          <select value={selected} onChange={e=>selectPoint(e.target.value)} style={{...field,marginTop:5}}>
            {LANDMARK_NAMES.map(name=><option value={name} key={name}>{name}</option>)}
          </select>
        </label>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:6}}>
          {['X','Y','Z'].map((axis,index)=><label key={axis} style={{color:'#9eb8c7',fontSize:10}}>
            {axis} (m)
            <input type="number" step="any"
              disabled={!viewState.axes.includes(axis)}
              title={viewState.axes.includes(axis)?'Eje editable':'Eje bloqueado por el modo de colocación'}
              key={selected+'-'+axis+'-'+(markers?.[selected]?.[index]??'')}
              style={{...field,padding:6,marginTop:3,fontSize:11}}
              defaultValue={markers?.[selected]?.[index]??''}
              onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}
              onBlur={e=>{
                const value=Number(e.target.value);
                if(e.target.value.trim()===''||!Number.isFinite(value))return;
                const point=[...(editorRef.current?.getMarkers()[selected]||[0,0,0])];
                point[index]=value;editorRef.current?.setMarker(selected,point);
              }}/>
          </label>)}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:5}}>
          <button type="button" className="outline-btn" style={{...btn,padding:5,fontSize:11}}
            disabled={!selected.startsWith('left')&&!selected.startsWith('right')}
            onClick={applyMirror}>Espejo</button>
          <button type="button" className="outline-btn" style={{...btn,padding:5,fontSize:11}}
            onClick={resetPoint}>Restaurar punto</button>
          <button type="button" className="outline-btn" style={{...btn,padding:5,fontSize:11}}
            onClick={()=>{editorRef.current?.resetAll();
              setNotice('Restaurados los 22 puntos. Puedes deshacer esta acción.');}}>
            Restaurar todos</button>
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
          Esqueleto anatómico preliminar preparado: 19 huesos.
        </div>}
        {preview&&<div style={{border:'1px solid #315064',borderRadius:10,
          padding:10,display:'grid',gap:9}}>
          <strong style={{fontSize:12,color:'#a8e9df'}}>
            AUTORIG-02C.1 · Prueba local de pesos y deformaciones
          </strong>
          <small style={{color:'#b8cbd3',lineHeight:1.5}}>
            Cálculo experimental por proximidad sobre una COPIA temporal.
            No se exporta un GLB riggeado, no modifica la geometría original
            y todavía requiere inspección anatómica, ropa y rostro.
          </small>
          {skin.status!=='ready'?<button type="button" className="outline-btn"
            style={btn} onClick={generateSkin} disabled={!audit?.ok||skin.status==='working'}>
            {skin.status==='working'?'Calculando pesos localmente…':
              'Calcular pesos y activar vista de deformación'}
          </button>:null}
          {skin.status==='working'&&<div style={{fontSize:11,color:'#9db9ca'}}>
            {skin.progress?
              'Procesadas '+skin.progress.meshes+'/'+skin.progress.totalMeshes+
              ' mallas; '+skin.progress.vertices+'/'+skin.progress.totalVertices+' vértices.':
              'Preparando cálculo…'}
            <button type="button" className="outline-btn"
              style={{...btn,marginTop:7}} onClick={stopSkin}>Cancelar</button>
          </div>}
          {skin.status==='ready'&&<>
            <div style={{color:'#a8d8d0',fontSize:11}}>
              {skin.vertices.toLocaleString('es-CL')} vértices · {skin.audits.length} mallas
              · pesos normalizados (máximo 4 influencias).
            </div>
            <div style={{display:'grid',gap:8,padding:10,
              border:'1px solid #466763',borderRadius:9}}>
              <strong style={{color:'#c7eee8',fontSize:12}}>
                AUTORIG-02C.3 · Animación corporal completa (Mixamo / ORBI)
              </strong>
              <small style={{color:'#b0cbd4',lineHeight:1.55}}>
                Reproduce todos los huesos simultáneamente. La marcha, sentadilla
                y saludo incluidos son animaciones ORIGINALES de diagnóstico ORBI.
                También puedes cargar tu propio FBX descargado de Mixamo.
              </small>
              <label style={{fontSize:11,color:'#d7eced'}}>Movimiento de prueba
                <select value={motion.selected} style={{...field,marginTop:5}}
                  onChange={e=>selectFullBodyMotion(e.target.value)}>
                  {motionOptions.map(({id,label})=>
                    <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
              <button type="button" className="outline-btn" style={btn}
                disabled={motion.importing}
                onClick={()=>motionFileRef.current?.click()}>
                {motion.importing?'Importando animación…':
                  'Importar animación Mixamo (.fbx o .glb)'}
              </button>
              <input type="file" ref={motionFileRef} hidden accept=".fbx,.glb"
                onChange={e=>{importMixamo(e.target.files?.[0]);e.target.value='';}}/>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                <button type="button" className="outline-btn" style={btn}
                  onClick={toggleMotion}>
                  {motion.playing?'⏸ Pausar animación':'▶ Reproducir animación'}
                </button>
                <button type="button" className="outline-btn" style={btn}
                  onClick={()=>seekMotion(0)}>↶ Volver al inicio</button>
              </div>
              <label style={{fontSize:11,color:'#d7eced'}}>
                Línea de tiempo: {motion.time.toFixed(2)} /
                {' '}{motion.duration.toFixed(2)} s
                <input type="range" min="0" max={motion.duration||1}
                  step=".02" value={Math.min(motion.time,motion.duration||1)}
                  onChange={e=>seekMotion(e.target.value)}
                  style={{width:'100%',marginTop:7}}/>
              </label>
              <label style={{fontSize:11,color:'#d7eced'}}>Velocidad
                <select style={{...field,marginTop:4}} value={motion.speed}
                  onChange={e=>changeMotionSpeed(e.target.value)}>
                  {[.25,.5,.75,1,1.25,1.5,2].map(speed=>
                    <option key={speed} value={speed}>{speed}×</option>)}
                </select>
              </label>
              {!!motion.warning&&<small style={{color:'#f1c98c',lineHeight:1.5}}>
                {motion.warning}
              </small>}
              <small style={{color:'#aecbd2',lineHeight:1.5}}>
                Mientras el clip se reproduce, observa en movimiento hombros,
                codos, caderas, rodillas, tobillos, rostro y ropa.
                Las animaciones Mixamo se adaptan de forma aproximada y sin
                desplazamiento de raíz. No es una exportación final.
              </small>
            </div>
            <div style={{display:'grid',gap:7,padding:9,
              border:'1px solid #345365',borderRadius:8}}>
              <strong style={{fontSize:12,color:'#b2ebeb'}}>
                AUTORIG-02C.2 · Mapa de pesos por hueso
              </strong>
              <label style={{fontSize:11,color:'#d7eced'}}>Visualizar influencia
                <select value={heatmapBone} style={{...field,marginTop:4}}
                  onChange={e=>changeHeatmap(e.target.value)}>
                  <option value="">Apariencia original (sin mapa)</option>
                  {skinRef.current?.bones.map(name=>
                    <option key={name} value={name}>{name}</option>)}
                </select>
              </label>
              {!!heatmapBone&&<div style={{display:'grid',gap:5}}>
                <div style={{height:9,borderRadius:4,
                  background:'linear-gradient(to right, #091438, #0a52d6, #05d6b8, #facb1f, #ff2e17)'}}/>
                <div style={{display:'flex',justifyContent:'space-between',
                  fontSize:10,color:'#acc1ca'}}>
                  <span>0 % (azul)</span><span>50 %</span><span>100 % (rojo)</span>
                </div>
                {heatmapStats&&<div style={{fontSize:11,color:'#b9d9d8',lineHeight:1.6}}>
                  Influencia detectada en {heatmapStats.influencedVertices.toLocaleString('es-CL')}
                  {' / '}{heatmapStats.vertices.toLocaleString('es-CL')} vértices.
                  {' '}{heatmapStats.strongVertices.toLocaleString('es-CL')}
                  {' '}tienen influencia igual o superior al 50 %.
                </div>}
                <small style={{color:'#e7c995',fontSize:10,lineHeight:1.5}}>
                  Los colores solo indican pesos numéricos. Una zona roja no
                  garantiza una deformación correcta; revisa también rostro,
                  ropa, hombros y articulaciones desde varios ángulos.
                </small>
              </div>}
            </div>
            <label style={{fontSize:11,color:'#d7eced'}}>Articulación
              <select style={{...field,marginTop:4}} value={pose.joint}
                onChange={e=>updatePose('joint',e.target.value)}>
                {['leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm',
                  'leftUpperLeg','rightUpperLeg','leftLowerLeg','rightLowerLeg',
                  'neck','head','spine','chest'].map(j=>
                  <option key={j} value={j}>{j}</option>)}
              </select>
            </label>
            <label style={{fontSize:11,color:'#d7eced'}}>Eje de rotación
              <select style={{...field,marginTop:4}} value={pose.axis}
                onChange={e=>updatePose('axis',e.target.value)}>
                {['X','Y','Z'].map(axis=><option key={axis} value={axis}>{axis}</option>)}
              </select>
            </label>
            <label style={{fontSize:11,color:'#d7eced'}}>
              Flexión experimental: {pose.angle}°
              <input type="range" min="-75" max="75" step="5" value={pose.angle}
                onChange={e=>updatePose('angle',e.target.value)}
                style={{width:'100%',marginTop:8}}/>
            </label>
            <div style={{fontSize:10,color:'#edc991',lineHeight:1.55}}>
              Si ves ropa, articulaciones o piel deformadas, NO aceptes los pesos
              como definitivos. Corrige marcadores y repite el cálculo.
            </div>
            <button type="button" className="outline-btn" style={btn}
              onClick={()=>{skinRef.current?.resetPose();
                setMotion(m=>({...m,playing:false,time:0}));
                setPose(p=>({...p,angle:0}));}}>
              Restablecer T-Pose
            </button>
            <button type="button" className="outline-btn" style={btn}
              onClick={stopSkin}>
              Cerrar prueba y recuperar marcadores originales
            </button>
          </>}
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
        <span>Solo GLB sin rig ni animaciones. Cámara fija por defecto; para recuperar
          un punto usa Deshacer o Restaurar punto. Guarda JSON antes de cerrar.
          No modifica archivos de origen.</span>
      </div>
    </div>
  </section>;
}
