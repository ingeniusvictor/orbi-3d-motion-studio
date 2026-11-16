# STUDIO-09 — Escena protagonista + paneles desplegables

## Solicitud del usuario (QA real de FACIAL-08)

El usuario confirmó que los controles faciales ya pueden activarse y que
**las pruebas funcionan** sobre LUMIA Claude GLB. Reportó que otros LP
siguen deshabilitados y pidió dejar atrás la interfaz de laboratorio:
cada LP y cada grupo de pruebas debe tener un botón desplegable **sobre
la pantalla del personaje**, sin obligar a recorrer el scroll ni perderlo
de vista.

## Diagnóstico real de los LP

Basado en `src/lib/viewer.js` y `src/LivingPresenceLab.jsx`:

| Familia | Motor / condición | Situación GLB/FBX |
|---|---|---|
| LP-01 | `new LivingPresence(vrm)`, requiere humanoide VRM | No habilitado sin adaptador corporal calibrado |
| LP-02 | `new MotionComposer(vrm)`, necesita VRM y clip elegible | No se activa solo por tener GLB con 346 huesos |
| LP-03A/B | gestos, dedos, posturas e IK dependen de `this.presence` | No certificado para rig Claude V09 |
| LP-03C | `VoiceMotorBridge` + `startLivingLipSync`; detecta morphs GLB/FBX | Voz posible; labios si el controlador detecta visemas reales y el usuario activa QA |
| LP-03D | `GlbMorphFaceQA` o motores `FacialPresence` de VRM | Compatible con Blink, A/I/U/E/O y emociones reales de V09 |

**No forzar los motores VRM sobre GLB**: compartir nombres o tener muchos
huesos no garantiza ejes, límites, pesos, máscara para pelvis, dedos o IK.
Los controles corporales quedan deshabilitados de forma segura hasta
una adaptación validada para la pose de reposo de Claude V09.

Se agregó `describeLpCapabilities` con estados `available`, `partial`,
`pending`, `requires-vrm` y `no-model`, presentado al inicio del
panel `LP cuerpo`, con explicaciones específicas para el rig cargado.

## Experiencia de usuario

- La visualización pasa a ser una **escena 3D alta y a ancho completo**,
  adaptada a escritorio y móvil. Se reduce la barra lateral original, la
  cabecera y los márgenes para dar más espacio al personaje.
- Dentro del visor se coloca una **barra flotante horizontal**, desplazable
  lateralmente si falta espacio, con botones identificados: Rostro,
  Voz, Editor, Clips, LP cuerpo, AutoRig, Mixamo, ToeLock, Extraer,
  Texturas, Modelo, Exportar y Preparar.
- Cada botón alterna la visibilidad de su **panel superpuesto**. Solo un
  panel está abierto a la vez. El personaje permanece dibujándose detrás;
  cerrar el panel devuelve la escena completamente despejada.
- La barra tiene acceso **Ocultar paneles**, cada panel de sidebar dispone
  de `Cerrar panel`, y `Esc` cierra el panel activo.
- `FaceQuickDock` y `ViewportMotionDock`, ya probados, continúan
  en el propio viewport. También se accede a ellos desde la nueva barra.
- El panel de voz LP-03C se separa del bloque LivingPresence, evitando
  perderlo al desplazarse por controles de cuerpo; **solo se monta una
  instancia de `VoiceMotorLab`**.
- Cada panel conserva su componente y su estado React aunque esté oculto
  por CSS. Cambiar de herramienta **no destruye el canvas** de Three.js,
  no recarga archivos ni obliga a reiniciar motor TTS o de animación.
- La biblioteca de clips, extractores, MOTION-06, MOTION-07, AutoRig,
  inspector de huesos, texturas, exportación y preparación se mantienen
  íntegros, ahora dentro de paneles superpuestos y con scroll propio.
- Se conserva `PanelErrorBoundary` para impedir que un editor con
  error vuelva a desmontar toda la interfaz.

## Archivos

- `src/StudioToolStrip.jsx`: barra accesible, selector único,
  botones y metadatos de herramientas.
- `src/lib/livingPresence/lpCapabilities.js`: clasificación real
  de disponibilidad por formato, motor y capacidades.
- `src/LivingPresenceLab.jsx`: estado LP por módulo;
  prop `showVoice` opcional (compatibilidad retroactiva).
- `src/App.jsx`: paneles reubicados alrededor del viewport;
  VoiceMotorLab montado una sola vez; Escape para cerrar.
- `src/styles.css`: escenario principal alto, riel de herramientas
  de cristal y drawer flotante adaptable.
- `tests/studio09ViewportDrawer.test.js`: pruebas funcionales/SSR de barra,
  reglas LP, montaje único de paneles, preservación de VIEWER-04 y
  compatibilidad con tamaño móvil.
- `tests/autorig02ViewportDock.test.js`: pruebas de los controles
  originales actualizadas al selector centralizado, sin eliminar sus
  condiciones de seguridad.

## QA Windows y condición de aceptación

Se parte de `feat/facial-08-glb-morph-v09` (PR #20) que contiene
VIEWER-04, MOTION-06, MOTION-07 y FACIAL-08. **No se altera la rama ni
la carpeta estable `ORBI-VIEWER-04` ni `main`.**

1. Detener Vite actual con Ctrl+C para liberar **5201**.
2. Crear nuevo worktree aislado `ORBI-STUDIO-09-QA`; instalar npm y ejecutar
   `npm.cmd run dev -- --host 127.0.0.1 --port 5201 --strictPort`.
3. Cargar GLB LUMIA maestra 346 **sin animaciones**; verificar rostro y
   cuerpo visibles y que la barra superpuesta no tape la cabeza.
4. Abrir y cerrar los paneles desde la barra. Deben permanecer en pantalla
   sin llevarte a una sección inferior; cambia entre Clips, Modelo, LP,
   Voz, Texturas, AutoRig y Mixamo y observa que el canvas no se reinicia.
5. Pulsar Rostro y probar Blink, A/I/U/E/O y Joy. Al cerrar/abrir
   otro panel la expresión no debe quedarse artificialmente aplicada.
6. En LP cuerpo comprobar que LP-01/02/03A/B indiquen «Solo VRM»
   para la maestra V09, pero LP-03C/03D reflejen capacidades GLB.
7. En Voz, probar reproducción de WAV/MP3 local con autorización
   explícita y verificar que la boca vuelve al reposo tras detener.
8. Abrir un FBX con animación; Clips y Editor deben funcionar, y el
   personaje debe seguir animado mientras el panel está abierto.
9. Verificar Mixamo MOTION-06, ToeLock MOTION-07 y exportación sin
   cambios en sus parámetros ni en los motores Golden.
10. Repetir en ventana estrecha; barra debe desplazarse lateralmente,
    drawer debe permitir desplazamiento vertical independiente.
11. `Esc` u Ocultar paneles devuelve vista completa; probar carga
    consecutiva GLB/FBX y recuperación WebGL si corresponde.

**No declarar certificado hasta el QA visual del usuario en Chrome Windows.**
No se ha creado un adaptador de cuerpo GLB universal y no se ha
manipulado la pose base 346.
