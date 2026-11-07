# LUMIA Living Presence — LP-02D: mirada, cabeza, codos, piernas y pies

**Estado:** implementación experimental certificada por CI; **QA visual de Vita.vrm pendiente**.

## Por qué

El propietario confirmó visualmente que el perfil LP-02B.2 dejó la mano de Vita.vrm con una forma mucho más relajada. El siguiente objetivo es que un personaje en reposo cambie suavemente de fijación ocular, acompañe con la cabeza, flexione ocasionalmente los codos y reajuste mínimamente el apoyo de las piernas. Debe haber pausas y variación natural; nunca vibración constante.

## Implementado

### 1. Director de atención — attentionDirector.js

- Selecciona objetivos de mirada seudoaleatorios **reproducibles**, con sostén de fijación de 1,5 a 6,3 segundos y pequeños saltos sacádicos con transiciones de 0,11 a 0,29 s.
- Ángulo horizontal del objetivo acotado a ±12° y vertical a ±6°. Regresa ocasionalmente al centro/cámara.
- No se mueve constantemente: alterna sacada/fijación/pausa. El reposo no es un único clip periódico.
- Si la ventana vuelve después de suspensión, no se disparan cientos de fijaciones atrasadas.

### 2. Coordinación cuello-cabeza-ojos — LivingPresence.js

- La cabeza sigue parcialmente la orientación escogida con dinámica de segundo orden y frecuencia inferior al movimiento ocular.
- Distribuye microcorrecciones entre cabeza y cuello; evita grandes giros durante reposo.
- El runtime de mirada VRM recibe un objetivo de fijación temporal y restaura el target previo cuando se desactiva.
- Si un sistema externo ya posee el objetivo `VRMLookAt.target`, el laboratorio no lo sobreescribe.

### 3. Semiflexiones de codos

- El motor reutiliza el eje anatómico calibrado de `neutralPose.js` para añadir flexiones breves y suaves por encima de la postura reposada.
- Cada codo tiene un evento distinto; la flexión adicional no se realiza mediante X arbitrario del hueso.
- Los offsets nunca se escriben al archivo VRM original y vuelven al estado previo al desactivar A/B.

### 4. Microajustes de piernas, rodillas y pies — plantedLegs.js

- Sistema **experimental** de dos segmentos por pierna: cadera→rodilla→tobillo.
- Calcula longitudes reales, anclas iniciales del tobillo y un plano de flexión preferente usando la postura del rig o el frente local del avatar.
- Introduce un descenso de pelvis muy pequeño que posibilita una suave flexión de rodilla y resuelve analíticamente la posición de la rodilla aplicando correcciones de cuaterniones.
- El tobillo de cada pie debe permanecer en su posición mundial de referencia. De manera ocasional, se permite elevar un solo pie una cantidad mínima y volver al apoyo, mientras el otro permanece anclado.
- Si faltan huesos, existe una configuración degenerada o el IK excede el error permitido, **se cancela el ajuste** en lugar de forzar articulaciones.
- Esto NO es locomoción, balance físico, simulación real de centro de masas ni detector general de contacto con suelo. La posición de ancla es la del VRM cargado.
- La dirección de flexión de rodilla requiere validación frontal y lateral con **Vita.vrm**; el polo virtual +Z puede no coincidir con rigs no estándar.
- No garantiza ausencia de colisiones entre ropa, pantorrillas y zapatos; debe revisarse visualmente.

### 5. Opciones y límites

`src/LivingPresenceLab.jsx` incorpora casillas:
- Giros suaves de cabeza
- Miradas a objetivos variables
- Semiflexiones de codos
- Rodillas y pies (IK experimental)
- Intensidad de piernas y pies en porcentaje

Las funciones existentes de manos, dedos, parpadeo, auditoría de huesos, exportaciones y FBX permanecen.

El motor procedural se **inhibe íntegramente** si hay un clip FBX seleccionado, incluso si está pausado; la composición FBX + procedural queda para LP-02C.

## Archivos modificados

- Nuevo `src/lib/livingPresence/attentionDirector.js`
- Nuevo `src/lib/livingPresence/plantedLegs.js`
- Modificados `organicIdle.js`, `LivingPresence.js`, `src/lib/viewer.js`, `src/LivingPresenceLab.jsx`
- Nuevas pruebas `tests/livingPresenceAttentionAndFeet.test.js`

## QA automatizada

GitHub Actions con Node tests: **114 pruebas superadas, 0 fallos, build Vite OK** en commit `943a7b8f6b612c6c39a26d22a200aeaa1ecd8fa1` (antes de agregar este documento).

Probado sobre rigs THREE.Bone sintéticos: director atención acotado y asimétrico; pelvis y tobillos anclados; flexiones de rodillas y elevación de un solo pie; restauración A/B; inhibición con FBX y detección de cadenas incompletas. No equivale a QA visual en Vita.

## Prueba física

1. Detener Vite con Ctrl+C en el PowerShell que sirve :5174.
2. En `$env:USERPROFILE\Downloads\ORBI-LIVING-PRESENCE-LAB` ejecutar `git status --short`; si está limpio `git pull --ff-only`, `npm.cmd test`, `npm.cmd run build` y `npm.cmd run dev -- --port 5174 --strictPort`.
3. Abrir `http://localhost:5174/`, actualizar la pestaña y cargar `Vita.vrm`.
4. Activar A/B y los controles **Giros suaves de cabeza** y **Miradas a objetivos variables**. Acercar al rostro: observar 1 a 2 minutos con cambios de fijación, pausa y acompañamiento más lento de cabeza. No aceptar giro brusco, ojos cruzados o mirada errática.
5. Activar **Semiflexiones de codos**, revisar de perfil que no atraviesen el vestido.
6. En pantalla de cuerpo entero activar **Rodillas y pies (IK experimental)** con intensidad 20–35 % inicialmente. Revisar de frente y lateral 1–2 minutos. Un pie puede alzarse milímetros de vez en cuando, pero el otro **debe permanecer apoyado**. Si alguna rodilla se dobla hacia atrás, el avatar flota o hay clipping de zapatos, desactivar inmediatamente la casilla y reportar captura (frontal y perfil).
7. Desactivar A/B y corroborar retorno exacto a pose original, sin desplazamientos acumulativos de pelvis/tobillo.
8. Probar la carga de FBX: el motor LP debe ceder prioridad al clip incluso en pausa.
9. Tomar notas de FPS/fluidez en la laptop real; la certificación automática no mide GPU.

## Evolución propuesta después del QA

- Mejorar patrón de apoyo con IK y contacto de malla de los zapatos contra suelo, y calibración del polo de rodilla usando información de avatar/medidas reales.
- Introducir objetivos de atención vinculados a objetos de la escena con restricciones y estados semánticos.
- LP-02C: mezclar clip Mixamo de reposo con capas de movimiento orgánico por hueso, de manera reversible.
- LP-03: coordinador motor de intención y eventual puente con Qwen local; no hace falta inferencia por fotograma.

**Regla:** mantener branch experimental/PR borrador; no modificar main ni LUMIA R8 hasta QA visual y de rendimiento.
