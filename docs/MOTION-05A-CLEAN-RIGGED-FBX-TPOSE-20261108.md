# MOTION-05A — FBX riggeado limpio en pose T + extracción de clips
**Fecha:** 2026-11-08
**Repositorio:** https://github.com/ingeniusvictor/orbi-3d-motion-studio
**Rama:** `feat/lumia-living-presence-lp01-20261107`
**PR:** https://github.com/ingeniusvictor/orbi-3d-motion-studio/pull/2 (borrador).
**Propósito definido por el usuario:** obtener de personajes que ya tienen clips incrustados un **FBX riggeado, sin animaciones y en posición T**, preferiblemente listo para cargar en Adobe Mixamo y seguir descargando sus movimientos; guardar, opcionalmente, cada animación original aparte.

## Principio de producto

**El archivo principal no es GLB:** `<nombre>_MIXAMO_TPOSE.fbx` es un FBX binario 7400 real. Conserva las mallas riggeadas y un único esqueleto físico con nombres y jerarquía originales, y declara **cero animaciones**. Un FBX riggeado sirve como entrada para Mixamo, que intentará mapear su esqueleto; el usuario debe validar que ese servicio realmente lo acepte.

Adobe documenta expresamente el upload de personajes que ya traen un rig en formato .fbx y su mapeo al sistema Mixamo: https://helpx.adobe.com/creative-cloud/help/mixamo-rigging-animation.html

### Flujo

1. Cargar un personaje FBX o GLB riggeado con una o varias animaciones. Los clips aparecen en la Biblioteca.
2. Abrir debajo de la Biblioteca el desplegable **MOTION-05 · Extraer animaciones y preparar FBX para Mixamo**, que evita añadir más scroll al inspector lateral.
3. Seleccionar por defecto **T calibrada — objetivo Mixamo**. Disponible también **Pose de referencia original — respaldo seguro**.
4. Pulsar **Exportar FBX limpio**.
5. El motor no reutiliza los huesos de la animación actual: `viewer.open` capturó transformaciones del modelo **antes de reproducir el primer AnimationClip**.
6. El programa clona el modelo con `SkeletonUtils.clone`, restaura el bind/referencia original, vacía todas las listas `animations` del clon y comprueba que siguen todas las mallas skinned y huesos.
7. Solo en la copia, intenta reconocer `Hips`, `LeftArm/LeftForeArm/LeftHand` y `RightArm/RightForeArm/RightHand` o aliases habituales. Determina la lateralidad por la geometría efectiva del brazo, no por convenciones de signo fijo; alinea hombro-codo y codo-mano con el plano X horizontal en coordenadas de escena.
8. Cada corrección está limitada a **75° brazo superior y 65° antebrazo**. Si falta una articulación, el eje lateral es incierto o la corrección es demasiado grande, **se bloquea la salida en T** y se muestra el motivo. No se fabrica una T falsa ni se editan los huesos en el modelo activo.
9. `three-js-fbx-exporter` produce FBX binario con `animations:[]`, `bakeAnimations:false`, `embedTextures:false` para mantener un archivo más ligero. Validación de ida y vuelta: firma física de huesos `LimbNode`, parentesco de cada hueso, malla/skinning, cero clips al reabrir con `FBXLoader`. La prueba automatizada incluye inspección angular de brazos después de reimportar bytes reales.
10. Descarga `<nombre>_MIXAMO_TPOSE.fbx` si y solo si supera las verificaciones. **No se afirma aceptación por Mixamo**, que requiere probar cada personaje real.

### Exportación opcional de movimientos

Con un clip seleccionado, **Guardar clip seleccionado** descarga `<nombre>_ORBI_MOTION.json`, un documento pequeño con `THREE.AnimationClip.toJSON()`, `format:orbi.motion.clip.v1`, nombre fuente y cantidad de huesos. Se documenta explícitamente que **no es FBX ni un formato de Mixamo**. El soporte para cargar el JSON a la biblioteca y exportar un `FBX Without Skin` confiable, con curvas verificadas, se propone para MOTION-05B. No implica retargeting automático.

