import test from 'node:test';
import assert from 'node:assert/strict';
import { Bone, Object3D, AnimationClip, QuaternionKeyframeTrack, VectorKeyframeTrack } from 'three';
import { adaptFbxToVrm } from '../src/lib/vrmMotion.js';

const roleNames = {
  hips:'j_bip_c_hips',spine:'j_bip_c_spine',head:'j_bip_c_head',
  leftUpperArm:'j_bip_l_upperarm',rightUpperArm:'j_bip_r_upperarm',
  leftUpperLeg:'j_bip_l_upperleg',rightUpperLeg:'j_bip_r_upperleg',
};
function fixtures(mixamo=false){
  const source=new Object3D();
  const rawHumanBones={},normalized={};
  const target=new Object3D();
  for(const [role,name] of Object.entries(roleNames)){
    const bone=new Bone();
    bone.name=mixamo?({
      hips:'mixamorig:Hips',spine:'mixamorig:Spine',head:'mixamorig:Head',
      leftUpperArm:'mixamorig:LeftArm',rightUpperArm:'mixamorig:RightArm',
      leftUpperLeg:'mixamorig:LeftUpLeg',rightUpperLeg:'mixamorig:RightUpLeg',
    })[role]:name;
    source.add(bone);
    if(role==='hips')bone.position.y=2;
    const raw=new Bone();raw.name=name;target.add(raw);
    const node=new Bone();node.name='normalized_'+role;target.add(node);
    normalized[role]=node;
    rawHumanBones[role]={node:raw};
  }
  const vrm={
    meta:{metaVersion:'1'},
    humanoid:{
      rawHumanBones,
      normalizedRestPose:{hips:{position:[0,1,0]}},
      getRawBoneNode:role=>rawHumanBones[role]?.node||null,
      getNormalizedBoneNode:role=>normalized[role]||null,
    },
  };
  const tracks=Object.entries(roleNames).map(([role,name])=>{
    const rigName=mixamo?source.children.find(x=>x.name.toLowerCase().includes(
      ({hips:'hips',spine:'spine',head:'head',leftUpperArm:'leftarm',rightUpperArm:'rightarm',leftUpperLeg:'leftupleg',rightUpperLeg:'rightupleg'})[role]
    ))?.name:name;
    return new QuaternionKeyframeTrack(rigName+'.quaternion',[0,1],[0,0,0,1,0,0,0,1]);
  });
  return {source,vrm,tracks};
}
test('VRM: convierte animación con nombres crudos iguales aunque la jerarquía sea distinta',()=>{
  const {source,vrm,tracks}=fixtures();
  const clip=new AnimationClip('Thinking',1,tracks);
  const out=adaptFbxToVrm(source,vrm,clip);
  assert.equal(out.mappedRoles,7);
  assert.equal(out.clip.tracks.length,7);
  assert.ok(out.clip.tracks.some(t=>t.name==='normalized_hips.quaternion'));
  assert.match(out.warning,/experimental/);
});
test('VRM: permite alias estándar Mixamo incluso si el VRM usa J_Bip',()=>{
  const {source,vrm,tracks}=fixtures(true);
  const out=adaptFbxToVrm(source,vrm,new AnimationClip('Idle',1,tracks));
  assert.equal(out.mappedRoles,7);
  assert.ok(out.clip.tracks.some(t=>t.name==='normalized_leftUpperArm.quaternion'));
});
test('VRM: convierte el desplazamiento de caderas según altura',()=>{
  const {source,vrm,tracks}=fixtures();
  tracks.push(new VectorKeyframeTrack('j_bip_c_hips.position',[0,1],[0,2,0, 1,2,0]));
  const out=adaptFbxToVrm(source,vrm,new AnimationClip('Walk',1,tracks));
  const pos=out.clip.tracks.find(t=>t.name==='normalized_hips.position');
  assert.ok(pos);
  assert.ok(Math.abs(pos.values[3]-0.5)<0.00001);
});
test('VRM: rechaza una pista de grupo con movimiento real en vez de perderla silenciosamente',()=>{
  const {source,vrm,tracks}=fixtures();
  const obj=new Object3D();obj.name='LUMIA_FULL_SKIN_1';source.add(obj);
  tracks.push(new VectorKeyframeTrack('LUMIA_FULL_SKIN_1.position',[0,1],[0,0,0,2,0,0]));
  assert.throws(()=>adaptFbxToVrm(source,vrm,new AnimationClip('Thinking',1,tracks)),/objeto externo/);
});
test('VRM: omite pista auxiliar estática, sin borrar pistas humanoides',()=>{
  const {source,vrm,tracks}=fixtures();
  const obj=new Object3D();obj.name='LUMIA_FULL_SKIN_1';obj.position.y=2;source.add(obj);
  tracks.push(new VectorKeyframeTrack('LUMIA_FULL_SKIN_1.position',[0,1],[0,2,0,0,2,0]));
  const out=adaptFbxToVrm(source,vrm,new AnimationClip('Idle',1,tracks));
  assert.equal(out.skipped,1);
  assert.equal(out.clip.tracks.length,7);
});
test('VRM: no acepta un FBX sin caderas, torso y extremidades reconocidas',()=>{
  const source=new Object3D();const bone=new Bone();bone.name='foo';source.add(bone);
  const {vrm}=fixtures();
  const track=new QuaternionKeyframeTrack('foo.quaternion',[0,1],[0,0,0,1,0,0,0,1]);
  assert.throws(()=>adaptFbxToVrm(source,vrm,new AnimationClip('X',1,[track])),/estructuras humanoides/);
});
