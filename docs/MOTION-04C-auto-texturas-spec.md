# CONTINUIDAD OFICIAL — ORBI 3D MOTION STUDIO
## MOTION-04C · Autoaplicación inteligente de texturas — Especificación funcional v1.0
Fecha: 2026-11-03 · Estado: **especificación aprobada para desarrollo; funcionalidad aún no implementada**
Repositorio: https://github.com/ingeniusvictor/orbi-3d-motion-studio
Rama de desarrollo: \`feat/motion-01-viewer-inspector\` · \`main\` protegida.

### 1. Objetivo
Permitir cargar un personaje FBX, GLB o VRM y **una colección de imágenes externas** para reconocer, agrupar, proponer y aplicar en lote las texturas correctas a sus materiales, con una sola confirmación para coincidencias inequívocas. No alterar la malla, el rig, sus huesos, pesos, visemas, clips ni el archivo original.

La “inteligencia” de v1 se basa en reglas deterministas verificables, sin API paga, cuenta, IA generativa ni procesamiento en servidores.

### 2. Base existente que se debe conservar
- \`src/lib/textureStudio.js\`: lectura de materiales, UV, canales, sugerencia simple de coincidencia por nombres y aplicación a materiales.
- \`src/lib/ddsTexture.js\`: importación DDS comprimidos convertidos localmente a textura exportable (con límites ya establecidos).
- \`src/TextureStudio.jsx\`: selección múltiple de PNG/JPG/WebP/DDS y asignación manual/sugerida.
- \`src/lib/viewer.js\`: unión de texturas al modelo en memoria, visor FBX/GLB/VRM, animaciones y exportación GLB.
- Conservación de MOTION-03B/03C para FBX riggeado ligero; MOTION-02E/02G para VRM y animaciones. No rehacer estos módulos.

### 3. Alcance y entradas
Entradas admitidas: archivos de imagen individuales, múltiples archivos, carpeta seleccionada por usuario (cuando el navegador permita \`webkitdirectory\` o mecanismo equivalente), carpeta arrastrada (cuando soporte APIs de entrada de directorio) y ZIP con imágenes. Reconocer \`.png\`, \`.jpg\`, \`.jpeg\`, \`.webp\` y \`.dds\` compatibles con el decodificador actual. Conservar \`relativePath\` cuando esté disponible; resolver referencias por basename normalizado más contexto de carpeta.

**Límite de acceso:** la web solo puede leer lo que el usuario seleccione o arrastre; nunca explorar automáticamente directorios del PC a partir de una ruta guardada en FBX.
**ZIP:** descomprimir solo imágenes candidatas en memoria, bloquear rutas absolutas, \`..\`, archivos con contraseña, tamaños inesperados y bombas ZIP; no interpretar scripts ni ejecutables. Topes iniciales ajustables: 300 archivos de imagen, 250 MB comprimidos por paquete, 500 MB descomprimidos, 50 MB por imagen; respetar el límite actual de DDS de 4096×4096 píxeles. Mostrar errores claros.

### 4. Experiencia de usuario (un solo flujo)
1. **Cargar personaje** (ya existe). Mostrar número de mallas, materiales, canales existentes y materiales sin UV.
2. **Agregar texturas**: botones “Elegir imágenes”, “Elegir carpeta”, “Importar ZIP” y zona “Arrastrar paquete”.
3. **Analizar automáticamente**: leer nombres/rutas explícitas presentes en el modelo, nombres de materiales y mallas, jerarquía de carpetas, convenciones de mapas y metadatos accesibles. Generar un plan de asignación sin modificar el modelo.
4. **Revisar resultado** por tres grupos: “Listas para aplicar”, “Requieren confirmación”, “Sin coincidencia”. Para cada propuesta: imagen, miniatura, material/malla, canal, nivel de confianza, motivo legible y posibles conflictos.
5. **Botón principal “Aplicar coincidencias seguras”**: un clic aplica todas las propuestas inequívocas, sin necesidad de elegir archivo por archivo. No modificar automáticamente las ambiguas. Ofrecer “Confirmar seleccionadas” para las medias y asignación manual para las bajas.
6. **Verificar** en el visor antes/después; mostrar resumen y permitir “Deshacer última aplicación de lote”.
7. **Exportar GLB con materiales**, con o sin animaciones; reabrir y comprobar texturas y clips antes de considerar la exportación correcta. FBX binario permanece beta y puede requerir texturas externas; VRM/VRMA nativo no se promete.

### 5. Motor de matching MOTION-04C
Trabajar con registros \`TextureCandidate\` y \`MaterialSlot\` identificados por rutas relativas, \`material.uuid\`, \`mesh.name\`, canal y existencia de UV; evitar duplicados de nombres procedentes de carpetas diferentes.

Prioridad de evidencias:
- **A. Referencia explícita del modelo**: nombre/ruta de textura incluida en material FBX o en su objeto de textura (si la librería conserva esa referencia), comparada de forma normalizada, ignorando rutas absolutas del disco. Confianza máxima, si no es ambigua.
- **B. Nombre de material**: coincidencia exacta de tokens y canal (\`Body_BaseColor\` → material Body + albedo).
- **C. Nombre de malla o grupo**: coincidencia inequívoca del conjunto de mallas referenciadas por el material.
- **D. Carpeta y set**: \`textures/body/normal.dds\` o familias \`Body_Albedo\`, \`Body_Normal\`, \`Body_Roughness\`.
- **E. Similaridad débil**: tokens próximos, abreviaturas o alias; solo sugerencia para revisión.

Normalización: minúsculas, Unicode normalizado, espacios/guiones/guiones bajos, prefijos genéricos (tex, mat, mesh), números de versión seguros; nunca eliminar información distintiva (\`body01\` frente a \`body02\`).

Reconocer: \`albedo|basecolor|diffuse|color\`→map; \`normal|nrm|normalgl\`→normalMap; \`roughness|rough\`→roughnessMap; \`metallic|metalness\`→metalnessMap; \`ao|occlusion\`→aoMap; \`emissive|emission\`→emissiveMap; \`alpha|opacity\`→alphaMap; \`orm|arm\`→mapa combinado AO/Roughness/Metalness (R/G/B); \`normalDX\`, \`gloss\`, \`spec\`, \`bump\` requieren revisión o transformación explícita, jamás tratarlos como normales PBR por defecto. Comprobar orientación de normales y coordenadas UV.

Confianza de ejemplo (ajustable y calibrada mediante fixtures, NO probabilidad estadística):
- **Alta ≥90/100:** referencia explícita única o coincidencia material+malla+canal inequívoca; diferencia ≥15 puntos frente al siguiente candidato, UV válido, canal soportado, sin sobrescribir material existente. Aplicable con un solo clic de lote.
- **Media 65–89:** alias o contexto indirecto, diferencia insuficiente, múltiples candidatos plausibles. Confirmación en resumen.
- **Baja <65:** sin relación fiable, canal desconocido, falta UV, material especial incompatible, conflicto, duplicado o ambigüedad. Dejar en revisión manual o informar bloqueo.

Un material/canal solo recibe una textura candidata de manera predeterminada. Si ya existe una textura, elegir por defecto **conservarla** y presentar la sustitución como acción separada. Si una imagen corresponde a varios materiales compartidos, se puede proponer la misma imagen solo si los materiales son inequívocamente equivalentes.

### 6. Procesamiento, seguridad y reversión
- Primero análisis/preview: **ninguna mutación mientras se calcula el plan**.
- Aplicación en lote con registro de estado anterior por \`material.uuid\` + canal (y transformación PBR si procede). Revertir el lote completo si falla un elemento de alta confianza, o mostrar éxitos/fallos parciales y ofrecer “Deshacer lote” de forma atómica; no dejar el estado silenciosamente mezclado.
- Las imágenes procesadas, Blob URLs y GPU Textures se liberan al cambiar modelo o revertir cambios. No reutilizar un \`material.uuid\` obsoleto tras conversiones PBR.
- Proteger SkinnedMesh, Bone, Skeleton, inverseBindMatrices, morph targets, clips y tiempos de animación. No realizar rigging ni retargeting.
- Materiales MToon de VRM: no convertir automáticamente; solo canales reconocidos por su material. Mostrar “requiere revisión” para incompatibles.
- Usar \`SRGBColorSpace\` para color/emisión y \`NoColorSpace\` para datos. \`flipY\` de acuerdo con origen FBX o glTF/VRM.
- Cada coincidencia conserva **trazabilidad**: motivo, nombres comparados, canal y fuente de archivo.

### 7. Interfaz ORBI Signature
Panel “Texturas inteligentes” dentro del visor:
- Entradas: [Cargar imágenes] [Seleccionar carpeta] [Importar ZIP].
- Acciones: [Analizar paquete] [Aplicar coincidencias seguras] [Revisar ambiguas] [Deshacer lote].
- Resumen de estado: “Detectadas N · Seguras A · Revisión B · No reconocidas C · Aplicadas D”.
- Tabla de propuestas con miniatura, imagen, material, mapa, nivel, explicación y decisión del usuario.
- Vista previa del resultado, materiales faltantes y alertas por UV o compresión DDS.
- Mantener flujo manual existente, diseño ORBI y tutorial desplegable para principiantes.

Mensajes orientativos:
- “Se encontraron 12 imágenes: 8 listas para aplicar, 3 por confirmar y 1 sin coincidencia.”
- “Body_Normal.dds → Body / Normal (alta; nombre del material y canal coinciden).”
- “No se aplicó Eye_Diffuse.png: hay dos materiales Eyes posibles.”
- “No se pudo asociar Skin_AO.png: la malla no tiene UV para esa textura.”
- “Cambios revertidos; el modelo original permanece intacto.”

### 8. Validación y criterios de aceptación
Tests unitarios de nombres, rutas, Unicode, material/malla, canales DDS y PBR, colisiones, sobrescritura, referencias explícitas, normalDX/spec/gloss, materiales sin UV, subcarpetas y ZIP malicioso.
Pruebas de integración:
1. FBX con \`Body_BaseColor.png\`, \`Body_Normal.dds\`, \`Hair_Albedo.png\` y materiales Body/Hair: clasificación alta y aplicación en lote correcta.
2. Materiales \`Eye_L\` y \`Eye_R\` con textura \`Eye_Color\`: **no** autoaplicar por ambigüedad.
3. Carpeta y ZIP con idénticos nombres de imagen en subdirectorios distintos: conservar el contexto, sin asignaciones cruzadas.
4. FBX/GLB estático sin animaciones: GLB exportado con texturas reimportable.
5. FBX/GLB animado: mallas, huesos y clips no cambian al aplicar texturas; GLB final reimportable.
6. VRM con MToon: no conversiones silenciosas ni pérdida de funciones en el modelo de trabajo.
7. DDS comprimido conocido y DDS no compatible: aplicación correcta o rechazo con mensaje útil.
8. Deshacer: restaura mapas/materiales previos sin cambiar rig.
9. Carga grande y ZIP sospechoso: límites, error visible y limpieza de recursos, sin bloqueo permanente.

**Definition of Done:** 0 regresiones en pruebas existentes; compilación/lint/CI PASS; preview Vercel READY; prueba manual con al menos un FBX real y paquete de texturas; captura del resumen de asociaciones; exportar/reimportar GLB y verificar mapas y animaciones; PR permanece draft hasta certificación. Sin despliegue directo a \`main\`.

### 9. Entregas acotadas
- **MOTION-04C1 (MVP):** matching mejorado, niveles de confianza, vista de propuesta, un clic seguro, conflictos, deshacer lote. Se apoya en selección múltiple ya existente.
- **MOTION-04C2:** selección de carpeta, arrastrar carpetas y ZIP con límites, rutas relativas y deduplicación; guía paso a paso.
- **MOTION-04C3:** perfiles opcionales de nombres, diagnósticos de canales específicos, auditoría de exportación y QA con archivos reales.

### 10. No objetivos
No buscar archivos en el PC sin permiso, no crear UV ni corregir geometría, no transformar automáticamente spec/gloss o normalDX, no rigging/retargeting, no exportación VRM/VRMA nativa ni garantía universal de texturas FBX embebidas, no procesamiento en backend de pago.

**Regla de protección:** congelar y preservar lo ya funcional del visor, animaciones, integración FBX, puente VRM, FBX ligero, DDS y exportación GLB. Los cambios de MOTION-04C se realizan como mejoras incrementales, con regresiones.
