# LUMIA — LP-03D.1: Expresión facial integral
**Fecha:** 8 nov 2026
**Estado:** implementado en rama experimental; pruebas automatizadas aprobadas; QA físico en Vita.vrm pendiente.
**PR:** https://github.com/ingeniusvictor/orbi-3d-motion-studio/pull/2
**Rama:** `feat/lumia-living-presence-lp01-20261107`
**Sin cambios:** main, LUMIA R8, archivos privados Vita.vrm/FBX, servicio Kokoro.

## Motivación y corrección de alcance
El usuario comprobó LP-03C.2 y pidió una evolución integral: **boca, labios, ojos, párpados y todos los movimientos faciales disponibles**. El motor de visemas de LP-03C.2 solo anima la apertura vocal. Una cara humana requiere también mirada, parpadeo, cejas, mejillas, sonrisa, entrecerramiento y pequeños ajustes expresivos.

El formato VRM expone expresiones de tipo blendshape y control VRMLookAt, pero no garantiza morphs anatómicos separados para cejas o mejillas: los presets genéricos `happy`, `angry`, `surprised`, `relaxed` podrían modificar varias regiones simultáneamente. **No confundir un preset emocional con un control anatómico completo.** Esta implementación audita el rig real, no inventa shapes.

## Arquitectura implementada
### 1) `src/lib/livingPresence/facialPresence.js`
- Nuevo `FacialPresence` con auditoría por `VRMExpressionManager.getValue(name)`. Solo usa presets presentes.
- Canales y prioridades:
  - **Cejas:** `browInnerUp` / `browUp` / proxy `surprised`, `browDown` / proxy `angry`.
  - **Sonrisa y mejillas:** `mouthSmile` / `smile` / proxy `happy|joy`; `cheekRaise` / `cheekPuff` si existen.
  - **Párpados adicionales:** `squintLeft`, `eyeSquintLeft`, `squintRight`, `eyeSquintRight`, `eyeWideLeft/Right` si existen.
  - **Mandíbula:** `jawOpen` solo si existe; su amplitud responde modestamente a la apertura vocal de LP-03C.2.
  - **Tono facial:** `relaxed` / proxy `fun` si está disponible.
- No controla directamente `aa/ih/ou/ee/oh`, `blink` ni `VRMLookAt`, preservando la prioridad de los motores existentes.
- Modos `resting`, `attentive`, `thinking`, `explaining`. La expresión varía por ruido suave de baja frecuencia, no por poses repetitivas de sonrisa constante.
- Al escuchar / hablar, aplica una expresividad discreta con transición amortiguada. Los presets emocionales genéricos están más limitados que morphs anatómicos independientes; hablando se restringen aún más para no interferir con visemas.
- A/B reversible con restauración de expresiones originales y respeto por modificaciones externas; sin mutar la geometría ni inventar controles.
- Por defecto el control facial está habilitado pero se ejecuta **solo si Presencia natural A/B está activada**, salvo pruebas manuales de expresión. El usuario puede apagar únicamente LP-03D.1 y conservar LP-02C.2.

### 2) `src/lib/livingPresence/LivingPresence.js`
- Separación fundamental entre **control facial** y **control corporal**. Con FBX no autorizado para composición, el cuerpo sigue bajo propiedad exclusiva de AnimationMixer, mientras el `AttentionDirector` y `NaturalBlink` pueden continuar dirigiendo los ojos y párpados sin tocar huesos del cuerpo.
- Se cancelan gestos corporales pendientes al entrar en modo FBX exclusivo.
- Nuevos controles directos de QA `previewBlink()`, `previewGaze('left'|'right'|'up'|'down')`. Las miradas se aplican mediante VRMLookAt y conservan su política de no sobrescribir objetivos externos.

### 3) `viewer.js` y `voiceMotorBridge.js`
- Orden de render: restaurar overlays → mixer FBX → presencia corporal/facial disponible → animación de visemas LP-03C.2 → microexpresiones LP-03D.1 → `vrm.update(dt)` → render.
- Las expresiones faciales son independientes de las piernas y raíces del FBX.
- Al comenzar realmente audio, `VoiceMotorBridge` activa un estado expresivo correspondiente a `motorMode` incluso cuando el FBX no autoriza gestos corporales. Al pausar/terminar/cancelar, la cara regresa al reposo previo.
- La exclusión de exportación ahora restaura también expresiones de LP-03D.1 antes de generar GLB/FBX.

