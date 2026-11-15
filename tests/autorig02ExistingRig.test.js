import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {
  existingRigBones,detectExistingRigRoles,scoreExistingRigRole,captureExistingRigRest,
  editExistingRigClip,prepareExistingRigClipForExport,
} from '../src/lib/autoRig/existingRigMotion.js';
import {MotionViewer} from '../src/lib/viewer.js';
import {readFileSync} from 'node:fs';

function buildFixture(){
  const model=new THREE.Group();
  model.name='LUMIA Rigged';
  const hips=new THREE.Bone();hips.name='mixamorigHips';hips.position.y=.8;
  const spine=new THREE.Bone();spine.name='mixamorigSpine';spine.position.y=.35;hips.add(spine);
  const l=new THREE.Bone();l.name='mixamorigLeftArm';l.position.set(-.3,.35,0);
  const r=new THREE.Bone();r.name='mixamorigRightArm';r.position.set(.3,.35,0);
  spine.add(l,r);
  const head=new THREE.Bone();head.name='mixamorigHead';head.position.y=.4;spine.add(head);
  model.add(hips);
  const geom=new THREE.BoxGeometry(.9,1.6,.3);
  const vertices=geom.attributes.position.count;
  const indices=new Uint16Array(vertices*4),weights=new Float32Array(vertices*4);
  for(let v=0;v<vertices;v++){
    indices[v*4]=geom.attributes.position.getX(v)<0?2:3;
    weights[v*4]=1;
  }
  geom.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
  geom.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const mesh=new THREE.SkinnedMesh(geom,new THREE.MeshStandardMaterial({
    color:0x777777,
  }));
  mesh.name='body';model.add(mesh);
  model.updateWorldMatrix(true,true);
  mesh.bind(new THREE.Skeleton([hips,spine,l,r,head]));
  const qAngle=(axis,angle)=>new THREE.Quaternion().setFromAxisAngle(axis,angle);
  const z=new THREE.Vector3(0,0,1),x=new THREE.Vector3(1,0,0);
  const lQ=qAngle(z,.35),rQ=qAngle(z,-.35),headQ=qAngle(x,.08);
  const clip=new THREE.AnimationClip('Hip Hop',2,[
    new THREE.QuaternionKeyframeTrack('mixamorigLeftArm.quaternion',[0,1,2],
      [0,0,0,1,...lQ.toArray(),0,0,0,1]),
    new THREE.QuaternionKeyframeTrack('mixamorigRightArm.quaternion',[0,1,2],
      [0,0,0,1,...rQ.toArray(),0,0,0,1]),
    new THREE.QuaternionKeyframeTrack('mixamorigHead.quaternion',[0,1,2],
      [0,0,0,1,...headQ.toArray(),0,0,0,1]),
    new THREE.QuaternionKeyframeTrack('mixamorigSpine.quaternion',[0,1,2],
      [0,0,0,1,...qAngle(x,.08).toArray(),0,0,0,1]),
    new THREE.VectorKeyframeTrack('mixamorigHips.position',[0,1,2],
      [0,.8,0, .1,.8,0, 0,.8,0]),
  ]);
  return {model,l,r,head,mesh,clip};
}
const map=clip=>new Map(clip.tracks.map(t=>[t.name,t]));
const quaternionAt=(clip,name,time)=>new THREE.Quaternion().fromArray(
  map(clip).get(name).createInterpolant().evaluate(time));

test('02F detects bone names across Mixamo, FBX, VRM and Blender without picking forearms',()=>{
  const variants=[
    ['mixamorig1LeftArm','mixamorig1RightArm','mixamorig:Head'],
    ['CC_Base_L_Upperarm','CC_Base_R_Upperarm','Head'],
    ['DEF-upper_arm.L','DEF-upper_arm.R','DEF-head'],
    ['Bip01 L UpperArm','Bip01 R UpperArm','Head_JNT'],
    ['LeftUpperArm_Jnt','RightUpperArm_Jnt','head01'],
    ['UpperArm_Left','UpperArm_Right','Head'],
  ];
  for(const [left,right,head] of variants){
    const root=new THREE.Group();
    for(const name of [left,right,head,'LeftForeArm','RightHand','HairHead']){
      const bone=new THREE.Bone();bone.name=name;root.add(bone);
    }
    const {detected}=detectExistingRigRoles(root);
    assert.equal(detected.leftUpperArm,left,'left arm variant '+left);
    assert.equal(detected.rightUpperArm,right,'right arm variant '+right);
    assert.equal(detected.head,head,'head variant '+head);
  }
  assert.equal(scoreExistingRigRole('LeftForeArm','leftUpperArm'),0);
  assert.equal(scoreExistingRigRole('LeftShoulder','leftUpperArm'),0);
  assert.equal(scoreExistingRigRole('EyeHead','head'),0);
  assert.equal(scoreExistingRigRole('UpperArmRight','leftUpperArm'),0);
});

