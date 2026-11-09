# LUMIA Living Presence · LP-03C.1 — Qwen local + motor sincronizado con audio

**Fecha:** 2026-11-07
**Estado:** laboratorio implementado y pruebas automatizadas; QA visual/auditiva sobre Vita.vrm + Idle Mixamo pendiente.
**Repositorio:** https://github.com/ingeniusvictor/orbi-3d-motion-studio
**Rama:** `feat/lumia-living-presence-lp01-20261107`
**PR borrador:** https://github.com/ingeniusvictor/orbi-3d-motion-studio/pull/2
**Rama main / LUMIA R8:** no modificadas.

## Objetivo

Unir tres subsistemas YA IMPLEMENTADOS en ORBI Motion Studio sin alterar LUMIA R8:
- LP-02D/02C: presencia natural, mirada, parpadeo, reposo Mixamo y suavizado.
- LP-03A: Cerebelo Motor con estados `resting`, `attentive`, `thinking`, `explaining`.
- LP-03B.1: Director de gestos one-shot `acknowledge`, `curious`, `emphasize`.

LP-03C.1 permite que un Qwen local proponga una respuesta hablada y un gesto de un catálogo cerrado, que **se ejecutará solamente cuando haya empezado realmente a reproducirse una voz**. La IA jamás determina ángulos de huesos, ejecuta código o impone movimientos por fotograma.

## Componentes

### `src/lib/livingPresence/ollamaMotorIntent.js`

- Consulta de texto real a `http://127.0.0.1:11434/api/chat`, `stream:false`, `think:false`, `format:'json'`; `qwen3.5:0.8b` por defecto; el selector muestra los Qwen 3.5 efectivamente instalados.
- Solo loopback `localhost/127.0.0.1`, nunca proveedores cloud ni endpoints arbitrarios. No recibe archivos VRM/FBX ni imágenes.
- Valida estrictamente el contrato `orbi.lumia.motor-intent.v1`. Ejemplo:

```json
{
  "schema": "orbi.lumia.motor-intent.v1",
  "dialogue": "Con gusto, puedo explicártelo.",
  "motorMode": "explaining",
  "gesture": "emphasize",
  "attentionTarget": "interlocutor",
  "intensity": 0.48
}
```

- `motorMode`: `resting|attentive|thinking|explaining`. `gesture`: `none|acknowledge|curious|emphasize`. `attentionTarget`: `interlocutor|ambient`; este último es metadata de intención reservada para control contextual posterior, **aún no gobierna el controlador ocular**.
- El diálogo se acota a 450 caracteres, intensidad motora limitada a 0–75 %, sin campos dinámicos ejecutables ni acceso a funciones de SO.
- Cualquier contrato inválido se rechaza con error visible y **no altera el avatar**.
- No hay llamadas automáticas al LLM por frame.

### `src/lib/livingPresence/voiceMotorBridge.js`

- `VoiceMotorBridge.prepare(intent)`: valida/guarda intención; **NO aplica ninguna pose** todavía.
- `start(token)`: en `SpeechSynthesisUtterance.onstart` o `HTMLAudioElement.playing`, valida acceso al VRM: Presencia natural A/B activada y, si hay un FBX seleccionado, composición LP-02C.1 aprobada.
- Cuando pasa el guard: guarda el estado previo de habilitación/mode del Cerebelo LP-03A y del Director de Gestos LP-03B.1, habilita ambos temporalmente, selecciona el modo indicado por Qwen, y dispara como máximo un gesto del catálogo.
- Si el guard deniega (por ejemplo, caminata FBX), **el audio se reproduce igualmente, pero sin alterar el esqueleto**, y la interfaz lo informa.
- `pause` cancela el gesto activo y vuelve temporalmente al estado attentive; `resume` reanuda el modo pero **no repite el gesto**.
- `end/cancel/error` restauran los toggles y el modo/volumen motor anteriores, cancelan gestos pendientes. Los callbacks obsoletos usan token de sesión y no pueden controlar una nueva sesión.
- Guarda referencia a identidad del VRM original; nunca restaura estados de una conversación antigua dentro de un avatar nuevo cargado en el mismo visor.

### Audio local y contrato con Kokoro

- La interfaz puede reproducir voz mediante `window.speechSynthesis`, claramente rotulada **fallback de navegador**, no Kokoro.
- Alternativamente puede cargar un WAV/MP3 local (p. ej. audio ya generado por Kokoro). `bindMediaElementMotor(audio,bridge,token)` se enlaza a `playing`, `pause`, `ended`, `error`, `abort`; no se activa en `play`, `loadstart` o cuando el TTS aún está generando.
- Este contrato puede conectar en el futuro el audio real Kokoro de LUMIA R8, **pero el servidor Kokoro y el runtime de R8 NO están integrados directamente ni se modificaron**.
- **No hay todavía visemas sincronizados palabra/fonema** en el Studio. Tampoco se sincronizan subtítulos ni gestos con palabras específicas: la primera sincronización es al comienzo/final del audio completo.

### `src/VoiceMotorLab.jsx`

