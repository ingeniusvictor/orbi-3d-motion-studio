# CONTINUIDAD OFICIAL — ORBI 3D MOTION STUDIO
## MOTION-04E · Autoasignación visual global de texturas por personaje completo
**Versión:** Especificación funcional y técnica v1.0 · 03-11-2026  
**Estado:** MOTION-04E1/E2 IMPLEMENTADOS EN BETA; MOTION-04E3/E4 PENDIENTES  
**Repositorio:** https://github.com/ingeniusvictor/orbi-3d-motion-studio  
**Rama de desarrollo:** `feat/motion-01-viewer-inspector` · `main` protegida · PR #1 draft

### 1. Necesidad y visión

El piloto MOTION-04D puede recomendar una textura de color para una única pieza/material del personaje, con hasta ocho imágenes por consulta. Los personajes reales tienen muchos `SkinnedMesh`, piezas, submallas y materiales con nombres arbitrarios. Elegir cada uno manualmente es inviable.

**Meta MOTION-04E:** el usuario carga un personaje FBX/GLB/VRM y una carpeta/ZIP con todas sus texturas; pulsa **«Analizar personaje completo»** una sola vez. ORBI inspecciona todas las unidades de material, organiza las imágenes en familias, pide asesoría visual local a Qwen cuando el reconocimiento por nombres resulta insuficiente, resuelve coincidencias globales sin conflictos y presenta un plan único. El usuario pulsa **«Aplicar coincidencias seguras»** y revisa exclusivamente el resto.

**No afirmar que se reconstruyó el original si no hay evidencia UV o visual suficiente.** El sistema debe preferir «sin coincidencia fiable» antes que una asignación inventada.

### 2. Preservar lo existente

- MOTION-04A/B: carga/aplicación de color/PBR desde imágenes sueltas y DDS convertido a CanvasTexture exportable.
- MOTION-04C: selección múltiple/carpeta/ZIP, material inventory, `textureAuto.js`, aplicación transaccional, conflictos y deshacer.
- MOTION-04D: conector **Ollama `127.0.0.1:11434`**, descubrimiento `/api/tags`, `/api/chat` con imágenes, capturas de piezas `captureMaterialViews()`, láminas de texturas, validación de JSON, selección manual de modelo y permiso de red local del navegador.
- Mantener visualizador 3D, controles de cámara, animaciones y rig, importación FBX/GLB/VRM, exportación GLB, FBX ligero, VRM/MToon en visualización y ORBI Signature. No reimplementar la base.

**Hechos confirmados por el usuario:** Ollama funciona en su laptop y enumera `qwen3.5:0.8b` y `qwen3.5:2b-q4_K_M`; antes hubo un fallo de conexión por servidor/permisos, posteriormente la API local respondió. No asumir una ejecución real exitosa del análisis global, ni que ambos modelos tengan igual rendimiento visual.

### 3. Alcance inicial

**04E Fase 1:** asignación global de mapas **Color / Albedo / Diffuse** exclusivamente. Filtrar explícitamente normal, NormalDX, roughness, metalness, AO, ORM, alpha, specular, gloss, height, bump y emissive; almacenarlos como grupos relacionados **sin aplicarlos** durante el piloto.

**04E Fase 2 posterior:** extender al conjunto PBR por familias verificadas y canales compatibles, con verificación de normal DirectX/OpenGL, orientación UV, color space, máscaras y materiales especiales. Nunca aplicar un mapa de datos como si fuera color.

**Unidad de trabajo:** `materialSlot` = material concreto (UUID) y conjunto de mallas que lo usan. Una malla puede tener varios materiales; varias mallas pueden compartir el mismo material. No atribuir texturas diferentes a mallas que comparten material sin clonación/split explícito posterior. No alterar pesos ni huesos.

### 4. Experiencia de usuario

1. **Cargar personaje**: mostrar recuento de mallas, materiales, huesos y materiales sin UV.
2. **Cargar carpeta, ZIP o archivos**: lectura local, sin subir a Vercel ni a servidores externos.
3. **Elegir IA local**: `qwen3.5:0.8b` (modo rápido) o `qwen3.5:2b-q4_K_M` (modo más exigente). No afirmar que 2B siempre será mejor; medir calidad y latencia con pruebas reales.
4. Pulsar **«Analizar personaje completo»**: no solicitar al usuario una malla por vez.
5. Mostrar progreso: «Inventario», «Filtrado», «Visión local: 7/24», «Resolución global», «Propuesta lista». Ofrecer **Cancelar** y mostrar resultados parciales sin prometer ejecución en segundo plano.
6. **Plan global** con tres pestañas: «Seguras», «Necesitan revisión» y «No identificadas», además de conflictos, imágenes ignoradas y canales pendientes.
7. **Previsualización**: resaltar/aislar cada material al seleccionarlo en la tabla. Mostrar imagen sugerida, otra alternativa, razonamiento, nivel real de evidencia y advertencia UV.
8. Botones «Aplicar seguras», «Confirmar seleccionadas», «Deshacer lote», «Exportar GLB», disponibles solo cuando su precondición sea válida.
9. **Reutilización opcional en sesión**: memorizar decisiones confirmadas para el mismo personaje+paquete, invalidarlas cuando cambien archivos o geometría. No persistir archivos ni datos sensibles sin autorización.

