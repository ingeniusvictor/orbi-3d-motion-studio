# LP-04A integrada · Intención Qwen + voz real + un único motor corporal

## Base y comparación entre ramas

**Base de integración:** `feat/lp-04-v09-natural-presence`, commit
`004fe96d950544242f1c9b137b8815bca36bc2eb`, **PR #23**.

**Origen consultado directamente:** `feat/lp-04-qwen-glb-presence-20261115`,
commit `5db85c26dbeb7ce1a6e7deaa27a2b48a3c625c71`, **PR #22**.

La comparación GitHub confirmó una historia divergente: nuestra rama LP-04
contenía 109 commits que no estaban en LP-04A, y LP-04A tenía diez commits
propios. Se conservaron VIEWER-04 (GLB/FBX con 0 clips), FACIAL-08,
STUDIO-09, MOTION-06/07, ToeLock V4, VRM original y LP-04.

Archivos compartidos examinados: `src/lib/viewer.js`,
`src/VoiceMotorLab.jsx`, `src/lib/livingPresence/voiceMotorBridge.js`.
Archivos exclusivos LP-04A auditados:
`glbAutonomyDirector.js`, sus pruebas y la documentación.

**Decisión antirregresión:** no copiar `glbAutonomyDirector.js` como segundo
motor de cuaterniones. Se transfieren sus capacidades contrastadas al
`LumiaV09BodyPresence` más reciente, que ya conoce el cuello adulto real
`J_Bip_C_Neck` y suspende movimiento con **cualquier clip seleccionado,
incluso si está en pausa**. El motor anterior de PR #22 permanece completo
y consultable en su propia rama, sin alterarla.

## Verificación de dos GLB maestros REALES

Se inspeccionaron localmente los archivos completos del usuario sin subirlos
a GitHub:

- `LUMIA_CUERPO_BASE.glb` — SHA-256
  `1d7424fe1b6b95af7b249e3f8bfdcb0425b6763a5578650157449c20806a89cb`.
- `LUMIA_CLAUDE_MAESTRA_346.glb` — SHA-256
  `4d50eefc4027f731a7ab728cb147a5612dda41785a7c0993021b7e4627e8434d`.

Ambos contienen **un skin de 346 joints** con los roles necesarios. Se
verificaron nombres únicos y descendencia real de columna, cabeza,
UpperArm/Hand y diez raíces de dedos. Sus matrices inverse-bind dan:
**pelvis Y ≈0,94325 m y cabeza Y ≈1,4177 m en ambos modelos**.
El puente D162 queda excluido por el requisito de 346 joints. Modelos con
otra pose de reposo o jerarquía se rechazan.

El adaptador GLB se activa solo tras consentimiento del usuario; cargar
un modelo nunca activa por sí mismo Qwen ni los gestos.

## Arquitectura final

```text
Qwen 3.5 en Ollama local
       |
ollamaMotorIntent.js (JSON strict / enums)
       |
VoiceMotorBridge.prepare() [NO mueve huesos]
       |
speechSynthesis.onstart / HTMLAudioElement.playing
       |
VoiceMotorBridge.start() [token + modelo verificado]
       |
MotionViewer.getLivingSpeechMotorAvailability()
       |
LumiaV09BodyPresence (único motor GLB 346)
   + MotorCoordinator  [gestos de contexto pequeños]
   + GestureDirector   [acknowledge, curious, emphasize]
       |
frame: retirar overlay previo → AnimationMixer → LP-04 idle/contexto
       |
Three.js WebGL render
```

Los **únicos** campos de Qwen son
`schema/dialogue/motorMode/gesture/attentionTarget/intensity`.
El validador `validateMotorIntent` rechaza modos o gestos fuera del
catálogo, limita la longitud del diálogo, limita intensidad y descarta
todas las propiedades extra. Qwen no controla huesos, matrices, JavaScript,
rutas de archivos ni comandos.

El motor GLB vuelve a limitar intensidad a un máximo de **0,65** y
cada delta añadido por gestos queda acotado a **4 grados por eje**.
No controla pelvis, raíz, piernas, pies ni contacto de manos. La mirada
no se convierte en movimiento ocular automático: los ejes oculares siguen
sin calibración artística.

## Contrato de estado y audio

- `prepare`: validar intención, almacenar token y **referencia del modelo**,
  no activar gesto.
- `start`: solo evento real `speechSynthesis.onstart` o
  `HTMLAudioElement.playing`. Rechazar si el visor/modelo cambió mientras
  se preparaba la reproducción.
- `pause`: suspender el motor de voz contextual GLB y cancelar el gesto;
  mantener la autorización del reposo natural que pertenece al usuario.
