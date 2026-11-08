# LUMIA Living Presence — LP-03C.2 · Boca, labios y visemas

**Fecha:** 8 de noviembre de 2026
**Estado:** motor facial y UI de diagnóstico implementados, 169/169 pruebas automatizadas y build en verde; **prueba visual en Vita.vrm privada pendiente**.
**Repo:** https://github.com/ingeniusvictor/orbi-3d-motion-studio
**Rama:** `feat/lumia-living-presence-lp01-20261107`
**PR:** https://github.com/ingeniusvictor/orbi-3d-motion-studio/pull/2 (borrador).

## Causa del problema detectado por el usuario

El usuario probó LP-03C.1: Qwen respondía y los movimientos de reposo continuaban, pero **no había ninguna apertura de boca ni articulación visible de palabras**. No era una cuestión de casillas A/B: LP-03C.1 solo implementaba texto/estado motor/gesto puntual, sin un runtime de expresiones vocales. Tampoco conectó el TTS Kokoro interno de R8.

LP-03C.2 aporta **simulación labial independiente de huesos**, ligada al audio y verificable sin Qwen. Los gestos corporales siguen siendo muy sutiles, deliberadamente.

## Cambios de código

### `src/lib/livingPresence/lipSync.js` — `LipSyncController`

- Audita el `VRMExpressionManager` del avatar al cargar y detecta expresiones `aa/ih/ou/ee/oh` (VRM 1, normalizadas) o aliases legacy/custom `a/i/u/e/o`.
- Presenta capacidades reales: visemas disponibles, si está hablando, vocal seleccionada, apertura y si recibió análisis acústico.
- Antes de comenzar la voz, **no altera ninguna expresión**; al `SpeechSynthesisUtterance.onstart` o `HTMLMediaElement.playing` inicia la apertura de boca.
- Distribuye vocales estimadas de texto español sobre visemas disponibles, con curvas de apertura/cierre amortiguadas. La boca debe cerrar al pausar, detener, finalizar o cambiar de VRM.
- Al usar voz del navegador, no se dispone de PCM ni de fonemas. El movimiento labial es una **aproximación temporal**, ayudada por el índice de palabra que provee `SpeechSynthesisUtterance.onboundary` cuando el navegador lo ofrece.
- Con WAV/MP3 local, `MediaElementRmsMeter` mide RMS del audio realmente reproducido y utiliza la energía para controlar apertura. La vocal se estima por la progresión del texto suministrado; **NO** es alineamiento fonético ni garantiza que el archivo de audio corresponda a la misma frase de Qwen.
- Guarda valor inicial de cada expresión y lo restaura al terminar, **sin sobrescribir cambios de un controlador externo** durante la prueba.
- Si faltan TODAS las expresiones vocales, **no inventa un movimiento mandibular arbitrario**. Explica en el diagnóstico que la malla necesita blendshapes/expresiones VRM de boca. Si solo hay algunas, utiliza las compatibles con aviso.
- Función `preview('a')` para abrir la boca sin audio ~1 segundo y confirmar visualmente que las expresiones del VRM están conectadas.
- Intensidad configurable; capa de vista previa, no modifica el VRM privado ni exporta lip-sync al GLB.

### `src/lib/livingPresence/audioRmsMeter.js`

- WebAudio `AudioContext` → `MediaElementAudioSourceNode` → `AnalyserNode` → speakers.
- Calcula RMS de pequeñas ventanas PCM **solo en memoria local** (nunca transmite el audio a Qwen, cloud o GitHub). El audio sigue escuchándose por los parlantes.
- Reutiliza una fuente por reproductor, se desconecta y cierra al desmontar el panel.
- En navegadores sin WebAudio compatible se mantiene una aproximación temporal, sin afirmar que es medición real.

### `voiceMotorBridge.js`, `viewer.js`, `VoiceMotorLab.jsx`

- La boca se inicia con la **señal audible**, independientemente de que el controlador corporal esté bloqueado por un FBX. Si hay expresiones vocales y el audio suena, la cara puede hablar; con `Clapping`, LP-03C no invade los huesos corporales.
- `VoiceMotorBridge` inicia, pausa, reanuda y termina los visemas con el mismo token de reproducción ya empleado para el cuerpo. Protege cambio de modelo para no restaurar valores dentro de un VRM nuevo.
- En el render, `lipSync.update(dt)` se ejecuta antes de `vrm.update(dt)`, separado de `AnimationMixer`, `LivingPresence` y `MotionComposer`. No afecta rodillas, manos, ojos ni la animación Mixamo.
- El sistema de exportación suspende/retira los visemas de vista previa y restaura el estado sin capturar una boca abierta en la copia GLB/FBX.
- Panel nuevo dentro de LP-03C.1: **LP-03C.2 · Boca y labios (visemas)**:
  - Lista de expresiones disponibles y advertencias.
  - Botón **Probar apertura de boca · Vocal A (sin voz)**.
  - Control de intensidad labial.
  - Estado de sesión, apertura aproximada y señal de audio.
