import * as THREE from 'three';

// View-only fix for static skinned GLB/FBX files: when an imported skeleton
// has no AnimationClip, incorrect/missing per-mesh skinned bounding spheres
// can cause frustum culling to hide a valid character. Do not fabricate an
// animation or change the rig or geometry to make it visible.
export function prepareStaticRigPreview(root,{
  animations=0,maxBypassVertices=250000,
}={}){
  const stats={
    staticModel:animations===0,
    skins:0,skinnedVertices:0,
    cullingBypassed:0,spheresUpdated:0,
    warnings:[],
  };
  if(!root||animations!==0)return stats;
  root.updateWorldMatrix(true,true);
  root.traverse(node=>{
    if(!node.isSkinnedMesh)return;
    stats.skins++;
    const count=node.geometry?.getAttribute('position')?.count||0;
    stats.skinnedVertices+=count;
    if(!node.skeleton?.bones?.length){
      stats.warnings.push('Malla '+node.name+' sin huesos de skinning.');
      return;
    }
    try{
      node.updateWorldMatrix(true,false);
      node.skeleton.update();
      if(typeof node.computeBoundingSphere==='function'){
        node.computeBoundingSphere();
        const b=node.boundingSphere;
        if(b&&Number.isFinite(b.radius)&&b.radius>0)
          stats.spheresUpdated++;
      }
      // Avoid false culling when static GLB creators use bind matrices that
      // diverge from the editor's rest camera coordinates. Limit to modest
      // assets to avoid degrading performance on multi-million vertex files.
      if(count>0&&count<=maxBypassVertices){
        node.frustumCulled=false;stats.cullingBypassed++;
      }
    }catch(error){
      stats.warnings.push('No se pudo estabilizar '+(node.name||'skin')+
        ': '+(error?.message||String(error)));
    }
  });
  return stats;
}
export function describeViewerRenderableState(root,clips=[]){
  let meshes=0,points=0,skins=0,hidden=0,morphs=0;
  root?.traverse(node=>{
    if(!(node.isMesh||node.isPoints))return;
    if(node.isMesh)meshes++;else points++;
    if(node.isSkinnedMesh)skins++;
    const hasMorph=Object.values(node.geometry?.morphAttributes||{})
      .some(arr=>Array.isArray(arr)&&arr.length>0);
    if(hasMorph)morphs++;
    for(let current=node;current;current=current.parent){
      if(!current.visible){hidden++;break;}
    }
  });
  return {meshes,pointClouds:points,skinnedMeshes:skins,
    hiddenMeshes:hidden,morphMeshes:morphs,animations:clips.length,
    staticModel:clips.length===0,
    hasRenderable:meshes+points>hidden,
  };
}
