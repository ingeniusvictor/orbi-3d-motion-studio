// STUDIO-09: truthful per-capability LP availability for the active rig.
// A 346-bone GLB is not automatically a normalized VRM humanoid.
export const LP_FEATURES=Object.freeze([
  {id:'lp01',name:'LP-01 · Presencia corporal',engine:'VRM humanoide'},
  {id:'lp04',name:'LP-04 · Presencia V09',engine:'Claude V09 · microgestos reversibles'},
  {id:'lp02',name:'LP-02 · Compositor Mixamo',engine:'VRM + clip elegible'},
  {id:'lp03ab',name:'LP-03A/B · Gestos, manos e IK',engine:'VRM calibrado'},
  {id:'lp03c',name:'LP-03C · Voz y labios',engine:'Motor de voz + canales de boca'},
  {id:'lp03d',name:'LP-03D · Expresiones faciales',engine:'VRM o morphs/huesos detectados'},
]);
export function describeLpCapabilities(model,viewer){
  const hasModel=Boolean(model&&viewer?.model);
  const isVrm=hasModel&&Boolean(viewer?.vrm)&&model?.format==='VRM';
  const mouth=hasModel?viewer?.getLivingLipDiagnostics?.():null;
  const facial=hasModel?viewer?.getLivingFacialDiagnostics?.():null;
  const clip=hasModel?viewer?.getLivingComposerStatus?.():null;
  const v09=hasModel?viewer?.getLumiaV09BodyStatus?.():null;
  const lip=Boolean(mouth?.supported);
  const face=Boolean(facial?.supported);
  const blocked=reason=>({state:'requires-vrm',reason});
  const unknown={state:'no-model',reason:'Carga un modelo para auditar sus capacidades.'};
  const entries={
    lp01:!hasModel?unknown:isVrm?{state:'available',reason:'Humanoide VRM reconocido.'}:
      blocked('Este motor usa el humanoide normalizado VRM; no está calibrado para huesos GLB/FBX.'),
    lp04:!hasModel?unknown:v09?.supported?
      {state:'partial',reason:'Claude V09 reconocido: respiración y cabeza; manos y dedos son pruebas optativas sin calibración artística.'}:
      {state:'pending',reason:isVrm?'El VRM utiliza su sistema LP-01.':
        'LP-04 requiere la maestra Claude V09 de 346 huesos y reposo verificado.'},
    lp02:!hasModel?unknown:!isVrm?
      blocked('Necesita el compositor y las máscaras óseas VRM verificadas.'):
      clip?.eligible?{state:'available',reason:'Clip autorizado para composición; activa LP-01.'}:
      {state:'pending',reason:'Selecciona un clip Mixamo elegible y activa la presencia.'},
    lp03ab:!hasModel?unknown:isVrm?{state:'available',reason:'Los controles requieren activación y calibración VRM.'}:
      blocked('No hay ejes, límites e IK corporal certificado para este GLB/FBX.'),
    lp03c:!hasModel?unknown:lip?
      {state:'available',reason:'Boca detectada: voz de navegador o audio local; sincronización aproximada.'}:
      {state:'partial',reason:'La voz puede reproducirse, pero falta un canal de boca compatible.'},
    lp03d:!hasModel?unknown:face?{state:'available',
      reason:'Controles faciales reales detectados; habilítalos voluntariamente.'}:
      {state:'pending',reason:'No se reconocieron canales faciales calibrados; se puede mapear un rig compatible.'},
  };
  return LP_FEATURES.map(f=>({...f,...entries[f.id]}));
}