### 4) `VoiceMotorLab.jsx`
- Nuevo panel **LP-03D.1 · Expresión facial integral**:
  - Interruptor A/B independiente y control de intensidad.
  - Selector manual de modo facial: Reposo/Escuchando/Pensando/Explicando.
  - Auditoría: `VRMLookAt`, parpadeo, cejas, mejillas, sonrisa, entrecerramiento, mandíbula.
  - Advertencia de expresiones emocionales indirectas vs morphs localizados.
  - Pruebas individuales: cejas, sonrisa, mejillas, entrecerramiento de ojos, mandíbula, parpadeo y mirada izquierda/derecha.
  - Los botones se deshabilitan cuando el VRM carece del canal requerido.
- Panel de **Boca y labios LP-03C.2** permanece para pruebas de Vocal A e intensidad de visemas.

## QA automatizada
`tests/livingPresenceFacialPresence.test.js` incorpora **11 pruebas** de auditoría real de shapes, fallback genérico sin inventar control independiente, A/B, previsualizaciones, coordinación de cejas y mandíbula durante voz, conservación de expresiones vocales, delimitación de presets emocionales, restauración externa, mirada+blink sobre clips no elegibles, modos y ciclo del puente de voz, y exportación limpia.

Se actualizaron tres comprobaciones antiguas que suponían que un FBX debía bloquear incluso los ojos. Desde LP-03D.1 la especificación correcta es: **FBX controla el cuerpo, sistema facial puede actuar de manera independiente**. Se conserva la prueba de cuerpo sin modificaciones y se cancela el motor de gestos sobre clips de acción.

Resultado esperado de CI: 180/180 tests y compilación OK.

## Prueba real con Vita.vrm — prioridad ALTA

1. Detener Vite del laboratorio en puerto 5174 con Ctrl+C.
2. En PowerShell: `cd "$env:USERPROFILE\Downloads\ORBI-LIVING-PRESENCE-LAB"`; revisar `git status --short` antes de cualquier pull. Con árbol limpio: `git pull --ff-only`, `npm.cmd test`, `npm.cmd run build`, `npm.cmd run dev -- --port 5174 --strictPort`.
3. Abrir `http://localhost:5174/` y refrescar Ctrl+Shift+R. Cargar **Vita.vrm** local, sin subirlo al repo.
4. Activar **Presencia natural A/B** y acercar la cámara a la cara (zoom). En **LP-03D.1 Expresión facial integral**, habilitar microexpresiones, ajustar intensidad 45–50 %, seleccionar `Escuchando` o `Explicando`.
5. Leer auditoría de controles. Probar por separado **cejas**, **sonrisa**, **mejillas**, **entrecerrar**, **mandíbula**, **parpadeo**, **mirada izquierda/derecha**. Esperar 1–2 segundos por gesto. Si un botón está deshabilitado y muestra `sin morph localizado`, esa función **no está disponible en el rig actual**.
6. Probar LP-03C.2 **Vocal A**. Si aparece `No hay visemas`, se necesita preparar visemas en Vita con una herramienta de modelado; una casilla no creará geometry/blendshapes.
7. Activar **Autorizar movimiento y reproducción de voz**, **Demostración sin IA** y **Reproducir y sincronizar**. Observar conjuntamente ojos, párpados, cejas, labios y mandíbula (si hay jawOpen). Verificar cierre de boca y relajación de cejas al terminar.
8. Repetir con un Idle Mixamo y LP-02C.1. Comprobar que las expresiones no deformen el rostro y el cuerpo mantenga su reposo natural. Luego seleccionar un FBX de acción: la cara puede parpadear y mirar sin alterar los huesos del clip.
9. Si el preset `happy` o `surprised` produce una boca extraña o interfiere con las vocales, apagar LP-03D.1 y reportar el nombre de expresión y una captura frontal/perfil. Es preferible reducir el proxy o excluirlo antes que alterar las formas vocales aprobadas.
10. Grabar y comparar frente/perfil 30 segundos: reposo, escuchando, hablando, pausado. Medir FPS con/ sin expresiones y comprobar que no hay saltos por actualizaciones simultáneas.
11. No fusionar PR ni copiar a LUMIA R8 hasta QA de la anatomía real y fluidez.

## Limitaciones y evolución LP-03D.2
- Las expresiones de facciones independientes solo son posibles si Vita las incorpora. VRM presets emocionales son proxies de regiones, no un rig facial universal.
- Movimientos faciales realistas completos (boca, labios, mejillas, cejas, ojos, párpados) requieren calibrar el modelo en Blender/UniVRM o un rig compatible si faltan morph targets.
- `speechSynthesis` sigue usando timing vocálico aproximado y Kokoro WAV/MP3 amplitud real, no alineamiento fonético exacto. La siguiente fase sería timestamps/visemas de Kokoro y arbitraje facial por prioridad temporal.
- Las pruebas de código no certifican la calidad visual del modelo privado.
