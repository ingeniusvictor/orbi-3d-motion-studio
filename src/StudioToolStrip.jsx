import {
  Activity,AudioLines,Box,Boxes,ChevronDown,Download,Eye,
  FilePlus2,Film,Focus,Layers3,MoveUp,ShieldCheck,SlidersHorizontal,Sparkles,
  WandSparkles,X,
} from 'lucide-react';

// Single place to add tools: every feature stays in the studio, but only one
// expandable panel occupies the on-character stage at a time.
export const STUDIO_TOOLS=Object.freeze([
  {id:'face',label:'Rostro',hint:'Parpadeos, expresiones y visemas',icon:Eye},
  {id:'voice',label:'Voz',hint:'LP-03C · voz, labios y diagnóstico',icon:AudioLines},
  {id:'motion',label:'Editor',hint:'Ajustes de animación y huesos',icon:MoveUp},
  {id:'clips',label:'Clips',hint:'Reproducir y seleccionar movimientos',icon:Film},
  {id:'presence',label:'LP cuerpo',hint:'Disponibilidad LP-01/02/03 y movimiento natural',icon:Activity},
  {id:'autorig',label:'AutoRig',hint:'Rig y movimiento de huesos',icon:WandSparkles},
  {id:'retarget',label:'Mixamo',hint:'MOTION-06 · retarget de animación',icon:Sparkles},
  {id:'toelock',label:'ToeLock',hint:'MOTION-07 · preparación D162',icon:ShieldCheck},
  {id:'extract',label:'Extraer',hint:'Extraer movimiento y exportar rig limpio',icon:Boxes},
  {id:'textures',label:'Texturas',hint:'Materiales y aspecto visual',icon:Layers3},
  {id:'inspector',label:'Modelo',hint:'Composición, estructura y métricas',icon:Box},
  {id:'integrate',label:'Exportar',hint:'Unir clips y generar GLB/FBX',icon:Download},
  {id:'light',label:'Preparar',hint:'Modelo ligero y paquete para Mixamo',icon:FilePlus2},
]);
const IDs=new Set(STUDIO_TOOLS.map(t=>t.id));
export function toggleStudioTool(current,next){
  if(!IDs.has(next))return '';
  return current===next?'':next;
}
export function toolLabel(id){
  return STUDIO_TOOLS.find(t=>t.id===id)?.label||'Herramientas';
}
export default function StudioToolStrip({activeTool='',onSelect,hasModel=true,disabled=false}){
  if(!hasModel)return null;
  return <nav className="studio-tool-strip" aria-label="Herramientas desplegables sobre el personaje">
    <div className="studio-tool-strip-scroller" role="toolbar" aria-label="Herramientas 3D">
      <span className="studio-tool-strip-brand" aria-hidden="true"><Focus size={15}/></span>
      {STUDIO_TOOLS.map(tool=>{
        const Icon=tool.icon,open=activeTool===tool.id;
        return <button key={tool.id} type="button"
          className={'studio-tool-tab'+(open?' active':'')}
          title={tool.hint} aria-label={tool.label}
          aria-pressed={open}
          disabled={disabled}
          onClick={()=>onSelect(tool.id)}>
          <Icon size={16} aria-hidden="true"/>
          <span>{tool.label}</span>
          <ChevronDown size={12} className={'studio-tool-chevron'+(open?' open':'')} aria-hidden="true"/>
        </button>;
      })}
      <button type="button" className="studio-tool-close"
        title="Cerrar panel y ver personaje completo"
        aria-label="Ocultar paneles del personaje" disabled={disabled}
        onClick={()=>onSelect('')}><X size={16}/></button>
    </div>
  </nav>;
}
