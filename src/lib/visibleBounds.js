import * as THREE from 'three';

// MOTION-05C.1 — camera only. NEVER recenter, scale, rotate or write any rig.
// FBX bind offsets and outlier helper geometry can make Box3.setFromObject()
// enormous despite the real skinned character occupying a small area.
const finite3=v=>Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z);
const quantile=(arr,f)=>{
  const index=Math.min(arr.length-1,Math.max(0,Math.floor((arr.length-1)*f)));
  return arr[index];
};
function boundsOf(points,{trim=0.002}={}){
  if(!points.length)return null;
  const xs=points.map(p=>p.x).sort((a,b)=>a-b);
  const ys=points.map(p=>p.y).sort((a,b)=>a-b);
  const zs=points.map(p=>p.z).sort((a,b)=>a-b);
  const b=new THREE.Box3(
    new THREE.Vector3(quantile(xs,trim),quantile(ys,trim),quantile(zs,trim)),
    new THREE.Vector3(quantile(xs,1-trim),quantile(ys,1-trim),quantile(zs,1-trim))
  );
  if(b.isEmpty()||!finite3(b.min)||!finite3(b.max))return null;
  return b;
}
function sampleWorldVertices(mesh,maximum){
  const attr=mesh.geometry?.getAttribute('position');
  const count=attr?.count||0;
  if(!count||!mesh.visible)return [];
  const samples=[];
  const local=new THREE.Vector3();
  const step=Math.max(1,Math.ceil(count/maximum));
  mesh.updateWorldMatrix(true,false);
  const push=i=>{
    try{
      mesh.getVertexPosition(i,local);
      local.applyMatrix4(mesh.matrixWorld);
      if(finite3(local))samples.push(local.clone());
    }catch{ /* Never let a malformed vertex prevent the fallback camera. */ }
  };
  for(let i=0;i<count;i+=step)push(i);
  if((count-1)%step!==0)push(count-1);
  return samples;
}
function visibleMesh(node,root){
  for(let cur=node;cur;cur=cur.parent){
    if(cur.visible===false)return false;
    if(cur===root)break;
  }
  return true;
}
function nearAnchor(box,anchor){
  const center=box.getCenter(new THREE.Vector3());
  const centerAnchor=anchor.getCenter(new THREE.Vector3());
  const radius=Math.max(anchor.getSize(new THREE.Vector3()).length(),1e-5);
  return center.distanceTo(centerAnchor)<=radius*3;
}
export function computeVisibleCharacterBounds(root,{maxSamplesPerMesh=4800}={}){
  if(!root)return null;
  root.updateWorldMatrix(true,true);
  const candidates=[];
  root.traverse(node=>{
    if(node.isMesh&&node.geometry?.getAttribute('position')?.count&&
      visibleMesh(node,root))candidates.push(node);
  });
  if(!candidates.length)return null;
  const ranked=candidates.slice().sort((a,b)=>
    Number(b.isSkinnedMesh)-Number(a.isSkinnedMesh)||
    b.geometry.getAttribute('position').count-
    a.geometry.getAttribute('position').count);
  const anchor=ranked[0];
  const anchorPoints=sampleWorldVertices(anchor,maxSamplesPerMesh);
  const anchorBox=boundsOf(anchorPoints);
  if(!anchorBox)return null;
  const points=[...anchorPoints];
  let included=1,excluded=0;
  for(const mesh of ranked.slice(1)){
    const extra=sampleWorldVertices(mesh,Math.max(250,Math.floor(maxSamplesPerMesh/3)));
    const box=boundsOf(extra);
    if(box&&nearAnchor(box,anchorBox)){
      points.push(...extra);included++;
    }else excluded++;
  }
  const box=boundsOf(points);
  if(!box)return null;
  // Trim only rare outliers; a generous camera margin keeps the extremities
  // visible without framing long offset axes, helper bones or bind ghosts.
  if(box.getSize(new THREE.Vector3()).length()<1e-8)
    box.expandByScalar(1e-4);
  return {box,anchorName:anchor.name||'(sin nombre)',
    includedMeshes:included,excludedMeshes:excluded,
    sampleCount:points.length,method:'skinned-vertices'};
}
export function cameraFitParameters(box,{fovDegrees=38,aspect=1}={}){
  if(!box||box.isEmpty())return null;
  const size=box.getSize(new THREE.Vector3());
  const center=box.getCenter(new THREE.Vector3());
  if(!finite3(center)||!finite3(size))return null;
  const radius=Math.max(size.length()/2,1e-6);
  const vfov=THREE.MathUtils.degToRad(fovDegrees);
  const safeAspect=Math.max(.05,Number(aspect)||1);
  const hfov=2*Math.atan(Math.tan(vfov/2)*safeAspect);
  const distance=Math.max(radius/Math.sin(vfov/2),
    radius/Math.sin(hfov/2),.00002)*1.55;
  return {center,size,radius,distance,
    near:Math.max(distance/4000,1e-6),
    far:Math.max(distance*100,radius*150,1),
    minDistance:Math.max(radius*.04,1e-6),
    maxDistance:Math.max(distance*40,.1),
  };
}

export function detectBodyUpDirection(root){
  if(!root)return null;
  root.updateWorldMatrix(true,true);
  const skins=[];
  root.traverse(n=>{if(n.isSkinnedMesh&&n.skeleton?.bones?.length)
    skins.push(n);});
  const main=skins.sort((a,b)=>b.skeleton.bones.length-a.skeleton.bones.length)[0];
  if(!main)return null;
  const bones=main.skeleton.bones;
  const find=(patterns)=>{
    for(const pattern of patterns){
      const found=bones.filter(b=>pattern.test(b.name||''));
      if(found.length===1)return found[0];
    }
    return null;
  };
  // Restrict matches to the BODY skin palette; never choose ChestBow's
  // head_adjust or another garment's similarly named helper.
  const head=find([/(?:^|[-_:])head$/i,/^head$/i]);
  const hips=find([/(?:^|[-_:])pelvis$/i,/(?:^|[-_:])hips?$/i,
    /(?:^|[-_:])spine$/i]);
  if(!head||!hips||head===hips)return null;
  const from=hips.getWorldPosition(new THREE.Vector3());
  const to=head.getWorldPosition(new THREE.Vector3());
  const direction=to.sub(from);
  if(!finite3(direction)||direction.lengthSq()<1e-8)return null;
  direction.normalize();
  return {up:direction,
    angleToWorldY:THREE.MathUtils.radToDeg(
      direction.angleTo(new THREE.Vector3(0,1,0))),
    head:head.name,hips:hips.name};
}
