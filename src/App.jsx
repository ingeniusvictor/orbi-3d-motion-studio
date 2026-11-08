import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ArrowDownToLine, Box, Boxes, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Clock3, Download, Eye, FilePlus2, FileUp, Film, FolderOpen, Grid2X2, Info, Layers3, Menu, MousePointer2, Pause, Play, RotateCcw, ScanEye, ShieldCheck, SlidersHorizontal, Sparkles, UploadCloud, X, XCircle } from 'lucide-react';
import { MotionViewer } from './lib/viewer.js';
import LightPrep from './LightPrep.jsx';
import TextureStudio from './TextureStudio.jsx';
import LivingPresenceLab from './LivingPresenceLab.jsx';
import FaceQuickDock from './FaceQuickDock.jsx';
import MotionExtractor from './MotionExtractor.jsx';
import { blenderConvertScript } from './lib/mixamoKit.js';
import { formatBytes } from './lib/modelInfo.js';

const number = value => Number(value || 0).toLocaleString('es-CL');
function OrbLogo({small=false}) {
  return <div className={`orb-logo ${small?'orb-logo-small':''}`} aria-hidden="true"><span className="orb-logo-core" /></div>;
}
function Intro({onOpen}) {
  return <div className="empty-state">
    <div className="empty-orbit"><span className="orbit-one"/><span className="orbit-two"/><Box size={44} strokeWidth={1.15}/></div>
    <div className="eyebrow centered"><span className="signal"/> TU ESPACIO DE EXPLORACIÓN 3D</div>
    <h2>Tu universo 3D<br/><span>comienza aquí.</span></h2>
    <p>Arrastra un personaje o modelo a este espacio. Explora su geometría, descubre su composición y reproduce sus animaciones.</p>
    <button className="primary-btn primary-large" onClick={onOpen}><FileUp size={17}/> Cargar modelo 3D</button>
    <div className="file-hint">GLB · GLTF · FBX · VRM <span>—</span> Sin cuentas, sin subir archivos</div>
  </div>;
}
function Tutorial({onClose}) {
  return <div className="modal-backdrop" onMouseDown={e => {if(e.target===e.currentTarget)onClose();}}>
    <section className="modal" role="dialog" aria-modal="true" aria-label="Guía de ORBI Motion Studio">
      <header className="modal-header"><div><div className="eyebrow">GUÍA RÁPIDA</div><h2>Empieza a crear movimiento.</h2></div><button className="icon-btn" onClick={onClose} aria-label="Cerrar"><X size={21}/></button></header>
      <p className="modal-lead">ORBI Motion Studio es un visualizador e integrador básico. No necesitas aprender modelado 3D para explorar tus creaciones.</p>
      <div className="tutorial-list">
        <div><span className="step-num">01</span><div><strong>Carga tu modelo</strong><p>Selecciona un .glb, .gltf, .fbx o .vrm. Si utilizas .gltf con archivos externos, incluye también los .bin y las texturas en la selección.</p></div></div>
        <div><span className="step-num">02</span><div><strong>Explora e inspecciona</strong><p>Gira con el ratón, acerca con la rueda y desplázate con el botón derecho. Revisa las mallas, materiales, huesos y la jerarquía.</p></div></div>
        <div><span className="step-num">03</span><div><strong>Reproduce sus animaciones</strong><p>Si el modelo contiene movimientos, elige uno en el panel «Animaciones». Puedes pausarlo y ajustar la velocidad.</p></div></div>
        <div><span className="step-num">04</span><div><strong>Opcional: nuevos movimientos desde Mixamo</strong><p>Prepara tu personaje en Blender/Mixamo, descarga un personaje base riggeado y nuevas animaciones FBX del mismo esqueleto (preferiblemente «Without Skin»). Carga aquí el mismo personaje base y después los movimientos. No se admite rigging ni retargeting de esqueletos distintos. Un FBX «Without Skin» no incluye modelo visible: cárgalo como animación, no como personaje base.</p></div></div>
        <div><span className="step-num">05</span><div><strong>Exporta un GLB integrado</strong><p>Descarga una copia nueva con las animaciones. Tu archivo original permanece intacto. Verificamos que el GLB generado se pueda volver a abrir.</p></div></div>
      </div>
      <div className="tutorial-warning"><ShieldCheck size={18}/><span>Los VRM 0.x y 1.0 permiten previsualizar FBX humanoides de Mixamo. Si el FBX contiene movimiento adicional de la malla, la vista puede omitir esa pista y mostrará una advertencia explícita: la animación visualizada será aproximada y no apta para exportar como definitiva. La exportación desde VRM permite crear un GLB estándar aproximado mediante aceptación explícita, sin conservar las funciones exclusivas de VRM. Para modelos FBX/GLB se exige el mismo esqueleto y jerarquía. Si hay diferencias, la aplicación rechazará la integración. Para editar huesos utiliza Blender.</span></div>
      <div className="modal-footer"><a href="https://www.mixamo.com/" target="_blank" rel="noreferrer">Abrir Mixamo ↗</a><button className="primary-btn" onClick={onClose}>Entendido</button></div>
    </section>
  </div>;
}
function Stat({icon:Icon,label,value}) {return <div className="stat"><div className="stat-icon"><Icon size={17}/></div><div><span>{label}</span><strong>{value}</strong></div></div>;}
export default function App() {
  const mountRef = useRef(null), viewer = useRef(null), fileInput = useRef(null), animationInput = useRef(null);
  const [model, setModel] = useState(null);
  const [lightMeshes, setLightMeshes] = useState([]);
  const [textureMaterials,setTextureMaterials]=useState([]);
  const [canUndoTextures,setCanUndoTextures]=useState(false);
  const [modelGeneration,setModelGeneration]=useState(0);
  const [lightBoneCount,setLightBoneCount] = useState(0);
  const [finalFormat,setFinalFormat] = useState('glb');
  const [clips, setClips] = useState([]);
  const [activeClip, setActiveClip] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showBones, setShowBones] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [grid, setGrid] = useState(true);
  const [inspectorTab, setInspectorTab] = useState('stats');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null);
  const [importResults, setImportResults] = useState([]);
  const [showTutorial, setShowTutorial] = useState(false);
  const [allowVrmExport, setAllowVrmExport] = useState(false);
  const [dragging,setDragging] = useState(false);
  const [mobilePanel,setMobilePanel] = useState(false);
  const [faceDockOpen,setFaceDockOpen]=useState(false);
  const voiceQARef=useRef(null);
  const [voiceQAState,setVoiceQAState]=useState({ready:false,authorized:false,status:'idle'});
  const getViewer = useCallback(() => viewer.current, []);
  const syncPlayer = useCallback(() => {
    const instance = viewer.current;
    if (!instance) return;
    setClips(instance.getClips());
    setActiveClip(instance.current);
    setPlaying(instance.playing);
  },[]);
  useEffect(() => {
    try { viewer.current = new MotionViewer(mountRef.current,syncPlayer); }
    catch(error) {setNotice({type:'error',text:`No se pudo inicializar WebGL: ${error.message}`});}
    return () => {viewer.current?.dispose();viewer.current=null;};
  },[syncPlayer]);
  const openFiles = useCallback(async files => {
    if (!files?.length || !viewer.current) return;
    setBusy('Abriendo modelo…');setNotice(null);setImportResults([]);setAllowVrmExport(false);setFinalFormat('glb');setLightMeshes([]);setLightBoneCount(0);setTextureMaterials([]);setCanUndoTextures(false);
    try {
      const info = await viewer.current.open(files);
      if (info) { setFaceDockOpen(info.format==='VRM');setModel(info);setLightMeshes(viewer.current.getLightMeshes());setLightBoneCount(viewer.current.getLightBoneCount());setTextureMaterials(viewer.current.getTextureMaterials());setModelGeneration(n=>n+1);syncPlayer();setNotice({type:'success',text:`${info.filename} cargado correctamente.`}); }
    } catch(error) {setNotice({type:'error',text:error.message||String(error)});}
    finally {setBusy('');}
  },[syncPlayer]);
  const importAnimations = async files => {
    if (!files?.length || !viewer.current) return;
    setBusy('Analizando compatibilidad…');setNotice(null);
    try {
      const results = await viewer.current.addAnimations(Array.from(files));
      setImportResults(results);syncPlayer();
      setModel(current=>current?{...current,...viewer.current.getInfo()}:current);
      const added = results.filter(x=>x.ok).reduce((n,x)=>n+x.count,0);
      setNotice({type:added?'success':'error',text:added?`Se añadieron ${added} animaciones compatibles.`:'Los archivos no se pudieron integrar. Revisa los motivos abajo.'});
    } catch(error) {setNotice({type:'error',text:error.message||String(error)});}
    finally {setBusy('');}
  };
  const refreshTextureInfo=()=>{
    const instance=viewer.current;
    if(!instance)return;
    setTextureMaterials(instance.getTextureMaterials());
    setModel(current=>current?{...current,...instance.getInfo()}:current);
  };
  const applyTexture=async (file,materialId,channel)=>{
    if(!viewer.current)return;
    setBusy('Aplicando textura al material…');setNotice(null);
    try{
      const attached=await viewer.current.attachTextureFile(file,materialId,channel);
      setCanUndoTextures(false);
      refreshTextureInfo();
      setNotice({type:'success',text:'Imagen «'+file.name+'» aplicada correctamente. Revisa el resultado en el visor y exporta GLB para conservarla.'});
      return attached;
    }catch(error){
      setNotice({type:'error',text:'No se pudo aplicar la textura: '+(error.message||error)});
      return null;
    }finally{setBusy('');}
  };
  const batchTexture=async assignments=>{
    if(!viewer.current||!assignments?.length)return [];
    setBusy('Aplicando asociaciones seguras…');setNotice(null);
    try{
      const result=await viewer.current.applyTextureBatch(assignments);
      refreshTextureInfo();setCanUndoTextures(true);
      setNotice({type:'success',text:result.length+' texturas aplicadas. Revisa el personaje en el visor; puedes deshacer el lote.'});
      return result;
    }catch(error){
      refreshTextureInfo();setCanUndoTextures(Boolean(viewer.current?.canUndoTextureBatch));
      setNotice({type:'error',text:error.message||String(error)});
      throw error;
    }finally{setBusy('');}
  };
  const undoTexture=async()=>{
    if(!viewer.current)return false;
    const result=viewer.current.undoTextureBatch();
    if(result){refreshTextureInfo();setCanUndoTextures(false);
      setNotice({type:'success',text:'Se restauraron los materiales anteriores al último lote. El rig y las animaciones no cambiaron.'});}
    return result;
  };
  const exportModel = async () => {
    if(!viewer.current || !model) return;
    setBusy(finalFormat==='fbx'?'Generando y verificando FBX…':'Generando y verificando GLB…');setNotice(null);
    try {
      const result = finalFormat==='fbx' ? await viewer.current.exportAnimatedFBX({allowApproximateVRM:allowVrmExport}) : await viewer.current.exportGLB({allowApproximateVRM:allowVrmExport});
      setNotice({type:'success',text:`${result.filename} · ${result.size} · ${result.animations} animaciones. Descarga iniciada.${result.warning?' '+result.warning:''}${finalFormat==='fbx'?' FBX binario experimental: comprueba el resultado y sus animaciones.':''}`});
    } catch(error) {setNotice({type:'error',text:`No se pudo exportar: ${error.message||error}`});}
    finally {setBusy('');}
  };
  const exportCleanFBX=async ({pose='reference'}={})=>{
    if(!viewer.current||!model)return;
    setBusy('Restaurando pose y verificando FBX riggeado sin animaciones…');
    setNotice(null);
    try{
      const result=await viewer.current.exportCleanMixamoFBX({pose});
      const rotations=result.adjustments?.map(a=>a.side+': brazo '+
        a.upperDegrees.toFixed(1)+'°, antebrazo '+a.forearmDegrees.toFixed(1)+'°').join(' | ');
      setNotice({type:'success',text:result.filename+' descargado ('+
        result.size+'). Verificado: '+result.bones+' huesos, '+
        result.meshes+' mallas riggeadas y 0 animaciones. '+
        (rotations?'Correcciones: '+rotations+'. ':'')+
        (result.consolidation?.consolidated
          ?'Se consolidaron '+result.consolidation.bonesBefore+
           ' referencias de huesos en '+result.consolidation.bonesAfter+
           ' huesos físicos de un solo rig. ':'')+
        'Pose exportada: '+result.pose+'. Reabre el FBX en ORBI antes de probarlo en Mixamo. La aceptación por Mixamo no está garantizada.'});
    }catch(error){
      setNotice({type:'error',text:'No se exportó el FBX limpio: '+
        (error.message||String(error))});
    }finally{setBusy('');}
  };
  const downloadRigDiagnostic=async()=>{
    if(!viewer.current)return;
    setBusy('Recopilando diagnóstico local de huesos…');
    try{
      const report=await viewer.current.exportRigDiagnosticJSON();
      setNotice({type:'success',text:report.filename+
        ' descargado. Solo contiene nombres y transformaciones óseas ('+
        report.summary.skinnedMeshes+' mallas, '+
        report.summary.uniqueBoneObjects+' objetos Bone). No incluye el FBX ni texturas.'});
    }catch(error){
      setNotice({type:'error',text:'No se pudo generar el diagnóstico: '+
        (error.message||String(error))});
    }finally{setBusy('');}
  };
  const saveExtractedClip=index=>{
    try{
      const result=viewer.current.exportExtractedClipJSON(index);
      setNotice({type:'success',text:'Clip guardado: '+result.filename+
        '. Formato de biblioteca ORBI, no FBX para Mixamo.'});
    }catch(error){setNotice({type:'error',text:error.message||String(error)});}
  };
  const downloadScript = () => {
    const blob=new Blob([blenderConvertScript()],{type:'text/x-python;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='orbi-convert-fbx.py';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
  };
  const prepareLight = async ids => {
    if(!viewer.current)return;
    setBusy('Preparando copia ligera y verificando el rig…');setNotice(null);
    try {
      const result=await viewer.current.exportLightweight(ids);
      setNotice({type:'success',text:'GLB corporal ligero: '+result.filename+' ('+result.size+'). Conservó '+result.bones+' huesos, '+result.meshes+' mallas y 0 animaciones. Para llevarlo a Mixamo conviértelo a FBX con Blender y el script de este panel.'});
    } catch(error){
      setNotice({type:'error',text:'No se pudo preparar el personaje ligero: '+(error.message||error)});
    } finally {setBusy('');}
  };
  const prepareLightFBX = async ids => {
    if(!viewer.current)return;
    setBusy('Generando FBX binario y comprobando el esqueleto…');setNotice(null);
    try {
      const result=await viewer.current.exportLightweightFBX(ids);
      setNotice({type:'success',text:'FBX binario ligero: '+result.filename+' ('+result.size+'). Conservó '+result.bones+' huesos y '+result.meshes+' mallas. Comprueba su mapeo en Mixamo y vuelve a abrirlo en ORBI.'});
    }catch(error) {
      setNotice({type:'error',text:'No se pudo generar un FBX riggeado: '+(error.message||error)+' Usa el GLB y el conversor Blender gratuito como alternativa.'});
    }finally{setBusy('');}
  };
  const previewLight = ids => viewer.current?.setLightPreview(ids);
  const chooseClip = index => {viewer.current?.play(index);syncPlayer();};
  const togglePlay = () => {viewer.current?.setPlaying(!playing);syncPlayer();};
  const changeSpeed = event => {const value=Number(event.target.value);setSpeed(value);viewer.current?.setSpeed(value);};
  const toggleBones = () => {setShowBones(v=>{viewer.current?.setSkeletonVisible(!v);return !v;});};
  const toggleWireframe = () => {setWireframe(v=>{viewer.current?.setWireframe(!v);return !v;});};
  const toggleGrid = () => {setGrid(v=>{if(viewer.current) viewer.current.grid.visible=!v;return !v;});};
  const drop = event => {event.preventDefault();setDragging(false);if(event.dataTransfer?.files?.length)openFiles(Array.from(event.dataTransfer.files));};
  return <div className="app-shell">
    <aside className="nav-rail">
      <a href="/" className="brand" aria-label="ORBI Motion Studio inicio"><OrbLogo/><div><strong>ORBI<span>·</span></strong><small>ECOSYSTEM</small></div></a>
      <div className="nav-section-title">WORKSPACE</div>
      <button className="nav-item selected" onClick={()=>fileInput.current?.click()}><ScanEye size={19}/><span>Motion Studio</span><span className="nav-selected-dot"/></button>
      <div className="rail-spacer"/>
      <div className="rail-foot"><span className="live-dot"/> PROCESAMIENTO LOCAL <small>v0.1 · MOTION-01</small></div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumb"><button className="mobile-menu" onClick={()=>setMobilePanel(v=>!v)} aria-label="Abrir menú"><Menu size={20}/></button><span>ORBI Ecosystem</span><ChevronRight size={14}/><strong>3D Motion Studio</strong><span className="beta-pill">BETA</span></div>
        <div className="top-actions"><span className="local-chip"><span className="live-dot"/> ARCHIVOS PRIVADOS</span><button className="subtle-btn help-button" onClick={()=>setShowTutorial(true)}><CircleHelp size={16}/> Guía rápida</button></div>
      </header>
      <main className="main-content">
        <div className="heading-row"><div><div className="eyebrow"><span className="signal"/> ESTUDIO DE VISUALIZACIÓN 3D</div><h1>Explora cada <span>dimensión.</span></h1><p>Inspecciona tus modelos, descubre sus movimientos y crea nuevas posibilidades.</p></div><button className="primary-btn new-file-btn" onClick={()=>fileInput.current?.click()}><FileUp size={17}/> Cargar modelo</button></div>
        <div className={`studio-layout ${mobilePanel?'mobile-panel-open':''}`}>
          <section className="viewer-column">
            <div className={`viewport-card ${dragging?'dragging':''}`} onDragOver={event=>{event.preventDefault();setDragging(true);}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget))setDragging(false);}} onDrop={drop}>
              <div className="viewer-toolbar"><div className="viewport-title"><span className="viewport-led"/> VISOR 3D <span className="viewer-divider">/</span> <span>{model?'MODELO CARGADO':'ESCENA VACÍA'}</span></div><div className="viewer-actions"><button className={grid?'toolbar-btn on':'toolbar-btn'} onClick={toggleGrid} title="Mostrar cuadrícula" aria-label="Cuadrícula"><Grid2X2 size={17}/></button><button className={wireframe?'toolbar-btn on':'toolbar-btn'} onClick={toggleWireframe} title="Vista de malla" aria-label="Vista de malla"><Layers3 size={17}/></button><button className={showBones?'toolbar-btn on':'toolbar-btn'} onClick={toggleBones} title="Visualizar esqueleto" aria-label="Visualizar esqueleto"><Activity size={17}/></button><button className="toolbar-btn" onClick={()=>viewer.current?.resetCamera()} title="Restablecer cámara" aria-label="Restablecer cámara"><RotateCcw size={17}/></button>{model?.format==='VRM'&&<button className={faceDockOpen?'toolbar-btn on':'toolbar-btn'} onClick={()=>setFaceDockOpen(v=>!v)} title="Abrir controles rápidos faciales junto a Vita" aria-label="Controles rápidos de rostro" aria-pressed={faceDockOpen}><ScanEye size={17}/></button>}</div></div>
              <div className="renderer-mount" ref={mountRef}/>
              <FaceQuickDock key={'face-dock-'+modelGeneration} getViewer={getViewer} model={model}
                open={faceDockOpen} onClose={()=>setFaceDockOpen(false)}
                voiceState={voiceQAState}
                onSpeak={()=>voiceQARef.current?.play?.()}
                onStopVoice={()=>voiceQARef.current?.stop?.()}/>
              {!model && <Intro onOpen={()=>fileInput.current?.click()}/>}
              {dragging&&<div className="drag-mask"><UploadCloud size={42}/><strong>Suelta tu archivo 3D</strong><span>Tu archivo se procesa localmente</span></div>}
              {busy&&<div className="busy-mask"><div className="loading-ring"/><strong>{busy}</strong></div>}
              <div className="viewport-bottom"><span><MousePointer2 size={13}/> Arrastrar para rotar · Rueda para zoom</span>{model&&<span className="format-chip">{model.format} · {formatBytes(model.bytes)}</span>}</div>
            </div>
            {notice&&<div className={`notice ${notice.type}`} role="status">{notice.type==='error'?<XCircle size={18}/>:<CheckCircle2 size={18}/>}<span>{notice.text}</span><button onClick={()=>setNotice(null)} aria-label="Cerrar aviso"><X size={16}/></button></div>}
            <section className="panel animation-panel"><div className="panel-header"><div><div className="section-icon"><Film size={19}/></div><div><h3>Biblioteca de animaciones</h3><p>{clips.length?`${clips.length} movimientos encontrados`:'Los movimientos de tu modelo aparecerán aquí'}</p></div></div><span className="counter">{clips.length.toString().padStart(2,'0')}</span></div>
              {clips.length?<><div className="clips-list">{clips.map(clip=><button className={`clip-row ${activeClip===clip.index?'active':''}`} key={`${clip.index}-${clip.name}`} onClick={()=>chooseClip(clip.index)}><div className="clip-play"><Play size={14} fill={activeClip===clip.index?'currentColor':'none'}/></div><span className="clip-name">{clip.name}<small>{clip.source}</small></span><span className="clip-meta">{clip.duration.toFixed(1)} s</span>{activeClip===clip.index&&<span className="playing-pill">ACTIVA</span>}</button>)}</div><div className="player-controls"><button className="play-btn" onClick={togglePlay} aria-label={playing?'Pausar animación':'Reproducir animación'}>{playing?<Pause size={18} fill="currentColor"/>:<Play size={18} fill="currentColor"/>}</button><div className="now-playing"><small>{playing?'REPRODUCIENDO':'EN PAUSA'}</small><strong>{activeClip!==null?clips[activeClip]?.name:'Selecciona un movimiento'}</strong></div><label className="speed-label">Velocidad <select value={speed} onChange={changeSpeed}><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label></div></>:<div className="no-animation"><div className="no-animation-icon"><Film size={22}/></div><div><strong>{model?'Este modelo no incluye animaciones':'Sin animaciones todavía'}</strong><p>{model?.format==='VRM'?'El VRM puede ser estático. Si tiene animaciones integradas, aparecerán aquí.':model?'Puedes inspeccionar el modelo o agregar animaciones del mismo esqueleto.':'Carga un personaje animado para reproducir sus movimientos.'}</p></div></div>}
              <MotionExtractor model={model} clips={clips} activeClip={activeClip}
                busy={busy} onExportRig={exportCleanFBX}
                onSaveClip={saveExtractedClip}
                onDownloadRigDiagnostic={downloadRigDiagnostic}/>
            </section>
          </section>
          <aside className="sidebar-panels"><section className="panel inspector-panel"><div className="panel-header"><div><div className="section-icon"><SlidersHorizontal size={19}/></div><div><h3>Inspector 3D</h3><p>Detalles de tu modelo</p></div></div></div>
            {model?<><div className="model-chip"><div className="model-symbol"><Box size={23}/></div><div><strong title={model.filename}>{model.filename}</strong><span>{model.format} · {formatBytes(model.bytes)}</span></div><CheckCircle2 size={17} className="success-ic"/></div><div className="tab-bar"><button className={inspectorTab==='stats'?'active':''} onClick={()=>setInspectorTab('stats')}>Composición</button><button className={inspectorTab==='tree'?'active':''} onClick={()=>setInspectorTab('tree')}>Estructura</button></div>{inspectorTab==='stats'?<div className="stats-grid"><Stat icon={Box} label="Mallas" value={number(model.meshes)}/><Stat icon={Grid2X2} label="Triángulos" value={number(model.triangles)}/><Stat icon={Layers3} label="Materiales" value={number(model.materials)}/><Stat icon={Boxes} label="Texturas" value={number(model.textures)}/><Stat icon={Activity} label="Huesos" value={number(model.bones)}/><Stat icon={Film} label="Animaciones" value={number(clips.length)}/><Stat icon={Eye} label="Nodos" value={number(model.nodes)}/><Stat icon={ScanEye} label="Vértices" value={number(model.vertices)}/></div>:<div className="tree-list">{model.hierarchy.map((node,index)=><div key={index} className="tree-node" style={{paddingLeft:`${Math.min(node.depth,7)*12+8}px`}}><span className="tree-mark">{node.type==='Bone'?'◇':'▸'}</span><span title={node.name}>{node.name}</span><small>{node.type}</small></div>)}{model.nodes>180&&<div className="tree-more">Mostrando los primeros 180 nodos de {model.nodes}.</div>}</div>}</>:<div className="inspector-empty"><Boxes size={32}/><strong>Aún no hay modelo</strong><p>La composición y estructura aparecerán al cargar un archivo.</p></div>}</section>
          <LivingPresenceLab key={'lp-'+modelGeneration} model={model} generation={modelGeneration} getViewer={getViewer} activeClip={activeClip} voiceQARef={voiceQARef} onVoiceQAState={setVoiceQAState}/>
          <TextureStudio key={modelGeneration} model={model} materials={textureMaterials} busy={busy} onApply={applyTexture} onBatch={batchTexture} onUndo={undoTexture} canUndo={canUndoTextures} onCapture={id=>viewer.current.captureMaterialViews(id)}/>
          <section className="panel integrate-panel"><div className="panel-header"><div><div className="section-icon mint"><FilePlus2 size={19}/></div><div><h3>Integrar movimientos</h3><p>Animaciones externas del mismo rig</p></div></div></div><div className="compat-note"><ShieldCheck size={17}/><span>{model?.format==='VRM'?'VRM: los movimientos se pueden guardar como GLB estándar aproximado (no como VRM).':'Solo FBX del mismo esqueleto y jerarquía del personaje. No realiza rigging ni retargeting.'}</span></div><button className="outline-btn" onClick={()=>animationInput.current?.click()} disabled={!model||!!busy}><FilePlus2 size={16}/> Añadir animaciones FBX</button>{importResults.length>0&&<div className="results-list">{importResults.map((item,index)=><div key={`${item.name}-${index}`} className={item.ok?'ok':'fail'}>{item.ok?<CheckCircle2 size={15}/>:<XCircle size={15}/>}<span><strong>{item.name}</strong><small>{item.ok?`${item.count} animación(es) añadida(s)`:item.reason}</small>{item.ok&&item.warning&&<small>{item.warning}</small>}</span></div>)}</div>}
            {model?.format==='VRM'&&<label className="vrm-export-warning" style={{display:'flex',alignItems:'flex-start',gap:9,margin:'10px 0',fontSize:12,lineHeight:1.6,color:'#c6d3e4',cursor:'pointer'}}><input type="checkbox" checked={allowVrmExport} onChange={event=>setAllowVrmExport(event.target.checked)} style={{accentColor:'#48d9cb',marginTop:3,flexShrink:0}}/><span>Entiendo que descargaré un <strong>GLB estándar aproximado</strong>, no un VRM. Materiales MToon, expresiones, física y desplazamientos omitidos pueden perderse.</span></label>}
            <label style={{display:'block',fontSize:12,color:'#c6d3e4',margin:'8px 0'}}>Formato final
              <select value={finalFormat} onChange={e=>setFinalFormat(e.target.value)} style={{display:'block',width:'100%',marginTop:6,padding:9,borderRadius:8,background:'#17273b',color:'#e1f3fa',border:'1px solid #315064'}}>
                <option value="glb">GLB — descarga directa</option>
                <option value="fbx">FBX binario directo — beta</option>
                <option value="vrm" disabled>VRM + VRMA — pendiente (formato separado)</option>
              </select>
            </label>
            <button className="export-btn" onClick={exportModel} disabled={!model||(finalFormat==='fbx'&&!clips.length)||(model.format==='VRM'&&!allowVrmExport)||!!busy}><Download size={17}/>{finalFormat==='fbx'?' Exportar FBX animado directo (beta)':model?.format==='VRM'?' Exportar GLB estándar (aproximado)':clips.length?' Exportar GLB integrado':' Exportar GLB con materiales'}</button>
            <div className="small-note">{finalFormat==='fbx'?'FBX experimental: vuelve a abrirlo y comprueba la integridad de todos sus clips en Blender y Mixamo.':'Se genera una copia nueva. Tu modelo original nunca se modifica.'}</div></section>
          <LightPrep model={model} meshes={lightMeshes} boneCount={lightBoneCount} busy={busy} onExport={prepareLight} onExportFBX={prepareLightFBX} onPreview={previewLight} onScript={downloadScript}/>
          <button className="help-card" onClick={()=>setShowTutorial(true)}><div><span className="eyebrow">¿PRIMERA VEZ AQUÍ?</span><strong>Una guía para crear sin límites.</strong><small>Descubre cómo preparar animaciones con Mixamo y probarlas aquí.</small><span className="help-link">Ver tutorial <ChevronRight size={14}/></span></div><Sparkles size={28}/></button>
          </aside>
        </div>
        <footer className="footer"><span>© 2026 ORBI ECOSYSTEM · MOTION STUDIO</span><span><span className="live-dot"/> Hecho para explorar. Diseñado para crear.</span></footer>
      </main>
    </div>
    <input ref={fileInput} type="file" multiple accept=".glb,.gltf,.fbx,.vrm,.bin,.png,.jpg,.jpeg,.webp,.ktx2" hidden onChange={e=>{openFiles(Array.from(e.target.files));e.target.value='';}}/>
    <input ref={animationInput} type="file" multiple accept=".fbx" hidden onChange={e=>{importAnimations(Array.from(e.target.files));e.target.value='';}}/>
    {showTutorial&&<Tutorial onClose={()=>setShowTutorial(false)}/>}
  </div>;
}