test('02F ambiguous duplicate arm candidates require manual mapping rather than guessing',()=>{
  const root=new THREE.Group();
  for(const name of ['DEF-upper_arm.L','DEF-upper_arm.L',
    'DEF-upper_arm.R','Head']){
    const bone=new THREE.Bone();bone.name=name;root.add(bone);
  }
  const roles=detectExistingRigRoles(root);
  assert.equal(roles.detected.leftUpperArm,'');
  assert.ok(roles.ambiguous.includes('leftUpperArm'));
});

test('02D recognizes existing Mixamo bones and captures safe rest before animation',()=>{
  const {model,l,r}=buildFixture();
  const detected=detectExistingRigRoles(model);
  assert.equal(detected.detected.leftUpperArm,l.name);
  assert.equal(detected.detected.rightUpperArm,r.name);
  assert.equal(detected.detected.head,'mixamorigHead');
  assert.equal(detected.bones.length,5);
  const rest=captureExistingRigRest(model);
  assert.ok(rest.has(l.uuid));
  assert.ok(rest.has(r.uuid));
  assert.ok(rest.get(l.uuid).local.every(Number.isFinite));
});

test('02D adjusts both arms but retains hips translation, spine and head channels',()=>{
  const {model,clip}=buildFixture(),rest=captureExistingRigRest(model);
  const original=clip.tracks.map(t=>Array.from(t.values));
  const edited=editExistingRigClip(clip,model,{
    rest,settings:{armSpace:75,armSwing:85},
  });
  assert.equal(edited.changed,true);
  assert.deepEqual(edited.targets.sort(),['leftUpperArm','rightUpperArm']);
  assert.equal(edited.clip.tracks.length,clip.tracks.length);
  assert.equal(edited.clip.duration,2);
  assert.deepEqual(clip.tracks.map(t=>Array.from(t.values)),original);
  const a=map(edited.clip),b=map(clip);
  for(const name of ['mixamorigHips.position','mixamorigSpine.quaternion',
    'mixamorigHead.quaternion']){
    assert.deepEqual(Array.from(a.get(name).values),Array.from(b.get(name).values),
      'Untargeted animation must be bitwise preserved: '+name);
  }
  assert.ok(quaternionAt(edited.clip,'mixamorigLeftArm.quaternion',1)
    .angleTo(quaternionAt(clip,'mixamorigLeftArm.quaternion',1))>.1);
  assert.ok(quaternionAt(edited.clip,'mixamorigRightArm.quaternion',1)
    .angleTo(quaternionAt(clip,'mixamorigRightArm.quaternion',1))>.1);
});

test('02D arm clearance changes simultaneously moving skinned mesh without reweighting',()=>{
  const {model,clip,l,r,mesh}=buildFixture();
  const rest=captureExistingRigRest(model);
  const beforeWeights=mesh.geometry.attributes.skinWeight.array.slice();
  const beforeIndexes=mesh.geometry.attributes.skinIndex.array.slice();
  const edited=editExistingRigClip(clip,model,{
    settings:{armSpace:80},rest,
  }).clip;
  const mixer=new THREE.AnimationMixer(model);
  mixer.clipAction(edited).play();
  mixer.update(.7);
  assert.ok(l.quaternion.angleTo(quaternionAt(clip,'mixamorigLeftArm.quaternion',.7))>.2,
    'left arm should differ from the original source animation');
  assert.ok(r.quaternion.angleTo(quaternionAt(clip,'mixamorigRightArm.quaternion',.7))>.2,
    'right arm should differ from the original source animation');
  assert.deepEqual(mesh.geometry.attributes.skinWeight.array,beforeWeights);
  assert.deepEqual(mesh.geometry.attributes.skinIndex.array,beforeIndexes);
  mixer.stopAllAction();mixer.uncacheRoot(model);
});


