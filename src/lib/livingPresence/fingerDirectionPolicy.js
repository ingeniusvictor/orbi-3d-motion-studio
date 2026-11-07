// LP-02B.2 — explicitly named, reversible QA presets for curl handedness.
// Bone geometry alone does not encode the palmar vs dorsal surface. Without
// a signed palm normal or a verified asset fingerprint, the sign is ambiguous.
// Vita.vrm was visually confirmed to hyperextend with the previous + sign.
// This preset never mutates the source VRM and is *not* universal autodetection.
export const SUPPORTED_FINGERS=Object.freeze(['Thumb','Index','Middle','Ring','Little']);
export const SIDES=Object.freeze(['left','right']);
export function recognizedFingerPreset(sourceName='') {
  const base=String(sourceName||'').replaceAll('\\','/').split('/').pop().trim().toLowerCase();
  if(base==='vita.vrm')return Object.freeze({
    name:'Vita.vrm — corrección validada por captura',
    left:-1,
    right:-1,
    verifiedBy:'visual-report',
  });
  return Object.freeze({
    name:'Sin perfil específico: comprobar manualmente',
    left:1,
    right:1,
    verifiedBy:'none',
  });
}
export function fingerCurlSign(side,finger,handDirections,perFingerOverrides) {
  if(!SIDES.includes(side)||!SUPPORTED_FINGERS.includes(finger))return 0;
  const hand=handDirections?.[side]===-1?-1:1;
  const override=perFingerOverrides?.get(side+':'+finger)===-1?-1:1;
  return hand*override;
}
