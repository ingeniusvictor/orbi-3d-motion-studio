# ORBI INTEGRATION-01 · MOTION-06 + VIEWER-COMPAT-01

## Objetivo

Consolidar los desarrollos paralelos que nacieron **ambos** de la misma base
`feat/autorig-02f-control-bone-binding`, sin modificar la rama original de
ninguno de los equipos:

- [PR #12 MOTION-06](https://github.com/ingeniusvictor/orbi-3d-motion-studio/pull/12),
  `feat/motion-06-lumia-mixamo-retarget-profiles`: adaptación Mixamo de los
  perfiles LUMIA Original 155 y adulta D162 al V06B de 346 huesos;
  panel web experimental, corrección de pelvis y punta de pies;
  envoltorio de motores Golden Python y pruebas.
- [PR #13 VIEWER-COMPAT-01](https://github.com/ingeniusvictor/orbi-3d-motion-studio/pull/13),
  `feat/viewer-compat-01-universal-import`: vista de modelos GLB/FBX sin
  animaciones, diagnóstico del encuadre y skinning, codecs glTF,
  visualización adicional OBJ/STL/PLY/DAE/3DS y pruebas.

**Regla:** el GLB de Claude, los FBX de Mixamo, los clips Golden y el rig
maestro son archivos **de solo lectura** durante importación y vista previa.
No añadir una animación artificial al GLB maestro para forzar su visualización.

## Estrategia de merge

Rama de integración: `feat/integration-motion06-viewercompat01`.

Se partió de VIEWER-COMPAT-01 porque su refactor del cargador incluye la
conexión de codecs y los diagnósticos del modelo estático. Luego se integraron
los archivos nuevos de MOTION-06, el paso de pruebas Python y, **de forma
puntual**, sus cambios en los archivos compartidos `src/App.jsx` y
`src/lib/viewer.js`. No se sustituyó ninguno de esos dos archivos con su
versión completa de la otra rama.

Los métodos `addLumiaMixamoRetarget` y `addAnimations` continúan separados:
el primero es experimental, bajo control explícito del usuario, para dos
perfiles LUMIA conocidos; el segundo valida coincidencia exacta de rig. La
carga visual también permanece separada del retargeting.

### Funcionalidades verificadas en el código

1. **Visualización** de GLB, glTF, FBX, VRM, OBJ(+MTL), STL, PLY,
   Collada DAE y 3DS (subconjuntos reconocidos por Three.js).
2. **GLB estáticos con esqueleto y sin clips:** conservar vista y facilitar
   diagnóstico, sin modificar mallas, pesos, huesos ni materiales.
3. **Decodificación glTF** de Draco, Meshopt y KTX2/Basis con assets
   locales de Three.js.
4. **Panel MOTION-06** para retarget controlado LUMIA Original 155/D162 →
   346 huesos, sin sustituir clips previos, con opciones de pivote y pies.
5. **Editor AUTORIG-02F** de movimiento ya importado, con panel flotante
   y controles Arms/Look/Arm-Space/Overdrive/Trim.
6. **Ejecutor Python Golden** conservado literalmente desde PR #12.
7. **Pipeline CI** que incluye test JS, comprobaciones Python y Vite build.

## Evidencia y límites

Las pruebas automáticas incluyen importaciones de código, formatos, glTF
estático y motor de retarget. No constituyen certificación de que el FBX/GLB
artístico de LUMIA V09 se vea y se anime correctamente en el dispositivo
real; tampoco certifican paridad visual del algoritmo web MOTION-06 respecto
a Python Golden V4.

Por eso **no fusionar a main** hasta completar QA con los archivos reales.

## Protocolo local recomendado

1. Actualizar a la rama unificada en una carpeta de laboratorio diferente;
   dejar intactas las demás ramas y servidores de prueba.
2. Abrir `LUMIA_V09_CLAUDE_ORGANIC_FUSION_CANDIDATE.glb` original (0 clips).
   Debe verse completo en reposo. Usar botón `ⓘ Diagnosticar visualización`
   para inspeccionar mallas, skins, cámara y clips.
3. Abrir `LUMIA V06B` riggeada de 346 huesos, con sus clips originales.
   Confirmar que persisten peso, facial y controles AUTORIG-02F.
4. Abrir el panel separado `MOTION-06`, cargar FBX de origen auténtico
   LUMIA 155 y D162 uno por vez. Comparar tiempos, pivote de pelvis,
   puntas de pies y clips Golden Python certificados.
5. Comprobar que el nuevo clip se agrega a la biblioteca sin borrar los
   anteriores. Editar movimiento en el panel flotante si es necesario.
6. Exportar una copia GLB, reimportarla y auditar clips, texturas, piel
   y todos los morph targets.
7. Volver a probar un FBX animado y un OBJ/PLY para detectar regresiones.

En caso de diferencia de orientación/escala/retarget, conservar
el motor Python Golden como la referencia y NO marcar el adaptador web
como equivalente sin pruebas comparativas.

## Estado

Integración de código y pruebas automáticas logradas.
Validación artística final en Chrome con V09 y equivalencia Golden **pendientes**.
Los PR #12 y #13 permanecen independientes.
