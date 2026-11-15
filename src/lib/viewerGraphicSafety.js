// VIEWER-03: GPU-safe presentation options. A renderer preset is separate
// from model data: no textures, bones, morph targets or source files are edited.
export function rendererPreset({
  safeMode=false,devicePixelRatio=1,
}={}){
  const requested=Number(devicePixelRatio);
  const ratio=Number.isFinite(requested)&&requested>0?requested:1;
  return {
    options:{
      antialias:!safeMode,
      alpha:false,
      powerPreference:safeMode?'default':'high-performance',
    },
    pixelRatio:safeMode?1:Math.min(ratio,2),
  };
}
export const recoverableGraphicsTypes=Object.freeze([
  'lost','render-error','creation-error',
]);
export function isRecoverableGraphicsFailure(status){
  return recoverableGraphicsTypes.includes(status?.type);
}
export function shortGraphicsReport(status){
  if(!status)return null;
  const metrics=status.diagnostics||{};
  return {
    type:status.type,
    safeMode:Boolean(status.safeMode),
    message:String(status.message||''),
    pixelRatio:metrics.pixelRatio??null,
    textures:metrics.textures??null,
    geometries:metrics.geometries??null,
    maxTextureSize:metrics.maxTextureSize??null,
    contextLossCount:metrics.contextLossCount??0,
    file:metrics.file??null,
  };
}
