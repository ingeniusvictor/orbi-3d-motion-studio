import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ArrowDownToLine, Box, Boxes, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Clock3, Download, Eye, FilePlus2, FileUp, Film, FolderOpen, Grid2X2, Info, Layers3, Menu, MousePointer2, Pause, Play, RotateCcw, ScanEye, ShieldCheck, SlidersHorizontal, Sparkles, UploadCloud, X, XCircle } from 'lucide-react';
import { MotionViewer } from './lib/viewer.js';
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
    <div className="file-hint">GLB · GLTF · FBX <span>—</span> Sin cuentas, sin subir archivos</div>
  </div>;
}
function Tutorial({onClose}) {
  return <div className="modal-backdrop" onMouseDown={e => {if(e.target===e.currentTarget)onClose();}}>
    <section className="modal" role="dialog" aria-modal="true" aria-label="Guía de ORBI Motion Studio">
      <header className="modal-header"><div><div className="eyebrow">GUÍA RÁPIDA</div><h2>Empieza a crear movimiento.</h2></div><button className="icon-btn" onClick={onClose} aria-label="Cerrar"><X size={21}/></button></header>
      <p className="modal-lead">ORBI Motion Studio es un visualizador e integrador básico. No necesitas aprender modelado 3D para explorar tus creaciones.</p>
      <div className="tutorial-list">
        <div><span className="step-num">01</span><div><strong>Carga tu modelo</strong><p>Selecciona un .glb, .gltf o .fbx. Si utilizas .gltf con archivos externos, incluye también los .bin y las texturas en la selección.</p></div></div>
        <div><span className="step-num">02</span><div><strong>Explora e inspecciona</strong><p>Gira con el ratón, acerca con la rueda y desplázate con el botón derecho. Revisa las mallas, materiales, huesos y la jerarquía.</p></div></div>
        <div><span className="step-num">03</span><div><strong>Reproduce sus animaciones</strong><p>Si el modelo contiene movimientos, elige uno en el panel «Animaciones». Puedes pausarlo y ajustar la velocidad.</p></div></div>
        <div><span className="step-num">04</span><div><strong>Opcional: nuevos movimientos desde Mixamo</strong><p>Prepara tu personaje en Blender/Mixamo, descarga un personaje base riggeado y nuevas animaciones FBX del mismo esqueleto (preferiblemente «Without Skin»). Carga aquí el mismo personaje base y después los movimientos. No se admite rigging ni retargeting de esqueletos distintos.</p></div></div>
        <div><span className="step-num">05</span><div><strong>Exporta un GLB integrado</strong><p>Descarga una copia nueva con las animaciones. Tu archivo original permanece intacto. Verificamos que el GLB generado se pueda volver a abrir.</p></div></div>
      </div>
      <div className="tutorial-warning"><ShieldCheck size={18}/><span>La compatibilidad exige la misma jerarquía y nombres de huesos. Si hay diferencias, la aplicación rechazará la integración. Para editar huesos utiliza Blender.</span></div>
      <div className="modal-footer"><a href="https://www.mixamo.com/" target="_blank" rel="noreferrer">Abrir Mixamo ↗</a><button className="primary-btn" onClick={onClose}>Entendido</button></div>
    </section>
  </div>;
}
function Stat({icon:Icon,label,value}) {return <div className="stat"><div className="stat-icon"><Icon size={17}/></div><div><span>{label}</span><strong>{value}</strong></div></div>;}
export default function App() {
  const mountRef = useRef(null), viewer = useRef(null), fileInput = useRef(null), animationInput = useRef(null);
  const [model, setModel] = useState(null);
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
  const [dragging,setDragging] = useState(false);
  const [mobilePanel,setMobilePanel] = useState(false);
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
    setBusy('Abriendo modelo…');setNotice(null);setImportResults([]);
    try {
      const info = await viewer.current.open(files);
      if (info) { setModel(info);syncPlayer();setNotice({type:'success',text:`${info.filename} cargado correctamente.`}); }
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
  const exportModel = async () => {
    if(!viewer.current || !model) return;
    setBusy('Generando y verificando GLB…');setNotice(null);
    try {
      const result = await viewer.current.exportGLB();
      setNotice({type:'success',text:`${result.filename} · ${result.size} · ${result.animations} animaciones. Descarga iniciada.`});
    } catch(error) {setNotice({type:'error',text:`No se pudo exportar: ${error.message||error}`});}
    finally {setBusy('');}
  };
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
              <div className="viewer-toolbar"><div className="viewport-title"><span className="viewport-led"/> VISOR 3D <span className="viewer-divider">/</span> <span>{model?'MODELO CARGADO':'ESCENA VACÍA'}</span></div><div className="viewer-actions"><button className={grid?'toolbar-btn on':'toolbar-btn'} onClick={toggleGrid} title="Mostrar cuadrícula" aria-label="Cuadrícula"><Grid2X2 size={17}/></button><button className={wireframe?'toolbar-btn on':'toolbar-btn'} onClick={toggleWireframe} title="Vista de malla" aria-label="Vista de malla"><Layers3 size={17}/></button><button className={showBones?'toolbar-btn on':'toolbar-btn'} onClick={toggleBones} title="Visualizar esqueleto" aria-label="Visualizar esqueleto"><Activity size={17}/></button><button className="toolbar-btn" onClick={()=>viewer.current?.resetCamera()} title="Restablecer cámara" aria-label="Restablecer cámara"><RotateCcw size={17}/></button></div></div>
              <div className="renderer-mount" ref={mountRef}/>
              {!model && <Intro onOpen={()=>fileInput.current?.click()}/>}
              {dragging&&<div className="drag-mask"><UploadCloud size={42}/><strong>Suelta tu archivo 3D</strong><span>Tu archivo se procesa localmente</span></div>}
              {busy&&<div className="busy-mask"><div className="loading-ring"/><strong>{busy}</strong></div>}
              <div className="viewport-bottom"><span><MousePointer2 size={13}/> Arrastrar para rotar · Rueda para zoom</span>{model&&<span className="format-chip">{model.format} · {formatBytes(model.bytes)}</span>}</div>
            </div>
            {notice&&<div className={`notice ${notice.type}`} role="status">{notice.type==='error'?<XCircle size={18}/>:<CheckCircle2 size={18}/>}<span>{notice.text}</span><button onClick={()=>setNotice(null)} aria-label="Cerrar aviso"><X size={16}/></button></div>}
            <section className="panel animation-panel"><div className="panel-header"><div><div className="section-icon"><Film size={19}/></div><div><h3>Biblioteca de animaciones</h3><p>{clips.length?`${clips.length} movimientos encontrados`:'Los movimientos de tu modelo aparecerán aquí'}</p></div></div><span className="counter">{clips.length.toString().padStart(2,'0')}</span></div>
              {clips.length?<><div className="clips-list">{clips.map(clip=><button className={`clip-row ${activeClip===clip.index?'active':''}`} key={`${clip.index}-${clip.name}`} onClick={()=>chooseClip(clip.index)}><div className="clip-play"><Play size={14} fill={activeClip===clip.index?'currentColor':'none'}/></div><span className="clip-name">{clip.name}<small>{clip.source}</small></span><span className="clip-meta">{clip.duration.toFixed(1)} s</span>{activeClip===clip.index&&<span className="playing-pill">ACTIVA</span>}</button>)}</div><div className="player-controls"><button className="play-btn" onClick={togglePlay} aria-label={playing?'Pausar animación':'Reproducir animación'}>{playing?<Pause size={18} fill="currentColor"/>:<Play size={18} fill="currentColor"/>}</button><div className="now-playing"><small>{playing?'REPRODUCIENDO':'EN PAUSA'}</small><strong>{activeClip!==null?clips[activeClip]?.name:'Selecciona un movimiento'}</strong></div><label className="speed-label">Velocidad <select value={speed} onChange={changeSpeed}><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label></div></>:<div className="no-animation"><div className="no-animation-icon"><Film size={22}/></div><div><strong>{model?'Este modelo no incluye animaciones':'Sin animaciones todavía'}</strong><p>{model?'Puedes inspeccionar el modelo o agregar animaciones del mismo esqueleto.':'Carga un personaje animado para reproducir sus movimientos.'}</p></div></div>}
            </section>
          </section>
          <aside className="sidebar-panels"><section className="panel inspector-panel"><div className="panel-header"><div><div className="section-icon"><SlidersHorizontal size={19}/></div><div><h3>Inspector 3D</h3><p>Detalles de tu modelo</p></div></div></div>
            {model?<><div className="model-chip"><div className="model-symbol"><Box size={23}/></div><div><strong title={model.filename}>{model.filename}</strong><span>{model.format} · {formatBytes(model.bytes)}</span></div><CheckCircle2 size={17} className="success-ic"/></div><div className="tab-bar"><button className={inspectorTab==='stats'?'active':''} onClick={()=>setInspectorTab('stats')}>Composición</button><button className={inspectorTab==='tree'?'active':''} onClick={()=>setInspectorTab('tree')}>Estructura</button></div>{inspectorTab==='stats'?<div className="stats-grid"><Stat icon={Box} label="Mallas" value={number(model.meshes)}/><Stat icon={Grid2X2} label="Triángulos" value={number(model.triangles)}/><Stat icon={Layers3} label="Materiales" value={number(model.materials)}/><Stat icon={Boxes} label="Texturas" value={number(model.textures)}/><Stat icon={Activity} label="Huesos" value={number(model.bones)}/><Stat icon={Film} label="Animaciones" value={number(clips.length)}/><Stat icon={Eye} label="Nodos" value={number(model.nodes)}/><Stat icon={ScanEye} label="Vértices" value={number(model.vertices)}/></div>:<div className="tree-list">{model.hierarchy.map((node,index)=><div key={index} className="tree-node" style={{paddingLeft:`${Math.min(node.depth,7)*12+8}px`}}><span className="tree-mark">{node.type==='Bone'?'◇':'▸'}</span><span title={node.name}>{node.name}</span><small>{node.type}</small></div>)}{model.nodes>180&&<div className="tree-more">Mostrando los primeros 180 nodos de {model.nodes}.</div>}</div>}</>:<div className="inspector-empty"><Boxes size={32}/><strong>Aún no hay modelo</strong><p>La composición y estructura aparecerán al cargar un archivo.</p></div>}</section>
          <section className="panel integrate-panel"><div className="panel-header"><div><div className="section-icon mint"><FilePlus2 size={19}/></div><div><h3>Integrar movimientos</h3><p>Animaciones externas del mismo rig</p></div></div></div><div className="compat-note"><ShieldCheck size={17}/><span>Solo FBX con el mismo esqueleto y jerarquía del personaje base. No realiza rigging ni retargeting.</span></div><button className="outline-btn" onClick={()=>animationInput.current?.click()} disabled={!model||!!busy}><FilePlus2 size={16}/> Añadir animaciones FBX</button>{importResults.length>0&&<div className="results-list">{importResults.map((item,index)=><div key={`${item.name}-${index}`} className={item.ok?'ok':'fail'}>{item.ok?<CheckCircle2 size={15}/>:<XCircle size={15}/>}<span><strong>{item.name}</strong><small>{item.ok?`${item.count} animación(es) añadida(s)`:item.reason}</small></span></div>)}</div>}
            <button className="export-btn" onClick={exportModel} disabled={!model||!!busy}><Download size={17}/> Exportar GLB integrado</button><div className="small-note">Tu modelo original nunca se modifica.</div></section>
          <button className="help-card" onClick={()=>setShowTutorial(true)}><div><span className="eyebrow">¿PRIMERA VEZ AQUÍ?</span><strong>Una guía para crear sin límites.</strong><small>Descubre cómo preparar animaciones con Mixamo y probarlas aquí.</small><span className="help-link">Ver tutorial <ChevronRight size={14}/></span></div><Sparkles size={28}/></button>
          </aside>
        </div>
        <footer className="footer"><span>© 2026 ORBI ECOSYSTEM · MOTION STUDIO</span><span><span className="live-dot"/> Hecho para explorar. Diseñado para crear.</span></footer>
      </main>
    </div>
    <input ref={fileInput} type="file" multiple accept=".glb,.gltf,.fbx,.bin,.png,.jpg,.jpeg,.webp,.ktx2" hidden onChange={e=>{openFiles(Array.from(e.target.files));e.target.value='';}}/>
    <input ref={animationInput} type="file" multiple accept=".fbx" hidden onChange={e=>{importAnimations(Array.from(e.target.files));e.target.value='';}}/>
    {showTutorial&&<Tutorial onClose={()=>setShowTutorial(false)}/>}
  </div>;
}
