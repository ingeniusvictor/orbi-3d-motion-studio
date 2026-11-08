import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { adaptFbxToVrm } from './vrmMotion.js';
import { auditVrmRig } from './livingPresence/rigAudit.js';
import { LivingPresence } from './livingPresence/LivingPresence.js';
import { MotionComposer } from './livingPresence/motionComposer.js';
import { LipSyncController } from './livingPresence/lipSync.js';
import { FacialPresence } from './livingPresence/facialPresence.js';
import { bakeVrmForGlb, convertVrmMaterials } from './vrmExport.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { catalogMaterials, applyTextureToMaterial } from './textureStudio.js';
import { captureMaterialState,restoreMaterialState } from './textureBatch.js';
import { skinnedMeshes, skinBoneCount, exportLightweightGLB } from './lightweight.js';
import { lightweightBinaryFBX, animatedBinaryFBX, cleanRiggedMixamoFBX } from './fbxExport.js';
import { captureReferencePose, exportableClipJSON } from './motionExtraction.js';
import { extensionOf, formatBytes, inspectRigCompatibility, uniqueClipName, summarizeRenderableGeometry, validateLoadedContent } from './modelInfo.js';

const EMPTY_INFO = { meshes: 0, vertices: 0, triangles: 0, materials: 0, bones: 0, animations: 0, nodes: 0, textures: 0, hierarchy: [] };

function inspect(root, clips) {
  let meshes = 0, vertices = 0, triangles = 0, bones = 0, nodes = 0;
  const materials = new Set(), textures = new Set(), hierarchy = [];
  root.traverse(object => {
    nodes += 1;
    if (object.isBone) bones += 1;
    if (object.isMesh) {
      meshes += 1;
      const geometry = object.geometry;
      const count = geometry?.getAttribute('position')?.count || 0;
      vertices += count;
      triangles += geometry?.index ? Math.floor(geometry.index.count / 3) : Math.floor(count / 3);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!material) continue;
        materials.add(material.uuid);
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap']) {
          if (material[key]?.isTexture) textures.add(material[key].uuid);
        }
      }
    }
    if (hierarchy.length < 180) {
      let depth = 0, parent = object.parent;
      while (parent && parent !== root && depth < 7) { depth += 1; parent = parent.parent; }
      hierarchy.push({ name: object.name || (object === root ? 'Escena' : object.type), type: object.type, depth });
    }
  });
  return { meshes, vertices, triangles, bones, nodes, materials:materials.size, textures:textures.size, animations:clips.length, hierarchy };
}

