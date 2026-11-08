import {useEffect,useState} from 'react';
import {isKnownMintSplitRig,suggestedAccessoryMode,suggestedPoseMode,accessoryModeLabel} from './lib/motionExportModes.js';
import {Download,Film,ShieldCheck} from 'lucide-react';

// MOTION-05A controls remain beside the Animation Library, never in the
// sprawling right-side inspector. The live rig/clips are never deleted.
export default function MotionExtractor({model,clips=[],activeClip,busy,onExportRig,onSaveClip,onDownloadRigDiagnostic}){
  const [pose,setPose]=useState(()=>suggestedPoseMode(model));
  const [orientation,setOrientation]=useState(()=>isKnownMintSplitRig(model)?'upright':'keep');
  const [accessoryHandling,setAccessoryHandling]=useState(()=>
    suggestedAccessoryMode(model));
  const knownMint=isKnownMintSplitRig(model);
  useEffect(()=>{
    // Initial selection is a *visible recommendation* only, not a mutation.
    // The actual lossy copy is generated solely after pressing Export.
    setAccessoryHandling(suggestedAccessoryMode(model));
    setPose(suggestedPoseMode(model));
    setOrientation(isKnownMintSplitRig(model)?'upright':'keep');
  },[model?.filename,model?.meshes,model?.bones]);
  if(!model)return null;
  const eligible=(model.format==='FBX'||model.format==='GLB'||model.format==='GLTF');
  const rigged=Number(model.bones)>0&&Number(model.meshes)>0;
  return <details className="motion-extractor">
    <summary><Film size={15}/> MOTION-05E.1 · Extraer animaciones y preparar FBX para Mixamo</summary>
    <div className="motion-extractor-content">
      <p>Genera una <strong>copia FBX riggeada sin animaciones</strong>.
        Un archivo FBX puede abrir en un fotograma de animación, no en su pose
        neutral. Para Mint recomendamos reconstruir la <strong>pose de bind</strong>
        desde las matrices inversas del esqueleto; no se garantiza que sea T/A.
        Calibrar A o T sigue siendo opcional si el rig permite reconocer brazos.</p>
      <label className="motion-extractor-pose">Pose de exportación
        <select value={pose} onChange={e=>setPose(e.target.value)}
          disabled={Boolean(busy)||!eligible||!rigged}>
          <option value="bind">Pose de bind real — compensar transformaciones FBX de padres y recuperar el esqueleto (Mint)</option>
          <option value="reference">Pose al abrir el FBX — puede contener un fotograma animado</option>
          <option value="a">Pose A calibrada — brazos 35° hacia abajo</option>
          <option value="t">Pose T calibrada — brazos horizontales</option>
        </select>
      </label>
      {knownMint&&pose==='reference'&&<p>
        <strong>Atención:</strong> la captura de Mint mostró una postura
        acrobática. «Pose al abrir» puede reproducir ese mismo fotograma.
        Prueba «Pose de bind real» para recuperar el reposo óseo antes de exportar.
      </p>}
      {knownMint&&<p>
        <strong>Mint Swimsuit detectado: dos rigs reales (cuerpo y lazo ChestBow).</strong>
        {' '}La opción estricta repetirá el error de «root». Para conservar
        visualmente el lazo en el FBX de Mixamo, utiliza <strong>lazo rígido</strong>
        (seleccionado como sugerencia). Esto quita su animación flexible
        solo de la copia exportada.
      </p>}
      <label className="motion-extractor-pose">Orientación física del FBX
        <select value={orientation} onChange={e=>setOrientation(e.target.value)}
          disabled={Boolean(busy)||!eligible||!rigged}>
          <option value="upright">Enderezar personaje físicamente (eje cabeza-pelvis hacia Y)</option>
          <option value="keep">Conservar orientación original del FBX</option>
        </select>
      </label>
      <small>La orientación física modifica solo la copia exportada:
        gira cuerpo, cabello y accesorios juntos alrededor del personaje,
        sin cambiar la bind pose, los pesos del skin ni el FBX original.
        El proceso se bloquea si la rotación de las mallas no se puede verificar.</small>
      <label className="motion-extractor-pose">Accesorios con esqueleto independiente
        <select value={accessoryHandling}
          onChange={e=>setAccessoryHandling(e.target.value)}
          disabled={Boolean(busy)||!eligible||!rigged}>
          <option value="strict">Conservar todos los rigs (bloquea esqueletos diferentes)</option>
          <option value="rigid">Mixamo: conservar accesorio como malla rígida en el pecho</option>
          <option value="exclude">Mixamo: exportar solo cuerpo, sin accesorio auxiliar</option>
        </select>
      </label>
      {accessoryHandling!=='strict'&&<small>
        Preparación experimental exclusiva de la COPIA exportada:
        {accessoryHandling==='rigid'
          ?' el lazo se congela en su forma actual y acompaña al torso; perderá su flexibilidad y animación propias.'
          :' el accesorio se omite del FBX para Mixamo; el archivo original conserva todas sus piezas.'}
        Solo se aplica a un accesorio identificado con rig separado, nunca al cuerpo.
      </small>}
      <small>Preparación seleccionada: <strong>{accessoryModeLabel(accessoryHandling)}</strong>.
        El FBX original no será modificado.</small>
      <div className="motion-extractor-actions">
        <button className="outline-btn" type="button"
          disabled={Boolean(busy)||!eligible||!rigged}
          onClick={()=>onExportRig({pose,accessoryHandling,orientation})}>
          <Download size={14}/> {accessoryHandling==='rigid'?'Exportar FBX con lazo rígido':
            accessoryHandling==='exclude'?'Exportar FBX solo cuerpo':'Exportar FBX (validación estricta)'}
        </button>
        <button className="outline-btn" type="button"
          disabled={Boolean(busy)||activeClip===null||!clips[activeClip]}
          onClick={()=>onSaveClip(activeClip)}>
          <Download size={14}/> Guardar clip seleccionado
        </button>
        <button className="outline-btn" type="button"
          disabled={Boolean(busy)||!eligible||!rigged}
          onClick={onDownloadRigDiagnostic}
          title="Guarda un reporte local de huesos y transformaciones para investigar errores de exportación">
          <Download size={14}/> Descargar diagnóstico del rig
        </button>
      </div>
      {!eligible&&<p>El exportador directo MOTION-05A admite FBX/GLB riggeados.
        Para VRM mantenemos el flujo de conversión controlada existente.</p>}
      {eligible&&!rigged&&<p>Este archivo no tiene mallas riggeadas verificables.
        No se generará un supuesto FBX preparado para Mixamo.</p>}
      <small><ShieldCheck size={13}/> Auditoría MOTION-05E: al reimportar
        el FBX se comprueban mallas, triángulos, materiales, morph targets
        y cobertura espacial de las superficies. Si aparece un hueco,
        desplazamiento o pérdida importante, se bloquea la descarga.</small>
      <small><ShieldCheck size={13}/> El diagnóstico se guarda únicamente en
        tu equipo. Incluye nombres, jerarquías y transformaciones de huesos;
        NO incluye geometría, texturas ni animaciones. Compártelo solo si deseas
        que revisemos las diferencias entre mallas.</small>
      <small><ShieldCheck size={13}/> En el modo lazo rígido, se conservan
        nodos de organización y piezas estáticas adicionales de la armadura
        auxiliar cuando pasan la verificación de posición y orientación.
        Los objetos con otros rigs o dependencias desconocidas siguen bloqueados.</small>
      <small><ShieldCheck size={13}/> El archivo FBX limpio conserva el rig y
        elimina los clips. «Pose de bind» recupera las matrices originales
        de skin, pero solo será neutral si el FBX dispone de una bind pose
        neutral. Si eliges A/T calibrada y el esqueleto no se reconoce,
        no se fuerza una postura deformada: usa la pose original.
        El JSON de cada clip conserva sus curvas para futura reimportación ORBI,
        pero no es un FBX de animación que Mixamo acepte.</small>
    </div>
  </details>;
}
