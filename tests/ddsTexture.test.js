import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectDdsHeader, decodeDDS, DDS_MAX_PIXELS } from '../src/lib/ddsTexture.js';

function dds({width=4,height=4,fourcc='DXT1',dxgi=null,blocks=null}={}){
  const hdr=dxgi===null?128:148;
  const payload=blocks||new Uint8Array(8);
  const data=new Uint8Array(hdr+payload.length);
  const dv=new DataView(data.buffer);
  dv.setUint32(0,0x20534444,true);
  dv.setUint32(4,124,true);
  dv.setUint32(8,0x1007,true);
  dv.setUint32(12,height,true);
  dv.setUint32(16,width,true);
  dv.setUint32(76,32,true);
  dv.setUint32(80,4,true);
  const name=dxgi===null?fourcc:'DX10';
  for(let i=0;i<4;i++)data[84+i]=name.charCodeAt(i);
  dv.setUint32(108,0x1000,true);
  if(dxgi!==null){
    dv.setUint32(128,dxgi,true);
    dv.setUint32(132,3,true);
    dv.setUint32(140,1,true);
  }
  data.set(payload,hdr);
  return data;
}
test('DDS: analiza encabezado, comprueba dimensiones y detecta bloque BC7 DX10',()=>{
  assert.deepEqual(((h)=>[h.width,h.height,h.format])(inspectDdsHeader(dds())),[4,4,'BC1']);
  assert.equal(inspectDdsHeader(dds({dxgi:98,blocks:new Uint8Array(16)})).format,'BC7');
});
test('DDS: rechaza archivo corrupto, cubemap y texturas desmesuradas',()=>{
  assert.throws(()=>inspectDdsHeader(new Uint8Array(21)),/incompleto/);
  const bad=dds();bad[0]=3;
  assert.throws(()=>inspectDdsHeader(bad),/encabezado/);
  const huge=dds({width:8192,height:8192});
  assert.ok(8192*8192>DDS_MAX_PIXELS);
  assert.throws(()=>inspectDdsHeader(huge),/demasiado grande/);
  const cube=dds();new DataView(cube.buffer).setUint32(112,0x200,true);
  assert.throws(()=>inspectDdsHeader(cube),/cubemap/);
});
test('DDS: decodifica BC5 normal con alfa y reconstruye componente azul',async()=>{
  const blocks=new Uint8Array(16);
  blocks[0]=255;blocks[1]=0;blocks[8]=128;blocks[9]=0;
  const texture=await decodeDDS(dds({fourcc:'ATI2',blocks}));
  assert.equal(texture.format,'BC5');
  assert.equal(texture.width,4);
  assert.deepEqual(Array.from(texture.pixels.slice(0,4)),[255,128,128,255]);
  assert.equal(texture.pixels.length,64);
});
test('DDS: decodifica BC4 como gris en RGBA8',async()=>{
  const block=new Uint8Array(8);block[0]=123;block[1]=0;
  const texture=await decodeDDS(dds({fourcc:'ATI1',blocks:block}));
  assert.deepEqual(Array.from(texture.pixels.slice(0,4)),[123,123,123,255]);
});
test('DDS: decodifica DXT1 a RGBA8 para GLB estándar',async()=>{
  const block=new Uint8Array(8);
  block[0]=0;block[1]=0xf8; // RGB565: red
  block[2]=0xe0;block[3]=0x07; // RGB565: green
  const texture=await decodeDDS(dds({fourcc:'DXT1',blocks:block}));
  assert.equal(texture.width,4);
  assert.equal(texture.height,4);
  assert.equal(texture.pixels.length,64);
  assert.equal(texture.pixels[0],255);
  assert.equal(texture.pixels[3],255);
});
test('DDS: archivo BC5 truncado no debe generar una textura parcial',async()=>{
  await assert.rejects(()=>decodeDDS(dds({fourcc:'ATI2',blocks:new Uint8Array(5)})),/incompleta/);
});
