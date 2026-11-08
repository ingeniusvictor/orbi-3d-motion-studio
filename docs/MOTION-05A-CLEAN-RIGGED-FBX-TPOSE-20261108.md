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


## MOTION-05A.1 — Corrección de falsa incompatibilidad de jerarquía (2026-11-08)

**Reporte real del usuario:** la extracción de una animación por separado funcionó, pero la exportación del FBX limpio en T falló con `No se exportó una pose T insegura: La jerarquía original no coincide con la copia de exportación.`

**Causa comprobada en código:** `viewer.open()` guardaba `captureReferencePose(this.model)` **antes** de establecer el nombre definitivo `this.model.name ||= loaded.name`. Cuando FBXLoader entregaba una escena raíz sin nombre, la instantánea guardaba `name: ''` y, al ejecutar `SkeletonUtils.clone`, el nodo raíz ya llevaba el nombre asignado por ORBI. Además, se comparaba directamente `Object3D.type`, cuya etiqueta puede normalizarse al clonar una clase importada sin que cambie su función real.

**Corrección:**
- `viewer.js` asigna nombre al modelo *antes* de capturar la pose de referencia y todavía *antes* del primer fotograma de AnimationMixer.
- `motionExtraction.js` tolera exclusivamente el cambio de etiqueta del nodo raíz (que no es una identidad ósea) y sustituye las comparaciones de cadenas `.type` por clases semánticas `bone / skinnedMesh / mesh / transform`. En nodos descendientes se mantiene el cotejo estricto de nombre y orden; siempre se exige la misma cantidad de nodos y firma del rig, y no se permiten cambios de función ósea/skinning.
- Se conserva la exportación de una **copia**, la pose T solo cuando el sistema reconoce los brazos, las verificaciones FBX de mallas, esqueleto, parentesco físico y cero clips; se bloquea cualquier conversión dudosa.
- `tests/motionExtraction.test.js`: caso real de nodo raíz sin nombre, asignación posterior, animación activa que no debe filtrarse; otro caso de etiquetas `FBXLimbNode` normalizadas por Three.js, con rechazo explícito si cambia la clase semántica del hueso.