test('02D resolves namespaced Mixamo tracks through UUID on the edited copy',()=>{
  const {model,clip,l,r}=buildFixture();
  l.name='mixamorig:LeftArm';r.name='mixamorig:RightArm';
  clip.tracks.find(t=>t.name==='mixamorigLeftArm.quaternion')
    .name='mixamorig:LeftArm.quaternion';
  clip.tracks.find(t=>t.name==='mixamorigRightArm.quaternion')
    .name='mixamorig:RightArm.quaternion';
  const rest=captureExistingRigRest(model);
  const changed=editExistingRigClip(clip,model,{rest,settings:{armSpace:70}}).clip;
  assert.ok(changed.tracks.some(t=>t.name===l.uuid+'.quaternion'));
  assert.ok(changed.tracks.some(t=>t.name===r.uuid+'.quaternion'));
  assert.ok(clip.tracks.some(t=>t.name==='mixamorig:LeftArm.quaternion'));
  const mixer=new THREE.AnimationMixer(model);
  mixer.clipAction(changed).play();
  mixer.update(.5);
  assert.ok(l.quaternion.angleTo(
    quaternionAt(clip,'mixamorig:LeftArm.quaternion',.5))>.1,
    'UUID-backed animation should differ from original and reach the bone');
  mixer.stopAllAction();mixer.uncacheRoot(model);
});
test('02D restores exactly original source clip when neutral settings',()=>{
  const {model,clip}=buildFixture();
  const rest=captureExistingRigRest(model);
  const a=editExistingRigClip(clip,model,{rest,settings:{armSpace:65}});
  const restored=editExistingRigClip(clip,model,{rest});
  assert.equal(restored.clip,clip);
  assert.equal(restored.changed,false);
  assert.notEqual(a.clip,clip);
});

test('02F Look uses a new bind-safe head quaternion track when the source omits head motion',()=>{
  const {model,clip,head}=buildFixture();
  clip.tracks=clip.tracks.filter(t=>t.name!=='mixamorigHead.quaternion');
  const originalTracks=clip.tracks.map(t=>Array.from(t.values));
  const result=editExistingRigClip(clip,model,{
    rest:captureExistingRigRest(model),settings:{look:75},
  });
  const added=result.clip.tracks.find(t=>t.name===head.uuid+'.quaternion');
  assert.ok(added,'Must synthesize the missing head quaternion track');
  assert.ok(result.targets.includes('head'));
  assert.ok(new THREE.Quaternion().fromArray(added.values)
    .angleTo(new THREE.Quaternion())>.05);
  assert.deepEqual(clip.tracks.map(t=>Array.from(t.values)),originalTracks);
});

test('02F arm clearance creates a proper copy track when FBX omits upper arm keys',()=>{
  const {model,clip,l,r}=buildFixture();
  clip.tracks=clip.tracks.filter(t=>!/(LeftArm|RightArm)\.quaternion/.test(t.name));
  const out=editExistingRigClip(clip,model,{
    rest:captureExistingRigRest(model),settings:{armSpace:70},
  });
  assert.ok(out.clip.tracks.find(t=>t.name===l.uuid+'.quaternion'));
  assert.ok(out.clip.tracks.find(t=>t.name===r.uuid+'.quaternion'));
  assert.deepEqual(out.targets.sort(),['leftUpperArm','rightUpperArm']);
  const mixer=new THREE.AnimationMixer(model);mixer.clipAction(out.clip).play();
  mixer.update(.4);
  assert.ok(l.quaternion.angleTo(new THREE.Quaternion())>.05);
  assert.ok(r.quaternion.angleTo(new THREE.Quaternion())>.05);
  mixer.stopAllAction();mixer.uncacheRoot(model);
  assert.throws(()=>editExistingRigClip(clip,model,{
    rest:captureExistingRigRest(model),settings:{armSwing:80},
  }),/no contiene rotaciones/);
});

test('02D Trim resamples all tracked channels and mirror swaps named arm roles',()=>{
  const {model,clip}=buildFixture(),rest=captureExistingRigRest(model);
  const result=editExistingRigClip(clip,model,{
    rest,settings:{trimStart:25,trimEnd:75,mirror:true},
  });
  assert.ok(Math.abs(result.clip.duration-1)<1e-5);
  assert.equal(result.clip.tracks.length,5);
  const changed=map(result.clip);
  assert.ok(changed.has('mixamorigLeftArm.quaternion'));
  assert.ok(changed.has('mixamorigRightArm.quaternion'));
  assert.equal(changed.get('mixamorigHips.position').values.length,31*3);
  assert.ok(changed.get('mixamorigHips.position').values[0]<0,
    'Mirrored hip motion should invert world X');
  for(const t of result.clip.tracks){
    assert.equal(t.times[0],0);
    assert.ok(t.times.at(-1)>=.99);
  }
});


