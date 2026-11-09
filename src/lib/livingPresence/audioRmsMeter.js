// LP-03C.2 — optional local WebAudio loudness meter for user-selected WAV/MP3.
// Never records, uploads or sends PCM. MediaElementAudioSource passes through
// to the local speakers. A single source node is reused for an <audio> element.
export class MediaElementRmsMeter {
  constructor(audio,{AudioContextCtor=null}={}){
    if(!audio)throw new Error('Selecciona un elemento de audio.');
    this.audio=audio;
    this.Context=AudioContextCtor;
    this.context=null;this.source=null;this.analyser=null;this.buffer=null;
  }
  async connect(){
    if(this.analyser){
      if(this.context?.state==='suspended')await this.context.resume();
      return true;
    }
    const Context=this.Context||
      (typeof window!=='undefined'&&(window.AudioContext||window.webkitAudioContext));
    if(!Context)return false;
    const context=new Context();
    try{
      const source=context.createMediaElementSource(this.audio);
      const analyser=context.createAnalyser();
      analyser.fftSize=1024;
      source.connect(analyser);
      analyser.connect(context.destination); // preserve audible local playback
      if(context.state==='suspended')await context.resume();
      this.context=context;this.source=source;this.analyser=analyser;
      this.buffer=new Float32Array(analyser.fftSize);
      return true;
    }catch(error){
      await context.close?.().catch(()=>{});
      throw error;
    }
  }
  sample(){
    const analyser=this.analyser,buffer=this.buffer;
    if(!analyser||!buffer)return null;
    if(typeof analyser.getFloatTimeDomainData==='function'){
      analyser.getFloatTimeDomainData(buffer);
      let sum=0;
      for(let i=0;i<buffer.length;i++)sum+=buffer[i]*buffer[i];
      return Math.sqrt(sum/buffer.length);
    }
    if(typeof analyser.getByteTimeDomainData==='function'){
      const bytes=new Uint8Array(buffer.length);
      analyser.getByteTimeDomainData(bytes);
      let sum=0;
      for(let i=0;i<bytes.length;i++){const x=(bytes[i]-128)/128;sum+=x*x;}
      return Math.sqrt(sum/bytes.length);
    }
    return null;
  }
  async dispose(){
    this.source?.disconnect();this.analyser?.disconnect();
    this.source=null;this.analyser=null;this.buffer=null;
    if(this.context){const ctx=this.context;this.context=null;
      try{await ctx.close();}catch{}}
  }
}