- `resume`: reanudar modo/volumen motor sin repetir el gesto puntual.
- `ended/error/abort/cancel`: limpiar sesión, labios y rostro del modelo
  **original**, restaurar habilitación, modo e intensidad previos;
  impedir que eventos tardíos de audio controlen un nuevo GLB.
- `model-or-clip-changed`: `VoiceMotorLab` invalida token y detiene
  audio. Además, el puente comprueba identidad de modelo y visores.
- **Clip Mixamo seleccionado**: motor corporal bloqueado incluso pausado.
  La reproducción de voz puede continuar con labios/rostro si son
  compatibles, sin disputar rotaciones de Mixamo.
- `withPresenceSuspended` elimina todas las superposiciones antes de
  exportar; no modifica la maestra GLB, morph targets, pesos, bind pose,
  jerarquía ni clips.

## UI en STUDIO-09

El panel desplegable **Voz** añade **LP-04A · Autorizar gestos de Qwen con
LUMIA GLB**. Su interruptor comparte el mismo
`setLumiaV09BodyEnabled` del panel **LP cuerpo → LP-04**. No hay
dos implementaciones ni dos autorizaciones independientes.
La opción existente `Autorizar movimiento y reproducción de voz` sigue
controlando por separado la ejecución de audio.

`LumiaV09BodyLab` lee el consentimiento directamente del estado del
visor para reflejar cambios hechos desde **Voz**.

El campo Qwen sigue utilizando el catálogo de modelos instalados obtenido
del Ollama local; no obliga a instalar un modelo nuevo. La conexión
permanece restringida a `127.0.0.1` o `localhost`. No hay conexión
directa al proceso externo de LUMIA R8 ni al servidor Kokoro todavía:
se usa voz del navegador o WAV/MP3 local bajo control del usuario.

## QA automatizada

`tests/lp04aQwenConsolidation.test.js` valida:
- motor compartido y ausencia de controlador GLB duplicado;
- preparación de Qwen sin movimiento de voz antes del audio;
- voz real → gesto allowlisted → retorno al reposo;
- pausa/reanudación, error y cancelación sin gestos duplicados;
- reemplazo de personaje antes de comenzar voz y durante reproducción;
- clips seleccionados **incluso pausados** bloquean el motor corporal;
- cero rotación de raíz, pelvis y pies; geometría y skin no tocados;
- rechazo de comandos/cadenas arbitrarias y límite de intensidad;
- intensidad temporal restaurada al terminar voz;
- exportación sin rotaciones residuales;
- SSR del panel real de voz y consentimiento compartido.

Se mantienen todas las pruebas anteriores de VIEWER-04, VRM, MOTION-06/07,
FACIAL-08, STUDIO-09 y LP-04. El resultado final de GitHub Actions se
registra en el PR de integración.

## QA manual de aceptación

1. Parar el servidor anterior en 5201 con `Ctrl+C`.
2. Crear worktree aparte en
   `%USERPROFILE%\Downloads\ORBI-LP-04A-QA` desde esta rama;
   ejecutar en **el mismo puerto 5201**, sin tocar los demás laboratorios.
3. Cargar **LUMIA_CUERPO_BASE.glb**, comprobar 346 huesos, cuerpo y
   rostro completo, sin pantalla negra. Repetir con
   **LUMIA_CLAUDE_MAESTRA_346.glb**.
4. **LP cuerpo → LP-04**: activar presencia natural. Verificar
   respiración/cabeza de baja amplitud y el A/B reversible.
5. **Voz → LP-04A**: comprobar que aparece autorizada la misma opción;
   elegir un Qwen 3.5 instalado de Ollama y pulsar «Conectar».
6. Consultar a Qwen; inspeccionar JSON validado. **No debe ocurrir
   un gesto de habla solo por recibir el texto**.
7. Autorizar audio; reproducir por voz del navegador, luego WAV/MP3
   local de LUMIA/Kokoro. Confirmar gesto justo al comienzo audible.
8. Pausar y reanudar; verificar que el gesto no se dispara dos veces.
9. Detener audio o provocar error/abort; confirmar restauración de
   postura, gesto y modo. Cambiar de personaje antes de que empiece
   audio y comprobar que el viejo token no mueve el nuevo.
10. Seleccionar un clip Mixamo, pausarlo y confirmar que Qwen no
    toma huesos; probar rostros y voz si existen canales válidos.
11. Exportar/reimportar GLB para comprobar 346 huesos, morphs,
    clips y poses originales sin superposición LP-04A horneada.
12. Verificar VRM original y controles FACIAL-08/STUDIO-09 sin regresión.

**NO afirmar validación en Windows hasta que el usuario termine esta QA.**
El PR queda en borrador; `main` y las ramas originales conservan su
contenido previo.
