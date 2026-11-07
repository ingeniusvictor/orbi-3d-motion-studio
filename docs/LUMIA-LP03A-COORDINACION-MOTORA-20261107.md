# LUMIA Living Presence — LP-03A Cerebelo Motor Experimental
**Fecha:** 2026-11-07
**Estado:** implementación en rama de investigación, pendiente de QA visual con Vita.vrm y FBX privado.
**Repositorio:** https://github.com/ingeniusvictor/orbi-3d-motion-studio
**Rama:** `feat/lumia-living-presence-lp01-20261107`
**PR en borrador:** https://github.com/ingeniusvictor/orbi-3d-motion-studio/pull/2

## Motivación

Después del LP-02C.2, el usuario aprobó visualmente la combinación del nuevo Idle Mixamo con el suavizado del balanceo. El siguiente objetivo no es hacer movimientos mayores, sino vincular discretamente las acciones ya existentes para que el avatar parezca un cuerpo organizado y no un conjunto de articulaciones aleatorias.

## Implementado

### LP-03A MotorCoordinator — `src/lib/livingPresence/motorCoordinator.js`

- Controlador **sin renderizador** y sin llamadas a LLM, que trabaja con señales existentes y usa dinámica amortiguada de segundo orden para responder con retardos suaves.
- Señales de entrada: balanceo lateral y torsión de torso, orientación horizontal de cabeza ligada a fijaciones oculares, y eventos de muñecas izquierda/derecha.
- Efectos causales de amplitud pequeña y acotada:
  - El seguimiento de la mirada se transmite de forma progresiva a pecho y pecho superior, con una discreta contracorrección de cuello.
  - El balanceo existente induce compensaciones suaves de hombros, sin introducir un nuevo oscilador.
  - Los movimientos de muñeca tienen una respuesta retrasada en hombro/brazo y pequeñas semiflexiones del codo sobre el eje anatómico ya calibrado.
  - No mueve `hips`, `root`, rodillas ni pies, ni cambia las pistas FBX.
- Peso ajustable en vivo, predeterminado 42%; **habilitación desactivada por defecto**, de forma que LP-02C.2 permanezca visualmente idéntico hasta que el usuario active este módulo.
- Estados de **previsualización manual**:
  - `resting` (reposo)
  - `attentive` (escuchando)
  - `thinking` (pensando)
  - `explaining` (explicando)
- Los estados cambian el nivel relativo de respuesta de torso, brazos y atención. Las transiciones también están amortiguadas, sin saltar directamente entre poses.
- **Todavía no están ligados a la voz ni a Qwen**. Son ajustes de comportamiento motor para inspección, NO una prueba de integración cognitiva.

### Integración en `LivingPresence.js`

- El cerebelo recibe señales después de que el sistema de reposo haya calculado balanceo, atención y eventos de manos.
- El resultado se aplica como **delta de cuaternión separado** del sistema anterior, después de la pose principal. No modifica ni contamina los estados de amortiguación de los microgestos originales.
- El sistema de flexión de codos usa el eje calibrado del reposo natural y el parámetro de coordinación, con límites de amplitud.
- Con FBX de reposo seleccionado, LP-03A solo aparece cuando la composición LP-02C.1 ha sido activada. Todos los movimientos de cerebro atraviesan los pesos y máscaras preexistentes, protegiendo articulaciones FBX.
- Clips de acción y caminatas no reciben ningún nuevo overlay; no hay ownership de root/hips/pies.
- Al desactivar LP-03A se retira su delta sin modificar la pose fuente ni obligar a reiniciar el avatar.

### Integración en el visualizador e interfaz

- `src/lib/viewer.js`: funciones `setLivingMotorCoordination`, `setLivingMotorIntensity`, `setLivingMotorMode`, `getLivingMotorStatus`.
- `src/LivingPresenceLab.jsx`: panel **LP-03A Cerebelo motor experimental**, interruptor A/B, intensidad 0–100% y selector de cuatro estados. La sección aparece encima de los controles de suavizado LP-02C.2. Se reinicia al cargar otro modelo. No reemplaza los demás ajustes de Living Presence.

### Pruebas

`tests/livingPresenceMotorCoordination.test.js` incluye pruebas de:
- Estado desactivado por defecto, magnitudes pequeñas, señales finitas y ausencia de ownership de huesos inferiores.
- Validación de nombres de estados y transición amortiguada.
- Comparación exacta contra LP-02C.2 con idéntica semilla; LP-03A debe producir diferencias medibles pero suaves, y el modo OFF recuperar la base existente.
- Exclusividad del motor `AnimationMixer` sobre `Clapping` u otros clips de acción.
- Alternancias A/B sin deriva acumulada de rotaciones.
- Integración con `Standing Idle` de Mixamo y composición opt-in, conservando posición de caderas y pies.

## QA visual en Vita.vrm

