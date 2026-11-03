/** Only material state is captured. Geometry, skeleton, clips stay untouched. */
const CHANNELS=['map','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap','alphaMap'];
const PROPS=['transparent','opacity','alphaTest','needsUpdate','metalness','roughness',
  'side','depthWrite','wireframe','emissiveIntensity'];
function materialList(scene){
 const mats=new Set();
 scene?.traverse(node=>{
   if(!node.isMesh)return;
   for(const m of Array.isArray(node.material)?node.material:[node.material]){
     if(m)mats.add(m);
   }
 });
 return mats;
}
export function captureMaterialState(scene) {
 const nodes=[],materials=new Map();
 scene.traverse(node=>{
   if(!node.isMesh)return;
   nodes.push({node,original:Array.isArray(node.material)?[...node.material]:node.material});
 });
 for(const mat of materialList(scene)){
   const channels=Object.fromEntries(CHANNELS.map(key=>[key,mat[key]]));
   const fields=Object.fromEntries(PROPS.filter(key=>key in mat).map(key=>[key,mat[key]]));
   materials.set(mat,{channels,fields,
     color:mat.color?.clone?.()||null,emissive:mat.emissive?.clone?.()||null});
 }
 return {scene,nodes,materials,textures:new Set([...materials].flatMap(([mat])=>
   CHANNELS.map(key=>mat[key]).filter(tex=>tex?.isTexture)))};
}
export function restoreMaterialState(snapshot) {
 const currentMaterials=materialList(snapshot.scene);
 const currentTextures=new Set([...currentMaterials].flatMap(mat=>
   CHANNELS.map(key=>mat[key]).filter(tex=>tex?.isTexture)));
 for(const {node,original} of snapshot.nodes)
   node.material=Array.isArray(original)?[...original]:original;
 for(const [mat,{channels,fields,color,emissive}] of snapshot.materials){
   Object.assign(mat,channels,fields);
   if(color&&mat.color?.copy)mat.color.copy(color);
   if(emissive&&mat.emissive?.copy)mat.emissive.copy(emissive);
   mat.needsUpdate=true;
 }
 for(const mat of currentMaterials)if(!snapshot.materials.has(mat))mat.dispose?.();
 for(const tex of currentTextures)if(!snapshot.textures.has(tex))tex.dispose?.();
}
