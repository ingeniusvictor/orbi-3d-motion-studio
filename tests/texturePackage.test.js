import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {inspectTextureZip,extractTextureZip,safeRelativePath,validateTexturePackage} from '../src/lib/texturePackage.js';
test('04C: ZIP lists only safe images with preserved paths',async()=>{
  const zip=zipSync({'assets/body/Body_BaseColor.png':strToU8('pngdata'),
    'assets/hair/Hair_Normal.dds':strToU8('ddsdata'),
    'license.txt':strToU8('text')});
  const info=inspectTextureZip(zip);
  assert.deepEqual(info.entries.map(x=>x.path),[
    'assets/body/Body_BaseColor.png','assets/hair/Hair_Normal.dds'
  ]);
  const blob=new Blob([zip],{type:'application/zip'});
  const files=await extractTextureZip(blob);
  assert.equal(files.length,2);
  assert.equal(files[0].orbiRelativePath,'assets/body/Body_BaseColor.png');
  assert.equal(files[1].name,'Hair_Normal.dds');
});
test('04C: unsafe ZIP paths rejected without unpacking',()=>{
  for(const path of ['../secret.png','C:/private/skin.png','/absolute.png','a//skin.png']){
    assert.throws(()=>safeRelativePath(path),/insegura/);
  }
  const evil=zipSync({'../secret.png':strToU8('pixels')});
  assert.throws(()=>inspectTextureZip(evil),/insegura/);
});
test('04C: ZIP with encryption flags or corrupt header is rejected',()=>{
  const zip=zipSync({'skin.png':strToU8('data')});
  const infected=new Uint8Array(zip); // mark encrypted in central directory only
  const pos=infected.findIndex((x,i)=>x===0x50&&infected[i+1]===0x4b&&infected[i+2]===0x01&&infected[i+3]===0x02);
  assert.ok(pos>0);
  infected[pos+8]|=1;
  assert.throws(()=>inspectTextureZip(infected),/contraseña/);
  assert.throws(()=>inspectTextureZip(new Uint8Array([1,2,3])),/incompleto/);
});
test('04C: retains duplicate basenames across distinct subfolders',()=>{
  const a={name:'color.png',size:20,orbiRelativePath:'body/color.png'};
  const b={name:'color.png',size:20,orbiRelativePath:'hair/color.png'};
  assert.equal(validateTexturePackage([a,b]).length,2);
  assert.equal(validateTexturePackage([a,a]).length,1);
});