1. Detener Vite con `Ctrl+C` en consola del puerto 5174.
2. `cd "$env:USERPROFILE\Downloads\ORBI-LIVING-PRESENCE-LAB"`
3. `git status --short` y, si está limpio, `git pull --ff-only`.
4. `npm.cmd test`, `npm.cmd run build` y `npm.cmd run dev -- --port 5174 --strictPort`.
5. Abrir `http://localhost:5174/`, recargar con Ctrl+Shift+R y cargar Vita.vrm privado localmente.
6. Recuperar la configuración LP-02C.2 que ya resultó agradable. Sin clip, activar presencia normal y observar 45 segundos; después activar LP-03A al **35–45%** y comparar el movimiento de cabeza, pecho, hombros y brazos.
7. Seleccionar el mismo FBX de reposo Mixamo. Activar compositor Mixamo + Presencia Viva al ~55%, con suavizado lateral al 60%. Activar LP-03A y alternar su A/B sin modificar el FBX.
8. Elegir los estados manuales `Reposo`, `Escuchando`, `Pensando`, `Explicando`; observar diferencias sutiles en las respuestas del cuerpo, **no** esperar cambios de emoción facial ni gestos semánticos completos.
9. Volver a OFF y comprobar que el reposo LP-02C.2 aparece exactamente como antes, sin saltos, deriva, clipping de brazos ni pies deslizantes.
10. Cargar un FBX no Idle (caminar, aplaudir): LP-03A no debe intervenir. Revisar exportación GLB/FBX para confirmar que nunca capture la pose procedural.

## Límites y siguientes decisiones

- La coordinación actual es una aproximación de bajo coste, no un modelo biomecánico completo con torque, masa, dinámica humana real o centro de gravedad.
- No hay detección de colisiones entre ropa, brazos y torso, ni medición de FPS real con la laptop del usuario.
- Aún se necesita QA visual y temporal con Vita y el FBX privado. No fusionar el PR ni transferir a LUMIA-ASUS R8 sin aprobar estas pruebas.
- LP-03B recomendado: controlador jerárquico de gestos con `anticipation → action → follow-through → recovery` y ownership temporal de articulaciones.
- LP-03C recomendado: contrato de motor-intent para Qwen local y coordinación con la voz efectivamente reproducida, sin consultar a la IA por fotograma.

**Regla de seguridad:** mantener `main` protegida, cambios solo en rama experimental; preservar archivos privados VRM/FBX y exportaciones.


## LP-03A.1 — Dependencia de la mirada frente a Mixamo y mejora de interfaz

**Observación del usuario:** al activar LP-03A con un FBX Idle seleccionado, no aparecían movimientos oculares hasta habilitar también la superposición LP-02C.1.

**Diagnóstico comprobado en código:** `LivingPresence.update()` sale mediante `resetOverlay(); return;` siempre que existe un FBX seleccionado y `composition?.active` es falso. Por tanto, el controlador de fijaciones LP-02D (ojo/parpadeo), la cabeza y el cerebelo LP-03A quedan suspendidos. LP-03A no crea movimientos de ojos por separado: coordina señales motoras generadas por Living Presence. La exclusividad de Mixamo es deliberada, no una pérdida del rig.

**Corrección de UX sin romper las prioridades:**
- Nuevo `src/lib/livingPresence/activationGate.js`: explica explícitamente si la presencia está disponible (sin FBX, o con FBX Idle y compositor opt-in activo), pendiente de autorización del compositor, inhibida para clips incompatibles, sin VRM, sin presencia general o con mezcla a 0%.
- El panel LP-03A de `src/LivingPresenceLab.jsx` muestra un estado contextual al haber un FBX seleccionado. Si se trata de un Idle elegible con LP-02C.1 apagado, ofrece el botón **Activar LP-02C.1 para este Idle**. Solo un clic consciente del usuario puede hacerlo; el componente no activa el compositor mediante efectos, cargas ni cambios automáticos.
- Al elegir una animación incompatible o mantener intensidad 0%, el botón no ofrece una ruta que el motor no admite; explica por qué no aparecen ojos ni coordinación.
- `tests/livingPresenceActivationGate.test.js`: seis pruebas de esta dependencia y de los bloqueos por acción o mezcla 0%.
- El comportamiento motor subyacente no se alteró; las animaciones FBX de acción mantienen control exclusivo, y los archivos originales y exportaciones no cambian.

**Orden correcto de prueba con Idle Mixamo:** cargar Vita.vrm → seleccionar el FBX Idle → activar Presencia natural A/B → activar LP-02C.1 explícitamente (botón del panel LP-03A o casilla tradicional) → activar coordinación LP-03A si se desean respuestas motoras enlazadas. La mirada natural viene de LP-02D y se verá al estar habilitada la presencia sobre el clip, incluso si LP-03A está apagado.

**Límite:** se trata de una mejora de claridad y acceso; separar mirada/parpadeo como capa independiente de prioridad facial durante clips de acción sería una evolución distinta y requeriría su propio protocolo de arbitraje con expresiones y eyes del FBX.
