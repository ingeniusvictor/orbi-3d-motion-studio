import {useState} from 'react';
import {ChevronLeft,ChevronRight,Film,X} from 'lucide-react';
import ExistingRigMotionLab from './ExistingRigMotionLab.jsx';

// Keeps the editor mounted when collapsed. Sliders, selected clip and mapping
// survive closing/reopening the dock; the loaded rig is never rebound.
export default function ViewportMotionDock({model,getViewer,open,onClose,generation}){
  const [side,setSide]=useState('right');
  if(!model||model.bones<1)return null;
  return <section
    id="orbi-motion-dock"
    className={'viewport-motion-dock '+(side==='left'?'dock-left':'dock-right')}
    data-viewport-motion-editor
    style={{display:open?'flex':'none'}}
    role="region"
    aria-label="Editor de animaciones sobre el visor 3D">
    <header className="viewport-motion-dock-head">
      <div className="viewport-motion-dock-title">
        <Film size={16}/>
        <div><strong>Editar animación</strong>
          <small>AUTORIG-02E · Ajustes sobre el personaje</small>
        </div>
      </div>
      <div className="viewport-motion-dock-actions">
        <button type="button" className="face-quick-close"
          onClick={()=>setSide(value=>value==='right'?'left':'right')}
          title={side==='right'?'Mover panel a la izquierda':'Mover panel a la derecha'}
          aria-label="Mover panel al otro lado del visor">
          {side==='right'?<ChevronLeft size={15}/>:<ChevronRight size={15}/>}
        </button>
        <button type="button" className="face-quick-close"
          onClick={onClose} title="Cerrar controles de animación"
          aria-label="Cerrar controles de animación"><X size={17}/></button>
      </div>
    </header>
    <div className="viewport-motion-dock-scroll">
      <ExistingRigMotionLab key={'rig-motion-'+generation} model={model}
        getViewer={getViewer} compact visible={open}/>
    </div>
  </section>;
}