- La integración con Kokoro local aún es por **archivo WAV/MP3**; no se alteran endpoints ni código del asistente LUMIA R8.

## Qué NO está implementado

- No hay fonema exacto ni alineamiento de palabras por timestamps. Es simulación labial aproximada.
- No se garantiza que los VRM que carecen de morph targets vocales puedan hablar visualmente; hacen falta expresiones VRM o trabajo en Blender/UniVRM.
- No se modifica la malla, rigging o expresiones del modelo: la funcionalidad depende del contenido facial original.
- Los tests de JS y CI no prueban el aspecto real de Vita.vrm ni el movimiento final del shader VRM; esas verificaciones requieren el archivo local y observación en Chrome.
- No se ha añadido la conversación completa y permanente de LUMIA R8; esta sigue siendo una pregunta de laboratorio a Qwen 3.5.

## QA local — probar antes de ajustar Mixamo

1. Detener Vite con Ctrl+C en la consola de `http://localhost:5174`.
2. `cd "$env:USERPROFILE\Downloads\ORBI-LIVING-PRESENCE-LAB"`; ejecutar `git status --short`. Si hay modificaciones locales, revisarlas antes de actualizar. Si está limpio, `git pull --ff-only`, `npm.cmd test`, `npm.cmd run build`, `npm.cmd run dev -- --port 5174 --strictPort`.
3. Abrir `http://localhost:5174/` y recargar con Ctrl+Shift+R.
4. Cargar **Vita.vrm** local. Acercar la cámara al rostro ANTES de probar la voz.
5. En `LP-03C.2 · Boca y labios`, leer los nombres de los visemas detectados. Si no encuentra ninguno, enviar el texto exacto del diagnóstico, pues la cara no se puede animar con este mecanismo sin blendshapes compatibles.
6. Pulsar **Probar apertura de boca · Vocal A (sin voz)**. La boca debe abrirse aproximadamente un segundo y regresar a la forma original sin tocar ojos ni cejas.
7. Si funciona, activar **Autorizar movimiento y reproducción de voz** y **Demostración sin IA**, elegir **Voz del navegador** y pulsar **Reproducir y sincronizar**. La boca debe comenzar solo al sonar la frase y cerrarse al terminar. Es una aproximación, no una concordancia fonética exacta.
8. Después probar **Conectar Ollama** y preguntar a Qwen 3.5; comprobar que los visemas se mueven durante el diálogo. Es independiente de si `gesture` viene como `none`.
9. Para evaluar mejor el movimiento, seleccionar **Audio local WAV/MP3** y cargar un archivo real de Kokoro; el indicador `Análisis acústico: activo` debe aparecer y la apertura variar con el volumen. El texto escrito puede diferir del audio, así que las vocales no son fonemas exactos.
10. Si un FBX Mixamo está seleccionado, para gestos corporales conservar `Presencia natural A/B + LP-02C.1`, pero la boca se puede mover independientemente si los visemas están disponibles. Probar también clips de acción: la boca puede animarse sin invadir huesos.
11. Detener a mitad de frase; comprobar cierre inmediato de boca y recuperación de pose. Probar volver a cargar el VRM y exportar GLB: no debe haber visemas residuales.
12. Evaluar desde perfil/frente si mandíbula, labios o dientes atraviesan malla/ropa. Registrar si el avatar original trae 0 o 5 presets y si la vocal A se mueve.

## Continuidad

**LP-03C.3**: obtener tiempos y visemas de la generación real Kokoro, o analizar la señal de audio para clasificar formas vocálicas sin texto; sincronizar eventos segmentados por frase y voz, y añadir protocolos explícitos de prioridades de expresión facial. No asumir que el audio del navegador proporciona PCM.
**LP-04**: portado controlado al runtime LUMIA R8 tras QA en Vita; no modificar LUMIA-ASUS R8 ni main hasta certificación.