- Nuevo panel **LP-03C.1 Qwen local + voz sincronizada** integrado dentro de `src/LivingPresenceLab.jsx`.
- Conectar Ollama, elegir Qwen 3.5 instalado, escribir pregunta, consultar, revisar diálogo/estado/gesto propuestos.
- Autorización explícita de voz/movimiento: desactivada por defecto.
- Modo **Demostración sin IA**, que permite probar todo el puente sin Ollama.
- Dos fuentes audio: navegador o un archivo local WAV/MP3 (máx. 40 MB), sin upload.
- `Reproducir y sincronizar` inicia el audio; `Detener y recuperar postura` cancela y restaura.
- Cancelación de inferencia con AbortController y timeout de 90 segundos; cambio de VRM/clip invalida cualquier reproducción anterior.
- Presenta ayuda de OLLAMA_ORIGINS para el origen exacto del navegador.

### `src/lib/viewer.js`

- Nuevo `getLivingSpeechMotorAvailability()`, que comprueba en cada inicio audible:
  1. VRM presente.
  2. Presencia natural A/B habilitada.
  3. Si hay clip FBX seleccionado, MotionComposer activo y autorizado.
- Se reutilizan `setLivingMotorCoordination`, `setLivingMotorMode`, `setLivingGestureEnabled/Intensity` y `triggerLivingGesture` ya certificados. **No se añadió un segundo motor de movimiento.**

## Seguridad y aislamiento

- PR permanece en rama experimental; sin merge a main.
- No se instala ningún modelo grande ni se cambia la inferencia usada por LUMIA-ASUS.
- No se copian ni publican Vita.vrm, FBX de Mixamo, audios privados o claves.
- Validación del modelo anterior a cualquier movimiento; lista cerrada de gestos y estados.
- El movimiento sigue siendo solo para vista previa; no se exporta como clips GLB/VRMA.
- La voz del navegador se elige explícitamente; **no afirmar que se usa Kokoro R8**.
- Ningún evento antiguo de voz puede aplicarse sobre un modelo recién cargado.

## QA automático

`tests/livingPresenceVoiceMotor.test.js` añade pruebas:
- Esquema JSON, eliminación de campos extra, límites, rechazo de inyección de gestos.
- Petición `/api/chat` local con formato JSON, sin imágenes ni streaming.
- No mover el avatar antes de `onstart`.
- Restauración de los estados previos al terminar, cancelar o reemplazar sesión.
- Pausa/reanudación sin gestos duplicados.
- Audio `HTMLMediaElement` dispara solamente desde `playing`.
- Audio permitido aunque FBX posea control exclusivo, sin movimientos.
- Protección contra modelo reemplazado y verificación del guard del visor.

Ejecución previa de CI con los nuevos archivos: **159/159 pruebas superadas y build correcto**. La confirmación final de la revisión de UI está en la ejecución de Actions correspondiente al último commit.

## Protocolo de prueba en Windows PowerShell 5.1

1. Detener el servidor anterior con `Ctrl+C`.
2. En `$env:USERPROFILE\Downloads\ORBI-LIVING-PRESENCE-LAB` ejecutar `git status --short`. Si está limpio, `git pull --ff-only`.
3. Ejecutar `npm.cmd test`, `npm.cmd run build`, `npm.cmd run dev -- --port 5174 --strictPort`.
4. Abrir `http://localhost:5174/` y cargar `Vita.vrm` original local.
5. Activar **Presencia natural A/B**; si está seleccionado el nuevo Idle Mixamo, habilitar **LP-02C.1 Mixamo + Presencia viva**. Mantener suavizado LP-02C.2 y/o LP-03A que fueron aprobados visualmente.
6. En **LP-03C.1**, marcar **Autorizar movimiento y reproducción de voz**, pulsar **Demostración sin IA**, elegir **Voz del navegador** y **Reproducir y sincronizar**. La postura no debe cambiar antes de sonar. Al terminar debe volver al reposo anterior.
7. Conectar Ollama. Si no conecta, abrir PowerShell y ejecutar `ollama list`, `ollama serve` si no está funcionando. El origen `http://localhost:5174` puede necesitar autorización en `OLLAMA_ORIGINS`; reiniciar Ollama luego de modificar su entorno.
8. Elegir uno de los Qwen 3.5 instalados en la laptop; consultar una frase corta. Revisar diálogo, gesto e intención generados, y solo luego autorizar `Reproducir y sincronizar`.
9. Para comprobar audio Kokoro **sin tocar R8**, generar/exportar un WAV/MP3 local con el servicio existente, cargarlo como archivo local, reproducirlo y verificar que los gestos siguen los eventos `playing` y `ended`. El texto de la respuesta Qwen no se alinea por palabra con este audio: es una prueba de canal de audio.
10. Detener voz a mitad de reproducción y probar nuevo clip/VRM. Debe cancelarse la intención antigua y conservar la seguridad de los huesos.
11. Seleccionar un FBX de acción `Clapping` o `Walking`. La voz puede sonar, pero **ningún gesto LP-03C debe mover el avatar** mientras el compositor esté bloqueado.
12. Revisar cámara frontal/perfil, intensidad baja, ojos no cruzados, manos sin clipping, y rendimiento de laptop real. CI no certifica esa naturalidad.

## Próxima evolución

**LP-03C.2:** adaptador directo con eventos audibles del servicio Kokoro de R8 mediante interfaz o plugin específico, sólo después de inspeccionar y certificar el API concreto de ese runtime. Añadir opcionalmente eventos de frase/segmento de audio y control de prioridad gestual por frase, sin girar 155 huesos a cada respuesta.

**LP-04:** migración controlada de capas previamente certificadas del laboratorio a LUMIA R8, con prueba A/B, preservando voz y FPS. No incorporar automáticamente el motor actual al repositorio estable.
