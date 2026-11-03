import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { adaptFbxToVrm } from './vrmMotion.js';
import { bakeVrmForGlb, convertVrmMaterials } from './vrmExport.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { catalogMaterials, applyTextureToMaterial } from './textureStudio.js';
import { skinnedMeshes, skinBoneCount, exportLightweightGLB } from './lightweight.js';
import { lightweightBinaryFBX, animatedBinaryFBX } from './fbxExport.js';
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
    this.lastFormat = null;
    this.textureAssetUrls = new Set();
    this.loadSequence = 0;
    this.disposed = false;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(mount);
    this.resize();
    this.animate = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(this.animate);
      const delta = Math.min(this.clock.getDelta(),0.1);
      if (this.mixer && this.playing) this.mixer.update(delta);
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
    this.model.name ||= loaded.name.replace(/\.[^.]+$/,'');
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
    if(this.lightPreviewStates?.size)this.setLightPreview(null);
    if (this.mixer) { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.model); }
    if (this.skeleton) {this.scene.remove(this.skeleton);this.skeleton.dispose(); this.skeleton=null;}
    if (this.model) {
      this.scene.remove(this.model);
      VRMUtils.deepDispose(this.model);
    }
    for(const url of this.textureAssetUrls)URL.revokeObjectURL(url);
    this.textureAssetUrls.clear();
    this.model = null;
    this.vrm = null;
    this.mixer = null;
    this.clips = [];
    this.current = null;
    this.playing = false;
  }
  play(index) {
    if (!this.mixer || !this.clips[index]) return false;
    this.mixer.stopAllAction();
    this.current = index;
    const clip = this.clips[index].clip;
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
  async exportLightweight(ids) {
    if(!this.model)throw new Error('Primero carga un personaje.');
    const result=await exportLightweightGLB(this.model,ids);
    const filename=(this.lastFilename||'personaje').replace(/\.[^.]+$/,'')+'-orbi-mixamo.glb';
    const url=URL.createObjectURL(new Blob([result.buffer],{type:'model/gltf-binary'}));
    const a=document.createElement('a');a.href=url;a.download=filename;
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
    return {...result,filename,size:formatBytes(result.bytes)};
  }
  async exportLightweightFBX(ids) {
    if(!this.model)throw new Error('Carga primero un personaje.');
    const result=lightweightBinaryFBX(this.model,ids);
    const filename=(this.lastFilename||'personaje').replace(/\.[^.]+$/,'')+'-orbi-mixamo.fbx';
    const url=URL.createObjectURL(new Blob([result.bytes],{type:'application/octet-stream'}));
    const a=document.createElement('a');a.href=url;a.download=filename;
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
    return {...result,filename,size:formatBytes(result.bytesLength)};
  }
  async exportAnimatedFBX({allowApproximateVRM=false}={}) {
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
  }
  getTextureMaterials(){return this.model?catalogMaterials(this.model):[];}
  async attachTextureFile(file,materialId,channel) {
    if(!this.model)throw new Error('Primero carga un personaje.');
    const currentModel=this.model;
    const applied=await applyTextureToMaterial(currentModel,materialId,channel,file,{format:this.lastFormat});
    if(this.model!==currentModel){
      URL.revokeObjectURL(applied.url);
      throw new Error('El personaje cambió durante la carga de la imagen.');
    }
    this.textureAssetUrls.add(applied.url);
    this.notify();
    return applied;
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
