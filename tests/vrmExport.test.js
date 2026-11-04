import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { bakeVrmForGlb, convertVrmMaterials } from '../src/lib/vrmExport.js';

function fixture() {
  const scene=new THREE.Group();
  const rawHip=new THREE.Bone();rawHip.name='rawHip';
  const rawSpine=new THREE.Bone();rawSpine.name='rawSpine';rawHip.add(rawSpine);
  scene.add(rawHip);
  const normHip=new THREE.Bone();normHip.name='normalizedHip';
  scene.add(normHip);
  const geometry=new THREE.BoxGeometry(1,1,1);
  const count=geometry.getAttribute('position').count;
  const indices=new Uint16Array(count*4);
  const weights=new Float32Array(count*4);
  for(let i=0;i<count;i++)weights[i*4]=1;
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial());
  mesh.name='body';scene.add(mesh);
  mesh.bind(new THREE.Skeleton([rawHip,rawSpine]));
  const humanoid={
    normalizedHumanBones:{hips:{node:normHip}},
    rawHumanBones:{hips:{node:rawHip},spine:{node:rawSpine}},
    autoUpdateHumanBones:true,
    resetNormalizedPose(){normHip.quaternion.identity();normHip.position.set(0,0,0);},
    update(){if(this.autoUpdateHumanBones){rawHip.quaternion.copy(normHip.quaternion);rawHip.position.copy(normHip.position);}},
  };
  return {vrm:{scene,humanoid},rawHip,normHip,mesh};
}
test('bake VRM proxy motion to actual skinned bones and retain source pose',()=>{
  const {vrm,rawHip,normHip}=fixture();
  const prior=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),0.12);
  normHip.quaternion.copy(prior);
  rawHip.quaternion.copy(prior);
  const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),0.8);
  const clip=new THREE.AnimationClip('Idle',1,[
    new THREE.QuaternionKeyframeTrack('normalizedHip.quaternion',[0,1],[0,0,0,1,...q.toArray()])
  ]);
  const result=bakeVrmForGlb(vrm,[{name:'Idle',clip,source:'VRM / Mixamo (experimental)'}],{fps:10});
  assert.equal(result.clips.length,1);
  assert.ok(result.clips[0].tracks.some(track=>track.name==='rawHip.quaternion'));
  assert.equal(result.clips[0].tracks[0].times.length,11);
  assert.equal(vrm.humanoid.autoUpdateHumanBones,true);
  assert.ok(normHip.quaternion.angleTo(prior)<1e-6);
  assert.ok(rawHip.quaternion.angleTo(prior)<1e-6);
  let skin=0;
  result.model.traverse(node=>{if(node.isSkinnedMesh)skin++;});
  assert.equal(skin,1);
});
test('converts shader materials only on export clone',()=>{
  const {vrm,mesh}=fixture();
  const source=new THREE.ShaderMaterial({transparent:true});
  source.name='VRM MToon';
  mesh.material=source;
  const root=vrm.scene.clone();
  const count=convertVrmMaterials(root);
  assert.equal(count,1);
  const cloneMesh=root.getObjectByName('body');
  assert.ok(cloneMesh.material.isMeshStandardMaterial);
  assert.equal(cloneMesh.material.transparent,true);
  assert.equal(mesh.material,source);
});
test('rejects exporting a VRM without clips or skin',()=>{
  const {vrm}=fixture();
  assert.throws(()=>bakeVrmForGlb(vrm,[]),/al menos una animación/);
  vrm.scene.children=vrm.scene.children.filter(node=>!node.isSkinnedMesh);
  const clip=new THREE.AnimationClip('Idle',1,[
    new THREE.QuaternionKeyframeTrack('normalizedHip.quaternion',[0,1],[0,0,0,1,0,0.1,0,0.994987])
  ]);
  assert.throws(()=>bakeVrmForGlb(vrm,[{name:'Idle',clip,source:'VRM / Mixamo (experimental)'}]),/malla vinculada/);
});
test('preserves raw-bone animations originally embedded in the VRM',()=>{
  const {vrm}=fixture();
  const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),0.3);
  const clip=new THREE.AnimationClip('Original',1,[
    new THREE.QuaternionKeyframeTrack('rawHip.quaternion',[0,1],[0,0,0,1,...q.toArray()])
  ]);
  const result=bakeVrmForGlb(vrm,[{name:'Original',clip,source:'Original'}],{fps:8});
  assert.equal(result.clips.length,1);
  assert.ok(result.clips[0].tracks.some(track=>track.name==='rawHip.quaternion'));
});

test('reimporta GLB con skin y animación convertida (smoke test real)', async()=>{
  const { GLTFExporter }=await import('three/addons/exporters/GLTFExporter.js');
  const { GLTFLoader }=await import('three/addons/loaders/GLTFLoader.js');
  const oldReader=globalThis.FileReader;
  if(!oldReader) {
    globalThis.FileReader=class {
      result=null;
      async readAsArrayBuffer(blob){
        try {this.result=await blob.arrayBuffer();this.onloadend?.({target:this});}
        catch(e){this.onerror?.(e);}
      }
      async readAsDataURL(blob){
        try{
          const data=Buffer.from(await blob.arrayBuffer()).toString('base64');
          this.result='data:'+(blob.type||'application/octet-stream')+';base64,'+data;
          this.onloadend?.({target:this});
        }catch(e){this.onerror?.(e);}
      }
    };
  }
  try {
    const {vrm}=fixture();
    const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),0.5);
    const clip=new THREE.AnimationClip('Motion',1,[
      new THREE.QuaternionKeyframeTrack('normalizedHip.quaternion',[0,1],[0,0,0,1,...rotation.toArray()])
    ]);
    const packed=bakeVrmForGlb(vrm,[{name:'Motion',clip,source:'VRM / Mixamo (experimental)'}],{fps:10});
    const bin=await new GLTFExporter().parseAsync(packed.model,{binary:true,animations:packed.clips,trs:true,onlyVisible:false});
    assert.ok(bin instanceof ArrayBuffer);
    const loaded=await new GLTFLoader().parseAsync(bin,'');
    assert.equal(loaded.animations.length,1);
    assert.ok(loaded.animations[0].tracks.some(track=>/rawHip/.test(track.name)));
    let skin=0;loaded.scene.traverse(node=>{if(node.isSkinnedMesh)skin++;});
    assert.equal(skin,1);
  } finally {
    if(!oldReader)delete globalThis.FileReader;
  }
});
