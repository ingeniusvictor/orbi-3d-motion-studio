# AUTORIG-02D · Editar y volver a exportar un personaje YA riggeado

## Problema del usuario

El usuario abrió en ORBI un personaje **ya riggeado y con una animación** (en sus capturas de Mixamo aparecía LUMIA V06B con *Snake Hip Hop Dance*). AutoRig 02C.4 mostró “Este modelo ya contiene huesos” y bloqueó su editor, porque ese flujo está limitado a personajes sin rig.

La petición: poder cargar personajes ya riggeados/animados, corregir los movimientos —p. ej. manos que atraviesan las piernas durante un baile— con controles de separación y amplitud, **descargar un personaje nuevo con la animación modificada**, sin volver a riggear ni borrar pesos/texturas.

## Implementación de AUTORIG-02D

**Dos modos en AutoRig Studio:**

1. **Crear rig**: GLB estático sin huesos/animaciones → 22 marcadores → 19 huesos → skinning experimental y QA. El gate existente sigue protegiendo este modo.
2. **Editar animaciones existentes**: modelo con huesos y clips → panel AUTORIG-02D, independiente de marcadores y skinning. Se aplica la edición a una copia del clip seleccionado dentro de la biblioteca activa de ORBI. El esqueleto, la malla, materiales, pesos, geometría y las demás animaciones no se modifican.

**Controles:**
- Elegir entre todas las animaciones que trae el archivo o clips añadidos mediante el sistema de biblioteca.
- Detectar por nombre los huesos de brazo izquierdo, brazo derecho y cabeza; seleccionar manualmente los correctos si no se reconocen.
- **Character Arm-Space 0–100 (neutro 50)**: rotaciones de apertura alrededor de Z mundial, convertidas a los ejes locales mediante los cuaterniones de los padres en pose de reposo.
- **Arms 0–150 % (neutro 100)**: escala de amplitud del movimiento respecto al cuaternión local de reposo de cada hombro, NO respecto a la identidad, evitando perder la orientación original del rig.
- **Look 0–100 (neutro 50)**: desplazamiento aproximado de giro de cabeza ±25°.
- **Overdrive 0,25–2 (neutro 1)**: se hornea en el tiempo del clip para persistir en el GLB exportado; es independiente del control general de velocidad del visor (que solo afecta la vista previa).
- **Trim**: recortar inicio/fin del clip con remuestreo de todos los canales, incluidos traslación de caderas, escala y expresiones. Se conserva al menos 5% de la duración.
- **Mirror (experimental)**: reflejo de rotaciones y posiciones X, intercambio de nombres Left/Right cuando existe contraparte. No equivale al Mirror original de Mixamo.
- **Restaurar movimiento original**, reproducción, pausa, control de tiempo fotograma a fotograma.
- **Exportar personaje con animación corregida (GLB)**: usa el exportador de ORBI con la biblioteca de clips actual. El nombre de salida terminado en `-orbi-motion-edited.glb` evita sobrescribir la fuente. Se reimporta el GLB binario automáticamente para detectar errores.

**Seguridad y límites:**
- Nunca usar AutoRig 02A/B/02C para reemplazar un personaje que ya tiene rig.
- Las pistas no afectadas, incluidos transformaciones de caderas, espina y canales secundarios, se conservan; los clips que no se editaron permanecen en la biblioteca.
- Se trabaja sobre `AnimationClip` nuevos sin editar los originales. Restaurar ajustes devuelve el clip original.
- El mapeo se limita inicialmente a brazos y cabeza. Si no se reconocen, la UI pide asignarlos; no se hace “retargeting” genérico ni pintura de pesos.
- Mixamo puede tener huesos con nombres que contengan ':' o '|', reservados en rutas Three.js. Para evitar que el motor de animación o GLTFExporter omita canales, el clip editado referencia esos huesos por UUID. El original sigue intacto.
- La separación de brazos NO detecta colisiones físicas y puede aumentar penetraciones en otras regiones; comprobar visualmente desde varios ángulos.
- No se promete exportar un archivo `.vrm`: VRM solo permite conversión a GLB estándar aproximado tras confirmación explícita; el usuario debe revisar materiales, expresión, física y metadata.
- El flujo puede abrir modelos FBX y exportar GLB si la conversión y comprobación son válidas. El editor no sobrescribe fuentes FBX.
- Los parámetros no se almacenan en el GLB como metadatos de edición: se conservan los fotogramas modificados en el clip.

## Protocolo manual de prueba con LUMIA real

1. Abrir la nueva rama en `ORBI-AUTORIG-02C-LAB` con el mismo servidor local.
2. Cargar el **modelo animado ya riggeado** (GLB/FBX) tal como está, SIN descargar ni cargar un GLB sin rig.
3. Ir a **AutoRig Studio → AUTORIG-02D · Editor de animaciones existentes**, disponible a pesar del aviso de que el modelo contiene huesos.
4. Elegir `Snake Hip Hop Dance` u otra animación.
5. Comprobar las etiquetas de los huesos (brazo izq./der./cabeza); corregirlas manualmente si es necesario.
6. Reproducir y pausar justo donde las manos cruzan las piernas. Arrastrar el tiempo para mirar la intersección precisa.
7. **Character Arm-Space** 50→65→75, **Arms** 100→90→80, revisar frente/perfil/espalda. Cambiar velocidad de exportación con Overdrive si es necesario.
8. Exportar GLB modificado. Debe tener el nombre del personaje fuente + `-orbi-motion-edited.glb`.
9. Reimportarlo en ORBI como archivo nuevo. Comprobar número de mallas, huesos, texturas y clips; seleccionar la misma animación y verificar que la corrección persiste.
10. Restaurar movimiento original y comprobar que el archivo fuente nunca se altera.

## QA automatizada

- Detección de huesos Mixamo, captura de bind/rest y asignación manual segura.
- Modificación de cuaterniones de ambos brazos y cabeza, conservando traslaciones de caderas y pistas ajenas.
- Reproducción real con `THREE.AnimationMixer` sobre un `THREE.SkinnedMesh`, comprobando que el cálculo no altera `skinIndex` ni `skinWeight`.
- Protección para nombres con namespace Mixamo, y para ajustes rechazados.
- Restauración original por clip.
- Exportación **binaria real** con `GLTFExporter`, reimportación `GLTFLoader`, conservación de malla skinned, cantidad de huesos y pistas animadas.
- Alcance pendiente: inspección con el archivo real LUMIA, incluyendo materiales, ropa y restricciones de colisión.

PR en borrador hasta la prueba humana con un GLB real existente.
