import * as THREE from 'three';
import {computeVisibleCharacterBounds} from './visibleBounds.js';

// Camera-only. Neither the FBX pose nor the currently playing clip is edited.
const canonical=name=>String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const finite=v=>[v.x,v.y,v.z].every(Number.isFinite);
export function findFaceAnchor(root,vrm=null){
  if(!root)return null;
  if(vrm?.humanoid){
    const node=vrm.humanoid.getNormalizedBoneNode?.('head')||
      vrm.humanoid.getRawBoneNode?.('head');
    if(node)return {node,method:'vrm-head'};
  }
  const skins=[];
  root.traverse(node=>{
    if(node.isSkinnedMesh&&node.skeleton?.bones?.length)skins.push(node);
  });
  skins.sort((a,b)=>b.skeleton.bones.length-a.skeleton.bones.length);
  // Use only the main body skin, not a garment or ear helper skeleton.
  const bones=[...new Set(skins[0]?.skeleton?.bones||[])].filter(b=>b?.isBone);
  const scored=bones.map(b=>{
    const name=canonical(b.name);
    if(/adjust|hair|ear|eyebrow|forehead|headtop|headend/.test(name))return {bone:b,score:-1};
    if(name==='head')return {bone:b,score:100};
    if(/^(?:mixamorig|bip[0-9]*|j?bip[clr]?|bn)head$/.test(name))
      return {bone:b,score:90};
    if(name.endsWith('head')&&!name.includes('ahead'))return {bone:b,score:70};
    return {bone:b,score:0};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  if(scored.length&&(!scored[1]||scored[0].score>scored[1].score))
    return {node:scored[0].bone,method:'fbx-head'};
  return null;
}
export function getFaceFraming(root,vrm=null){
  if(!root)return null;
  root.updateMatrixWorld(true,true);
  const bounds=computeVisibleCharacterBounds(root);
  const box=bounds?.box;
  if(!box||box.isEmpty())return null;
  const size=box.getSize(new THREE.Vector3());
  const height=Math.max(size.y,1e-4);
  const anchor=findFaceAnchor(root,vrm);
  let target;
  if(anchor){
    target=anchor.node.getWorldPosition(new THREE.Vector3());
    // Head joint is near the neck/skull base in many FBX rigs.
    // Target near the eyes; keep within visible body bounds.
    if(anchor.method==='fbx-head')
      target.y=Math.min(box.max.y,Math.max(box.min.y,target.y+height*.055));
  }else{
    // Fallback for rigs with nonstandard names. No assumption about a head
    // bone is used to animate; this is merely a camera targeting point.
    target=box.getCenter(new THREE.Vector3());
    target.y=box.min.y+height*.88;
  }
  if(!finite(target))return null;
  return {target,height,anchor:anchor?.node||null,
    method:anchor?.method||'visible-upper-body',
    distance:Math.max(height*.24,0.002)};
}
