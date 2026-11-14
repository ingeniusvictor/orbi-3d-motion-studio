// AUTORIG-01 eligibility gate is pure and covered by Node tests.
export function autoRigEligibility(model){
  if(!model)return {ok:false,reason:'Carga un personaje GLB sin esqueleto.'};
  if(model.format!=='GLB')return {
    ok:false,reason:'La primera versión solo acepta GLB estáticos. FBX y VRM no se modificarán.'};
  if(model.bones>0)return {
    ok:false,reason:'Este modelo ya contiene huesos; AUTORIG-01 no reemplaza rigs existentes.'};
  if(model.animations>0)return {
    ok:false,reason:'Este modelo contiene animaciones; AUTORIG-01 no las sobrescribe.'};
  if(model.meshes<1)return {ok:false,reason:'El modelo no tiene ninguna malla.'};
  return {ok:true,reason:'Compatible con editor nativo de marcadores y esqueleto en vista previa; el skinning todavía no está implementado.'};
}
