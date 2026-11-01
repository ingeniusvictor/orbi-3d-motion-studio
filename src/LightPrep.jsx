import { useEffect, useMemo, useState } from 'react';
import { Download, FileCode2, ShieldCheck, BookOpen, Layers3 } from 'lucide-react';
import { suggestLightMeshes } from './lib/lightweight.js';

export default function LightPrep({ model, meshes, busy, onExport, onScript }) {
  const [checked,setChecked]=useState([]);
  const [showAll,setShowAll]=useState(false);
  useEffect(()=> {
    setChecked(suggestLightMeshes(meshes));
    setShowAll(false);
  },[meshes]);
  const chosen=useMemo(()=>new Set(checked),[checked]);
  const selectedCount=meshes.filter(mesh=>chosen.has(mesh.id)).length;
  const visible=showAll?meshes:meshes.slice(0,9);
  return <section className="panel" style={{padding:'18px',marginTop:16}}>
    <div style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:12}}>
      <Layers3 size={20} color="#53dfcf" style={{flexShrink:0,marginTop:4}}/>
      <div><h3 style={{fontSize:16,margin:'0 0 4px'}}>Preparar versión ligera para Mixamo</h3>
        <p style={{margin:0,fontSize:12,color:'#98aeca',lineHeight:1.6}}>Una copia corporal sin texturas ni animaciones, conservando los huesos del personaje. El original no cambia.</p></div>
    </div>
    {model && !meshes.length && <p style={{fontSize:12,color:'#e3b7ad'}}>Este archivo no contiene una malla SkinnedMesh utilizable. La preparación requiere un modelo ya riggeado con malla vinculada a huesos.</p>}
    {model && meshes.length>0 && <>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:7,color:'#b7cce2'}}>
        <strong>Mallas corporales que conservar</strong><span>{selectedCount} / {meshes.length}</span>
      </div>
      <div style={{maxHeight:250,overflowY:'auto',border:'1px solid #274057',borderRadius:9,padding:'6px 9px',marginBottom:10}}>
        {visible.map(mesh=><label key={mesh.id} style={{display:'flex',alignItems:'center',gap:7,cursor:'pointer',fontSize:12,padding:'6px 0',color:'#dceaf6'}}>
          <input type="checkbox" checked={chosen.has(mesh.id)} onChange={e=>setChecked(current=>e.target.checked?[...current,mesh.id]:current.filter(id=>id!==mesh.id))} style={{accentColor:'#46d8c8'}}/>
          <span style={{overflowWrap:'anywhere',flex:1}}>{mesh.name}</span>
          <small style={{color:'#8babc0'}}>{mesh.vertices.toLocaleString('es-CL')} v.</small>
        </label>)}
        {meshes.length>9 && <button className="subtle-btn" type="button" onClick={()=>setShowAll(v=>!v)}>{showAll?'Ver menos':'Ver las '+meshes.length+' mallas'}</button>}
      </div>
      <p style={{fontSize:11,color:'#9fb4c8',lineHeight:1.55}}>La selección inicial es orientativa. Si una malla es cabello, ropa u otro accesorio, desmárcala; conserva cuerpo y rostro. Se comprueba que el GLB mantiene todos los huesos del skin antes de descargarlo.</p>
      <button className="export-btn" type="button" disabled={Boolean(busy)||!selectedCount} onClick={()=>onExport(checked)}>
        <Download size={16}/> Descargar GLB corporal ligero
      </button>
    </>}
    <button className="outline-btn" type="button" style={{marginTop:9}} disabled={Boolean(busy)} onClick={onScript}>
      <FileCode2 size={16}/> Descargar conversor GLB → FBX
    </button>
    <details style={{marginTop:13,padding:'10px 8px',border:'1px solid #244057',borderRadius:9,color:'#ccddeb'}}>
      <summary style={{cursor:'pointer',fontSize:13,fontWeight:700,display:'flex',alignItems:'center',gap:8}}>
        <BookOpen size={16}/> Tutorial completo: de tu modelo a Mixamo
      </summary>
      <ol style={{fontSize:12,lineHeight:1.8,paddingLeft:21,color:'#b9cddd',margin:'10px 0'}}>
        <li><strong>Conserva una copia original.</strong> Abre el VRM, GLB o FBX completo en ORBI; no necesitas borrar su cabello manualmente.</li>
        <li><strong>Prepara el cuerpo ligero.</strong> En la lista, marca las mallas del cuerpo y rostro. Desmarca cabello, ropa y accesorios si están separados. Descarga el GLB ligero sin animaciones.</li>
        <li><strong>Comprueba el rig.</strong> Abre el GLB ligero en ORBI: debe mostrar una malla corporal y los huesos originales. Anota el número real de huesos; no todos los personajes tienen 155.</li>
        <li><strong>Convierte a FBX con Blender gratuito.</strong> Descarga el script de este panel, instala Blender y ejecuta <code>blender --background --python orbi-convert-fbx.py -- "personaje-orbi-mixamo.glb"</code> en la carpeta de los archivos. Para el GLB ligero se exporta sin animaciones.</li>
        <li><strong>Alternativa visual en Blender.</strong> File → Import → glTF 2.0, selecciona el GLB; File → Export → FBX. Incluye Mesh y Armature. Desactiva Add Leaf Bones y Bake Animation. Exporta el archivo FBX binario.</li>
        <li><strong>Usa Mixamo.</strong> En <a href="https://www.mixamo.com/" target="_blank" rel="noreferrer">mixamo.com</a>, sube el FBX generado. Si ya está riggeado, comprueba su mapeo; no vuelvas a riggearlo si Mixamo lo reconoce.</li>
        <li><strong>Descarga movimientos.</strong> Sin cambiar de personaje, descarga Idle, Thinking, Walk u otros movimientos como FBX, preferentemente Without Skin.</li>
        <li><strong>Regresa a ORBI.</strong> Abre el personaje ORIGINAL completo, no el ligero. Añade los FBX en «Integrar movimientos», reproduce cada clip y comprueba caderas, brazos, piernas y cabeza.</li>
        <li><strong>Guarda el resultado.</strong> Exporta GLB integrado. Para un FBX final con animaciones, vuelve a ejecutar el script con <code>--with-animations</code> después del nombre del GLB. Verifica en Blender que se exportaron las acciones; para Mixamo NO uses esa opción. Para volver a VRM, se requiere un editor con <a href="https://vrm-addon-for-blender.info/en-us/" target="_blank" rel="noreferrer">VRM Add-on</a> y reconstruir/validar sus propiedades específicas; no equivale a renombrar el GLB.</li>
      </ol>
      <p style={{fontSize:11,color:'#9eb6c9',margin:0}}>ORBI no realiza rigging ni exportación FBX/VRM nativa. El script convierte con Blender. La geometría ligera puede no ser aceptada por Mixamo si no presenta un cuerpo humanoide adecuado; verifica siempre el resultado.</p>
    </details>
    <div style={{display:'flex',gap:7,alignItems:'flex-start',marginTop:11,fontSize:11,lineHeight:1.5,color:'#9bb5ca'}}><ShieldCheck size={15} style={{flexShrink:0}}/> Procesamiento local. Tus originales permanecen intactos.</div>
  </section>;
}
