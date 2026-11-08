import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {exportFbx} from 'three-js-fbx-exporter';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {reconcilePhysicalRigNames} from '../src/lib/fbxRigIdentity.js';
import {validateBinaryFBX} from '../src/lib/fbxExport.js';
import {readPhysicalFbxRig} from '../src/lib/fbxBoneAudit.js';

function skin(name='root'){
  const scene=new THREE.Group();scene.name='Character';
  const root=new THREE.Bone();root.name=name;root.position.y=1;scene.add(root);
  const child=new THREE.Bone();child.name='Bip001-Spine';child.position.y=0.4;root.add(child);
  const geom=new THREE.BoxGeometry(1,1,1);
  const count=geom.getAttribute('position').count;
  const ids=new Uint16Array(count*4),weights=new Float32Array(count*4);
  for(let i=0;i<count;i++)weights[i*4]=1;
  geom.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(ids,4));
  geom.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const body=new THREE.SkinnedMesh(geom,new THREE.MeshStandardMaterial());
  body.name='Body';scene.add(body);
  scene.updateWorldMatrix(true,true);
  body.bind(new THREE.Skeleton([root,child]));
  return {scene,root,child,body};
}
const exportRig=scene=>exportFbx(scene,{format:'binary',version:7400,target:'threejs',
  animations:[],bakeAnimations:false,embedTextures:false});
test('MOTION-05B.3 name-only physical root replacement validated from exported FBX bytes',()=>{
  const original=skin('root');
  const copy=skin('root_1');
  const bytes=exportRig(copy.scene);
  const physical=readPhysicalFbxRig(bytes);
  assert.equal(physical.size,2);
  let validated;
  try{validated=validateBinaryFBX(bytes,2,original.scene);}
  catch(error){
    const loaded=new FBXLoader().parse(bytes.buffer.slice(
      bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const skinBones=[];loaded.traverse(n=>{
      if(n.isSkinnedMesh)skinBones.push(
        ...n.skeleton.bones.map(b=>({name:b.name,parent:b.parent?.name||null})));
    });
    throw new Error(error.message+' | physical '+
      JSON.stringify([...physical])+' | skin '+JSON.stringify(skinBones));
  }
  assert.equal(validated.identity.renamedBones.length,1);
  assert.deepEqual(validated.identity.renamedBones[0],
    {before:'root',after:'root_1'});
  assert.ok(validated.identity.warnings.some(x=>x.includes('root_1')));
  const loaded=new FBXLoader().parse(bytes.buffer.slice(
    bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  assert.equal(loaded.animations.length,0);
});
test('MOTION-05B.3 root renamed under another physical bone is allowed only if parent+children match',()=>{
  const a=new Map([['Bip001',null],['root','Bip001'],['Hips','root'],['Spine','Hips']]);
  const b=new Map([['Bip001',null],['root_1','Bip001'],['Hips','root_1'],['Spine','Hips']]);
  const skinObj={skeleton:{bones:[{isBone:true,name:'root_1'}]}};
  const result=reconcilePhysicalRigNames(a,b,[skinObj]);
  assert.deepEqual(result.renamedBones,[{before:'root',after:'root_1'}]);
});
test('MOTION-05B.3 rejects same counts but different bone-parent graph',()=>{
  const a=new Map([['root',null],['head','root']]);
  const b=new Map([['root_1',null],['head',null]]);
  const linked={skeleton:{bones:[{isBone:true,name:'root_1'}]}};
  assert.throws(()=>reconcilePhysicalRigNames(a,b,[linked]),/No se puede aceptar/);
  const c=new Map([['root_1','head'],['head',null]]);
  assert.throws(()=>reconcilePhysicalRigNames(a,c,[linked]),/No se puede aceptar/);
});
test('MOTION-05B.3 rejects matching bone hierarchy if renamed root is NOT referenced by skin',()=>{
  const a=new Map([['root',null],['head','root']]);
  const b=new Map([['root_1',null],['head','root_1']]);
  assert.throws(()=>reconcilePhysicalRigNames(a,b,
    [{skeleton:{bones:[{isBone:true,name:'head'}]}}]),/No se puede aceptar/);
});
test('MOTION-05B.3 exact bone identity is unaffected and other renames are not silently allowed',()=>{
  const a=new Map([['root',null],['head','root']]);
  assert.equal(reconcilePhysicalRigNames(a,new Map(a),[]).warnings.length,0);
  const changed=new Map([['root',null],['head_1','root']]);
  assert.throws(()=>reconcilePhysicalRigNames(a,changed,[]),/Faltan: head\. Nuevos: head_1/);
});