test('02D Overdrive is baked into exported clip duration, preserving source frames',()=>{
  const {model,clip}=buildFixture();
  const original=clip.tracks.map(t=>Array.from(t.values));
  const fast=editExistingRigClip(clip,model,{
    rest:captureExistingRigRest(model),settings:{overdrive:1.5},
  }).clip;
  assert.ok(Math.abs(fast.duration-2/1.5)<1e-5);
  assert.equal(fast.tracks.length,clip.tracks.length);
  assert.deepEqual(clip.tracks.map(t=>Array.from(t.values)),original);
  assert.ok(Math.abs(map(fast).get('mixamorigHips.position').times.at(-1)-
    fast.duration)<1e-5);
  const slow=editExistingRigClip(clip,model,{
    rest:captureExistingRigRest(model),settings:{overdrive:.5},
  }).clip;
  assert.ok(Math.abs(slow.duration-4)<1e-4);
  assert.throws(()=>editExistingRigClip(clip,model,{
    settings:{overdrive:5},
  }),/Overdrive/);
});

test('02D rejects incompatible or unsafe mapping rather than editing random bones',()=>{
  const {model,clip}=buildFixture(),rest=captureExistingRigRest(model);
  assert.throws(()=>editExistingRigClip(clip,model,{
    rest,settings:{armSpace:70},boneNames:{
      leftUpperArm:'invalid',rightUpperArm:'mixamorigRightArm',
    },
  }),/no encontrada/);
  assert.throws(()=>editExistingRigClip(clip,model,{
    rest,settings:{armSpace:70},boneNames:{
      leftUpperArm:'mixamorigRightArm',
      rightUpperArm:'mixamorigRightArm',
    },
  }),/mismo hueso/);
  assert.throws(()=>editExistingRigClip(clip,model,{
    settings:{armSpace:70},
  }),/pose de reposo/);
});

test('02D viewer commits ONLY selected clip and restores via neutral controls',()=>{
  const {model,clip}=buildFixture(),base=clip.clone();
  const untouched=clip.clone();untouched.name='Walk';
  const viewer=Object.create(MotionViewer.prototype);
  viewer.model=model;viewer.vrm=null;
  viewer.clips=[{name:'Hip Hop',clip,source:'Original'},
    {name:'Walk',clip:untouched,source:'Original'}];
  viewer.mixer=new THREE.AnimationMixer(model);
  viewer.current=0;viewer.playing=false;viewer.speed=1;
  viewer.existingRigRest=captureExistingRigRest(model);
  viewer.existingRigOriginals=new Map();
  viewer.notify=()=>{};
  const result=viewer.editExistingRigAnimation(0,{armSpace:70},
    detectExistingRigRoles(model).detected);
  assert.equal(result.changed,true);
  assert.equal(viewer.clips[0].modified,true);
  assert.equal(viewer.clips[1].clip,untouched);
  assert.deepEqual(clip.tracks.map(t=>Array.from(t.values)),
    base.tracks.map(t=>Array.from(t.values)));
  assert.equal(viewer.getClips()[0].modified,true);
  viewer.editExistingRigAnimation(0,{},detectExistingRigRoles(model).detected);
  assert.equal(viewer.clips[0].clip,clip);
  assert.equal(viewer.getClips()[0].modified,false);
  viewer.mixer.stopAllAction();viewer.mixer.uncacheRoot(model);
});

test('02D real GLB roundtrip retains edited animation and original skin',async()=>{
  const {model,clip}=buildFixture();
  const rest=captureExistingRigRest(model);
  const edited=editExistingRigClip(clip,model,{rest,settings:{armSpace:75}}).clip;
  const previousReader=globalThis.FileReader;
  if(!previousReader)globalThis.FileReader=class {
    result=null;
    async readAsArrayBuffer(blob){
      try{this.result=await blob.arrayBuffer();this.onloadend?.({target:this});}
      catch(e){this.onerror?.(e);}
    }
    async readAsDataURL(blob){
      try{
        this.result='data:'+(blob.type||'application/octet-stream')+';base64,'+
          Buffer.from(await blob.arrayBuffer()).toString('base64');
        this.onloadend?.({target:this});
      }catch(e){this.onerror?.(e);}
    }
  };
  try{
    const buffer=await new GLTFExporter().parseAsync(model,{
      binary:true,animations:[edited],onlyVisible:false,trs:true,
    });
    assert.ok(buffer instanceof ArrayBuffer);
    const parsed=await new GLTFLoader().parseAsync(buffer,'');
    assert.equal(parsed.animations.length,1);
    assert.equal(parsed.animations[0].tracks.length,edited.tracks.length);
    const sample=parsed.animations[0].tracks.find(t=>
      /LeftArm/.test(t.name)&&/quaternion/.test(t.name));
    assert.ok(sample,'LeftArm survives exporter and importer');
    assert.ok(new THREE.Quaternion().fromArray(
      sample.createInterpolant().evaluate(.5))
      .angleTo(new THREE.Quaternion())>.1);
    const skinned=[];
    parsed.scene.traverse(node=>{if(node.isSkinnedMesh)skinned.push(node);});
    assert.equal(skinned.length,1);
    assert.equal(skinned[0].skeleton.bones.length,5);
    assert.equal(skinned[0].geometry.attributes.skinWeight.count,
      model.getObjectByName('body').geometry.attributes.skinWeight.count);
  }finally{
    if(!previousReader)delete globalThis.FileReader;
  }
});


