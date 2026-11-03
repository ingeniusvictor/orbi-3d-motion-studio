import { useEffect, useMemo, useState } from 'react';
import { ImagePlus, Images, WandSparkles, ShieldCheck } from 'lucide-react';
import { TEXTURE_CHANNELS, inferTextureChannel, isTextureFile, suggestTextureMatches } from './lib/textureStudio.js';
const selectStyle={width:'100%',minWidth:0,background:'#17273b',color:'#deedf9',border:'1px solid #315064',borderRadius:7,padding:9,fontSize:12};

export default function TextureStudio({model,materials,busy,onApply,onAuto}){
  const [files,setFiles]=useState([]);
  const [materialId,setMaterialId]=useState('');
  const [channel,setChannel]=useState('map');
  const [fileIndex,setFileIndex]=useState(0);
  const [working,setWorking]=useState(false);
  const [details,setDetails]=useState(false);
  useEffect(()=>{
    if(!materials.some(x=>x.id===materialId))setMaterialId(materials[0]?.id||'');
  },[materials,materialId]);
  const suggestions=useMemo(()=>suggestTextureMatches(files,materials),[files,materials]);
  const unsupported=materials.filter(x=>!x.hasUV).length;
  const loadFiles=event=>{
    const list=Array.from(event.target.files||[]);
    const valid=list.filter(isTextureFile);
    const distinct=new Map(valid.map(f=>[f.name+'-'+f.size,f]));
    setFiles([...distinct.values()].slice(0,60));
    setFileIndex(0);
    event.target.value='';
  };
  const applyOne=async()=>{
    const f=files[fileIndex];
    if(!f||!materialId)return;
    setWorking(true);
    try{await onApply(f,materialId,channel);}
    finally{setWorking(false);}
  };
  const applyAll=async()=>{
    if(!suggestions.length)return;
    setWorking(true);
    try{await onAuto(files,suggestions);}
    finally{setWorking(false);}
  };
  const disabled=Boolean(busy)||working;
  return <section className="panel" style={{padding:16,marginBottom:14}}>
    <div style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:13}}>
      <div className="section-icon mint"><Images size={19}/></div>
      <div><h3 style={{margin:'0 0 4px',fontSize:16}}>Texturas externas</h3>
        <p style={{margin:0,fontSize:12,color:'#9bb6ca',lineHeight:1.5}}>Da color y detalle a modelos FBX, GLB o VRM con imágenes independientes.</p></div>
    </div>
    <label className="outline-btn" style={{display:'flex',alignItems:'center',gap:8,justifyContent:'center',cursor:model&&!disabled?'pointer':'not-allowed',opacity:model&&!disabled?1:0.5}}>
      <ImagePlus size={17}/> Elegir imágenes (PNG, JPG o WebP)
      <input type="file" accept=".png,.jpg,.jpeg,.webp" multiple disabled={!model||disabled} onChange={loadFiles} style={{display:'none'}}/>
    </label>
    {model?<>
      <p style={{fontSize:11,color:'#91b6c5',margin:'10px 0'}}>{materials.length} materiales encontrados · {files.length} imágenes seleccionadas{unsupported?' · '+unsupported+' sin UV':''}</p>
      {files.length>0&&<div style={{maxHeight:115,overflowY:'auto',marginBottom:10,fontSize:11,color:'#c6ddeb',padding:'8px 10px',border:'1px solid #24415b',borderRadius:8}}>
        {files.map((file,i)=><div key={file.name+'-'+i} style={{marginBottom:4,overflowWrap:'anywhere'}}>
          {file.name} <span style={{color:'#8baaba'}}>· {TEXTURE_CHANNELS.find(x=>x.key===inferTextureChannel(file.name))?.label}</span>
        </div>)}
      </div>}
      {suggestions.length>0&&<button className="outline-btn" type="button" disabled={disabled} onClick={applyAll} style={{marginBottom:10}}>
        <WandSparkles size={16}/> Asociar {suggestions.length} imágenes sugeridas
      </button>}
      <div style={{display:'grid',gap:8,marginBottom:10}}>
        <label style={{display:'grid',gap:5,fontSize:11,color:'#c6d8e8'}}>Material
          <select value={materialId} onChange={e=>setMaterialId(e.target.value)} disabled={disabled||!materials.length} style={selectStyle}>
            {materials.map(m=><option value={m.id} key={m.id}>{m.name} ({m.meshes} mallas){!m.hasUV?' · SIN UV':''}</option>)}
          </select>
        </label>
        <label style={{display:'grid',gap:5,fontSize:11,color:'#c6d8e8'}}>Canal de textura
          <select value={channel} onChange={e=>setChannel(e.target.value)} disabled={disabled} style={selectStyle}>
            {TEXTURE_CHANNELS.map(x=><option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
        </label>
        <label style={{display:'grid',gap:5,fontSize:11,color:'#c6d8e8'}}>Imagen
          <select value={fileIndex} onChange={e=>setFileIndex(Number(e.target.value))} disabled={disabled||!files.length} style={selectStyle}>
            {files.length?files.map((f,i)=><option value={i} key={i}>{f.name}</option>):<option value={0}>Selecciona imágenes primero</option>}
          </select>
        </label>
      </div>
      <button className="export-btn" type="button" disabled={!files.length||!materialId||disabled} onClick={applyOne}>
        <ImagePlus size={16}/> Aplicar al personaje
      </button>
      <details open={details} onToggle={event=>setDetails(event.currentTarget.open)} style={{marginTop:10,color:'#b5cedd',fontSize:12}}>
        <summary style={{cursor:'pointer',fontWeight:600}}>Ver materiales y tutorial</summary>
        <div style={{marginTop:10,maxHeight:160,overflowY:'auto'}}>
          {materials.map(m=><div key={m.id} style={{padding:'6px 0',borderBottom:'1px solid #22394e'}}>
            <strong style={{overflowWrap:'anywhere'}}>{m.name}</strong>
            <div style={{fontSize:11,color:'#91acbd'}}>{m.meshNames.join(', ')} · {m.hasUV?'UV disponible':'Sin coordenadas UV'}{m.channels.length?' · '+m.channels.join(', '):''}</div>
          </div>)}
        </div>
        <p style={{fontSize:11,lineHeight:1.6,color:'#a7c0d4'}}>1. Carga el personaje. 2. Elige sus archivos de imagen. 3. Usa la asociación sugerida por nombres o asigna manualmente material, canal e imagen. 4. Revisa el resultado en el visor. 5. Exporta un GLB estándar con las imágenes incluidas. Un modelo sin UV necesita mapeado en un editor 3D. Para ZIP, TGA, PSD o DDS, extrae o convierte primero a PNG/JPG; la importación de ZIP no está habilitada. Para conservar imágenes dentro del archivo final, exporta GLB: el FBX directo continúa en beta y puede necesitar archivos de textura aparte.</p>
      </details>
    </>:<p style={{fontSize:12,color:'#8da9bb',marginTop:9}}>Carga un modelo para habilitar los materiales.</p>}
    <div style={{marginTop:12,display:'flex',gap:7,fontSize:11,lineHeight:1.5,color:'#91b7bc'}}><ShieldCheck size={15} style={{flexShrink:0}}/> Las imágenes se procesan localmente; el original no se modifica. VRM conserva sus materiales especiales mientras se visualiza.</div>
  </section>;
}
