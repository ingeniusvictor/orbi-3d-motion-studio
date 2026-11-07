# LUMIA Natural Motion — Living Presence
## Plan maestro · ORBI 3D Motion Studio · 7 de noviembre de 2026

**Estado:** LP-01 beta implementado en rama separada, pendiente de CI y aceptación visual con el VRM privado.
**Rama base protegida:** feat/motion-01-viewer-inspector (PR #1 en borrador).
**Nueva rama:** feat/lumia-living-presence-lp01-20261107.
**Objetivo:** evolucionar desde una sucesión de movimientos hacia una presencia digital humana, expresiva y adaptativa.
**No cambiar:** main, archivos VRM/FBX originales, funcionalidades de texturas, el asistente LUMIA-ASUS y sus sistemas de voz.

## 1. Diagnóstico arquitectónico verificado

- ORBI Motion Studio ya dispone de Three.js, GLTFLoader + VRMLoaderPlugin de @pixiv/three-vrm, vrm.update(delta), AnimationMixer, inspector de rig y adaptación experimental de FBX a huesos normalizados. Se conserva íntegramente el visualizador.
- LUMIA-ASUS (repositorio distinto) aún conserva en PH-04.8 un adaptador VRM0 de huesos crudos y coreografías escénicas reversibles para caminar. No trasladar esos atajos al Studio como solución definitiva.
- La exportación del Studio a GLB aproximado NO conserva necesariamente todas las extensiones y físicas VRM. Un VRMA requiere un trabajo separado con reimportación y certificación.
- El modelo LUMIA tiene 154 huesos según el inventario del propietario: contrastar con la auditoría local. Un humanoide normalizado expone solamente un subconjunto del rig. No confundir huesos físicos, dedos, morph targets y roles VRM.
- Las capacidades de físicas, cabello, expresiones y manos deben detectarse en el archivo real, no darse por supuestas.

## 2. Principios de diseño

1. Dos experiencias en una app: Studio original y nuevo Living Presence Lab, con encendido/apagado reversible.
2. Comparación A/B de original versus motor experimental con el mismo VRM, cámara y clip.
3. Propiedad clara de cada articulación en cada frame: remover overlay anterior, reproducir clips, aplicar control procedural autorizado, resolver restricciones, ejecutar update VRM y renderizar. Prohibir escritores concurrentes de los mismos huesos.
4. No usar solo ondas seno repetidas: dinámica amortiguada, ruido suave no periódico, anticipación, inercia, pausas, compensación y variación.
5. Retarget sobre huesos normalizados para humanoide; desplazamiento global en la raíz y cuidado con rest pose. No falsificar la locomoción únicamente con cámara.
6. Privacidad local por defecto: VRM y FBX del dueño no se suben a GitHub ni a terceros. Sin servicios de pago obligatorios.
7. Arquitectura modular que pueda exportar resultados reutilizables por el asistente sin acoplar voz a motores de movimiento.

## 3. Referencias y licencias por auditar

- pixiv/three-vrm: fundamento oficial ya instalado; expresiones, spring bones y runtime normalizado.
- opaopa6969/motion-engine: principal inspiración procedural; springs, noise idle, gestos con anticipación, IK y restricciones; licencia MIT en revisión inicial.
- Fano1/fano-vrm-controller: estudio de capa de control, composición de drivers y secundaria; licencia con atribución adicional, no incorporarla sin revisar íntegramente términos.
- nirholas/retarget: comparación con el retarget FBX existente y tratamiento de cadera/root; licencia Apache-2.0.
- met4citizen/TalkingHead: principios de mirada, gestualidad ligada al habla y dirección emocional; MIT; no sustituye el TTS de LUMIA.
- ekza-space/ekza-studio: revisión de curvas y VRMA, herramienta opcional de autoría.
- Moonweave-AI/virea: investigación de lenguaje, voz y generación de actuación corporal; revisar licencias y exigencias de modelos antes de integrar.
- rohitacharyams/MotionMind: posible futura fuente de motion capture a partir de vídeo, sujeta a permisos de clips, modelos y datasets.

**LP-01 está escrito como código ORBI independiente. No copia, descarga ni importa código, weights ni assets de esos proyectos.**

## 4. Fases y puertas de aprobación

### LP-01 · Auditoría y micro-presencia A/B — piloto actual
- Inventario de huesos reales, roles normalizados, dedos, mallas skinned, morph slots, expresiones y disponibilidad de spring bones.
- Prototipo de respiración variable y microajustes asimétricos de hombros, brazos, columna y cuello; movimiento amortiguado.
- Activar/desactivar sin alterar VRM, exportaciones o las pistas de un FBX. Durante FBX, el clip controla en exclusiva el rig.
- Módulos aislados: src/lib/livingPresence y src/LivingPresenceLab.jsx; pruebas en tests/livingPresence.test.js.
- **No demuestra aún** equilibrio, IK, captura humana, locomoción ni realismo definitivo.
- Gate: CI, QA navegador con avatar verdadero, no drift, no T-pose, original exacto tras desactivar.

### LP-02 · Idle con equilibrio y peso
- Centro de gravedad y reparto de peso, pelvis, apoyo de piernas y posturas distintas.
- Perfil anatómico derivado del esqueleto real; microacciones con pausas, amplitud y timings variables.
- Evitar duplicar o reescribir el gestor de spring bones VRM.

### LP-03 · Expresión corporal e IK
- Arquitectura de intención para escuchar, explicar, señalar, afirmar, negar, saludar, pensar y reaccionar.
- Curvas anticipación → gesto → seguimiento → recuperación; pequeño desfase entre hombro, codo, muñeca y dedos.
- IK 2 huesos con vector de codo, límites articulares y prevención de autocolisión.
- Medidas de QA: acercamiento real de palmas, evitar hombros deformados, trazado natural de manos.

### LP-04 · Locomoción de verdad
- Separar root motion de la animación de caderas; conservar traslaciones válidas del FBX.
- Foot IK, suelo y compensación de pelvis/rodillas; detección de apoyo y eliminación de deslizamiento.
- Caminar en sitio, avanzar y dibujar un círculo con desplazamiento real, sin depender de cámara.
- Transiciones y giros suaves sin teletransportes.

### LP-05 · Biblioteca de movimiento humano real
- Motion capture de material legítimamente licenciado; normalización, retarget a humanoide VRM y limpieza de curvas.
- Integración con ruido secundario e IK, evitando copiar movimientos imposibles para el avatar.
- Registro de procedencia y licencia por cada clip; no entrenar sobre videos privados sin autorización.

### LP-06 · Actuación verbal y semántica
- Director corporal que interpreta intención y puntos de énfasis de la respuesta.
- Sincronización con voz efectivamente reproducida, no con timestamps fonéticos inventados.
- Mirada, cabeza, cuello, torso, gestos y pausas coordinados. Manejo de interrupción y cancelación.
- Adaptador opcional para LUMIA-ASUS que preserve Ollama, Whisper, Kokoro y sus tiempos de respuesta.

### LP-07 · Presencia en el entorno
- IK con objetivos en mundo, alcanzar, recoger y soltar objetos, sentarse y levantarse.
- Colliders, suelo, superficies, paredes y muebles. Validación específica de cada avatar/escena.

### LP-08 · Exportación certificada y transferencia
- Soporte VRMA separado con validación de reimportación, sin confundirlo con exportar un GLB aproximado.
- Tests de rendimiento, regresiones y aceptación visual en ASUS física.
- Transferencia al runtime de LUMIA-ASUS solo mediante rama protegida y PR después de aceptación.

## 5. Matriz de certificación

| Ensayo | Referencia A | Experimental B | Criterio |
|---|---|---|---|
| Dos minutos idle | VRM original | LP-01 activo | respiración y microajustes sin deriva ni bucles groseros |
| Activar/desactivar 20 veces | pose original | overlay reversible | sin acumulación de rotaciones |
| Aplaudir y negar | FBX actual | LP-01 cede al FBX | amplitud y duración iguales al original |
| Tres caminatas | FBX original | LP-01 cede al FBX | no alterar root ni cámara en este piloto |
| Cambiar de VRM | nuevo modelo | nuevo rig auditado | sin estado cruzado ni accesos a huesos anteriores |
| Expresiones/spring bones | Three-VRM actual | mismo VRM update | no duplicar simulaciones |
| Texturas y exportar | comportamiento actual | mismo comportamiento | sin regresiones |
| FPS y memoria | medir en ASUS | medir en ASUS | presupuesto definido después de baseline real |

**No declarar éxito visual por tener tests unitarios verdes.** El VRM y los FBX privados no están en CI. Revisión final en máquina local del propietario.

## 6. Prueba del piloto LP-01

1. Abrir ORBI Motion Studio desde la rama de desarrollo.
2. Cargar el VRM local de LUMIA (el archivo no se envía al servidor).
3. Abrir panel Living Presence Lab y pulsar Auditar esqueleto VRM.
4. Comprobar cantidad total de huesos, humanoide, expresiones y spring bones contra rig real.
5. Observar 2 minutos con casilla de presencia desactivada y luego activada; variar intensidad.
6. Reproducir FBX y comprobar que el overlay no altera los clips.
7. Pausar/reanudar, cargar otro modelo, exportar GLB y revisar texturas para detectar regresiones.

Comandos de certificación de código: npm install, npm test, npm run build. Desplegar preview de la rama únicamente después de resultado satisfactorio.

**Regla:** main permanece protegida; PR de este laboratorio en borrador sobre la rama MOTION existente. Sin merge automático ni migración a LUMIA-ASUS antes de QA físico.

## 7. Continuidad

Repositorio: https://github.com/ingeniusvictor/orbi-3d-motion-studio
Proyecto objetivo: LUMIA Natural Motion — Living Presence.
Éxito final: el avatar comunica intención, equilibrio, contacto, reacción y continuidad, no solamente ejecuta más clips. Se utilizará movimiento humano capturado + IA y procedimientos suaves cuando su calidad y licencias estén verificadas.


## Actualización LP-02A · Postura natural visible y calibración por avatar

**Motivación de QA (2026-11-07):** El usuario probó \`Vita.vrm\` original, todavía en pose T. El visor identificó 155 huesos, 54/55 roles normalizados y 30 roles de dedos, con spring bones y expresiones; las microanimaciones LP-01 eran apenas perceptibles. No confundir este archivo de referencia con la versión visual final de LUMIA: se debe repetir la certificación cuando cambien rig o mallas.

**Implementado en LP-02A:**
- \`src/lib/livingPresence/neutralPose.js\`: toma las posiciones mundiales reales de hombro y codo para orientar ambos brazos hacia la gravedad, con descenso límite de 72° y una ligera flexión de antebrazo de hasta 13° usando el frente del avatar. Las correcciones se convierten a cuaterniones locales; no se asumen ejes de rotación iguales para ambos brazos.
- \`LivingPresence.js\`: combina la nueva postura A con el microidle amortiguado de LP-01; postura e intensidad de microgestos tienen controles independientes. Al desactivar restaura exactamente la pose previa. Los clips seleccionados conservan la propiedad de los huesos tanto reproduciéndose como pausados.
- \`LivingPresenceLab.jsx\`: selector de postura relajada (predeterminado 92 % del máximo calibrado), intensidad respiratoria y diagnóstico de calibración. La auditoría señala el rol opcional faltante.
- \`tests/livingPresencePose.test.js\`: cobertura del descenso simétrico, codos, reversibilidad durante cinco ciclos, clip activo/pausado y ausencia de manos opcionales.
- GitHub Actions **95/95 pruebas y compilación exitosa** en el commit \`5f593dd92746bfb4b558cbe9fd60e5ec3d3be7f4\`. Después de cualquier modificación adicional, usar el nuevo commit/CI.

**No implementado ni certificado:** IK completo, equilibrio con centro de masas, pie plantado, locomoción real o poses de actuación complejas. El descenso automático de brazos es una **postura inicial ajustable**, no una afirmación de realismo humano final. Revisar intersección con vestido/ropa y pelo en cada VRM.

**Prueba local actualizada:**
\`\`\`powershell
cd "$env:USERPROFILE\Downloads\ORBI-LIVING-PRESENCE-LAB"
git pull --ff-only
npm.cmd test
npm.cmd run build
npm.cmd run dev -- --port 5174 --strictPort
\`\`\`

Si Vite ya está activo en esa consola, detenerlo con Ctrl+C antes de actualizar y volver a iniciarlo. El puerto 5173 queda reservado para el otro proyecto.

**Prueba visual mínima:** abrir \`Vita.vrm\`, auditar, comprobar primero T (A/B off), activar (A/B on) y ajustar **Postura de brazos relajados** entre 70 y 100 %; comprobar descenso visible y flexión suave. Evaluar en vistas frontal/lateral para detectar autocolisión. Validar retorno exacto a T al desactivar. Repetir luego con el VRM definitivo de LUMIA cuando esté disponible.

**Siguiente puerta LP-02B:** corrección de hombros/manos, límites articulares, poses de espera/conversación y análisis del centro de masa; no simular balanceo de caderas que deslice los pies sin foot IK.


## Actualización LP-02B · Organic Living Idle (2026-11-07)

**Motivación:** El usuario comprobó que el modelo \`Vita.vrm\` ya descendía brazos tras LP-02A, pero manos, dedos y mirada seguían pareciendo rígidos. LUMIA R8 también dispone de un FBX Mixamo en reposo, cuyo bucle aislado no transmite una presencia natural suficientemente variada.

**Principio técnico:** Reposo vivo = postura anatómica + respiración + acciones episódicas de varios grados de libertad. No es un único clip en loop ni mover todas las partes continuamente. Las acciones deben incluir inicios suaves, duraciones variables, relajación, pausas y frecuencias asimétricas. En LP-02B los microeventos procedurales son independientes y deterministas para hacer QA reproducible.

**Implementación experimental dentro del Studio:**
- \`organicIdle.js\`: generador de eventos orgánicos con semillas reproducibles, canales separados para muñecas, codos, hombros, dedos, cabeza, cuello y movimientos de fijación ocular. \`NaturalBlink\` genera parpadeo espaciado y doble parpadeo poco frecuente.
- \`fingerPose.js\`: calcula ejes de flexión de cada articulación a partir de la palma y cadena de huesos normalizados del VRM. Se evita imponer el mismo eje local fijo a izquierda y derecha. Hasta 30 articulaciones reconocidas, dependiente del avatar cargado.
- \`LivingPresence.js\`: combina la postura LP-02A, la respiración ya existente y el nuevo score orgánico en la pose de renderizado. Los dedos tienen pequeñas flexiones de descanso y eventos independientes; los brazos y cabeza se reajustan a ritmos diferentes. \`VRMExpressionManager\` gestiona parpadeo cuando existe; \`VRMLookAt\` dirige fijaciones ligeras mediante objeto objetivo temporal no agregado a la escena. **Los valores y poses anteriores se restauran al apagar**.
- \`viewer.js\` y \`LivingPresenceLab.jsx\`: conmutadores de manos/dedos, mirada y parpadeo; modo de inspección con ganancia ×2,4 para evaluar efectos pequeños en pantalla sin convertirlo en configuración final. La auditoría muestra capacidades reales del VRM.
- \`tests/livingPresenceOrganic.test.js\`: test de canales no sincronizados, pausas, suavidad, parpadeo, 30 dedos, reversión A/B, clip activo/pausado y preservación de \`lookAt.target\` si otro sistema lo posee.

**Límites explícitos:**
- LP-02B aplica el motor de idle mientras **no haya un clip importado seleccionado**; cuando existe un FBX seleccionado, incluso pausado, el clip tiene prioridad. La **composición sobre el FBX de reposo de LUMIA R8 no está implementada aún**: requiere resolver las máscaras de huesos, prioridad de expresiones, blending temporal y evitar sobrescritura del Mixamo.
- La posición de la palma y los ejes de dedos dependen de la geometría real. Validar que dedos flexionen hacia la palma, no atraviesen la mano o la ropa; probar desde vista lateral y lateral de las manos.
- Ni la apariencia visual de Vita ni el realismo humano final quedan certificados por CI. La mirada necesita \`VRMLookAt\` usable; el parpadeo necesita expresiones \`blink\` o \`blinkLeft/right\`; si faltan, el motor no inventa expresiones.
- No incluye foot IK, reparto físico del peso, cinemática corporal con colisiones, voice-synced gesturing ni exportación VRMA.
- El modo de inspección amplificado no se debe usar como valor predeterminado final.
- Las imágenes, VRM y FBX originales siguen siendo archivos privados y se procesan en navegador sin subirlos al repositorio.

**Protocolo visual LP-02B:**
1. En la consola de la carpeta ORBI-LIVING-PRESENCE-LAB, detener Vite con Ctrl+C; \`git status --short\` y si está limpio \`git pull --ff-only\`, \`npm.cmd test\`, \`npm.cmd run build\`, \`npm.cmd run dev -- --port 5174 --strictPort\`.
2. Cargar \`Vita.vrm\`, activar presencia, postura 90-95%, microactividad 55-75%.
3. **Acercar cámara a manos** (a cuerpo entero no se aprecian variaciones de 2 a 5 grados). Observar 45-90 segundos. Alternar por separado canal de manos/dedos; inspección ×2,4 solo para confirmar dirección, sin juzgar realismo en ese modo.
4. Acercar a rostro y verificar parpadeos con intervalos variables, y cambios ligeros de fijación. Si el runtime no detecta lookAt o expresiones, revisar auditoría.
5. Apagar A/B y confirmar pose original exacta. Si manos se deforman, desactivar \`Manos, muñecas, codos y dedos\` y reportar vista frontal/perfil.
6. Añadir FBX y verificar que el motor procedural cede todo el esqueleto incluso al pausarlo. Cerrar y volver a abrir modelo para detectar estado residual.
7. Evaluar performance y ausencia de temblores en ASUS física antes de crear política de composición para R8.

**Siguiente milestone: LP-02C — Compositor de base animada + vida procedural**, que permitirá utilizar el FBX Mixamo de reposo como base *sin que el loop controle todos los huesos rígidamente*. Necesita máscaras articuladas, sincronización de movimientos secundarios, compatibilidad de blink/lookAt y capacidad de desactivar por articulación. No debe presumirse implementado.