### 5. Arquitectura de análisis global

```text
Modelo + paquete completo
  ├─ Escáner de materiales, mallas, huesos y coordenadas UV
  ├─ Catálogo de imágenes: tipo, dimensiones, canal, carpeta, familia, miniatura
  ├─ Reglas 04C: referencias explícitas > material > malla > carpeta > alias
  ├─ Filtro global de candidatos por compatibilidad y familias
  ├─ Capturas aisladas + contexto espacial y muestras de UV
  ├─ Cola secuencial Ollama (Qwen 0.8B / 2B)
  ├─ Validador de JSON y evidencias visuales
  ├─ Resolución de conflictos / asignación global
  └─ Plan de revisión → Aplicación transaccional → Exportación verificable
```

#### 5.1 Inventario del modelo
Registrar para cada material: `material.uuid`, nombre, tipo, mallas asociadas, cantidad de objetos, canales ya ocupados, UV disponibles, referencia de texturas original (si accesible), posición relativa y bounding box, zonas visibles y visibilidad. Registrar `SkinnedMesh` sin alterar su pose ni animación.

Capturas: dos perspectivas de la pieza **y una vista contextual** del personaje con la pieza resaltada. Las capturas deben restaurar visibilidad, cámara, luces, material, WebGL target y estado de reproducción en `finally`. Si la malla es demasiado pequeña, inconexa u oculta, marcar «no evaluable» en vez de inventar forma.

#### 5.2 Inventario de texturas
Procesar imágenes válidas `.png/.jpg/.jpeg/.webp/.dds`; conservar `relativePath`, basename, dimensiones, tamaño, canal y patrón de sufijos. Construir familias: `skin_color + skin_normal + skin_roughness` se considera un grupo, pero en fase 1 solo `skin_color` participa en la asignación. Crear miniaturas JPEG pequeñas (no enviar texturas 4K completas).

Se puede calcular color dominante/histograma, presencia de transparencia y rasgos generales, pero **el color parecido no prueba compatibilidad UV ni identidad**. Permitir atlas compartidos y varias zonas del personaje para una textura cuando exista evidencia de atlas/UV o referencias explícitas.

#### 5.3 Poda previa de candidatos
Para cada material construir lista de hasta **8 candidatos de color** usando evidencia determinista 04C, pertenencia a carpeta, tokens y familias; excluir no-color y dimensiones ilegibles. Para nombres completamente arbitrarios, permitir candidatos de diversas familias de forma representativa para no dejar fuera la textura correcta. No limitar el paquete a ocho imágenes: **ocho por consulta**, con rondas adicionales solo cuando sea necesario.

Con imágenes `body_color.png` / `eyes_color.dds` y materiales `material_001`, el filtro no debe inventar coincidencias fuertes. El motor visual evalúa la forma y color, y la UI mantiene estado «revisión» si no existe evidencia adicional.

#### 5.4 Cola multimodal local Ollama
- Una petición `POST /api/chat` por material o grupo inequívoco, **una a la vez**; el botón de inicio es una interacción explícita.
- Modelo por defecto `qwen3.5:0.8b`; opción manual «modo más detallado» `qwen3.5:2b-q4_K_M`.
- Entrada: imagen de la pieza (aislada+contexto), lámina de hasta ocho candidatas numeradas y texto estructurado con identificadores opacos, canales y nombres tratados **solo como datos no confiables**.
- Salida estricta: `{materialId,candidateIndex|null,alternatives:[...],confidence,reason,part}`. Validar cada índice contra la lista ofrecida; no confiar en IDs inventados ni usar el texto del modelo como comandos.
- Por seguridad: `AbortController`, tiempo de espera por petición configurable, una recuperación con lote reducido si es útil, progreso real, cancelación y liberación de recursos; nada se ejecuta asíncronamente fuera de la sesión activa.
- No reenviar más imágenes de las necesarias; no conectar modelos que no estén instalados, no abrir puerto público, no cambiar `OLLAMA_HOST` a `0.0.0.0`, no usar `OLLAMA_ORIGINS=*`.
- Si CORS/permiso de loopback falla, informar que la petición local no se completó y ofrecer diagnóstico, nunca aplicar texturas a partir de una respuesta ausente.
- El modelo pequeño puede confundir piezas y atlas: usar sus respuestas como **evidencia secundaria**, no verdad absoluta ni porcentaje calibrado.

