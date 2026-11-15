// A tiny, local, privacy-preserving breadcrumb survives a browser reload.
// Do not store model bytes, absolute paths, textures or user file names.
const KEY='orbi.viewer.interrupted-load.v3';
export function rememberLoadPhase(stage,extension=''){
  const entry={
    stage:String(stage||'Carga 3D').slice(0,140),
    extension:String(extension||'').replace(/[^a-z0-9]/gi,'').slice(0,12),
    timestamp:Date.now(),
  };
  try{sessionStorage.setItem(KEY,JSON.stringify(entry));}catch{/* storage disabled */}
  return entry;
}
export function readInterruptedLoad(){
  try{
    const raw=sessionStorage.getItem(KEY);
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    if(!parsed||typeof parsed.stage!=='string')return null;
    // Stale reports from weeks ago are not current diagnostics.
    if(!Number.isFinite(parsed.timestamp)||
       Date.now()-parsed.timestamp>24*60*60*1000){
      sessionStorage.removeItem(KEY);return null;
    }
    return {stage:parsed.stage,extension:parsed.extension||'',
      timestamp:parsed.timestamp};
  }catch{return null;}
}
export function clearInterruptedLoad(){
  try{sessionStorage.removeItem(KEY);}catch{/* storage disabled */}
}
