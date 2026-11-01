import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { extensionOf, formatBytes, inspectRigCompatibility, uniqueClipName, summarizeRenderableGeometry } from './modelInfo.js';

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

async function loadObject(files) {
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
    if (!geometry.hasGeometry) {
      throw new Error(clips.length
        ? 'Este archivo contiene animaciones pero no una malla visible. Los FBX de Mixamo descargados «Without Skin» son solo movimientos: carga primero el personaje FBX «With Skin» o su GLB y luego usa «Añadir animaciones FBX».'
        : 'El archivo no contiene geometría 3D que pueda mostrarse. Comprueba que exportaste la malla del personaje.');
    }
    if (!geometry.drawableMeshes) {
      throw new Error('El archivo contiene mallas, pero están ocultas en la jerarquía. Hazlas visibles antes de exportar desde tu editor 3D.');
    }
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
    if (this.mixer) { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.model); }
    if (this.skeleton) {this.scene.remove(this.skeleton);this.skeleton.dispose(); this.skeleton=null;}
    if (this.model) {
      this.scene.remove(this.model);
      VRMUtils.deepDispose(this.model);
    }
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
  getClips() { return this.clips.map(({name,clip,source},index)=>({name,source,index,duration:Number(clip.duration.toFixed(2)),tracks:clip.tracks.length})); }
  getInfo() { return this.model ? inspect(this.model,this.clips) : EMPTY_INFO; }
  async addAnimations(files) {
    if (!this.model) throw new Error('Primero carga el personaje base.');
    if (this.vrm) throw new Error('La integración y exportación de VRM no están habilitadas en esta versión. Puedes visualizarlo, inspeccionarlo y reproducir sus animaciones.');
    const result = [];
    for (const file of files) {
      if(extensionOf(file.name)!=='fbx') {result.push({name:file.name,ok:false,reason:'Para integrar movimientos selecciona archivos FBX.'});continue;}
      try {
        const loaded = await loadObject([file]);
        if (!loaded.clips.length) throw new Error('Este FBX no contiene animaciones.');
        const match = inspectRigCompatibility(this.model,loaded.model,loaded.clips);
        if (!match.ok) throw new Error(match.reason);
        const named = [];
        for (const original of loaded.clips) {
          const clip = original.clone();
          // Only same-rig remapping. No spatial retargeting or rest-pose corrections.
          clip.tracks = clip.tracks.map(track => {
            const found = match.mappedTracks.find(([sourceTrack]) => sourceTrack.name === track.name);
            const renamed = track.clone();
            renamed.name = `${found[1].name}.${found[2]}`;
            return renamed;
          });
          clip.resetDuration();
          const raw = loaded.clips.length === 1 ? file.name.replace(/\.fbx$/i,'') : original.name;
          const name = uniqueClipName([...this.clips,...named].map(c=>c.name),raw);
          clip.name = name;
          named.push({name,clip,source:'Mixamo / FBX'});
        }
        this.clips.push(...named);
        result.push({name:file.name,ok:true,count:named.length});
      } catch(error) {
        result.push({name:file.name,ok:false,reason:error.message||String(error)});
      }
    }
    this.notify();
    return result;
  }
  async exportGLB() {
    if (!this.model) throw new Error('Primero carga un modelo.');
    if (this.vrm) throw new Error('VRM está disponible para visualización e inspección. Exportarlo como GLB podría perder las funciones y materiales VRM; por seguridad, la exportación VRM no está disponible en esta versión.');
    // The built-in AnimationClips and compatible imported clips are exported together.
    const exporter = new GLTFExporter();
    const buffer = await exporter.parseAsync(this.model,{
      binary:true, animations:this.clips.map(item=>item.clip),
      onlyVisible:false, trs:true, maxTextureSize:2048,
    });
    if (!(buffer instanceof ArrayBuffer)) throw new Error('No se generó un GLB válido.');
    // Smoke-check the generated file before delivery.
    const loader = new GLTFLoader();
    const verified = await loader.parseAsync(buffer,'');
    if (verified.animations.length !== this.clips.length) throw new Error('La comprobación encontró diferencias en la cantidad de animaciones exportadas.');
    const filename = `${(this.lastFilename || 'modelo').replace(/\.[^.]+$/,'')}-orbi-motion.glb`;
    const href = URL.createObjectURL(new Blob([buffer],{type:'model/gltf-binary'}));
    const anchor = document.createElement('a');anchor.href=href;anchor.download=filename;document.body.append(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(href),3000);
    return {filename,size:formatBytes(buffer.byteLength),animations:verified.animations.length};
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
