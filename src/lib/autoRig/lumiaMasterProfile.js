// MOTION-07: distinguish V06B 346 from Claude V09 346 by true inverse-bind
// rest coordinates, not matching bone names alone (they share 346 names).
const signatures=Object.freeze({
  'claude-v09':{pelvisY:0.9432,headY:1.4177},
  'v06b':{pelvisY:1.0564,headY:1.5835},
});
const tolerance=.012; // 12 mm tolerates benign float32/export rounding
export const LUMIA_TARGET_VERSIONS=Object.freeze({
  CLAUDE_V09:'claude-v09',V06B:'v06b',
});
export function inspectLumiaMasterRest(model){
  if(!model?.traverse)return {ok:false,reason:'No hay escena 3D cargada.'};
  let best=null;
  model.traverse(node=>{
    if(node.isSkinnedMesh&&node.skeleton?.bones?.length===346)
      best=node.skeleton;
  });
  if(!best)return {ok:false,reason:'No se encontró un skin único de 346 huesos.'};
  const names=best.bones.map(b=>b?.name||'');
  if(new Set(names).size!==346||!names.includes('V8_root')||
     !names.includes('V8_Bip001-Pelvis')||
     !names.includes('J_Bip_C_Head'))
    return {ok:false,reason:'La identidad de huesos 346 no es la LUMIA esperada.'};
  const restY=name=>{
    const index=names.indexOf(name);
    const inv=best.boneInverses?.[index];
    if(!inv)return NaN;
    const matrix=inv.clone().invert();
    return matrix.elements[13];
  };
  const pelvisY=restY('V8_Bip001-Pelvis');
  const headY=restY('J_Bip_C_Head');
  if(!Number.isFinite(pelvisY)||!Number.isFinite(headY))
    return {ok:false,reason:'Matrices de reposo no finitas.'};
  const matches=Object.entries(signatures).filter(([,s])=>
    Math.abs(pelvisY-s.pelvisY)<tolerance &&
    Math.abs(headY-s.headY)<tolerance);
  if(matches.length!==1)
    return {ok:false,bones:346,pelvisY,headY,
      reason:'Reposo 346 desconocido. No aplicar perfiles V06B/V09 automáticamente.'};
  return {ok:true,version:matches[0][0],
    pelvisY,headY,bones:346,confidence:'pose-de-reposo-por-inverse-bind'};
}
export function requireLumiaTargetRest(model,version){
  const data=inspectLumiaMasterRest(model);
  if(!data.ok||data.version!==version)
    throw new Error('MOTION-07: el destino no coincide con el perfil '+
      version+' de reposo certificado. '+(data.reason||'Perfil detectado: '+data.version));
  return data;
}