function makeManager(files) {
  const urls = [];
  const resources = new Map();
  for (const file of files) {
    const url = URL.createObjectURL(file);
    urls.push(url);
    const path = (file.webkitRelativePath || file.name).replaceAll('\\','/').toLowerCase();
    resources.set(path, url);
    resources.set(file.name.toLowerCase(), url);
  }
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(request => {
    if (request.startsWith('blob:') || request.startsWith('data:')) return request;
    let path;
    try { path = decodeURIComponent(request.split(/[?#]/)[0]); } catch { path = request; }
    path = path.replaceAll('\\','/').replace(/^\.\//,'').toLowerCase();
    if (resources.has(path)) return resources.get(path);
    const basename = path.split('/').pop();
    return resources.get(basename) || request;
  });
  return { manager, urls, resources };
}

async function loadObject(files, { animationSource = false } = {}) {
  const list = Array.from(files);
  const primary = list.find(file => ['glb','gltf','fbx','vrm'].includes(extensionOf(file.name)));
  if (!primary) throw new Error('Selecciona un modelo .glb, .gltf, .fbx o .vrm.');
  const {manager, urls, resources} = makeManager(list);
  try {
    const extension = extensionOf(primary.name);
    const loader = extension === 'fbx' ? new FBXLoader(manager) : new GLTFLoader(manager);
    if (extension !== 'fbx') loader.register(parser => new VRMLoaderPlugin(parser));
    const source = resources.get(primary.name.toLowerCase());
    const loaded = await loader.loadAsync(source);
    const vrm = extension === 'fbx' ? null : loaded.userData?.vrm || null;
    if (extension === 'vrm' && !vrm) {
      throw new Error('El archivo usa la extensión .vrm, pero no contiene metadatos VRM compatibles.');
    }
    if (vrm) VRMUtils.rotateVRM0(vrm);
    const model = vrm?.scene || (extension === 'fbx' ? loaded : loaded.scene);
    const clips = (loaded.animations || []).map(clip => clip.clone());
    const geometry = summarizeRenderableGeometry(model);
    // Animation-only Mixamo files intentionally have bones and clips, but no mesh.
    // Permit them ONLY in the import-animations workflow, not as visible models.
    const reason = validateLoadedContent(geometry, clips.length, animationSource && extension === 'fbx');
    if (reason) throw new Error(reason);
    model.updateWorldMatrix(true, true);
    return {model, clips, vrm, name:primary.name, bytes: list.reduce((n,file) => n+file.size,0), format:vrm ? 'VRM' : extension.toUpperCase()};
  } catch(error) {
    throw new Error(`No se pudo abrir ${primary.name}. Si utilizas .gltf, selecciona también sus .bin y texturas. Detalle: ${error?.message || error}`);
  } finally {
    // Defer revocation until all loader-created image/texture tasks have resolved.
    setTimeout(() => urls.forEach(url => URL.revokeObjectURL(url)), 3000);
  }
}

export class MotionViewer {
  constructor(mount, notify = () => {}) {
    this.mount = mount;
    this.notify = notify;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0b1220');
    // Fixed-distance fog made centimeter-scale FBX models vanish entirely.
    // Keep the clean dark backdrop and render all model scales without fog.
    this.scene.fog = null;
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 2000);
    this.camera.position.set(3,2.5,5);
    this.renderer = new THREE.WebGLRenderer({antialias:true, alpha:false, powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;
    this.renderer.domElement.className = 'viewer-canvas';
    mount.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 0.1;
    this.controls.maxDistance = 500;
    this.ambient = new THREE.HemisphereLight(0xd9edff,0x26364f,2.2);
    this.keyLight = new THREE.DirectionalLight(0xffffff,3.2); this.keyLight.position.set(5,8,6);
    this.fillLight = new THREE.DirectionalLight(0x42adff,1.6); this.fillLight.position.set(-5,3,-5);
    this.scene.add(this.ambient,this.keyLight,this.fillLight);
    this.grid = new THREE.GridHelper(20,40,0x264d66,0x1b2a41);
    this.grid.position.y = -0.01;
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.5;
    this.scene.add(this.grid);
    this.clock = new THREE.Clock();
    this.clips = [];
    this.model = null;
    this.vrm = null;
    this.mixer = null;
    this.current = null;
    this.playing = false;
    this.speed = 1;
    this.skeleton = null;
    this.showBones = false;
    this.wireframe = false;
    this.lastFilename = null;
    this.referencePose = null;
    this.lastFormat = null;
    this.textureAssetUrls = new Set();
    this.lastTextureBatch = null;
    this.loadSequence = 0;
    this.presence = null;
    this.motionComposer = null;
    this.lipSync = null;
    this.facial = null;
    this.presenceSuspendCount = 0;
    this.disposed = false;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(mount);
    this.resize();
    this.animate = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(this.animate);
      const delta = Math.min(this.clock.getDelta(),0.1);
      // Ownership order: remove prior overlay → FBX mixer → masked procedural
      // deltas → VRM constraints/expressions/springbones → render.
      if(!this.presenceSuspendCount){
        // Undo in reverse overlay order: LivingPresence → FBX softener.
        this.presence?.beforeFrame();
        this.facial?.beforeFrame();
        this.motionComposer?.beforeFrame();
      }
      if (!this.presenceSuspendCount && this.mixer && this.playing) this.mixer.update(delta);
      if(!this.presenceSuspendCount&&this.presence?.enabled)
        this.motionComposer?.applyTorsoSoftening(delta);
      if(!this.presenceSuspendCount)this.presence?.update(delta,{
        clipPlaying:Boolean(this.mixer && this.current !== null),
        composition:this.motionComposer,
      });
      // Speech mouth expressions are separate from Mixamo bone ownership.
      if(!this.presenceSuspendCount){
        this.lipSync?.update(delta);
        this.facial?.update(delta,{
          presenceActive:Boolean(this.presence?.enabled),
          lipOpening:this.lipSync?.opening||0,
        });
      }
      // VRM spring bones, constraints and expressions require an update each frame.
      this.vrm?.update(delta);
      this.controls.update();
      this.renderer.render(this.scene,this.camera);
    };
    this.animate();
  }
  resize() {
    const width = Math.max(this.mount.clientWidth,1), height = Math.max(this.mount.clientHeight,1);
    this.camera.aspect = width/height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width,height,false);
  }
  focusFace(){
    if(!this.model||!this.vrm)return false;
    const head=this.vrm.humanoid?.getNormalizedBoneNode?.('head')||
      this.vrm.humanoid?.getRawBoneNode?.('head');
    if(!head)return false;
    this.model.updateWorldMatrix(true,true);
    const focus=head.getWorldPosition(new THREE.Vector3());
    const box=new THREE.Box3().setFromObject(this.model,true);
    const height=box.getSize(new THREE.Vector3()).y;
    if(!Number.isFinite(height)||height<=0||
      ![focus.x,focus.y,focus.z].every(Number.isFinite))return false;
    const distance=Math.max(height*0.62,0.01);
    // Preserve the current viewing direction; this is a camera change only,
    // never a modification to the avatar's head or Mixamo clip.
    const look=this.camera.position.clone().sub(this.controls.target);
    if(look.lengthSq()<1e-10)look.set(0,0,1);
    look.normalize();
    this.controls.target.copy(focus);
    this.camera.position.copy(focus).addScaledVector(look,distance);
    this.camera.near=Math.max(distance/1000,0.00001);
    this.camera.far=Math.max(distance*120,height*20,1);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    return true;
  }
  resetCamera() {
    if (!this.model) {
      this.camera.position.set(3,2.5,5);
      this.controls.target.set(0,1,0);
      this.controls.update();
      return;
    }
    this.model.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(this.model, true);
    if (box.isEmpty() || !Number.isFinite(box.min.x) || !Number.isFinite(box.max.x) ||
      !Number.isFinite(box.min.y) || !Number.isFinite(box.max.y) ||
      !Number.isFinite(box.min.z) || !Number.isFinite(box.max.z)) {
      this.camera.position.set(3,2.5,5); this.controls.target.set(0,0,0); this.controls.update(); return;
    }
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 0.001);
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const distance = Math.max(radius / Math.sin(vfov / 2), radius / Math.sin(hfov / 2), 0.02) * 1.35;
    this.camera.near = Math.max(distance / 2000, 0.00001);
    this.camera.far = Math.max(distance * 100, radius * 100, 100);
    this.camera.updateProjectionMatrix();
    this.camera.position.set(center.x + distance * 0.24, center.y + distance * 0.15, center.z + distance);
    this.controls.target.copy(center);
    this.controls.minDistance = Math.max(radius * 0.05, 0.0005);
    this.controls.maxDistance = Math.max(distance * 40, 50);
    this.controls.update();
    this.grid.position.y = box.min.y-0.015;
    this.grid.scale.setScalar(Math.max(radius / 5, 0.001));
  }
  async open(files) {
    const request = ++this.loadSequence;
    const loaded = await loadObject(files);
    if (this.disposed || request !== this.loadSequence) return null;
    this.clearModel();
    this.model = loaded.model;
    this.vrm = loaded.vrm;
    // Stabilize the root label BEFORE taking the reference-pose snapshot.
    // FBXLoader can return an unnamed Group; assigning a name afterwards
    // previously made the safe-copy validator reject the unchanged rig.
    this.model.name ||= loaded.name.replace(/\.[^.]+$/,'');
    // Still captured before any AnimationMixer action or presence overlay.
    this.referencePose = captureReferencePose(this.model);
    this.presence = this.vrm ? new LivingPresence(this.vrm,{sourceName:loaded.name}) : null;
    this.motionComposer = this.vrm ? new MotionComposer(this.vrm) : null;
    this.lipSync = this.vrm ? new LipSyncController(this.vrm) : null;
    this.facial = this.vrm ? new FacialPresence(this.vrm,{
      seed:this.presence?.randomSeed||367,
    }) : null;
    this.lastFilename = loaded.name;
    this.lastFormat = loaded.format;
    this.scene.add(this.model);
    this.clips = loaded.clips.map((clip,index)=>({name:uniqueClipName(loaded.clips.slice(0,index).map(c=>c.name),clip.name || `Animación ${index+1}`),clip,source:'Original'}));
    this.mixer = new THREE.AnimationMixer(this.model);
    if (this.clips.length) { this.play(0); this.mixer.update(0); }
    this.resetCamera();
    this.setSkeletonVisible(this.showBones);
    this.setWireframe(this.wireframe);
    const info = inspect(this.model,this.clips);
    this.notify();
    return {...info, filename:loaded.name, bytes:loaded.bytes, format:loaded.format};
  }
  clearModel() {
    this.facial?.dispose();this.facial=null;
    this.lipSync?.dispose();
    this.lipSync=null;
    this.presence?.resetOverlay();
    this.motionComposer?.dispose();
    this.motionComposer=null;
    this.presenceSuspendCount=0;
    this.presence?.dispose();
    this.presence=null;
    if(this.lightPreviewStates?.size)this.setLightPreview(null);
    if (this.mixer) { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.model); }
    if (this.skeleton) {this.scene.remove(this.skeleton);this.skeleton.dispose(); this.skeleton=null;}
    if (this.model) {
      this.scene.remove(this.model);
      VRMUtils.deepDispose(this.model);
    }
    for(const url of this.textureAssetUrls)URL.revokeObjectURL(url);
    this.textureAssetUrls.clear();
    this.lastTextureBatch=null;
    this.model = null;
    this.vrm = null;
    this.referencePose = null;
    this.mixer = null;
    this.clips = [];
    this.current = null;
    this.playing = false;
  }
  play(index) {
    if (!this.mixer || !this.clips[index]) return false;
    this.presence?.resetOverlay();
    this.motionComposer?.beforeFrame();
    this.mixer.stopAllAction();
    this.current = index;
    const clip = this.clips[index].clip;
    this.motionComposer?.selectClip(clip,{source:this.clips[index].source});
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(THREE.LoopRepeat,Infinity);
    action.play();
    this.playing = true;
    this.notify();
    return true;
  }
  setPlaying(playing) { if (!this.mixer) return; this.playing = Boolean(playing); this.notify(); }
  setSpeed(speed) { this.speed = Number(speed); if(this.mixer) this.mixer.timeScale=this.speed; }
  getLivingComposerStatus() { return this.motionComposer?.getStatus() || null; }
  setLivingComposerEnabled(value) {
    if(!this.motionComposer)return false;
    this.presence?.resetOverlay();
    this.motionComposer.beforeFrame();
    this.motionComposer.setEnabled(value);
    return true;
  }
  setLivingComposerIntensity(value) {
    if(!this.motionComposer)return;
    this.motionComposer.setIntensity(value);
    if(!this.motionComposer.active)this.presence?.resetOverlay();
  }
  setLivingTorsoSoftening(value){this.motionComposer?.setTorsoSoftening(value);}
  setLivingTorsoSofteningEnabled(value){
    this.presence?.resetOverlay();
    this.motionComposer?.beforeFrame();
    this.motionComposer?.setTorsoSofteningEnabled(value);
  }
  setLivingSwayIntensity(value){this.presence?.setSwayIntensity(value);}
  setLivingSwaySpeed(value){this.presence?.setSwaySpeed(value);}
  getLivingFacialDiagnostics(){
    return this.facial?.getDiagnostics()||{
      supported:false,channels:{},independent:[],proxies:[],
      missing:[],blink:false,gaze:false,
      reason:'Carga Vita.vrm para inspeccionar el rostro.',
    };
  }
  setLivingFacialEnabled(value){this.facial?.setEnabled(value);}
  setLivingFacialIntensity(value){this.facial?.setIntensity(value);}
  setLivingFacialMode(mode){return this.facial?.setMode(mode)??false;}
  previewLivingFace(feature){return this.facial?.previewFeature(feature)??false;}
  previewLivingBlink(){return this.presence?.enabled?
    (this.presence?.previewBlink()??false):false;}
  previewLivingGaze(direction){return this.presence?.enabled?
    (this.presence?.previewGaze(direction)??false):false;}
  startLivingFaceSpeech(token,options){return this.facial?.beginSpeech(token,options)??false;}
  stopLivingFaceSpeech(token){return this.facial?.endSpeech(token)??false;}
  getLivingLipDiagnostics(){
    return this.lipSync?.getDiagnostics()||{
      supported:false,names:[],mapping:{},reason:'Carga un avatar VRM para revisar los visemas.',
      active:false,opening:0,
    };
  }
  setLivingLipStrength(value){this.lipSync?.setStrength(value);}
  previewLivingVowel(vowel='a'){return this.lipSync?.preview(vowel)??false;}
  startLivingLipSync(token,options){return this.lipSync?.start(token,options)??false;}
  pauseLivingLipSync(token){return this.lipSync?.pause(token)??false;}
  resumeLivingLipSync(token){return this.lipSync?.resume(token)??false;}
  boundaryLivingLipSync(token,charIndex){return this.lipSync?.boundary(token,charIndex)??false;}
  updateLivingLipAudio(token,rms,progress){
    return this.lipSync?.audioSignal(token,rms,progress)??false;
  }
  stopLivingLipSync(token){return this.lipSync?.stop(token)??false;}
  getLivingSpeechMotorAvailability(){
    if(!this.vrm||!this.presence?.enabled)
      return {available:false,reason:'Activa Presencia natural A/B sobre un VRM.'};
    if(this.mixer&&this.current!==null&&!this.motionComposer?.active)
      return {available:false,reason:'Activa LP-02C.1 sobre un Idle Mixamo autorizado; el FBX actual tiene prioridad.'};
    return {available:true,reason:'Motor preparado para acompañar la reproducción de voz.'};
  }
  setLivingMotorCoordination(value){this.presence?.setMotorCoordination(value);}
  setLivingMotorIntensity(value){this.presence?.setMotorIntensity(value);}
  setLivingMotorMode(value){
    const accepted=this.presence?.setMotorMode(value)??false;
    if(accepted)this.facial?.setMode(value);
    return accepted;
  }
  getLivingMotorStatus(){return this.presence?.getMotorStatus()||null;}
  setLivingGestureEnabled(value){this.presence?.setGestureEnabled(value);}
  setLivingGestureIntensity(value){this.presence?.setGestureIntensity(value);}
  getLivingGestureStatus(){return this.presence?.getGestureStatus()||null;}
  triggerLivingGesture(name){
    if(!this.presence?.enabled)return false;
    // An FBX selection is never overridden without user-approved idle
    // composition, even when the imported action is paused.
    if(this.mixer&&this.current!==null&&!this.motionComposer?.active)return false;
    return this.presence.triggerGesture(name);
  }
  getLivingRigAudit() { return this.vrm ? auditVrmRig(this.vrm) : null; }
  setLivingPresence(enabled) {
    if(!this.presence)return false;
    this.presence.setEnabled(enabled);
    if(!enabled)this.motionComposer?.beforeFrame();
    return true;
  }
  setLivingPresenceIntensity(value) { this.presence?.setIntensity(value); }
  setLivingPosture(value) { this.presence?.setPosture(value); }
  setLivingHandRelaxation(value) { this.presence?.setHandRelaxation(value); }
  setLivingLegIntensity(value) { this.presence?.setLegIntensity(value); }
  getLivingLegDiagnostics() { return this.presence?.getLegDiagnostics() || null; }
  setLivingFingerDirection(side, reversed) { this.presence?.setFingerDirection(side, reversed); }
  setLivingFingerOverride(side, finger, reversed) { return this.presence?.setFingerOverride(side, finger, reversed) ?? false; }
  getLivingFingerCalibration() { return this.presence?.getFingerCalibrationState() || null; }
  getLivingPoseDiagnostics() { return this.presence?.getDiagnostics() || []; }
  getLivingCapabilities() { return this.presence?.getCapabilities() || null; }
  setLivingOptions(options) { this.presence?.setOptions(options); }
  setSkeletonVisible(show) {
    this.showBones = Boolean(show);
    if (this.skeleton) {this.scene.remove(this.skeleton);this.skeleton.dispose();this.skeleton=null;}
    if (this.model && show) {
      this.skeleton = new THREE.SkeletonHelper(this.model);
      this.skeleton.material.color.set(0x38e7dd);
      this.scene.add(this.skeleton);
    }
  }
  setWireframe(enabled) {
    this.wireframe = Boolean(enabled);
    this.model?.traverse(node => {
      if (!node.isMesh) return;
      for (const material of Array.isArray(node.material)?node.material:[node.material]) {
        if (material && 'wireframe' in material) material.wireframe = this.wireframe;
      }
    });
  }
  setLightPreview(selectedIds) {
    if(!this.model)return;
    if(!this.lightPreviewStates)this.lightPreviewStates=new Map();
    this.model.traverse(node=>{
      if(!node.isMesh)return;
      if(!this.lightPreviewStates.has(node))this.lightPreviewStates.set(node,node.visible);
      node.visible = selectedIds
        ? Boolean(node.isSkinnedMesh && selectedIds.includes(node.uuid))
        : this.lightPreviewStates.get(node);
    });
    if(!selectedIds)this.lightPreviewStates.clear();
  }
  getLightMeshes() { return this.model ? skinnedMeshes(this.model) : []; }
  getLightBoneCount() { return this.model ? skinBoneCount(this.model) : 0; }
  // Preview-only overlays must not leak into downloaded GLB/FBX geometry.
  // Freeze LivingPresence while model preparation/export runs asynchronously.
  async withPresenceSuspended(operation){
    this.presenceSuspendCount++;
    if(this.presenceSuspendCount===1){
      this.presence?.resetOverlay();
      this.motionComposer?.beforeFrame();
      this.lipSync?.release();
      this.facial?.release();
      // Three-VRM copies normalized humanoid bones to raw bones during update.
      // Synchronize once BEFORE cloning/exporting the raw skinned model.
      this.vrm?.update(0);
      this.model?.updateWorldMatrix(true,true);
    }
    try{return await operation();}
    finally{
      this.presenceSuspendCount=Math.max(0,this.presenceSuspendCount-1);
      // If audio is still playing, regain ownership only of mouth expressions.
      if(this.presenceSuspendCount===0&&this.lipSync?.session)
        this.lipSync.captureBaseline();
    }
  }
  async exportCleanMixamoFBX({pose='t'}={}){
    if(!this.model||!this.referencePose)throw new Error('Carga primero un personaje.');
    if(this.vrm)throw new Error('MOTION-05A acepta personajes FBX o GLB riggeados. VRM requiere un proceso separado para preservar sus metadatos.');
    return this.withPresenceSuspended(async()=>{
      const result=cleanRiggedMixamoFBX(this.model,this.referencePose,{pose});
      const base=(this.lastFilename||'Personaje').replace(/\.[^.]+$/,'')
        .replace(/[^a-z0-9_\-]/gi,'_').slice(0,80);
      const filename=base+(pose==='t'?'_MIXAMO_TPOSE':'_POSE_ORIGINAL')+'.fbx';
      const url=URL.createObjectURL(new Blob([result.bytes],{
        type:'application/octet-stream',
      }));
      const a=document.createElement('a');a.href=url;a.download=filename;
      document.body.append(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),5000);
      return {...result,filename,size:formatBytes(result.bytesLength)};
    });
  }
  exportExtractedClipJSON(index){
    if(!this.clips[index])throw new Error('Selecciona una animación de la biblioteca.');
    const json=exportableClipJSON(this.clips[index].clip,{
      rigName:this.lastFilename||'personaje',rigBones:skinBoneCount(this.model),
    });
    const filename=(this.clips[index].name||'animacion')
      .replace(/[^a-z0-9_\-]/gi,'_').slice(0,90)+'_ORBI_MOTION.json';
    const url=URL.createObjectURL(new Blob([json],{
      type:'application/json;charset=utf-8',
    }));
    const a=document.createElement('a');a.href=url;a.download=filename;
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
    return {filename,size:formatBytes(new Blob([json]).size)};
  }
  async exportLightweight(ids) {
    return this.withPresenceSuspended(async()=>{
    if(!this.model)throw new Error('Primero carga un personaje.');
    const result=await exportLightweightGLB(this.model,ids);
    const filename=(this.lastFilename||'personaje').replace(/\.[^.]+$/,'')+'-orbi-mixamo.glb';
    const url=URL.createObjectURL(new Blob([result.buffer],{type:'model/gltf-binary'}));
    const a=document.createElement('a');a.href=url;a.download=filename;
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
    return {...result,filename,size:formatBytes(result.bytes)};
    });
  }
  async exportLightweightFBX(ids) {
    return this.withPresenceSuspended(async()=>{
    if(!this.model)throw new Error('Carga primero un personaje.');
    const result=lightweightBinaryFBX(this.model,ids);
    const filename=(this.lastFilename||'personaje').replace(/\.[^.]+$/,'')+'-orbi-mixamo.fbx';
    const url=URL.createObjectURL(new Blob([result.bytes],{type:'application/octet-stream'}));
    const a=document.createElement('a');a.href=url;a.download=filename;
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
    return {...result,filename,size:formatBytes(result.bytesLength)};
    });
  }
  async exportAnimatedFBX({allowApproximateVRM=false}={}) {
    return this.withPresenceSuspended(async()=>{
    if(!this.model)throw new Error('Carga primero un personaje.');
    if(!this.clips.length)throw new Error('Agrega al menos una animación.');
    if(this.vrm && !allowApproximateVRM)
      throw new Error('La conversión VRM→FBX es aproximada. Confirma los posibles cambios.');
    const prepared=this.vrm?bakeVrmForGlb(this.vrm,this.clips):null;
    const result=animatedBinaryFBX(prepared?.model||this.model,
      prepared?.clips||this.clips.map(item=>item.clip));
    const filename=(this.lastFilename||'personaje').replace(/\.[^.]+$/,'')+'-orbi-animated.fbx';
    const url=URL.createObjectURL(new Blob([result.bytes],{type:'application/octet-stream'}));
    const a=document.createElement('a');a.href=url;a.download=filename;
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
    return {...result,filename,size:formatBytes(result.bytesLength),
      animations:this.clips.length,
      warning:['FBX binario beta: revisa los clips en Blender y Mixamo.',
       ...result.warnings].join(' ')};
    });
  }
  /**
   * Local visual evidence for a material: two isolated views, no scene edits
   * retained. Rendering occurs on a temporary WebGLRenderTarget, not by
   * exporting model files or sending any geometry to a server.
   */
  captureMaterialViews(materialId){
    if(!this.model)throw new Error('Primero carga un personaje 3D.');
    const meshes=[];
    const visibility=[];
    this.model.updateMatrixWorld(true);
    this.model.traverse(node=>{
      if(node.isMesh){
        visibility.push({node,visible:node.visible});
        const mats=Array.isArray(node.material)?node.material:[node.material];
        if(mats.some(mat=>mat?.uuid===materialId))meshes.push(node);
      }
    });
    if(!meshes.length)throw new Error('No se encontró la malla vinculada a ese material.');
    const bounds=new THREE.Box3();
    for(const mesh of meshes)bounds.expandByObject(mesh,true);
    if(bounds.isEmpty())throw new Error('La malla no tiene volumen visible.');
    const size=bounds.getSize(new THREE.Vector3());
    if(![size.x,size.y,size.z].every(Number.isFinite))
      throw new Error('Las dimensiones de la malla no son válidas.');
    const center=bounds.getCenter(new THREE.Vector3());
    const radius=Math.max(size.length()/2,0.005);
    const cam=this.camera.clone();cam.aspect=1;
    const dist=Math.max(radius/Math.sin(THREE.MathUtils.degToRad(cam.fov)/2)*1.4,0.04);
    cam.near=Math.max(dist/3000,0.000001);cam.far=Math.max(dist*100,1);
    cam.updateProjectionMatrix();
    const edge=288;
    const canvas=document.createElement('canvas');
    canvas.width=edge*2;canvas.height=edge+30;
    const ctx=canvas.getContext('2d',{willReadFrequently:false});
    if(!ctx)throw new Error('El navegador no permite capturar la malla.');
    const target=new THREE.WebGLRenderTarget(edge,edge,{depthBuffer:true});
    target.texture.colorSpace=THREE.SRGBColorSpace;
    const previousTarget=this.renderer.getRenderTarget();
    const gridVisible=this.grid.visible,skeletonVisible=this.skeleton?.visible;
    try{
      const selected=new Set(meshes);
      for(const {node} of visibility)node.visible=selected.has(node);
      this.grid.visible=false;
      if(this.skeleton)this.skeleton.visible=false;
      const pixels=new Uint8Array(edge*edge*4);
      for(let view=0;view<2;view++){
        const angle=view===0?0:Math.PI/2;
        cam.position.copy(center).add(new THREE.Vector3(
          Math.sin(angle)*dist,dist*0.15,Math.cos(angle)*dist));
        cam.lookAt(center);cam.updateMatrixWorld(true);
        this.renderer.setRenderTarget(target);
        this.renderer.clear();
        this.renderer.render(this.scene,cam);
        this.renderer.readRenderTargetPixels(target,0,0,edge,edge,pixels);
        const img=ctx.createImageData(edge,edge);
        for(let y=0;y<edge;y++){
          const src=(edge-1-y)*edge*4;
          img.data.set(pixels.subarray(src,src+edge*4),y*edge*4);
        }
        ctx.putImageData(img,view*edge,0);
        ctx.fillStyle='#142438';ctx.fillRect(view*edge,edge,edge,30);
        ctx.font='bold 13px sans-serif';ctx.fillStyle='#ffffff';
        ctx.fillText(view===0?'Vista frontal aproximada':'Vista lateral aproximada',view*edge+10,edge+20);
      }
      return canvas.toDataURL('image/jpeg',0.78);
    }finally{
      this.renderer.setRenderTarget(previousTarget);
      for(const {node,visible} of visibility)node.visible=visible;
      this.grid.visible=gridVisible;
      if(this.skeleton)this.skeleton.visible=skeletonVisible;
      target.dispose();
    }
  }
  getTextureMaterials(){return this.model?catalogMaterials(this.model):[];}
  async attachTextureFile(file,materialId,channel,{batch=false}={}) {
    if(!this.model)throw new Error('Primero carga un personaje.');
    if(!batch)this.lastTextureBatch=null; // manual changes invalidate prior undo
    const currentModel=this.model;
    const applied=await applyTextureToMaterial(currentModel,materialId,channel,file,{format:this.lastFormat});
    if(this.model!==currentModel){
      if(applied.url)URL.revokeObjectURL(applied.url);
      throw new Error('El personaje cambió durante la carga de la imagen.');
    }
    if(applied.url)this.textureAssetUrls.add(applied.url);
    this.notify();
    return applied;
  }
  get canUndoTextureBatch(){return Boolean(this.lastTextureBatch);}
  undoTextureBatch(){
    const state=this.lastTextureBatch;
    if(!state)return false;
    if(this.model!==state.model){this.lastTextureBatch=null;return false;}
    restoreMaterialState(state.snapshot);
    for(const url of [...this.textureAssetUrls])
      if(!state.urls.has(url)){URL.revokeObjectURL(url);this.textureAssetUrls.delete(url);}
    this.lastTextureBatch=null;
    this.notify();
    return true;
  }
  async applyTextureBatch(assignments){
    if(!this.model)throw new Error('Primero carga un personaje.');
    if(!Array.isArray(assignments)||!assignments.length)throw new Error('No hay asociaciones seleccionadas.');
    const unique=new Set();
    for(const item of assignments){
      const k=item.materialId+'|'+item.channel;
      if(unique.has(k))throw new Error('Conflicto: dos imágenes para el mismo material y canal.');
      unique.add(k);
    }
    const model=this.model,snapshot=captureMaterialState(model);
    const urls=new Set(this.textureAssetUrls);
    this.lastTextureBatch=null;
    const reassigned=new Map();
    const results=[];
    try{
      for(const item of assignments){
        if(this.model!==model)throw new Error('El personaje cambió durante la aplicación.');
        const id=reassigned.get(item.materialId)||item.materialId;
        const applied=await this.attachTextureFile(item.file,id,item.channel,{batch:true});
        if(applied.materialId!==id)reassigned.set(item.materialId,applied.materialId);
        results.push({filename:item.file.name,materialId:applied.materialId,channel:item.channel});
      }
      this.lastTextureBatch={snapshot,urls,model};
      this.notify();
      return results;
    }catch(error){
      if(this.model===model){
        restoreMaterialState(snapshot);
        for(const url of [...this.textureAssetUrls])
          if(!urls.has(url)){URL.revokeObjectURL(url);this.textureAssetUrls.delete(url);}
        this.notify();
      }
      throw new Error('Se deshicieron los cambios del lote porque falló una textura: '+(error.message||error));
    }
  }
  getClips() { return this.clips.map(({name,clip,source},index)=>({name,source,index,duration:Number(clip.duration.toFixed(2)),tracks:clip.tracks.length})); }
  getInfo() { return this.model ? inspect(this.model,this.clips) : EMPTY_INFO; }
  async addAnimations(files) {
    if (!this.model) throw new Error('Primero carga el personaje base.');
    // VRM is also rigged: accept FBX only when its raw bone hierarchy matches.
    // No automatic retargeting of different rigs.
    const result = [];
    for (const file of files) {
      if(extensionOf(file.name)!=='fbx') {result.push({name:file.name,ok:false,reason:'Para integrar movimientos selecciona archivos FBX.'});continue;}
      let loaded = null;
      try {
        loaded = await loadObject([file], {animationSource: true});
        const isVrm = Boolean(this.vrm);
        const match = isVrm ? null : inspectRigCompatibility(this.model,loaded.model,loaded.clips);
        if (match && !match.ok) throw new Error(match.reason);
        const named = [];
        const diagnostics = [];
        for (const original of loaded.clips) {
          let clip;
          if (isVrm) {
            const converted = adaptFbxToVrm(loaded.model,this.vrm,original);
            clip = converted.clip;
            diagnostics.push(converted.warning);
          } else {
            clip = original.clone();
            // Supports tracks on rig bones and compatible named scene objects.
            const mapping = new Map(match.mappedTracks.map(([track,node,channel])=>[track,{node,channel}]));
            clip.tracks = original.tracks.flatMap(track=>{
              const mapped=mapping.get(track);
              if(!mapped)return [];
              const renamed=track.clone();
              renamed.name=mapped.node.name+'.'+mapped.channel;
              return [renamed];
            });
          }
          clip.resetDuration();
          const raw = loaded.clips.length === 1 ? file.name.replace(/\.fbx$/i,'') : original.name;
          const name = uniqueClipName([...this.clips,...named].map(c=>c.name),raw);
          clip.name = name;
          named.push({name,clip,source:isVrm?'VRM / Mixamo (experimental)':'Mixamo / FBX'});
        }
        this.clips.push(...named);
        // three-vrm normally overwrites raw human bones from normalized proxies.
        // FBX channels animate the raw bones, so disable that copy for previews.
        if (this.vrm?.humanoid) this.vrm.humanoid.autoUpdateHumanBones = true;
        result.push({name:file.name,ok:true,count:named.length,warning:isVrm?diagnostics.join(' '):match.advisory});
      } catch(error) {
        result.push({name:file.name,ok:false,reason:error.message||String(error)});
      } finally {
        // Imported source is only used to extract clips: release unused FBX meshes.
        if (loaded?.model) VRMUtils.deepDispose(loaded.model);
      }
    }
    this.notify();
    return result;
  }
  async exportGLB({allowApproximateVRM=false}={}) {
    return this.withPresenceSuspended(async()=>{
    if(!this.model) throw new Error('Primero carga un modelo.');
    // GLB can contain a static textured model without any animation clips.
    if(this.vrm && !allowApproximateVRM) {
      throw new Error('La conversión VRM → GLB es aproximada. Confirma que aceptas perder funciones exclusivas de VRM.');
    }
    // Never overwrite or modify the source file. VRM is baked to RAW skin bones,
    // copied into a separate model, and converted to portable PBR materials.
    const converted=this.vrm
      ? (this.clips.length ? bakeVrmForGlb(this.vrm,this.clips) : (()=>{
          const clone=cloneSkeleton(this.vrm.scene);
          convertVrmMaterials(clone);
          return {model:clone,clips:[]};
        })())
      : null;
    const exportModel=converted?.model||this.model;
    const exportClips=converted?.clips||this.clips.map(item=>item.clip);
    const exporter=new GLTFExporter();
    const buffer=await exporter.parseAsync(exportModel,{
      binary:true, animations:exportClips, onlyVisible:false,
      trs:true, maxTextureSize:2048,
    });
    if(!(buffer instanceof ArrayBuffer)) throw new Error('No se generó un GLB válido.');
    // Reimport the exported binary and validate the actual animation payload.
    const parsed=await new GLTFLoader().parseAsync(buffer,'');
    if(parsed.animations.length!==exportClips.length ||
      parsed.animations.some((clip,i)=>!clip.tracks.length || !Number.isFinite(clip.duration))) {
      throw new Error('El GLB exportado no conserva todas las animaciones; no se descargará un archivo incompleto.');
    }
    if(this.textureAssetUrls.size && !this.vrm && inspect(parsed.scene,parsed.animations).textures===0)
      throw new Error('Las texturas externas no quedaron incorporadas en el GLB. No se descargará un archivo incompleto.');
    if(this.vrm){
      let skin=0;
      parsed.scene.traverse(node=>{if(node.isSkinnedMesh)skin++;});
      if(!skin)throw new Error('No se pudo conservar el esqueleto con su malla en el GLB.');
    }
    const filename=(this.lastFilename||'modelo').replace(/\.[^.]+$/,'')+
      (this.vrm?'-orbi-animated-standard':'-orbi-motion')+'.glb';
    const blob=new Blob([buffer],{type:'model/gltf-binary'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=filename; document.body.append(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
    return {
      filename,size:formatBytes(buffer.byteLength),animations:parsed.animations.length,
      warning: this.vrm
        ? 'GLB estándar (no VRM): materiales MToon aproximados; física, expresiones y metadatos VRM no incluidos. Los movimientos omitidos en la previsualización tampoco se recuperan al exportar.'
        : null,
    };
    });
  }
  dispose() {
    this.disposed=true;
    this.loadSequence +=1;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.clearModel();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
