import {useEffect,useRef,useState} from 'react';
import {Brain,Volume2,Square,ShieldCheck} from 'lucide-react';
import {
  getInstalledOllamaModels,OLLAMA_MODEL,ollamaOriginHelp,
} from './lib/ollamaVision.js';
import {
  askLocalMotorIntent,validateMotorIntent,MOTOR_INTENT_SCHEMA,
} from './lib/livingPresence/ollamaMotorIntent.js';
import {
  VoiceMotorBridge,bindMediaElementMotor,
} from './lib/livingPresence/voiceMotorBridge.js';

const style={padding:'7px',borderRadius:6,background:'#17273b',color:'#e0f2ff',
  border:'1px solid #315064',width:'100%'};
const demo=()=>validateMotorIntent({
  schema:MOTOR_INTENT_SCHEMA,
  dialogue:'Entiendo. Ahora puedo acompañar mis palabras con movimientos suaves y recuperar mi postura al terminar.',
  motorMode:'explaining',gesture:'emphasize',attentionTarget:'interlocutor',intensity:0.48,
});

export default function VoiceMotorLab({getViewer,model,generation,activeClip}){
  const bridge=useRef(null);
  if(!bridge.current)bridge.current=new VoiceMotorBridge(getViewer);
  const controller=useRef(null);
  const audio=useRef(null);
  const detachAudio=useRef(null);
  const soundUrl=useRef(null);
  const utterance=useRef(null);
  const currentToken=useRef(null);
  const [connected,setConnected]=useState(false);
  const [models,setModels]=useState([]);
  const [modelName,setModelName]=useState(OLLAMA_MODEL);
  const [question,setQuestion]=useState('¿Cómo podemos hacer que tus movimientos se sientan más naturales?');
  const [busy,setBusy]=useState(false);
  const [intent,setIntent]=useState(null);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [source,setSource]=useState('browser');
  const [audioName,setAudioName]=useState('');
  const [speakerEnabled,setSpeakerEnabled]=useState(false);
  const [voiceStatus,setVoiceStatus]=useState('idle');
  const origin=typeof window==='undefined'?'':window.location.origin;

  const stop=(reason='cancelled')=>{
    controller.current?.abort();
    controller.current=null;
    detachAudio.current?.();detachAudio.current=null;
    if(typeof window!=='undefined'&&window.speechSynthesis){
      // Token invalidation happens FIRST so late browser events cannot act
      // on a newly loaded VRM or a later utterance.
      currentToken.current=null;
      bridge.current.cancel(reason);
      window.speechSynthesis.cancel();
    }else{
      currentToken.current=null;
      bridge.current.cancel(reason);
    }
    if(audio.current){
      audio.current.pause();
      audio.current.currentTime=0;
    }
    utterance.current=null;
    setVoiceStatus('idle');
  };
  // Switching model/clip cannot leave a stale voice session driving the rig.
  // Keep already loaded local audio available when only the FBX changes.
  useEffect(()=>{
    stop('model-or-clip-changed');
    setIntent(null);setMessage('');
  },[generation,activeClip,getViewer]);
  // Release object URLs and browser speech only when the component unmounts.
  useEffect(()=>()=> {
    controller.current?.abort();
    detachAudio.current?.();detachAudio.current=null;
    currentToken.current=null;
    bridge.current.cancel('unmounted');
    if(typeof window!=='undefined')window.speechSynthesis?.cancel();
    if(audio.current)audio.current.pause();
    if(soundUrl.current){
      URL.revokeObjectURL(soundUrl.current);soundUrl.current=null;
    }
  },[]);

  const connect=async()=>{
    setError('');setMessage('');setBusy(true);
    const ctrl=new AbortController();controller.current=ctrl;
    try{
      const available=await getInstalledOllamaModels({signal:ctrl.signal});
      const qwen=available.filter(name=>/^qwen3\.5(?::|$)/i.test(name));
      setModels(qwen);
      setConnected(true);
      if(qwen.length){
        const preferred=qwen.includes(modelName)?modelName:
          qwen.find(x=>x.startsWith('qwen3.5:0.8b'))||qwen[0];
        setModelName(preferred);
        setMessage('Ollama local conectado. Qwen 3.5 disponible.');
      }else{
        setMessage('Ollama responde, pero no hay Qwen 3.5 instalado.');
      }
    }catch(e){setConnected(false);setError(e.message||String(e));}
    finally{setBusy(false);if(controller.current===ctrl)controller.current=null;}
  };
  const query=async()=>{
    if(!connected||busy||!models.includes(modelName))return;
    stop('new-question');
    setIntent(null);setError('');setMessage('Consultando Qwen local…');setBusy(true);
    const ctrl=new AbortController();controller.current=ctrl;
    const timeout=setTimeout(()=>ctrl.abort(),90000);
    try{
      const output=await askLocalMotorIntent({question,model:modelName,signal:ctrl.signal});
      if(ctrl.signal.aborted)return;
      setIntent(output);
      setMessage('Respuesta recibida y contrato motor validado. Voz aún sin reproducir.');
    }catch(e){if(!ctrl.signal.aborted)setError(e.message||String(e));}
    finally{clearTimeout(timeout);if(controller.current===ctrl)controller.current=null;setBusy(false);}
  };
  const onAudioFile=event=>{
    stop('audio-replaced');
    if(soundUrl.current){URL.revokeObjectURL(soundUrl.current);soundUrl.current=null;}
    const file=event.target.files?.[0];
    if(!file){setAudioName('');if(audio.current)audio.current.removeAttribute('src');return;}
    if(!file.type.startsWith('audio/')||file.size>40*1024*1024){
      setError('Elige un archivo de audio local compatible de hasta 40 MB.');
      event.target.value='';return;
    }
    soundUrl.current=URL.createObjectURL(file);
    if(audio.current){audio.current.src=soundUrl.current;audio.current.load();}
    setAudioName(file.name);
    setError('');setMessage('Audio local preparado; no se subirá a ningún servidor.');
  };
  const play=async()=>{
    if(!intent||!speakerEnabled)return;
    stop('new-playback');
    setError('');setMessage('');
    let token;
    try{token=bridge.current.prepare(intent);}
    catch(e){setError(e.message||String(e));return;}
    currentToken.current=token;
    if(source==='browser'){
      if(typeof window==='undefined'||typeof window.SpeechSynthesisUtterance!=='function'||
        !window.speechSynthesis){
        bridge.current.end(token,'unavailable');
        currentToken.current=null;
        setError('Este navegador no tiene sintetizador de voz disponible. Usa un audio local.');
        return;
      }
      const speech=new window.SpeechSynthesisUtterance(intent.dialogue);
      speech.lang='es-CL';speech.rate=0.92;speech.pitch=1;speech.volume=0.95;
      utterance.current=speech;
      speech.onstart=()=>{
        if(currentToken.current!==token)return;
        bridge.current.start(token);
        setVoiceStatus('speaking');
        const status=bridge.current.getStatus();
        setMessage(status.motorApplied
          ? 'Voz del navegador iniciada: movimiento ligado al audio.'
          : 'Voz iniciada SIN gestos: '+status.reason);
      };
      speech.onpause=()=>{if(currentToken.current===token){
        bridge.current.pause(token);setVoiceStatus('paused');
      }};
      speech.onresume=()=>{if(currentToken.current===token){
        bridge.current.resume(token);setVoiceStatus('speaking');
      }};
      speech.onend=()=>{if(currentToken.current===token){
        bridge.current.end(token,'ended');
        currentToken.current=null;utterance.current=null;
        setVoiceStatus('idle');setMessage('Voz finalizada; postura anterior restaurada.');
      }};
      speech.onerror=event=>{if(currentToken.current===token){
        bridge.current.end(token,'error');
        currentToken.current=null;utterance.current=null;
        setVoiceStatus('idle');
        if(event.error!=='canceled'&&event.error!=='interrupted')
          setError('Falló la síntesis de voz del navegador: '+event.error);
      }};
      window.speechSynthesis.speak(speech);
      setVoiceStatus('queued');
      setMessage('Voz solicitada. Ningún gesto se iniciará antes del audio.');
    }else{
      if(!audioName||!audio.current){
        bridge.current.end(token,'no-audio');currentToken.current=null;
        setError('Selecciona primero un archivo WAV/MP3 producido localmente.');
        return;
      }
      detachAudio.current=bindMediaElementMotor(audio.current,bridge.current,token);
      try{
        await audio.current.play(); // 'playing' starts motor, not this promise.
        if(currentToken.current!==token)return;
        setVoiceStatus('speaking');
        const status=bridge.current.getStatus();
        setMessage(status.motorApplied
          ? 'Audio local reproduciéndose: el sistema motor acompaña la voz.'
          : 'Audio local sonando SIN gestos: '+status.reason);
      }catch(e){
        bridge.current.end(token,'play-error');
        detachAudio.current?.();detachAudio.current=null;
        currentToken.current=null;
        setError('No se pudo reproducir el audio local: '+(e.message||e));
      }
    }
  };

  return <div style={{display:'grid',gap:10,borderTop:'1px solid #284158',paddingTop:12}}>
    <strong style={{display:'flex',alignItems:'center',gap:8,fontSize:12}}>
      <Brain size={16}/> LP-03C.1 · Qwen local + voz sincronizada
    </strong>
    <small style={{lineHeight:1.6,opacity:0.82}}>
      Qwen genera una respuesta y propone una intención motora limitada. Los
      gestos solo se inician cuando comienza a sonar realmente la voz.
      Este laboratorio usa voz del navegador o un archivo de audio local;
      <strong> todavía no conecta el servidor Kokoro de LUMIA R8</strong>.
    </small>
    <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12}}>
      <input type="checkbox" checked={speakerEnabled}
        onChange={e=>{stop('disabled');setSpeakerEnabled(e.target.checked);}}/>
      Autorizar movimiento y reproducción de voz (solo pruebas)
    </label>
    <div style={{display:'flex',gap:8,alignItems:'center'}}>
      <button className="outline-btn" type="button" onClick={connect} disabled={busy}>
        {connected?'Actualizar Ollama':'Conectar Ollama'}
      </button>
      <span style={{fontSize:11,opacity:0.72}}>{connected?'Conectado':'Sin conectar'}</span>
    </div>
    {connected&&<label style={{fontSize:12,display:'grid',gap:4}}>
      Modelo Qwen local
      <select style={style} value={modelName} onChange={e=>setModelName(e.target.value)}>
        {models.map(m=><option key={m} value={m}>{m}</option>)}
      </select>
    </label>}
    <label style={{fontSize:12,display:'grid',gap:4}}>
      Pregunta de prueba para LUMIA (máximo 600 caracteres)
      <textarea value={question} maxLength={600} rows={3}
        style={{...style,resize:'vertical'}} onChange={e=>setQuestion(e.target.value)}/>
    </label>
    <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
      <button className="outline-btn" type="button"
        disabled={!connected||!models.length||busy||!question.trim()}
        onClick={query}>Preguntar a Qwen</button>
      <button className="outline-btn" type="button" disabled={busy}
        onClick={()=>{stop('demo');setIntent(demo());
          setError('');setMessage('Demostración preparada SIN consultar a Qwen.');}}>
        Demostración sin IA
      </button>
      {busy&&<button className="outline-btn" type="button"
        onClick={()=>{controller.current?.abort();setBusy(false);}}>
        Cancelar consulta
      </button>}
    </div>
    {intent&&<div style={{display:'grid',gap:5,padding:9,border:'1px solid #315064',
      borderRadius:8}}>
      <strong style={{fontSize:11}}>Respuesta lista para hablar</strong>
      <p style={{margin:0,fontSize:12,lineHeight:1.55}}>{intent.dialogue}</p>
      <small style={{opacity:0.78}}>Intención: {intent.motorMode} · Gesto: {intent.gesture}
        {' '}· Intensidad autorizada: {Math.round(intent.intensity*100)}%</small>
    </div>}
    <label style={{fontSize:12,display:'grid',gap:4}}>
      Fuente de audio para la prueba
      <select style={style} value={source} onChange={e=>{stop('source-change');setSource(e.target.value);}}>
        <option value="browser">Voz del navegador (fallback de laboratorio)</option>
        <option value="file">Archivo de voz local WAV/MP3 (por ejemplo, Kokoro)</option>
      </select>
    </label>
    {source==='file'&&<>
      <label style={{fontSize:11,display:'grid',gap:4}}>
        Audio producido localmente (no se sube a ningún servidor)
        <input type="file" accept="audio/*" onChange={onAudioFile}/>
      </label>
      {audioName&&<small style={{opacity:0.8}}>Archivo: {audioName}.
        Se reproducirá tal cual; no se garantiza sincronización por palabra.</small>}
    </>}
    <audio ref={audio} preload="metadata" style={{width:'100%',display:source==='file'?'block':'none'}}
      onPlaying={()=>{if(currentToken.current!==null)setVoiceStatus('speaking');}}
      onPause={()=>{if(currentToken.current!==null)setVoiceStatus('paused');}}
      onEnded={()=>{if(currentToken.current!==null){currentToken.current=null;
        setVoiceStatus('idle');setMessage('Audio finalizado; postura anterior restaurada.');}}}
    />
    <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
      <button type="button" className="outline-btn" onClick={play}
        disabled={!speakerEnabled||!intent||busy||voiceStatus==='speaking'||voiceStatus==='queued'||
          (source==='file'&&!audioName)}>
        <Volume2 size={14}/> Reproducir y sincronizar
      </button>
      <button type="button" className="outline-btn" disabled={voiceStatus==='idle'}
        onClick={()=>{stop('manual-stop');setMessage('Voz detenida. Reposo restaurado.');}}>
        <Square size={13}/> Detener y recuperar postura
      </button>
    </div>
    {message&&<small role="status" style={{lineHeight:1.55,opacity:0.87}}>{message}</small>}
    {error&&<small role="alert" style={{color:'#ffb4a7',lineHeight:1.55}}>{error}</small>}
    <small style={{display:'flex',alignItems:'start',gap:7,lineHeight:1.5,opacity:0.76}}>
      <ShieldCheck size={15}/> Para mover el personaje, activa Presencia A/B;
      con FBX seleccionado activa también LP-02C.1 sobre un Idle.
      La voz puede sonar aunque la animación esté bloqueada por seguridad.
    </small>
    <details style={{fontSize:11}}>
      <summary style={{cursor:'pointer'}}>Configuración local de Ollama / permisos de origen</summary>
      <p style={{lineHeight:1.5}}>Si Chrome bloquea Ollama en el puerto 5174,
        comprueba que el servicio local esté encendido y autoriza este origen en OLLAMA_ORIGINS.</p>
      <code style={{fontSize:10,whiteSpace:'pre-wrap',wordBreak:'break-all'}}>
        {ollamaOriginHelp(origin)}
      </code>
    </details>
  </div>;
}
