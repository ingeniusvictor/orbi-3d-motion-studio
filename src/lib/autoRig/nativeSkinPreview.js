import * as THREE from 'three';
import {skeletonDraft} from './nativeRig.js';
import {validateWeightBuffers} from './nativeSkinWeights.js';
import {boneInfluenceHeatmap,combineInfluenceAudits} from './weightHeatmap.js';

// AUTORIG-02C.1: separate, disposable, experimental skinned VIEW.
// Absolutely no changes to source vertex buffers, morphs, original mesh or file.
export function buildBoneSkeleton(bones){
  if(!Array.isArray(bones)||bones.length!==19)
    throw new Error('Se esperan exactamente 19 huesos para este piloto.');
  const root=new THREE.Group();
  root.name='ORBI_AUTORIG02C_BONES';
  const nodeMap=new Map();
  for(const def of bones){
    if(nodeMap.has(def.name))throw new Error('Nombre de hueso duplicado.');
    const parent=def.parent?nodeMap.get(def.parent):null;
    if(def.parent&&!parent)throw new Error('Padre inexistente: '+def.name);
    const bone=new THREE.Bone();
    bone.name=def.name;
    const head=new THREE.Vector3().fromArray(def.head);
    bone.position.copy(parent?
      head.clone().sub(parent.userData.bindHead):head);
    bone.userData.bindHead=head.clone();
    if(parent)parent.add(bone);else root.add(bone);
    nodeMap.set(def.name,bone);
  }
  root.updateMatrixWorld(true);
  const skeleton=new THREE.Skeleton(bones.map(def=>nodeMap.get(def.name)));
  skeleton.calculateInverses();
  return {root,skeleton,nodeMap};
}

export function collectStaticMeshes(model){
  if(!model)throw new Error('No hay modelo para rigging.');
  const meshes=[];
  model.updateWorldMatrix(true,true);
  model.traverse(node=>{
    if(!node.isMesh||!node.visible)return;
    if(node.isSkinnedMesh)throw new Error('El piloto no modifica modelos ya riggeados.');
    if(node.geometry?.morphAttributes?.position?.length)
      throw new Error('Este modelo tiene morph targets: se requiere soporte de preservación antes de riggear.');
    const position=node.geometry?.getAttribute('position');
    if(!position||!position.count)throw new Error('Malla sin vértices: '+node.name);
    meshes.push(node);
  });
  if(!meshes.length)throw new Error('El personaje no contiene mallas visibles.');
  const total=meshes.reduce((n,mesh)=>n+mesh.geometry.getAttribute('position').count,0);
  if(total>300000||meshes.length>60)
    throw new Error('El piloto limita a 300.000 vértices y 60 mallas para proteger memoria.');
  return {meshes,total};
}

function workerWeights(positions,bones,signal){
  if(signal?.aborted)return Promise.reject(new Error('Análisis cancelado.'));
  return new Promise((resolve,reject)=>{
    let worker;
    try{worker=new Worker(new URL('./nativeSkinWorker.js',import.meta.url),{type:'module'});}
    catch(err){reject(new Error('El navegador no permite ejecutar el motor local: '+err.message));return;}
    let done=false;
    const close=()=>{
      if(done)return false;
      done=true;
      signal?.removeEventListener('abort',cancel);
      worker.terminate();
      return true;
    };
    const cancel=()=>{if(close())reject(new Error('Análisis cancelado.'));};
    worker.addEventListener('message',event=>{
      if(event.data?.id!==1)return;
      if(!close())return;
      if(!event.data.ok){reject(new Error(event.data.error||'Fallo del motor de pesos.'));return;}
      resolve({
        indices:new Uint16Array(event.data.indices),
        weights:new Float32Array(event.data.weights),
        audit:event.data.audit,
      });
    });
    worker.addEventListener('error',err=>{
      if(close())reject(new Error('Error del motor local: '+(err.message||'desconocido')));
    });
    signal?.addEventListener('abort',cancel,{once:true});
    worker.postMessage({id:1,positions:positions.buffer,bones},[positions.buffer]);
  });
}

function worldPositions(mesh,geometry){
  // The copy is already baked into world coordinates, not applied to the source.
  geometry.applyMatrix4(mesh.matrixWorld);
  const p=geometry.getAttribute('position');
  const positions=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++){
    positions[i*3]=p.getX(i);
    positions[i*3+1]=p.getY(i);
    positions[i*3+2]=p.getZ(i);
  }
  return positions;
}

function cleanMeshResources(node){
  node?.geometry?.dispose();
  if(Array.isArray(node?.material))node.material.forEach(m=>m?.dispose());
  else node?.material?.dispose();
}

