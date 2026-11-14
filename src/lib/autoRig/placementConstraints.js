// AUTORIG-02A.1: deterministic anatomical placement constraints.
// World axes in the ORBI viewer: X = horizontal, Y = vertical, Z = depth.
export const PLACEMENT_MODES=Object.freeze(['X','Y','Z','XY','XZ','YZ','XYZ']);
export const VIEW_PRESETS=Object.freeze(['front','back','left','right','top']);
export const PLANE_FOR_VIEW=Object.freeze({
  front:'XY',back:'XY',left:'YZ',right:'YZ',top:'XZ',
});
const isFinite3=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);

export function constrainMarkerPosition(previous,candidate,axes='XY'){
  if(!isFinite3(previous)||!isFinite3(candidate))
    throw new Error('Las coordenadas del marcador deben ser finitas.');
  if(!PLACEMENT_MODES.includes(axes))
    throw new Error('Restricción de ejes desconocida: '+axes);
  return ['X','Y','Z'].map((axis,i)=>axes.includes(axis)?candidate[i]:previous[i]);
}

export function getViewDirection(view){
  switch(view){
    case 'front':return [0,0,1];
    case 'back':return [0,0,-1];
    case 'left':return [-1,0,0];
    case 'right':return [1,0,0];
    case 'top':return [0,1,0];
    default:throw new Error('Vista desconocida: '+view);
  }
}

export function getDefaultAxesForView(view){
  if(!Object.hasOwn(PLANE_FOR_VIEW,view))throw new Error('Vista desconocida: '+view);
  return PLANE_FOR_VIEW[view];
}
