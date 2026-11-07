# LUMIA Living Presence · LP-02C.2 — Balanceo corporal sutil

**Fecha:** 2026-11-07
**Estado:** implementación experimental, pruebas de código aprobadas; QA visual con Vita.vrm y FBX real pendiente.
**Rama:** `feat/lumia-living-presence-lp01-20261107`
**PR en borrador:** https://github.com/ingeniusvictor/orbi-3d-motion-studio/pull/2

## Observación de campo

Tras introducir LP-02C.1, el usuario cargó un FBX de reposo más creíble que el clip utilizado en LUMIA R8. La superposición Living Presence aportó naturalidad, pero el clip de origen inclina el cuerpo exageradamente a ambos lados, de forma mecánica.

Requisito deducido del feedback: incorporar un **balanceo lateral lentísimo, pequeño e irregular** al motor autónomo (también cuando no haya FBX), y permitir amortiguar de manera conservadora los giros laterales del torso presentes en el reposo Mixamo. Mantener los pies en su sitio.

## Cambios implementados

### 1. `src/lib/livingPresence/slowBodySway.js`

- Introduce `SlowBodySway`, con dos ruidos de valor continuos de baja frecuencia, semillas por sesión y dinámica críticamente amortiguada.
- Modulación por **amplitud** y **velocidad** de manera independiente; no es otro bucle sinusoidal regular.
- Límite de inclinación total sumada **≤1,65°** al 100 % de amplitud; valor predeterminado 35 % ⇒ máximo aproximado 0,58°.
- Predeterminado de velocidad 65 %, equivalente a cambios de postura en escalas temporales de decenas de segundos.
- Aplicación sobre `spine`, `chest`, `upperChest`; compensaciones pequeñas de cuello/cabeza. Nunca traslada caderas, raíz ni los zapatos mediante esta capa.
- Protegido por opción `sway`; conmutación A/B reversible y sujeto al peso de la composición cuando un FBX está seleccionado.

### 2. `src/lib/livingPresence/clipSwayReducer.js`

- Reducción **solamente para vista previa** del giro lateral incluido en pistas QuaternionKeyframeTrack de `spine`, `chest` y `upperChest`.
- Media de cuaterniones con corrección del doble hemisferio; separación aproximada entre `swing` y `twist` local alrededor de Z.
- **Atenúa únicamente el twist lateral** y conserva otras componentes de la animación; controles de fuerza 0–100 % y habilitación.
- Límite máximo de corrección por hueso: 3° en columna, 2° en pecho, 1,5° en pecho alto; evita cambios extremos.
- Interpolación amortiguada del control de suavizado para impedir cambios abruptos durante el clip.
- Restauración de cuaterniones exactos en `beforeFrame`, incluso cuando el mixer está pausado. No altera datos de AnimationClip.
- No modifica `hips`, ningún hueso de pierna, root motion o posición de pie. Si la inclinación de un FBX proviene principalmente de caderas/root, esta mejora **no puede atenuarla por completo**. Es deliberadamente conservadora.
- Admite exclusivamente la autorización del compositor existente: clip de reposo, importado mediante adaptador FBX/VRM, y presencia activada.

### 3. `MotionComposer.js`, `LivingPresence.js`, `viewer.js`

- El compositor añade capacidad opcional de suavizar torso y registra las articulaciones realmente atenuables.
- Nuevo orden: revertir LivingPresence → revertir suavizado anterior → actualizar mixer → suavizar solo pista de torso → aplicar microgestos → actualizar VRM → render.
- Al activar/desactivar presencia o compositor, cambiar de clip o exportar, ambas capas restauran sus deltas temporales.
- La exportación suspende el motor, restaura poses y sincroniza el avatar antes de clonar los huesos. No exporta el efecto procedural ni la reducción de inclinación.
- Corrección de seguridad adicional: el mixer queda congelado durante exportaciones asíncronas para evitar cambios de pose dentro de una copia/exportación (la reproducción continúa al terminar).

### 4. `src/LivingPresenceLab.jsx`