// Avoid inconsistent app state: source is hidden ONLY after the complete
// candidate has passed buffer audits and has been mounted successfully.
export async function createNativeSkinPreview(viewer,markers,{
  signal,onProgress=()=>{},
}={}){
  if(!viewer?.model||!viewer?.scene)throw new Error('No hay modelo abierto.');
  const source=viewer.model;
  const bones=skeletonDraft(markers);
  const {meshes,total}=collectStaticMeshes(source);
  const {root:boneRoot,skeleton,nodeMap}=buildBoneSkeleton(bones);
  const overlay=new THREE.Group();
  overlay.name='ORBI_AUTORIG02C_SKIN_PREVIEW_ONLY';
  overlay.add(boneRoot);
  const riggedMeshes=[],audits=[];
  const originalMaterials=new Map();
  let heatmapMaterial=null;
  let committed=false;
  const disposeCandidate=()=>{
    for(const mesh of riggedMeshes){
      // Restore the candidate's own cloned materials before disposal; the
      // diagnostic material is shared and disposed exactly once below.
      mesh.material=originalMaterials.get(mesh);
      cleanMeshResources(mesh);
    }
    heatmapMaterial?.dispose();
    skeleton.dispose();
  };
  const originalVisibility=source.visible;
  try{
    let processed=0;
    for(const sourceMesh of meshes){
      if(signal?.aborted||viewer.model!==source)
        throw new Error('El cálculo fue cancelado o se cambió de modelo.');
      const geometry=sourceMesh.geometry.clone();
      const positions=worldPositions(sourceMesh,geometry);
      let result;
      try{result=await workerWeights(positions,bones,signal);}
      catch(error){geometry.dispose();throw error;}
      if(signal?.aborted||viewer.model!==source){
        geometry.dispose();throw new Error('El cálculo fue cancelado o se cambió de modelo.');
      }
      const check=validateWeightBuffers(result.indices,result.weights,bones.length);
      if(!check.ok){geometry.dispose();throw new Error(check.reason);}
      geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(result.indices,4));
      geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(result.weights,4));
      const materials=(Array.isArray(sourceMesh.material)?
        sourceMesh.material.map(mat=>mat?.clone()):
        sourceMesh.material?.clone());
      const rigged=new THREE.SkinnedMesh(geometry,materials);
      rigged.name='ORBI_SKIN_'+(sourceMesh.name||('mesh_'+riggedMeshes.length));
      rigged.castShadow=sourceMesh.castShadow;
      rigged.receiveShadow=sourceMesh.receiveShadow;
      rigged.frustumCulled=false;
      overlay.add(rigged);
      overlay.updateMatrixWorld(true);
      rigged.bind(skeleton,new THREE.Matrix4());
      rigged.normalizeSkinWeights();
      riggedMeshes.push(rigged);
      originalMaterials.set(rigged,materials);
      audits.push({mesh:sourceMesh.name||'malla '+riggedMeshes.length,...result.audit});
      processed+=result.audit.vertices;
      onProgress({meshes:riggedMeshes.length,totalMeshes:meshes.length,
        vertices:processed,totalVertices:total});
    }
    if(viewer.model!==source||signal?.aborted)
      throw new Error('El modelo cambió antes de publicar la vista preliminar.');
    viewer.scene.add(overlay);
    overlay.updateMatrixWorld(true);
    source.visible=false;
    committed=true;
    const api={
      bones:bones.map(x=>x.name),
      audits,
      vertexCount:total,
      setWeightHeatmap(boneName=null){
        if(boneName===null||boneName===''){
          for(const mesh of riggedMeshes){
            mesh.material=originalMaterials.get(mesh);
            mesh.geometry.deleteAttribute('color');
          }
          return null;
        }
        const boneIndex=bones.findIndex(bone=>bone.name===boneName);
        if(boneIndex<0)throw new Error('Hueso desconocido para visualizar pesos.');
        // Prepare all maps before changing a rendered mesh, so malformed
        // weights cannot leave half the character in heatmap mode.
        const prepared=riggedMeshes.map(mesh=>({
          mesh,
          heatmap:boneInfluenceHeatmap(
            mesh.geometry.getAttribute('skinIndex').array,
            mesh.geometry.getAttribute('skinWeight').array,
            boneIndex),
        }));
        heatmapMaterial??=new THREE.MeshBasicMaterial({
          vertexColors:true,side:THREE.DoubleSide,toneMapped:false,
        });
        for(const {mesh,heatmap} of prepared){
          mesh.geometry.setAttribute('color',
            new THREE.Float32BufferAttribute(heatmap.colors,3));
          mesh.material=heatmapMaterial;
        }
        return combineInfluenceAudits(prepared.map(item=>item.heatmap.stats));
      },
      setJointAngle(name,axis,angleDegrees){
        if(!nodeMap.has(name))throw new Error('Articulación desconocida.');
        if(!['X','Y','Z'].includes(axis)||!Number.isFinite(angleDegrees)||
            Math.abs(angleDegrees)>90)
          throw new Error('Rotación de prueba inválida.');
        for(const bone of nodeMap.values())bone.rotation.set(0,0,0);
        nodeMap.get(name).rotation[axis.toLowerCase()]=THREE.MathUtils.degToRad(angleDegrees);
        boneRoot.updateMatrixWorld(true);
        skeleton.update();
      },
      resetPose(){
        for(const bone of nodeMap.values())bone.rotation.set(0,0,0);
        boneRoot.updateMatrixWorld(true);
        skeleton.update();
      },
      dispose(){
        if(!committed)return;
        committed=false;
        overlay.parent?.remove(overlay);
        if(viewer.model===source)source.visible=originalVisibility;
        disposeCandidate();
      },
    };
    return api;
  }catch(error){
    overlay.parent?.remove(overlay);
    disposeCandidate();
    if(committed&&viewer.model===source)source.visible=originalVisibility;
    throw error;
  }
}