**CI:** 191/191 pruebas y build aprobados. [GitHub Actions 42460872733](https://github.com/ingeniusvictor/orbi-3d-motion-studio/actions/runs/42460872733).

**Procedimiento de recuperación:** detener Vite, comprobar `git status --short`, `git pull --ff-only` solo si limpio, ejecutar pruebas/build/servidor; recargar Chrome con Ctrl+Shift+R y **volver a cargar el FBX ORIGINAL** para regenerar la pose de referencia con el nuevo orden. Después usar Biblioteca de animaciones → MOTION-05 → T calibrada → Exportar FBX limpio. Reimportar el archivo y probar en Mixamo. Si aparece un error diferente (brazos, malla o jerarquía ósea), registrar mensaje exacto: la compatibilidad con ese rig real todavía requiere QA visual.


## MOTION-05A.2 — Pose original como predeterminada + opción de pose A (2026-11-08)

**QA real informado:** «El movimiento guardado en JSON funcionó, pero la exportación de FBX limpio en T mostró: `No se pudo reconocer el brazo left completo (brazo superior, antebrazo, mano y caderas)`». El usuario solicita también **pose A, brazos extendidos en diagonal hacia abajo**, no necesariamente T horizontal.

**Respuesta sobre JSON:** `_ORBI_MOTION.json` guarda un `AnimationClip` de Three.js serializado, con duraciones, pistas/keyframes y metadatos del rig. Es un respaldo válido de las curvas originales **para uso futuro de la biblioteca ORBI**. En MOTION-05A la interfaz todavía no incluye un importador del JSON guardado, y Mixamo **no consume ese JSON como FBX de animación**; la exportación FBX de movimiento por separado sigue pendiente. Mantener el original FBX como respaldo.

**Cambios implementados:**
- **Predeterminada: `reference`** — conserva sin modificación la pose de referencia que tenía el modelo ANTES de reproducirse el primer clip (A, T u otra). Esta ruta no intenta identificar caderas/brazos, por lo que puede exportar rigs con nombres desconocidos; sigue auditando el FBX binario, el skin, la jerarquía física de huesos y cero animaciones.
- **Optativa: `a`** — cuando los huesos se reconocen con suficiente confianza, alinea cada brazo superior y antebrazo en diagonal hacia abajo **35° respecto de horizontal**, con límites de giro, manteniendo ambos lados simétricos. Es una **A calibrada**, no brazos completamente pegados al cuerpo. Nunca se cambia el personaje en reproducción: se opera sobre una copia.
- **Optativa: `t`** — calibración T horizontal previa, sin cambios de seguridad.
- Se amplían aliases conservadores para rigs compatibles (incluidos `J_Bip_`, `Arm_L/Arm_R`, `Bip001` y otros). Si A/T no se puede calcular, el mensaje indica **articulaciones no reconocidas** y un muestreo de **nombres reales de huesos**; aconseja seleccionar Pose original. La herramienta no inventa un T/A si no puede reconocer el rig.
- La UI de `MotionExtractor.jsx` cambia la elección por defecto y clarifica la diferencia entre **conservar original** y **calibrar A/T**. La respuesta de exportación en `App.jsx` ya no afirma que toda exportación está en T; los nombres resultantes son `_POSE_ORIGINAL.fbx`, `_MIXAMO_APOSE.fbx` o `_MIXAMO_TPOSE.fbx` según selección.
- `tests/motionExtraction.test.js` añade tres casos para pose A calibrada, nombres de huesos irreconocibles con exportación de pose original FBX binario reimportable, y conservación de postura original inclinada sin deformar al personaje activo.

**Aclaración Mixamo:** Adobe documenta la subida de **FBX ya riggeados** y su mapeo automático. No garantiza que cualquier rig sea compatible ni obliga a nuestra aplicación a generar una T horizontal para todos los personajes: https://helpx.adobe.com/creative-cloud/help/mixamo-rigging-animation.html . La calidad del skin, la pose neutral y la aceptación real siguen pendientes de pruebas con el FBX del usuario.

**Protocolo recomendado de QA:**
1. Detener Vite; `cd "$env:USERPROFILE\Downloads\ORBI-LIVING-PRESENCE-LAB"` → `git status --short` → solo si limpio `git pull --ff-only` → `npm.cmd test`, `npm.cmd run build`, `npm.cmd run dev -- --port 5174 --strictPort`.
2. `Ctrl+Shift+R` en localhost:5174. **Volver a cargar el FBX original** (el que contiene las animaciones) para reconstruir el snapshot.
3. Biblioteca de animaciones → MOTION-05 → dejar seleccionada **Pose original — conserva A/T sin mover huesos** → Exportar FBX limpio. Este flujo ya no requiere detectar la estructura de brazos. Inspeccionar `_POSE_ORIGINAL.fbx` reimportándolo en ORBI: 0 clips, mallas, huesos, apariencia sin deformación. Si la pose se ve neutral con los brazos separados del cuerpo, probarla en Mixamo.
4. Solo si se desea una A más uniforme y el rig tiene articulaciones reconocidas, elegir **Pose A calibrada — 35° hacia abajo**. Si se bloquea, usar Pose original y copiar **los nombres de huesos mostrados** para agregar soporte a ese rig.
5. No sobreescribir los archivos fuente originales ni afirmar aceptación de Mixamo hasta subir el FBX real y aplicar una animación de prueba.

**Límite técnico:** conservar pose original no garantiza que sea A; un FBX que solo trae una pose de acción como base podría producir una copia en esa postura. Evaluar visualmente antes de subirlo a Mixamo. Para rigs con nombres especiales y referencia incorrecta habrá que leer la jerarquía y, posiblemente, usar Blender para ajustar una pose/bind segura.