### 6. Resolución de asignaciones globales
Construir una matriz `materialSlot × textureFamily` con puntuación reproducible y procedencia:
- Coincidencia explícita de referencia y UV compatible > evidencia de nombre/carpeta > correspondencia visual > color global.
- Penalizar contradicciones de nombre/carpeta, material ya texturizado, falta UV, múltiples atlas candidatos, mismo canal ocupado y mapas no-color.
- Elegir el mejor conjunto de asociaciones compatible con las restricciones mediante una resolución de conflictos determinista (matching bipartito ponderado u optimización equivalente), **permitiendo que un material quede sin textura**.
- Reutilización de una misma textura en más de un material solo si hay referencia compartida, atlas común demostrado o confirmación del usuario; no prohibir automáticamente el atlas compartido.
- Una textura ya presente debe conservarse por defecto. Ningún lote puede asignar dos imágenes distintas al mismo `material.uuid + channel`.
- No confundir `número de mallas` con `número de materiales`. Si un material compartido necesita dos apariencias incompatibles, marcar «requiere separar/duplicar material» (fuera del MVP).

**Estados de recomendación:**
- **Segura:** referencia exacta inequívoca o evidencia determinista fuerte **corroborada** visualmente, sin conflictos, UV válido, canal libre y margen suficiente contra alternativa. Requiere un clic global «Aplicar seguras»; no autoejecutar al concluir análisis.
- **Revisión:** la IA sugiere una textura por apariencia pero faltan datos UV, hay nombres arbitrarios, conflicto, reemplazo o el 2B/0.8B declara incertidumbre. El usuario confirma por selección múltiple.
- **No identificada:** evidencia débil, imágenes ilegibles, material especial incompatible, UV ausente o modelo responde «ninguna». No aplicar.

**Regla crítica:** una recomendación **solo de Qwen** no se clasifica como «segura» aunque Qwen declare `confidence:"high"`; esa confianza es autodeclarada, no calibrada. Sin evidencia técnica complementaria se queda en revisión. Los umbrales/pesos se calibrarán con personajes reales, no son probabilidades estadísticas.

### 7. Seguridad, corrección y rendimiento
- Análisis nunca muta geometría, materiales, rig, clips ni archivos fuente. Guardar temporalmente decisiones, evidencias y capturas en memoria de la pestaña.
- Aplicación solo mediante `MotionViewer.applyTextureBatch()` existente; respaldar/restaurar estado con rollback al error y «Deshacer último lote».
- Mantener materiales VRM MToon: no convertir a PBR automáticamente durante la fase global.
- Requerir UV válidos pero **reconocer que la mera existencia de UV no prueba el encaje de una imagen**. Evitar prometer retexturizado perfecto; fase futura opcional: comparar atlas, orientación y transformaciones UV en vista previa.
- Límites iniciales sugeridos: máximo 100 slots en sesión de análisis, hasta 300 imágenes del paquete según MOTION-04C, 8 miniaturas por consulta, 1 consulta concurrente, capturas pequeñas y duración finita por consulta; si excede, solicitar división por grupos sin perder progreso de la sesión.
- Evaluar consumo de RAM/VRAM, tamaño de canvas, resultados parciales, `AbortController`, cache con invalidación por material+archivo, liberación de GPU y object URLs; ninguna operación debe congelar la animación 3D.
- Proteger errores de red, JSON mal formado, números fuera de rango, imágenes corruptas, DDS incompatible, timeout y cambio de personaje en mitad de la operación. El cambio de personaje cancela la sesión anterior.

### 8. Plan de implementación en GitHub

**MOTION-04E1 — Inventario global y vista de análisis (sin IA automática):**
- Construir `globalTextureInventory.js` que agrupe material slots y familias de color.
- Extender capturas 04D con contexto espacial y registro de UV, sin editar mallas.
- UI «Analizar personaje completo», tabla con todos los materiales y progreso inicial.
- Tests: 1 material en varias mallas, 1 malla con varios materiales, referencias, nombres arbitrarios, sin UV.

**MOTION-04E2 — Orquestador IA local secuencial:**
- Introducir `globalVisionQueue.js` (cola, cancelación, timeout, reintentos limitados y resultados parciales).
- Reutilizar `ollamaVision.js`, `visionImages.js` y el permiso loopback ya aplicado; consultar todos los materiales sin interacción individual.
- Opción 0.8B / 2B y mediciones por modelo; no garantizar superioridad del 2B.
- Tests con API simulada: 10/50 materiales, cancelación, fallos intermedios, respuesta «ninguna», latencia, selección de candidato e invalidación.

