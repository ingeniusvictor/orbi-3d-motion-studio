// LP-03A.1 — source-of-truth for explaining when procedural presence is live.
// A selected FBX owns humanoid controls until a user explicitly opts into the
// guarded idle compositor; enabling the cerebellum alone never overrides FBX.
export function describePresenceGate({
  vrmReady=false,presenceEnabled=false,clipSelected=false,
  composerEligible=false,composerActive=false,composerEnabled=false,
}={}) {
  if(!vrmReady)return {
    running:false,needsComposer:false,reason:'Carga un personaje VRM para utilizar Living Presence.',
  };
  if(!presenceEnabled)return {
    running:false,needsComposer:false,reason:'Activa Presencia natural A/B.',
  };
  if(!clipSelected)return {
    running:true,needsComposer:false,
    reason:'Sin FBX seleccionado: mirada y coordinación motora disponibles.',
  };
  if(composerActive)return {
    running:true,needsComposer:false,
    reason:'FBX de reposo con superposición activa: mirada y LP-03A disponibles.',
  };
  if(!composerEligible)return {
    running:false,needsComposer:false,
    reason:'Este FBX conserva el control exclusivo del personaje; la superposición solo admite reposos Mixamo compatibles.',
  };
  if(composerEnabled)return {
    running:false,needsComposer:false,
    reason:'La superposición LP-02C.1 está habilitada pero su intensidad es 0 %. Súbela por encima de 0 %.',
  };
  return {
    running:false,needsComposer:true,
    reason:'Con un FBX seleccionado, la mirada y LP-03A quedan suspendidos hasta activar LP-02C.1.',
  };
}
