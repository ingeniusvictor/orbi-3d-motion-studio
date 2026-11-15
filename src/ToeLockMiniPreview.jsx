import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

// Dedicated opt-in preview. Never replace ORBI's loaded 346-bone master.
// Renders the approved temporary D162 GLB read-only in a separate mini canvas.
export default function ToeLockMiniPreview({buffer}){
  const mount=useRef(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    if(!buffer||!mount.current)return;
    let dead=false,raf=0,model=null,controls=null,renderer=null;
    let observer=null;
    const host=mount.current;
    const onError=e=>{if(!dead)setError(e.message||String(e));};
    setError('');
    try{
      const scene=new THREE.Scene();
      scene.background=new THREE.Color(0x10202f);
      const camera=new THREE.PerspectiveCamera(38,1,.01,100);
      renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'default'});
      renderer.setPixelRatio(1);
      renderer.setSize(Math.max(host.clientWidth,200),280,false);
      host.appendChild(renderer.domElement);
      controls=new OrbitControls(camera,renderer.domElement);
      controls.enableDamping=true;
      scene.add(new THREE.HemisphereLight(0xffffff,0x455061,2));
      const light=new THREE.DirectionalLight(0xffffff,2);
      light.position.set(2,4,4);scene.add(light);
      const loader=new GLTFLoader();
      loader.parseAsync(buffer.slice(0),'').then(gltf=>{
        if(dead)return;
        model=gltf.scene;scene.add(model);
        model.updateWorldMatrix(true,true);
        const box=new THREE.Box3();let count=0;
        model.traverse(mesh=>{
          if(!mesh.isMesh||!mesh.geometry?.getAttribute('position')?.count)return;
          if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
          if(!mesh.geometry.boundingBox?.isEmpty()){
            box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
            count++;
          }
          if(mesh.isSkinnedMesh)mesh.frustumCulled=false;
        });
        if(!count||box.isEmpty())throw new Error('La copia D162 no contiene mallas visibles.');
        const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
        const radius=Math.max(size.length()*.5,.25);
        camera.position.copy(center).add(new THREE.Vector3(.35,.15,1)
          .normalize().multiplyScalar(Math.max(radius*3.7,2)));
        camera.near=Math.max(radius/100,.01);
        camera.far=Math.max(radius*50,50);
        camera.updateProjectionMatrix();
        controls.target.copy(center);controls.update();
      }).catch(onError);
      const resize=()=>{
        if(dead||!renderer)return;
        const width=Math.max(host.clientWidth,200);
        renderer.setSize(width,280,false);
        camera.aspect=width/280;camera.updateProjectionMatrix();
      };
      observer=new ResizeObserver(resize);observer.observe(host);resize();
      const animate=()=>{
        if(dead)return;
        raf=requestAnimationFrame(animate);
        try{controls.update();renderer.render(scene,camera);}
        catch(e){cancelAnimationFrame(raf);onError(e);dead=true;}
      };animate();
    }catch(e){onError(e);}
    return ()=>{
      dead=true;cancelAnimationFrame(raf);observer?.disconnect();
      controls?.dispose();renderer?.dispose();renderer?.domElement?.remove();
      model?.traverse(node=>{
        node.geometry?.dispose();
        for(const m of Array.isArray(node.material)?node.material:[node.material]){
          if(m)m.dispose?.();
        }
      });
    };
  },[buffer]);
  return <div style={{border:'1px solid #345869',borderRadius:8,overflow:'hidden'}}>
    <div ref={mount} style={{height:280,minWidth:200}}/>
    {error&&<div role="alert" style={{padding:10,color:'#ff9b93'}}>
      No se pudo previsualizar: {error}</div>}
    <small style={{padding:9,display:'block',color:'#afcbd0'}}>
      Vista temporal D162 ToeLock V4. El maestro 346 permanece abierto en ORBI.
      La vista no certifica compatibilidad con Mixamo.</small>
  </div>;
}
