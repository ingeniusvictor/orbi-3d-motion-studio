import * as THREE from 'three';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {LANDMARK_NAMES,initialMarkers,mirrorMarker,skeletonDraft,validateMarkers} from './nativeRig.js';

// Transient overlay on the existing viewer. Never parent it to viewer.model.
// No vertex groups, skin weights, source transforms or materials are touched.
export class NativeRigEditor{
  constructor(viewer,{onMarkers=()=>{},onSelect=()=>{}}={}){
    if(!viewer?.model||!viewer.scene||!viewer.camera||!viewer.renderer)
      throw new Error('Abre un personaje GLB estático antes de editar.');
    this.viewer=viewer;
    this.onMarkers=onMarkers;
    this.onSelect=onSelect;
    this.disposed=false;
    this.markers=new Map();
    this.box=new THREE.Box3().setFromObject(viewer.model,true);
    if(this.box.isEmpty())throw new Error('No se encontró geometría para colocar marcadores.');
    this.initial=initialMarkers(this.box);
    this.radius=Math.max((this.box.max.y-this.box.min.y)*.009,.0001);
    this.root=new THREE.Group();
    this.root.name='ORBI_AUTORIG02_EDITOR_ONLY';
    viewer.scene.add(this.root);
    this.geometry=new THREE.SphereGeometry(this.radius,12,10);
    for(const name of LANDMARK_NAMES){
      const material=new THREE.MeshBasicMaterial({
        color:0x4fd8c6,depthTest:false,transparent:true,opacity:.92,
      });
      const handle=new THREE.Mesh(this.geometry,material);
      handle.position.fromArray(this.initial[name]);
      handle.name='ORBI_LM_'+name;
      handle.userData.orbiMarker=name;
      handle.renderOrder=998;
      this.root.add(handle);
      this.markers.set(name,handle);
    }
    this.lineGeometry=new THREE.BufferGeometry();
    this.linePositions=new Float32Array(19*2*3);
    this.lineGeometry.setAttribute('position',new THREE.BufferAttribute(this.linePositions,3));
    this.lines=new THREE.LineSegments(this.lineGeometry,
      new THREE.LineBasicMaterial({color:0xffce74,depthTest:false,transparent:true,opacity:.88}));
    this.lines.name='ORBI_AUTORIG02_SKELETON_LINES';
    this.lines.renderOrder=997;
    this.lines.visible=false;
    this.root.add(this.lines);
    this.boneRoot=new THREE.Group();
    this.boneRoot.name='ORBI_AUTORIG02_DRAFT_BONES';
    this.root.add(this.boneRoot);
    this.hasSkeleton=false;

    this.transform=new TransformControls(viewer.camera,viewer.renderer.domElement);
    this.transform.setMode('translate');
    this.transform.setSize(.6);
    this.helper=this.transform.getHelper();
    viewer.scene.add(this.helper);
    this.onDragging=event=>{viewer.controls.enabled=!event.value;};
    this.onObjectChange=()=>{if(this.disposed)return;this.updatePreview();this.emit();};
    this.transform.addEventListener('dragging-changed',this.onDragging);
    this.transform.addEventListener('objectChange',this.onObjectChange);

    this.raycaster=new THREE.Raycaster();
    this.pointer=new THREE.Vector2();
    this.meshes=[];
    viewer.model.traverse(node=>{if(node.isMesh&&node.visible)this.meshes.push(node);});
    this.onPointerDown=this.pointerDown.bind(this);
    viewer.renderer.domElement.addEventListener('pointerdown',this.onPointerDown);
    this.select('pelvis');
    this.emit();
  }
  screenRay(event){
    const rect=this.viewer.renderer.domElement.getBoundingClientRect();
    if(!rect.width||!rect.height)return false;
    this.pointer.set(((event.clientX-rect.left)/rect.width)*2-1,
      -((event.clientY-rect.top)/rect.height)*2+1);
    this.raycaster.setFromCamera(this.pointer,this.viewer.camera);
    return true;
  }
  pointerDown(event){
    if(this.disposed||event.button!==0||!this.screenRay(event))return;
    // Shift + click projects the selected joint onto the character surface.
    // The XYZ gizmo can then move it into the anatomical joint volume.
    if(event.shiftKey){
      const hit=this.raycaster.intersectObjects(this.meshes,false)[0];
      if(hit&&this.selected){
        this.setMarker(this.selected,hit.point.toArray());
        event.preventDefault();
      }
      return;
    }
    const hit=this.raycaster.intersectObjects([...this.markers.values()],false)[0];
    if(hit)this.select(hit.object.userData.orbiMarker);
  }
  select(name){
    if(!this.markers.has(name))throw new Error('Marcador desconocido: '+name);
    this.selected=name;
    for(const [key,handle] of this.markers){
      handle.material.color.setHex(key===name?0xffca65:0x4fd8c6);
      handle.scale.setScalar(key===name?1.35:1);
    }
    this.transform.attach(this.markers.get(name));
    this.onSelect(name);
  }
  setMarker(name,coords){
    if(!this.markers.has(name)||!Array.isArray(coords)||coords.length!==3||
       !coords.every(Number.isFinite))
      throw new Error('Posición de marcador no válida.');
    this.markers.get(name).position.fromArray(coords);
    this.updatePreview();
    this.emit();
  }
  getMarkers(){
    return Object.fromEntries([...this.markers].map(([name,h])=>[name,h.position.toArray()]));
  }
  setMarkers(markers){
    const valid=validateMarkers(markers);
    if(!valid.ok)throw new Error(valid.errors.join(' '));
    for(const name of LANDMARK_NAMES)this.markers.get(name).position.fromArray(markers[name]);
    this.updatePreview();
    this.emit();
  }
  reflectSelected(){
    const next=mirrorMarker(this.getMarkers(),this.selected);
    this.setMarkers(next);
    return this.selected.startsWith('left')?'right'+this.selected.slice(4):
      'left'+this.selected.slice(5);
  }
  createSkeletonPreview(){
    const bones=skeletonDraft(this.getMarkers());
    this.hasSkeleton=true;
    this.lines.visible=true;
    this.updatePreview();
    return bones;
  }
  updatePreview(){
    if(!this.hasSkeleton)return;
    const bones=skeletonDraft(this.getMarkers());
    for(const bone of [...this.boneRoot.children])this.boneRoot.remove(bone);
    const map=new Map();
    for(const entry of bones){
      const bone=new THREE.Bone();
      bone.name=entry.name;
      const head=new THREE.Vector3().fromArray(entry.head);
      const parent=entry.parent?map.get(entry.parent):null;
      const parentHead=parent?.userData.worldHead;
      bone.position.copy(parentHead?head.sub(parentHead):head);
      bone.userData.worldHead=new THREE.Vector3().fromArray(entry.head);
      if(parent)parent.add(bone);else this.boneRoot.add(bone);
      map.set(entry.name,bone);
    }
    this.boneRoot.updateMatrixWorld(true);
    let i=0;
    for(const {head,tail} of bones){
      this.linePositions.set(head,i);i+=3;
      this.linePositions.set(tail,i);i+=3;
    }
    this.lineGeometry.attributes.position.needsUpdate=true;
    this.lineGeometry.computeBoundingSphere();
  }
  emit(){this.onMarkers(this.getMarkers());}
  dispose(){
    if(this.disposed)return;
    this.disposed=true;
    this.viewer.renderer.domElement.removeEventListener('pointerdown',this.onPointerDown);
    this.transform.removeEventListener('dragging-changed',this.onDragging);
    this.transform.removeEventListener('objectChange',this.onObjectChange);
    this.transform.detach();
    this.transform.dispose();
    this.helper.parent?.remove(this.helper);
    this.viewer.controls.enabled=true;
    this.root.parent?.remove(this.root);
    for(const mesh of this.markers.values())mesh.material.dispose();
    this.geometry.dispose();
    this.lineGeometry.dispose();
    this.lines.material.dispose();
    this.markers.clear();
  }
}
