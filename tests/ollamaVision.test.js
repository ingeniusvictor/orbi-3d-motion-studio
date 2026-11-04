import test from 'node:test';
import assert from 'node:assert/strict';
import {getInstalledOllamaModels,askOllamaVisual,verifyVisualSuggestion,
  extractJsonReply,ollamaOriginHelp,OLLAMA_LOCAL,OLLAMA_MODEL} from '../src/lib/ollamaVision.js';

const image='data:image/jpeg;base64,'+Buffer.from('a tiny local screenshot').toString('base64');
const candidates=[{name:'head_color.png'},{name:'hair_albedo.dds'}];
test('04D: asks only local Ollama for installed models and selects known installed tag',async()=>{
 const urls=[];
 const list=await getInstalledOllamaModels({request:async(url,init)=>{
   urls.push(url);assert.equal(init.method,'GET');
   assert.equal(init.targetAddressSpace,'loopback');
   assert.equal(init.mode,'cors');
   return {ok:true,json:async()=>({models:[{name:'qwen3.5:0.8b'},{name:'other:latest'}]})};
 }});
 assert.deepEqual(list,['qwen3.5:0.8b','other:latest']);
 assert.equal(urls[0],OLLAMA_LOCAL+'/api/tags');
 assert.equal(OLLAMA_MODEL,'qwen3.5:0.8b');
});
test('04D: vision request sends two bounded images, JSON prompt, and never material writes',async()=>{
 let payload;
 const res=await askOllamaVisual({meshImage:image,textureImage:image,
  materialName:'face',meshNames:['jaw','eyes'],candidates,request:async(url,options)=>{
    assert.equal(url,OLLAMA_LOCAL+'/api/chat');
    assert.equal(options.method,'POST');
    assert.equal(options.targetAddressSpace,'loopback');
    assert.equal(options.mode,'cors');
    payload=JSON.parse(options.body);
    return {ok:true,json:async()=>({message:{content:'{"candidateIndex":2,"confidence":"medium","part":"cabello","reason":"patrón compatible"}'}})};
  }});
 assert.equal(payload.model,'qwen3.5:0.8b');
 assert.equal(payload.stream,false);
 assert.equal(payload.format,'json');
 assert.equal(payload.messages[1].images.length,2);
 assert.equal(payload.messages[1].images[0],image.split(',')[1]);
 assert.deepEqual(res,{candidateIndex:1,confidence:'medium',part:'cabello',reason:'patrón compatible'});
});
test('04D: rejects hallucinated candidates, malformed response and invalid images',async()=>{
 assert.throws(()=>verifyVisualSuggestion({candidateIndex:99},candidates),/índice/);
 assert.throws(()=>extractJsonReply('not JSON'),/JSON/);
 assert.deepEqual(verifyVisualSuggestion({candidateIndex:null,reason:'no coincide'},candidates),
   {candidateIndex:null,reason:'no coincide',confidence:'low'});
 await assert.rejects(()=>askOllamaVisual({meshImage:'invalid',textureImage:image,candidates}),/dos imágenes/);
 await assert.rejects(()=>askOllamaVisual({meshImage:image,textureImage:image,candidates:[]}),/una y ocho/);
});
test('04D: network and CORS errors are actionable and do not leak to remote endpoints',async()=>{
 await assert.rejects(()=>getInstalledOllamaModels({
  request:async()=>{throw new TypeError('Failed to fetch');}
 }),/OLLAMA_ORIGINS/);
 assert.match(ollamaOriginHelp('https://orbi-app.vercel.app'),/orbi-app\.vercel\.app/);
 assert.equal(ollamaOriginHelp('https://evil.com;exit'), '');
});
