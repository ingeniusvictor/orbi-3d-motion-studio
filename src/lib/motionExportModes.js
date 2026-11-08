// MOTION-05B.1 — An explicit export mode should never be invisible.
// This is a UI recommendation based on the exact known split-rig Mint file.
// It NEVER removes or freezes anything until the user clicks Export.
export const isKnownMintSplitRig=(info)=>{
  const file=String(info?.filename||'');
  return /mint[^/\\]*swimsuit/i.test(file)
    && Number(info?.meshes)===2
    && Number(info?.bones)>=370;
};
export const suggestedAccessoryMode=info=>
  isKnownMintSplitRig(info)?'rigid':'strict';

export function accessoryModeLabel(mode){
  if(mode==='rigid')return 'Lazo rígido unido al torso';
  if(mode==='exclude')return 'Solo cuerpo, sin accesorio';
  return 'Validación estricta (dos rigs no fusionados)';
}
export const strictSplitRigHint=(error,mode)=>{
  const message=String(error?.message||error||'');
  if(mode!=='strict')return '';
  return (/orientación o escala de referencia distinta|posiciones de referencia diferentes|rig único|dos raíces óseas|raíces óseas distintas/i.test(message))
    ?' Este modelo parece tener dos esqueletos. Para prepararlo para Mixamo selecciona «Conservar accesorio como malla rígida» o «Solo cuerpo». La opción estricta no los convierte.'
    :'';
};
