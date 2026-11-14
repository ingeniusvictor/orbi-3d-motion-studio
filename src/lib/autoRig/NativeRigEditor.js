import * as THREE from 'three';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {LANDMARK_NAMES,initialMarkers,mirrorMarker,skeletonDraft,validateMarkers} from './nativeRig.js';
import {
  PLACEMENT_MODES,VIEW_PRESETS,constrainMarkerPosition,
  getViewDirection,getDefaultAxesForView,
} from './placementConstraints.js';

// EDITOR-ONLY overlay; never parent controls/bones to the imported model.
export class NativeRigEditor{
  constructor(viewer,{onMarkers=()=>{},onSelect=()=>{},onHistory=()=>{},onView=()=>{}}={}){
    if(!viewer?.model||!viewer.scene||!viewer.camera||!viewer.renderer)
      throw new Error('Abre un personaje GLB estático antes de editar.');
    this.viewer=viewer;
    this.onMarkers=onMarkers;
    this.onSelect=onSelect;
    this.onHistory=onHistory;
    this.onView=onView;
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

    this.cameraSnapshot={
      position:viewer.camera.position.clone(),
      up:viewer.camera.up.clone(),
      near:viewer.camera.near,far:viewer.camera.far,
      target:viewer.controls.target.clone(),
      minDistance:viewer.controls.minDistance,
      maxDistance:viewer.controls.maxDistance,
      enabled:viewer.controls.enabled,
      enableRotate:viewer.controls.enableRotate,
      enablePan:viewer.controls.enablePan,
      enableZoom:viewer.controls.enableZoom,
    };
    this.view='front';
    this.axisMode='XY';
    this.cameraLock=true;
    this.undoStack=[];
    this.redoStack=[];
    this.dragAnchor=null;

    this.transform=new TransformControls(viewer.camera,viewer.renderer.domElement);
    this.transform.setMode('translate');
    this.transform.setSpace('world');
    this.transform.setSize(.6);
    this.helper=this.transform.getHelper();
    viewer.scene.add(this.helper);
    this.onDragging=event=>{
      // Never allow OrbitControls to rotate/pan while dragging a joint.
      viewer.controls.enabled=!event.value&&this.cameraSnapshot.enabled;
    };
    this.onDragStart=()=>{this.dragAnchor=this.getMarkers();};
    this.onDragEnd=()=>{
      if(this.dragAnchor){this.recordChange(this.dragAnchor);this.dragAnchor=null;}
    };
    this.onObjectChange=()=>{
      if(this.disposed)return;
      // Constrain even when a gizmo center/plane attempts to move forbidden axes.
      const handle=this.markers.get(this.selected);
      if(handle){
        const anchor=this.dragAnchor?.[this.selected]||handle.position.toArray();
        handle.position.fromArray(constrainMarkerPosition(
          anchor,handle.position.toArray(),this.axisMode));
      }
      this.updatePreview();
      this.emit();
    };
    this.transform.addEventListener('dragging-changed',this.onDragging);
    this.transform.addEventListener('mouseDown',this.onDragStart);
    this.transform.addEventListener('mouseUp',this.onDragEnd);
    this.transform.addEventListener('objectChange',this.onObjectChange);

    this.raycaster=new THREE.Raycaster();
    this.pointer=new THREE.Vector2();
    this.meshes=[];
    viewer.model.traverse(node=>{if(node.isMesh&&node.visible)this.meshes.push(node);});
    this.onPointerDown=this.pointerDown.bind(this);
    this.onKeyDown=this.keyDown.bind(this);
    viewer.renderer.domElement.addEventListener('pointerdown',this.onPointerDown);
    window.addEventListener('keydown',this.onKeyDown);
    this.select('pelvis');
    this.setView('front');
    this.emit();
    this.emitHistory();
  }
  screenRay(event){
    const rect=this.viewer.renderer.domElement.getBoundingClientRect();
    if(!rect.width||!rect.height)return false;
    this.pointer.set(((event.clientX-rect.left)/rect.width)*2-1,
      -((event.clientY-rect.top)/rect.height)*2+1);
    this.raycaster.setFromCamera(this.pointer,this.viewer.camera);
    return true;
  }
  planeIntersection(){
    const anchor=this.markers.get(this.selected)?.position;
    if(!anchor)return null;
    let normal;
    if(this.cameraLock&&VIEW_PRESETS.includes(this.view))
      normal=new THREE.Vector3().fromArray(getViewDirection(this.view));
    else
      normal=this.viewer.camera.getWorldDirection(new THREE.Vector3());
    const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,anchor);
    return this.raycaster.ray.intersectPlane(plane,new THREE.Vector3());
  }
  pointerDown(event){
    if(this.disposed||event.button!==0||!this.screenRay(event))return;
    if(event.shiftKey&&this.selected){
      // Shift-click = intersection with the selected landmark's fixed-depth plane,
      // not a potentially offset garment/surface. Depth cannot jump accidentally.
      const planePoint=this.planeIntersection();
      if(planePoint){
        const old=this.getMarkers()[this.selected];
        this.setMarker(this.selected,
          constrainMarkerPosition(old,planePoint.toArray(),this.axisMode));
        event.preventDefault();
      }
      return;
    }
    const hit=this.raycaster.intersectObjects([...this.markers.values()],false)[0];
    if(hit)this.select(hit.object.userData.orbiMarker);
  }
  keyDown(event){
    if(!event.ctrlKey&&!event.metaKey)return;
    if(event.altKey||event.target?.closest?.('input,textarea,select,[contenteditable=true]'))return;
    const key=event.key.toLowerCase();
    if(key==='z'){event.preventDefault();event.shiftKey?this.redo():this.undo();}
    else if(key==='y'){event.preventDefault();this.redo();}
  }
  setCameraLock(locked){
    this.cameraLock=Boolean(locked);
    const controls=this.viewer.controls,original=this.cameraSnapshot;
    // Keep wheel zoom available, but disallow camera rotation and panning.
    controls.enabled=original.enabled;
    controls.enableRotate=locked?false:original.enableRotate;
    controls.enablePan=locked?false:original.enablePan;
    controls.enableZoom=original.enableZoom;
    this.onView({view:this.view,axes:this.axisMode,cameraLocked:this.cameraLock});
  }
  setView(view){
    if(!VIEW_PRESETS.includes(view))throw new Error('Vista desconocida: '+view);
    const camera=this.viewer.camera,controls=this.viewer.controls;
    const direction=new THREE.Vector3().fromArray(getViewDirection(view));
    const center=this.box.getCenter(new THREE.Vector3());
    const size=this.box.getSize(new THREE.Vector3());
    const radius=Math.max(size.length()*.5,.01);
    const distance=Math.max(
      radius/Math.sin(THREE.MathUtils.degToRad(camera.fov/2))*1.25,
      radius*2.5);
    this.view=view;
    camera.up.set(0,view==='top'?0:1,view==='top'?-1:0);
    camera.position.copy(center).addScaledVector(direction,distance);
    camera.near=Math.max(distance/2000,1e-6);
    camera.far=Math.max(distance*30,radius*100,2);
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.minDistance=Math.max(distance*.1,1e-5);
    controls.maxDistance=Math.max(distance*15,1);
    controls.update();
    this.setPlacementAxes(getDefaultAxesForView(view));
    this.setCameraLock(true);
  }
  setPlacementAxes(axes){
    if(!PLACEMENT_MODES.includes(axes))throw new Error('Ejes desconocidos: '+axes);
    this.axisMode=axes;
    this.transform.showX=axes.includes('X');
    this.transform.showY=axes.includes('Y');
    this.transform.showZ=axes.includes('Z');
    this.onView({view:this.view,axes:this.axisMode,cameraLocked:this.cameraLock});
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
  getMarkers(){
    return Object.fromEntries([...this.markers].map(([name,h])=>[name,h.position.toArray()]));
  }
  recordChange(before){
    if(JSON.stringify(before)===JSON.stringify(this.getMarkers()))return false;
    this.undoStack.push(before);
    if(this.undoStack.length>50)this.undoStack.shift();
    this.redoStack.length=0;
    this.emitHistory();
    return true;
  }
  emitHistory(){
    this.onHistory({canUndo:this.undoStack.length>0,canRedo:this.redoStack.length>0,
      undoCount:this.undoStack.length,redoCount:this.redoStack.length});
  }
  applySnapshot(markers){
    for(const name of LANDMARK_NAMES)this.markers.get(name).position.fromArray(markers[name]);
    this.updatePreview();
    this.emit();
  }
  undo(){
    if(!this.undoStack.length)return false;
    const current=this.getMarkers();
    this.redoStack.push(current);
    this.applySnapshot(this.undoStack.pop());
    this.emitHistory();
    return true;
  }
  redo(){
    if(!this.redoStack.length)return false;
    const current=this.getMarkers();
    this.undoStack.push(current);
    this.applySnapshot(this.redoStack.pop());
    this.emitHistory();
    return true;
  }
  setMarker(name,coords,{force=false}={}){
    if(!this.markers.has(name)||!Array.isArray(coords)||coords.length!==3||
       !coords.every(Number.isFinite))
      throw new Error('Posición de marcador no válida.');
    const before=this.getMarkers();
    const point=force?coords:constrainMarkerPosition(before[name],coords,this.axisMode);
    this.markers.get(name).position.fromArray(point);
    this.updatePreview();
    this.recordChange(before);
    this.emit();
  }
  setMarkers(markers){
    const valid=validateMarkers(markers);
    if(!valid.ok)throw new Error(valid.errors.join(' '));
    const before=this.getMarkers();
    this.applySnapshot(markers);
    this.recordChange(before);
  }
  resetSelected(){
    if(!this.selected)return;
    this.setMarker(this.selected,this.initial[this.selected],{force:true});
  }
  resetAll(){
    this.setMarkers(this.initial);
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
    const check=validateMarkers(this.getMarkers());
    if(!check.ok){this.lines.visible=false;return;}
    this.lines.visible=true;
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
    window.removeEventListener('keydown',this.onKeyDown);
    this.transform.removeEventListener('dragging-changed',this.onDragging);
    this.transform.removeEventListener('mouseDown',this.onDragStart);
    this.transform.removeEventListener('mouseUp',this.onDragEnd);
    this.transform.removeEventListener('objectChange',this.onObjectChange);
    this.transform.detach();
    this.transform.dispose();
    this.helper.parent?.remove(this.helper);
    const snap=this.cameraSnapshot,viewer=this.viewer;
    viewer.camera.position.copy(snap.position);
    viewer.camera.up.copy(snap.up);
    viewer.camera.near=snap.near;
    viewer.camera.far=snap.far;
    viewer.camera.updateProjectionMatrix();
    viewer.controls.target.copy(snap.target);
    viewer.controls.minDistance=snap.minDistance;
    viewer.controls.maxDistance=snap.maxDistance;
    viewer.controls.enabled=snap.enabled;
    viewer.controls.enableRotate=snap.enableRotate;
    viewer.controls.enablePan=snap.enablePan;
    viewer.controls.enableZoom=snap.enableZoom;
    viewer.controls.update();
    this.root.parent?.remove(this.root);
    for(const mesh of this.markers.values())mesh.material.dispose();
    this.geometry.dispose();
    this.lineGeometry.dispose();
    this.lines.material.dispose();
    this.markers.clear();
  }
}
