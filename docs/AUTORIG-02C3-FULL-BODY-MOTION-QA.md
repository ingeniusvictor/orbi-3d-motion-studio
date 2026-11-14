# AUTORIG-02C.3 — Evaluación dinámica con movimiento corporal completo

## Objetivo y estado

El usuario confirmó que LUMIA 50K se deforma con el piloto de 19 huesos, pero flexionar un hueso por vez no permite juzgar la calidad del rig. Este cambio agrega secuencias de **movimiento simultáneo** y un importador de animaciones **Mixamo** a través del navegador. Rama aislada `feat/autorig-02c3-mixamo-motion-qa`, derivada de AUTORIG-02C.2; no se modifica `main`.

**El proyecto continúa siendo una prueba de skinning, no un GLB final riggeado.**

## Herramientas disponibles

### Animaciones de diagnóstico originales ORBI

La vista experimental inicia automáticamente una **marcha en el sitio**. También incluye **sentadilla y brazos** y **saludo y giro**. Son clips hechos en código, independientes de sitios externos y sin requerir descargas. Se animan simultáneamente cadera, columna, brazos, rodillas y pies.

### Importar una animación real de Mixamo

1. Abrir `https://www.mixamo.com/` con Adobe ID. El portal y sus animaciones se usan conforme a las condiciones de Adobe.
2. Elegir un personaje y un movimiento como **Walking**, **Running** o **Dancing**. No hace falta subir LUMIA: queremos únicamente el clip de movimiento.
3. Seleccionar **Download**. Preferir **FBX**, **Without Skin**; si hay opción de **In Place**, usarla para marcha sobre el mismo punto.
4. Volver a ORBI, cargar `lumia 50k.glb` y el `lumia 50k-orbi-autorig02.json` de marcadores.
5. Generar esqueleto, activar la vista de skinning y ubicar **AUTORIG-02C.3 · Animación corporal completa**.
6. Clic en **Importar animación Mixamo (.fbx o .glb)**; seleccionar el archivo descargado. El análisis se ejecuta localmente; no se sube a GitHub ni a servidores.
7. Seleccionar el clip importado, reproducir/pausar, controlar velocidad (0.25×–2×), recorrer el timeline; orbitar la cámara con la opción **Cámara libre** del editor.
8. Examinar hombros, torso, axilas, codos, cintura, rodillas, tobillos, cabello, ropa y ojos al caminar/girar/agacharse. Comparar con el mapa de pesos por hueso de la fase anterior.
9. Pulsar **Restablecer T-Pose** y después cerrar la prueba. El GLB inicial nunca se sobrescribe.

### Sobre la adaptación

- La transferencia de movimiento busca nombres de huesos estándar Mixamo, incluidos prefijos como `mixamorig:` y `mixamorig`.
- Los cuaterniones se transforman según la orientación del esqueleto fuente en reposo y las orientaciones locales neutras del esqueleto ORBI. Los datos de rotación no se copian directamente de un rig ajeno.
- La **traslación de caderas/raíz se omite intencionadamente**. La animación queda in-place. El ciclo muestra el movimiento de articulaciones, pero no prueba desplazamiento ni apoyo exacto de pies.
- El esqueleto ORBI tiene solo 19 huesos: Mixamo suele incluir más, de modo que los dedos, `Spine2` adicional y otras articulaciones se omiten; por ello la retargetización es aproximada.
- No se incorporan animaciones Mixamo al repositorio. Las clips se abren desde archivos locales aportados por el usuario.
- Rechazar FBX con jerarquía incompatible, pistas inválidas, huesos ausentes, clips demasiado grandes o sin suficientes canales.
- La importación FBX/GLB real y la apariencia animada sobre LUMIA 50K **requieren prueba en navegador con archivos reales**. Las pruebas automáticas solo acreditan reconstrucción de poses sintéticas y compilación.

## Criterios de aceptación visual

| Zona | Comportamiento esperado | Defecto observable |
|------|------------------------|--------------------|
| Hombros y axilas | Brazo sigue la articulación sin arrastrar el pecho | Manga/tórax se estiran al caminar |
| Codos | Antebrazo gira con curva continua | Pliegues angulosos, pérdida de volumen |
| Caderas | Movimiento integrado, sin piezas separadas | Costuras o pelvis giran en dirección errada |
| Rodillas | Muslo y pantorrilla siguen un movimiento coordinado | Rodilla colapsa o pierna se estira |
| Tobillos | El pie no se desprende durante el ciclo | Deformaciones de punta o zapato |
| Cabeza y cuello | Acompañan torso sin arrastrar malla facial | Pelo/ojos/tórax influidos por hueso incorrecto |

## Limitaciones y próximos pasos

1. Inspección por regiones y corrección de pesos de mallas separadas.
2. Compatibilidad con un rig anatómico adicional donde necesitemos apoyo más realista, dedos, expresión y respiración.
3. Opcional: retarget más completo de `Spine2`, cadera con root motion y constraints para pies.
4. **Solo tras QA real**: crear candidato GLB, reimportarlo y probar movimientos antes de habilitar exportación final.

## Prueba automática

Los fixtures THREE de Mixamo simulan un esqueleto con 19 nombres, transformaciones de bind rotadas y clips con 19 canales, para comprobar que la adaptación mantiene una referencia de reposo neutral y produce movimientos simultáneos. También se prueban los tres movimientos originales y validadores de archivo y jerarquía.
