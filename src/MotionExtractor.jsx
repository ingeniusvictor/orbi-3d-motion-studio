import {useState} from 'react';
import {Download,Film,ShieldCheck} from 'lucide-react';

// MOTION-05A controls remain beside the Animation Library, never in the
// sprawling right-side inspector. The live rig/clips are never deleted.
export default function MotionExtractor({model,clips=[],activeClip,busy,onExportRig,onSaveClip}){
  const [pose,setPose]=useState('reference');
  if(!model)return null;
  const eligible=(model.format==='FBX'||model.format==='GLB'||model.format==='GLTF');
  const rigged=Number(model.bones)>0&&Number(model.meshes)>0;
  return <details className="motion-extractor">
    <summary><Film size={15}/> MOTION-05 · Extraer animaciones y preparar FBX para Mixamo</summary>
    <div className="motion-extractor-content">
      <p>Genera una <strong>copia FBX riggeada sin animaciones</strong>.
        La opción recomendada conserva la pose de referencia del archivo:
        si ya está en A, se mantiene en A sin exigir nombres de brazo.
        Calibrar A o T es opcional y requiere identificar las articulaciones.</p>
      <label className="motion-extractor-pose">Pose de exportación
        <select value={pose} onChange={e=>setPose(e.target.value)}
          disabled={Boolean(busy)||!eligible||!rigged}>
          <option value="reference">Pose original — conserva A/T sin mover huesos (recomendado)</option>
          <option value="a">Pose A calibrada — brazos 35° hacia abajo</option>
          <option value="t">Pose T calibrada — brazos horizontales</option>
        </select>
      </label>
      <div className="motion-extractor-actions">
        <button className="outline-btn" type="button"
          disabled={Boolean(busy)||!eligible||!rigged}
          onClick={()=>onExportRig({pose})}>
          <Download size={14}/> Exportar FBX limpio
        </button>
        <button className="outline-btn" type="button"
          disabled={Boolean(busy)||activeClip===null||!clips[activeClip]}
          onClick={()=>onSaveClip(activeClip)}>
          <Download size={14}/> Guardar clip seleccionado
        </button>
      </div>
      {!eligible&&<p>El exportador directo MOTION-05A admite FBX/GLB riggeados.
        Para VRM mantenemos el flujo de conversión controlada existente.</p>}
      {eligible&&!rigged&&<p>Este archivo no tiene mallas riggeadas verificables.
        No se generará un supuesto FBX preparado para Mixamo.</p>}
      <small><ShieldCheck size={13}/> El archivo FBX limpio conserva el rig y
        elimina los clips. Si eliges A/T calibrada y el esqueleto no se reconoce,
        no se fuerza una postura deformada: usa la pose original.
        El JSON de cada clip conserva sus curvas para futura reimportación ORBI,
        pero no es un FBX de animación que Mixamo acepte.</small>
    </div>
  </details>;
}
