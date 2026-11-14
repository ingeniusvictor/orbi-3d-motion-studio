# AUTORIG-02C.1 · Skinning experimental nativo sin Blender

Estado: **piloto de pruebas**, rama `feat/autorig-02c-native-skinning-pilot`, basada en `feat/autorig-02-native-editor`. No modifica `main`, no cambia los GLB originales y **NO es un rigging certificado ni exportable**.

## Alcance implementado

- Algoritmo JavaScript puro `nativeSkinWeights.js` que calcula influencias por proximidad de cada vértice a los 19 segmentos óseos de AUTORIG-02. Máximo 4 huesos por vértice, pesos finitos y normalizados.
- Worker local `nativeSkinWorker.js` para calcular pesos fuera del hilo de renderizado. El modelo no sale del equipo.
- Creación de copias temporales de las mallas GLB estáticas, con geometrías y materiales clonados. La geometría se coloca en coordenadas globales de la escena para que coincida con los 22 marcadores exportados por AUTORIG-02.
- Jerarquía real `THREE.Bone`, `THREE.Skeleton` y `THREE.SkinnedMesh` en overlay separado del personaje original.
- Panel para generar la vista de skinning, revisar cantidad de mallas/vértices, seleccionar articulaciones, eje de giro y ángulo de prueba. Restaurar la pose o cerrar la prueba restaura el modelo fuente.
- Guardas contra bones y posiciones no finitas, más de 300.000 vértices o 60 mallas, modelos ya riggeados y mallas con morph targets (no se alteran).
- Pruebas unitarias y smoke de deformación sintética (no equivalen a QA visual del GLB LUMIA 50K).

## Cómo probar con LUMIA 50K

1. Clonar/actualizar la rama experimental. Cargar el **GLB estático sin rig** `lumia 50k.glb`.
2. Abrir AutoRig Studio. Seleccionar **Iniciar editor 3D sin Blender** y luego **Abrir proyecto de marcadores (JSON)**.
3. Elegir el archivo real de marcadores `lumia 50k-orbi-autorig02.json` exportado anteriormente. No se incorpora el archivo del usuario al repositorio público.
4. Elegir **Frente** y **Derecha/Izquierda** y revisar la profundidad Z de cuello, torso, codos, rodillas, tobillos y manos. En el JSON recibido, 20 de 22 marcadores comparten exactamente Z; no se ha certificado su ajuste de perfil.
5. Pulsar **Generar esqueleto de 19 huesos**.
6. Pulsar **Calcular pesos y activar vista de deformación**. El proceso usa Web Worker y prepara una copia del modelo en el navegador.
7. Probar codo izquierdo/derecho, rodilla izquierda/derecha, hombros y cuello con ángulos progresivos: ±10°, ±25°, ±45°. Revisar cruces, estiramientos, artefactos, ropa flotante y deformación del rostro.
8. Pulsar **Restablecer T-Pose** para volver al reposo; **Cerrar prueba y recuperar marcadores originales** para descartar toda la copia temporal.
9. El JSON de marcadores sigue siendo la única salida guardable en AUTORIG-02A/B. Este piloto **no descarga GLB riggeado**.
10. No pulsar el exportador general de ORBI para obtener este rig; ese exportador sigue trabajando con el archivo cargado original.

## Precauciones esenciales

- **Proximidad NO es anatomía.** El cálculo no identifica automáticamente brazos, prendas, ojos, pelo, topología de islas separadas ni pesos artísticos, y puede vincular segmentos anatómicamente incorrectos. Los números normalizados no implican buen resultado visual.
- Los modelos con morph targets se bloquean expresamente para no perder expresiones.
- Los GLB con rig o animaciones quedan fuera del piloto, incluidos Vita y Mint. No se reemplazarán sus esqueletos.
- Los materiales se clonan y **comparten texturas de solo lectura** con la fuente. No se elimina ni modifica ningún recurso original durante la vista previa.
- El cálculo falla de forma visible si faltan datos o si se cambia el personaje antes de acabar; los Workers se cancelan.
- La QA automatizada valida pesos, jerarquía, deformación sintética y compilación. La prueba de deformación y renderizado real en navegador con LUMIA sigue pendiente.

## Siguiente incremento 02C.2 antes de exportar

- Inspector visual de pesos por colores y malla.
- Restricciones anatómicas por región para evitar mezclar ramas (especialmente cerca de hombros y caderas).
- Herramienta de corrección/pintado de influencias; protección de ojos, cabello y ropa según malla.
- QA de bind pose, consistencia de normales/UV, bounds y roundtrip real con GLTFLoader/GLTFExporter.
- Solo después, exportación GLB experimental explícita, seguida de reimportación y flexiones certificadas. VRM/FBX requieren trabajo aparte.

El GLB de LUMIA debe obtenerse de la máquina del usuario: no es parte del JSON de puntos.
