# AUTORIG-02C.2 · Inspector visual de pesos por hueso

**Estado:** piloto no certificable en `feat/autorig-02c2-weight-inspector` (derivado de `feat/autorig-02c-native-skinning-pilot`). Ningún cambio a `main`; este incremento no exporta GLB/VRM/FBX.

## Lo implementado

- Desplegable de huesos del rig temporal. Para cada hueso, muestra cuánto influye en los vértices del personaje.
- Leyenda de colores: azul oscuro = 0, azul = bajo, verde/cian = intermedio, amarillo = alto, rojo = influencia cercana a 1.
- Conteo de vértices influidos (>0.001) y fuertemente influidos (>=0.5), independiente del desplazamiento geométrico.
- El cambio a modo diagnóstico utiliza `MeshBasicMaterial` en las copias `THREE.SkinnedMesh` y atributos de color en las geometrías clonadas.
- Opción **Apariencia original (sin mapa)**: restituye los materiales originales clonados.
- Desmontar el piloto descarta mallas, materiales, atributos y buffers temporales; la escena fuente y archivo GLB no cambian.

## Interpretación responsable

Los colores describen únicamente pesos calculados por proximidad. No identifican anatomía correcta, topología de ropa, tejidos o articulaciones. Un hueso puede influir en vértices no deseados de cara, cabello, falda o partes opuestas del cuerpo, incluso si los pesos suman 1.

### QA humano con LUMIA 50K

1. Cargar `lumia 50k.glb` sin esqueleto y abrir el JSON de marcadores guardado por el usuario.
2. Generar el rig de 19 huesos y el skinning experimental.
3. En **Mapa de pesos por hueso**, elegir `leftLowerArm`. Esperado: la influencia más alta debería estar cerca del antebrazo izquierdo, no en la cara, muslo ni antebrazo derecho.
4. Repetir para `rightLowerArm`, `leftUpperLeg`, `rightUpperLeg`, `head`, `neck` y `chest`.
5. Aplicar flexiones de 10°, 25°, 45° en X/Y/Z con la vista normal y con el mapa de pesos. Anotar qué parte se deforma incorrectamente.
6. Elegir apariencia original y restaurar T-Pose; cerrar el skinning. Confirmar que el GLB original mantiene apariencia, geometría, texturas y rig anterior si corresponde.

### Límites

- Las zonas con influencia cercana a cero no quedan transparentes: aparecen azul oscuro.
- Sin editor de peso/pincel todavía. No cambiar ni sobrescribir el archivo GLB del usuario.
- Por seguridad el piloto no procesa personajes con rig existente o morph targets.
- No certificar el modelo hasta una validación visual real y ajuste de pesos con mallas originales.
- Las pruebas automatizadas validan únicamente cálculos, buffers, conservación de copias y compilación. No sustituyen QA ocular real.

## Siguiente fase

AUTORIG-02C.3: restricciones de rama anatómica por región + herramienta de corrección dirigida, auditoría por malla, preservación de texturas y validación de deformación. Solo después plantear exportación GLB reversible.