test('02D preserves ALL Mixamo namespaced clips in two-clip binary GLB',async()=>{
  const {model,clip,l,r}=buildFixture();
  l.name='mixamorig:LeftArm';r.name='mixamorig:RightArm';
  for(const track of clip.tracks){
    if(track.name.startsWith('mixamorig'))
      track.name=track.name.replace('mixamorig','mixamorig:');
  }
  const rest=captureExistingRigRest(model);
  const edited=editExistingRigClip(clip,model,{
    rest,settings:{armSpace:70,overdrive:1.25},
  }).clip;
  const untouched=clip.clone();
  untouched.name='Second Original Animation';
  const normalizedOriginal=prepareExistingRigClipForExport(untouched,model);
  assert.notEqual(normalizedOriginal,untouched);
  assert.equal(normalizedOriginal.tracks.length,untouched.tracks.length);
  assert.ok(normalizedOriginal.tracks.every(t=>!t.name.includes(':')));
  assert.ok(untouched.tracks.some(t=>t.name.includes(':')),
    'source clip names must be untouched');
  const oldReader=globalThis.FileReader;
  if(!oldReader)globalThis.FileReader=class{
    result=null;
    async readAsArrayBuffer(blob){
      try{this.result=await blob.arrayBuffer();this.onloadend?.({target:this});}
      catch(e){this.onerror?.(e);}
    }
    async readAsDataURL(blob){
      try{
        this.result='data:'+(blob.type||'application/octet-stream')+';base64,'+
          Buffer.from(await blob.arrayBuffer()).toString('base64');
        this.onloadend?.({target:this});
      }catch(e){this.onerror?.(e);}
    }
  };
  try{
    const binary=await new GLTFExporter().parseAsync(model,{
      binary:true,trs:true,onlyVisible:false,
      animations:[edited,normalizedOriginal],
    });
    const loaded=await new GLTFLoader().parseAsync(binary,'');
    assert.equal(loaded.animations.length,2);
    assert.equal(loaded.animations[0].tracks.length,clip.tracks.length);
    assert.equal(loaded.animations[1].tracks.length,clip.tracks.length);
    assert.ok(Math.abs(loaded.animations[0].duration-1.6)<.04);
    let skinned=0;loaded.scene.traverse(n=>{if(n.isSkinnedMesh)skinned++;});
    assert.equal(skinned,1);
  }finally{if(!oldReader)delete globalThis.FileReader;}
});

test('02D visible editor and export use current viewer clips, not AUTORIG-01',()=>{
  const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  const dock=readFileSync(new URL('../src/ViewportMotionDock.jsx',
    import.meta.url),'utf8');
  const ui=readFileSync(new URL('../src/ExistingRigMotionLab.jsx',
    import.meta.url),'utf8');
  const viewer=readFileSync(new URL('../src/lib/viewer.js',import.meta.url),'utf8');
  assert.match(app,/ViewportMotionDock/);
  assert.match(dock,/ExistingRigMotionLab/);
  assert.match(ui,/AUTORIG-02D · Editor de animaciones existentes/);
  assert.match(ui,/editExistingRigAnimation\(clipIndex,v,targets\)/);
  assert.match(ui,/exportGLB\(/);
  assert.match(ui,/seekExistingRigAnimation/);
  assert.match(ui,/Overdrive · ritmo que se guarda al exportar/);
  assert.match(viewer,/this\.clips\.map\(item=>item\.clip\)/);
  assert.match(viewer,/getExistingRigMotionStatus/);
});
