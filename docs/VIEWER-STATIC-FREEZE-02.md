# VIEWER-STATIC-FREEZE-02 — Evitar congelamiento al abrir GLB/FBX sin clips

## Incidencia reproducida por el usuario

- La copia animada de `LUMIA_V09_CLAUDE_ORGANIC_FUSION_CANDIDATE.glb` se visualiza en ORBI.
- El modelo original entregado por Claude, con **0 clips de animación**, continúa dejando el visor congelado incluso después de VIEWER-COMPAT-01.
- El archivo GLB fue inspeccionado fuera de ORBI y puede renderizarse. Se preservan las mejoras artísticas, el rig, las texturas y las 41 expresiones faciales.
- Se verificó el manifiesto original directamente: 354 nodos, 4 mallas glTF divididas en **20 primitivas**, **47.386 vértices** de las primitivas listadas, 346 articulaciones de skinning, 15 texturas, 41 morph targets en la malla facial, 0 animaciones.

## Diferencia de ejecución peligrosa descubierta

El código VIEWER-COMPAT-01 trataba los modelos estáticos de forma especial con `prepareStaticRigPreview`:

1. Para **cada SkinnedMesh** ejecutaba `node.computeBoundingSphere()` desde la importación.
2. En Three.js esa operación debe evaluar los vértices deformados en CPU para calcular bounds precisos, incluidos skinning y morphs.
3. En un personaje con muchas primitivas, 346 huesos y blendshapes, esto bloquea el hilo principal del navegador y puede parecer una carga colgada.
4. En la copia que contiene un clip, la ruta `animations===0` no se ejecutaba. Esa diferencia reproduce el patrón observado, aunque la causa precisa todavía necesita confirmación real en Chrome.

Además, la función de encuadre `computeVisibleCharacterBounds` pedía hasta 4.800 muestras deformadas por malla, y el fallback `new Box3().setFromObject(model,true)` podía solicitar de nuevo el cálculo de cada vértice skinned.

## Correcciones

- Para personajes sin animaciones, `prepareStaticRigPreview` ya **no llama `SkinnedMesh.computeBoundingSphere()`**. Solo actualiza las matrices óseas necesarias y asigna `frustumCulled=false`, evitando depender de bounds precisos para mostrar el personaje sin cambiar pesos ni materiales.
- El ajuste de cámara de modelos estáticos usa `computeVisibleCharacterBounds(...,{deformed:false,maxSamplesPerMesh:1600})`. Toma la geometría de reposo directamente, sin ejecutar skinning ni 41 morphs en CPU para cada muestra.
- Si el encuadre por muestras falla, usa `fastStaticGeometryBounds`, que combina los bounding boxes de posiciones crudas de las mallas. No usa `Box3.setFromObject(model,true)` en la ruta estática.
- Modelos animados siguen usando la lógica de encuadre original (deformación activa) para no cambiar el comportamiento aprobado.
- La pantalla de carga muestra etapas específicas: decodificación, preparación de huesos y materiales, visualización segura, cámara y comprobación de geometría. Antes de las operaciones síncronas principales se cede un turno al navegador para actualizar la interfaz.
- No se añade ninguna animación falsa, no se sobrescribe el modelo original y no se tocan matrices de reposo, huesos, ni morphs.

## Pruebas automatizadas

El test `tests/viewerStaticFreeze.test.js` construye un personaje skinned con posiciones y pesos reales y sustituye `computeBoundingSphere()` y `getVertexPosition()` por funciones que lanzan errores. Demuestra que la ruta sin animaciones no invoca esas operaciones costosas. También inspecciona inmutabilidad de buffers de vértices/skin, ruta con animaciones intacta, fallback seguro y estados visibles.

La integración se basa en `feat/integration-motion06-viewercompat01`. No modifica MOTION-06, el ejecutor Python Golden, los controles de AUTORIG, ni las ramas PR #12/#13/#14. No se fusiona con `main` antes de QA real.

## Protocolo de aceptación en Chrome

1. Usar **rama de prueba** `feat/viewer-static-load-freeze-02` en una carpeta `git worktree` separada.
2. Abrir el GLB original de Claude, no la copia de diagnóstico de 4 segundos.
3. Confirmar que el texto de carga avanza entre sus etapas y que el personaje aparece completo.
4. Rotar y acercar la cámara; inspeccionar ojos, cabello, cuello, ropa, cara y extremidades.
5. Abrir la copia animada conocida y comprobar que continúa funcionando.
6. Abrir un FBX sin clips para verificar que la corrección funciona en ambos formatos.
7. Abrir un FBX animado, usar `Animación ▾` y verificar controles Arms/Look/Trim.
8. Comprobar que MOTION-06 sigue visible para retarget de LUMIA 155/D162 y que su motor Python no se ha alterado.

**Si todavía se congela**, informar de la última etapa visible (p. ej. `Leyendo y decodificando modelo 3D` versus `Ajustando cámara al personaje`) y acompañar con la salida F12→Console. Eso identifica si persiste un bloqueo de decodificador, malla, WebGL o integración distinta de bounds.

**No se garantiza todavía que la incidencia real esté resuelta**: la prueba automatizada comprueba ausencia del recorrido peligroso; la validación visual con el GLB auténtico en Windows sigue pendiente.
