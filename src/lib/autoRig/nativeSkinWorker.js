import {computeSkinWeights} from './nativeSkinWeights.js';

self.addEventListener('message',event=>{
  const {id,positions,bones,softness}=event.data||{};
  try{
    const result=computeSkinWeights(new Float32Array(positions),bones,{softness});
    self.postMessage({id,ok:true,indices:result.indices.buffer,
      weights:result.weights.buffer,audit:result.audit},
      [result.indices.buffer,result.weights.buffer]);
  }catch(error){
    self.postMessage({id,ok:false,error:error?.message||String(error)});
  }
});
