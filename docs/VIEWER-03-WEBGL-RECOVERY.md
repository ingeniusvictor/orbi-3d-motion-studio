# VIEWER-03 — Recuperación WebGL sin recargar la pestaña

## Síntoma real

El usuario confirmó que **LUMIA V09 original y otros modelos FBX/GLB sin clips** siguen
provocando una pantalla negra que obliga a actualizar la página. VIEWER-STATIC-FREEZE-02
eliminó cálculos costosos de CPU, pero no reparó completamente el problema.

**No se ha certificado la causa raíz**: una pantalla negra puede corresponder a
pérdida del contexto WebGL (GPU/driver), un error de shader, un fallo de renderizado,
un proceso de carga bloqueado o incluso una pestaña que deja de dibujar la interfaz.
Los nuevos controles de recuperación se aplican si la página React sigue activa.

## Riesgo observado directamente en el código

La clase `MotionViewer` creaba `THREE.WebGLRenderer` con antialiasing y pixel
ratio de hasta 2, pero **no registraba** `webglcontextlost` o
`webglcontextrestored`. El bucle RAF invocaba siempre `renderer.render()`
sin capturar excepciones. El usuario no podía volver a crear el renderer sin
recargar completamente Chrome.

## VIEWER-03 implementado

1. Eventos del canvas `webglcontextlost` y `webglcontextrestored`.
   `preventDefault()` permite al navegador intentar restaurar el contexto.
   Se detiene el RAF en una pérdida gráfica y se reanuda si Chrome restaura.
2. Captura de errores del bucle de renderizado: evita repetir indefinidamente
   un error en cada fotograma y muestra la causa recibida.
3. **Modo gráfico seguro**: genera un nuevo renderer con antialiasing
   desactivado, pixel ratio 1, sin modificar materiales, buffers, huesos,
   blendshapes ni texturas originales. El modo normal sigue disponible.
4. **Recuperar visor en modo seguro**: botón sobre una capa HTML independiente
   del canvas. Elimina el WebGLRenderer antiguo y crea uno nuevo sin llamar
   `location.reload()`. Vacía solamente la sesión 3D: hay que volver a abrir
   el archivo desde el PC. Las mejoras del modelo original no se alteran.
5. La recuperación invalida callbacks de carga anteriores: una decodificación
   en progreso no puede volver a sobrescribir el estado de un renderer nuevo.
6. Informe de GPU con estado WebGL, ratio de píxeles, cantidad de texturas y
   geometrías y modelo cargado. No incluye bytes de mallas ni texturas.
7. **Última etapa persistente al recargar**: en `sessionStorage` local se
   guarda solo el estado de carga y la extensión del modelo, sin la ruta,
   nombre, geometría, texto o imagen del archivo. Se limpia tras carga
   exitosa, error gestionado o recuperación. Si Chrome necesita recargarse
   por un bloqueo grave, se muestra «La carga anterior se interrumpió:
   última etapa…» para identificar la zona del bloqueo.

## Alcance y límites

- No asegura que un controlador GPU o Chrome que se bloquea por completo
  pueda recuperarse desde una página cuya interfaz ya no recibe eventos.
- No promete compatibilidad con todos los GLB/FBX; modelos con extensiones
  o estructuras no admitidas pueden seguir produciendo errores concretos.
- Los contadores `renderer.info.memory` son número de recursos, **no VRAM
  real medida**.
- La distinción entre GPU/contexto y un fallo CPU requiere el mensaje del
  nuevo estado o la última etapa persistida.
- Si la carga falla incluso en modo seguro, adjuntar la última etapa del
  aviso y la consola F12. No reescribir ni simplificar el GLB de Claude.

## QA de aceptación en Windows

1. Iniciar laboratorio sobre esta rama con un puerto exclusivo.
2. Activar **Modo gráfico seguro** antes de abrir el GLB original V09.
   Este botón reconstruye el renderizador y deja el visor vacío.
3. Cargar el original `LUMIA_V09_CLAUDE_ORGANIC_FUSION_CANDIDATE.glb`.
   Inspeccionar que el personaje se vea sin clip, materiales y expresiones.
4. Si el visor falla pero la página sigue respondiendo, pulsar
   **Recuperar visor en modo seguro** y luego abrir la copia animada conocida.
5. Si la pestaña se vuelve negra por completo, recargar. La aplicación debe
   mostrar automáticamente la **última etapa de carga previa al fallo**.
6. Repetir con un FBX estático problemático, después un FBX animado.
7. Verificar MOTION-06, panel flotante y exportación. No fusionar a main hasta
   confirmar en navegador con archivos reales.

## Compatibilidad de ramas

Base: `feat/viewer-static-load-freeze-02` (PR #15); contiene
`feat/integration-motion06-viewercompat01` (PR #14), MOTION-06 (PR #12),
VIEWER-COMPAT-01 (PR #13) y AUTORIG-02F (PR #11). Ninguna de esas ramas
se sobrescribe ni se fusiona automáticamente.