- **LP-02C.2 · Balanceo corporal vivo**: interruptor A/B, amplitud 0–100 %, velocidad 15–150 %.
- **LP-02C.1 · Mixamo + Presencia viva**: control independiente para activar/desactivar amortiguación de inclinación del FBX y regulador 0–100 %.
- Valores iniciales para inspección: amplitud 35 %, velocidad 65 %, atenuación del FBX 60 %.
- Para ralentizar el **clip original completo** se utiliza el selector existente de velocidad en Biblioteca de animaciones, por ejemplo 0,5×; el regulador de velocidad de LP-02C.2 sólo modifica el balanceo procedural.

## QA automatizada

`tests/livingPresenceSway.test.js` comprueba:
- Ondas de reposo no sincronizadas, reproducibilidad por semilla, amplitud limitada y suavidad sin saltos.
- Cambio de velocidad y decaimiento cuando la intensidad se lleva a cero.
- Cuaterniones con signos opuestos y media de un track.
- Reducción de giro lateral con límites, sin distorsionar otras orientaciones.
- Integración con `THREE.AnimationMixer`: pelvis, cadera, piernas y calzado inalterados; sin acumulación en pausa; restauración exacta de clip.
- Inhibición para clips caminando y clips originales no autorizados.
- Independencia del movimiento de raíz/pie de la capa `SlowBodySway`.

**Resultado:** 130/130 pruebas y Vite build OK en CI de la rama experimental en el cambio `7f32fe93d9d6a8837ae4345ca1ff26abbb0c394f`.

## Prueba visual en Vita.vrm

1. En el PowerShell de localhost:5174, detener con Ctrl+C; ejecutar `git status --short` y, si limpio, `git pull --ff-only`, `npm.cmd test`, `npm.cmd run build` y `npm.cmd run dev -- --port 5174 --strictPort`.
2. Cargar `Vita.vrm` sin FBX. Activar presencia natural. Probar `LP-02C.2 Balanceo corporal vivo` con amplitud 35 %, velocidad 65 %; observar de perfil y de frente 60–90 segundos. No debe parecer mareo ni una inclinación lateral marcada.
3. Cargar el FBX de reposo nuevo y reproducirlo. Activar el compositor LP-02C.1 (mix 50–60 %); activar atenuación FBX al 60 %. Comparar ON/OFF del interruptor de atenuación.
4. Si la inclinación sigue siendo muy fuerte, comprobar si el movimiento de caderas proviene del FBX. No intentar subir intensidad >100 % ni manipular los tobillos.
5. Para ver el efecto de ralentizar toda la animación de Mixamo, probar el selector existente `Velocidad 0,5×` en la Biblioteca de animaciones.
6. Pausar el FBX y alternar el compositor. La pose de origen debe recuperarse sin deformación ni saltos de cuaternión.
7. Verificar que no se deslicen zapatos, no se crucen rodillas, no exista clipping llamativo de ropa y que un clip de caminar siga bloqueado por la política del compositor.
8. Desactivar A/B y exportar GLB/FBX de prueba: debe incluir únicamente el clip fuente, nunca los offsets procedurales.
9. Reportar captura frontal y lateral; idealmente vídeo corto del reposo comparativo (antes/después) para medir visualmente amplitud y rapidez.

## Siguientes mejoras

- LP-02C.3: análisis cuantitativo del movimiento lateral del FBX descompuesto por hips/spine/chest, estimación de centro de masa visual y opciones de retiming no destructivo. Debe conservar pie plantado mediante IK/constraints validado en Vita.
- LP-03A: cerebelo motor que coordina atención visual, reajuste de hombros y movimiento de manos con desaceleración predictiva.
- Conservar el reposo actual aprobado como fallback; no trasladar esta característica a LUMIA R8 hasta QA y mediciones en laptop.

**Límites:** una captura fija no prueba la velocidad de la animación; los algoritmos aquí no reconstruyen biomecánica completa y el CI no posee el VRM/FBX privado. La garantía de naturalidad se obtiene por QA visual, no por compilar correctamente.