### Límites

- La primera entrega admite únicamente **FBX y GLB riggeados**. VRM tiene otro flujo porque su normalización y expresiones no se pueden preservar como FBX estándar sin pérdidas. Si se intenta, el módulo informa y detiene la operación.
- La restauración inicial es la **pose de referencia cargada antes de animar**. No debe confundirse con recuperar automáticamente una verdadera T para todos los personajes: si el rig no tiene estructura reconocible, solo se permite exportar la pose de referencia y se informa de ello.
- La alineación automática en T puede ser anatómicamente insuficiente para ropa/faldas/armaduras y mallas cuya postura está esculpida en A. No hay simulación de colisiones ni re-rigging, ni guarantee de compatibilidad Mixamo para todas las escalas/jerarquías. Revisar brazos, dedos y ropa.
- Las texturas **no se incrustan** en el nuevo FBX para reducir posibles problemas con Mixamo. El archivo original conserva todos sus materiales y los clips.
- No se altera la rama `main`, ni el proyecto LUMIA R8, ni el VRM privado, ni las animaciones originalmente importadas.
- Si la pose es A, el bind original del esqueleto puede diferir de la nueva pose T. La exportación incluye transformaciones locales de la pose resultante y conserva skinning; Mixamo debe interpretarla correctamente. Si aparecen deformaciones, no usar el resultado y ajustar el rig en Blender como vía de respaldo.
- **MOTION-05A es experimental hasta que se pruebe con un FBX animado real que pertenezca al usuario.** CI verifica datos sintéticos y exportaciones de prueba, no certifica Mixamo.

## QA local

Detener el Vite actual con Ctrl+C. En PowerShell:
```powershell
cd "$env:USERPROFILE\Downloads\ORBI-LIVING-PRESENCE-LAB"
git status --short
git pull --ff-only
npm.cmd test
npm.cmd run build
npm.cmd run dev -- --port 5174 --strictPort
```
Si `git status --short` muestra modificaciones, **no ejecutar pull** hasta revisarlas.

1. Abrir `http://localhost:5174/` y recargar con `Ctrl+Shift+R`.
2. Cargar **un FBX con malla, rig y animación** (preferible el mismo modelo con el que ya probaste movimiento). Ver que el clip original se puede reproducir.
3. En **Biblioteca de animaciones** → `MOTION-05`, elegir `T calibrada`; pulsar `Exportar FBX limpio`.
4. Si el sistema bloquea el FBX, copiar el texto completo: es una restricción intencional de pose/huesos. Puedes intentar la opción de respaldo `Pose de referencia original` sin deformar nada, pero eso **no garantiza T**.
5. Si se descarga, **reabrir el nuevo FBX en ORBI**; debe tener 0 animaciones, mallas, huesos y brazos aproximadamente horizontales. Verificar manos, ropa y peso del skin.
6. Cargar el FBX exportado en https://www.mixamo.com/ y comprobar si mapea el rig existente, permite elegir animaciones y descargar con `Without Skin`. Validación final por usuario, no por CI.
7. Volver a ORBI y, si interesa, guardar individualmente clips originales `_ORBI_MOTION.json` para documentar sus curvas.

## Siguientes incrementos

- **MOTION-05B:** previsualización A/T dentro del visor (sin editar modelo actual), detección anatómica más amplia, rig con eje rotado y normalización segura de escala. Para compatibilidad total, ofrecer salida Blender FBX validada cuando exportador local no se comporte.
- **MOTION-05C:** importar el clip JSON de vuelta, extraer todos los clips por lotes y exportarlos como FBX solo esqueleto sin malla cuando las pistas físicas sean compatibles.
- Integrar una biblioteca ORBI de movimientos reusable entre modelos con **firma de rig** en lugar de suponer que personajes del mismo tamaño usan el mismo esqueleto.
