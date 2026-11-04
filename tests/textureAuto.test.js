import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTexturePlan,summarizeTexturePlan,normalizeTokens} from '../src/lib/textureAuto.js';
const material=(id,name,meshNames=[name],options={})=>({
  id,name,meshNames,hasUV:true,channels:[],type:'MeshStandardMaterial',textureReferences:[],...options
});
const file=(name,path=name)=>({name,size:2048,orbiRelativePath:path});
test('04C: Body+Hair PBR textures have safe deterministic matches',()=>{
  const mats=[material('body','Body'),material('hair','Hair')];
  const files=[
    file('Body_BaseColor.png'),file('Body_Normal.dds'),file('Hair_Albedo.jpg')
  ];
  const result=buildTexturePlan(files,mats);
  assert.deepEqual(result.map(x=>x.status),['safe','safe','safe']);
  assert.deepEqual(result.map(x=>x.materialId),['body','body','hair']);
  assert.deepEqual(result.map(x=>x.channel),['map','normalMap','map']);
  assert.equal(summarizeTexturePlan(result).safe,3);
  assert.ok(result.every(x=>x.score>=90));
});
test('04C: Eye_L / Eye_R ambiguity is never auto-applied',()=>{
  const result=buildTexturePlan([file('Eye_Color.png')],[
    material('l','Eye_L'),material('r','Eye_R')
  ]);
  assert.equal(result[0].status,'review');
  assert.match(result[0].reason,/más de un material/);
});
test('04C: preserve existing texture rather than automatically overwrite',()=>{
  const result=buildTexturePlan([file('Body_Color.png')],[
    material('body','Body',['Body'],{channels:['Color / Albedo']})
  ]);
  assert.equal(result[0].status,'review');
  assert.equal(result[0].overwrite,true);
  assert.match(result[0].reason,/ya tiene una textura/);
});
test('04C: reject unsafe NormalDX, bump, specular or gloss workflows',()=>{
  for(const filename of ['Body_NormalDX.dds','Body_Gloss.png','Body_Specular.png','Body_Bump.png']){
    const p=buildTexturePlan([file(filename)],[material('body','Body')])[0];
    assert.equal(p.status,'unmatched',filename);
    assert.match(p.reason,/revisión|conversión/);
  }
});
test('04C: duplicate alternatives for the same material and channel are conflicts',()=>{
  const result=buildTexturePlan([file('Body_Albedo.png'),file('Body_BaseColor.jpg')],
    [material('body','Body')]);
  assert.deepEqual(result.map(x=>x.status),['review','review']);
  assert.ok(result.every(x=>/Varias imágenes/.test(x.reason)));
});
test('04C: folder context can disambiguate generically named textures',()=>{
  const result=buildTexturePlan([
    file('normal.dds','textures/body/normal.dds'),
    file('normal.dds','textures/hair/normal.dds')
  ],[material('body','Body'),material('hair','Hair')]);
  assert.deepEqual(result.map(x=>x.materialId),['body','hair']);
  assert.deepEqual(result.map(x=>x.status),['safe','safe']);
});
test('04C: missing UV blocks application and no guessing unrelated materials',()=>{
  const noUV=buildTexturePlan([file('Body_Albedo.png')],
    [material('body','Body',['Body'],{hasUV:false})])[0];
  assert.equal(noUV.blocked,true);
  assert.notEqual(noUV.status,'safe');
  const unknown=buildTexturePlan([file('clouds.png')],[material('b','Body'),material('h','Hair')])[0];
  assert.equal(unknown.status,'unmatched');
});
test('04C: distinguish versioned body01 vs body02 instead of collapsing identifiers',()=>{
  assert.notDeepEqual(normalizeTokens('body01'),normalizeTokens('body02'));
  const materials=[material('1','Body01'),material('2','Body02')];
  const plan=buildTexturePlan([file('Body01_Normal.png'),file('Body02_Normal.png')],materials);
  assert.deepEqual(plan.map(x=>x.materialId),['1','2']);
  assert.deepEqual(plan.map(x=>x.status),['safe','safe']);
});
