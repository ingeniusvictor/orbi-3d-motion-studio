// AUTORIG-01 eligibility gate is pure and covered by Node tests.
export function autoRigEligibility(model){
  if(!model)return {ok:false,reason:'Carga un personaje GLB o glTF sin esqueleto.'};
  if(!['GLB','GLTF'].includes(model.format))return {
    ok:false,reason:'La primera versión solo acepta GLB/glTF estáticos. FBX y VRM no se modificarán.'};
  if(model.bones>0)return {
    ok:false,reason:'Este modelo ya contiene huesos; AUTORIG-01 no reemplaza rigs existentes.'};
  if(model.animations>0)return {
    ok:false,reason:'Este modelo contiene animaciones; AUTORIG-01 no las sobrescribe.'};
  if(model.meshes<1)return {ok:false,reason:'El modelo no tiene ninguna malla.'};
  return {ok:true,reason:'Compatible para preparar marcadores; la T-Pose y la calidad del skinning todavía deben verificarse en Blender.'};
}