**MOTION-04E3 — Resolución global y aplicación segura:**
- Matriz de puntuaciones, conflictos, atlas compartidos, familias y alternativas.
- Reporte global «Seguras / Revisar / No identificadas» y explicación legible por decisión.
- Un clic «Aplicar seguras», confirmación múltiple de revisión, deshacer y comprobación de materiales.
- Tests de conflictos, atlas, material compartido, textura existente y ausencia de asignación.

**MOTION-04E4 — QA real y congelación:**
- Probar con al menos **dos personajes distintos**: un FBX fragmentado de numerosos materiales y un GLB/VRM de referencia con rig y clips.
- Probar carpeta/ZIP real con DDS y texturas de familias PBR; verificar que solo color se aplica en esta fase.
- Reproducir clips antes/después, exportar GLB y reimportar: mallas, huesos, canales y animaciones conservados según garantías del exportador.
- Documentar exactitud observada de asociaciones, revisiones, tiempos y recursos **medidos**, sin cifras inventadas.
- GitHub Actions 2/2 PASS, build y pruebas; Vercel READY; mantener PR #1 draft, **no fusionar `main`** sin revisión visual.

### 9. Pruebas de aceptación obligatorias
1. «Cargar personaje + carpeta + Analizar» produce tabla completa sin pedir elegir malla por malla.
2. Materiales genéricos `Material001` a `Material040` se analizan visualmente o se marcan sin propuesta; nunca se inventa confianza alta por nombre.
3. Escena con 40 mallas y 12 materiales compartidos muestra **12 unidades principales**, no 40 aplicaciones redundantes.
4. `Eye_L` y `Eye_R` o dos prendas similares no reciben una misma textura indiscriminadamente; reportar ambigüedad.
5. Atlas UV único y material compartido mantienen asignaciones compatibles, o se marcan para revisión.
6. Qwen no devuelve ningún candidato → «sin propuesta»; jamás asignar por defecto la primera textura.
7. Caída de Ollama, CORS, cancelación o timeout → conservar modelo, no mutar, reintento manual disponible.
8. 8 candidatas por consulta, con paquetes >8 texturas: el sistema considera el conjunto completo mediante preselección/rondas.
9. Los mapas normal/roughness/metal/ORM no se confunden con albedo.
10. Tras aplicar un lote y deshacer, se recuperan texturas previas, sin alterar huesos, pesos ni clips.
11. Exportar y reimportar GLB verifica presencia de texturas y estructura/animaciones; registrar límites reales de VRM/MToon/FBX beta.
12. UI muestra recuentos de analizadas, seguras, revisión, sin propuesta y fallos, sin ocultar diferencias.

### 10. Fuera de alcance y decisión de producto
No generar nuevas texturas ni UV automáticos, no pintar texturas, no refactorizar pesos/esqueleto, no retargeting ni conversiones avanzadas spec/gloss, no exportar VRM/VRMA nativos, no transferir modelos completos a la nube, no prometer identificación perfecta con IA pequeña.

**Decisión:** avanzar con arquitectura híbrida **nombres/referencias + visión local + optimizador global + validación humana**, conservando la fiabilidad del importador. La experiencia final debe ser **«una sola orden para analizar todo el personaje, una sola acción para aplicar las coincidencias seguras y revisión únicamente de las excepciones»**.

### Actualización de ejecución — 03-11-2026

- E1: `src/lib/globalTextureInventory.js` inventaría materiales, mallas compartidas, mapas de albedo, imágenes no-color y familias; genera rondas completas de candidatas con límites preventivos.
- E2: `src/lib/globalVisionQueue.js` ejecuta el análisis visual local de forma secuencial, con cancelación, timeout, comparación de finalistas, resultados parciales y rechazo visible cuando Ollama no responde.
- UI: `src/GlobalTextureAI.jsx`, integrada en `src/OllamaTextureAI.jsx`, expone «Analizar personaje completo», progreso, tabla y aprobación humana en lote; el modo individual anterior sigue disponible.
- Seguridad: se utiliza la aplicación transaccional MOTION-04C. No se autoaplican texturas elegidas exclusivamente por IA.
- Verificación: GitHub Actions 2/2 PASS, Vercel preview READY; validación manual con FBX + carpeta/DDS real sigue pendiente. Las capturas disponibles aún son las dos vistas aisladas de MOTION-04D; vista contextual/UV más avanzada aplazada para E3.
- Esta actualización NO implica que MOTION-04E3/04E4 estén terminados. `main` sigue protegida y PR #1 en borrador.
