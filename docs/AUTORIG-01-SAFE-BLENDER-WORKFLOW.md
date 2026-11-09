# ORBI AutoRig Studio — AUTORIG-01 (CPU / Blender)

## Estado

**MVP experimental implementado** en `feat/autorig-01`. Está deliberadamente separado de LUMIA V6/V7/V8, de `main` y de los módulos de animación existentes. No es una clonación de los 488 huesos de Mint ni una versión terminada de Mixamo. **Blender real + modelos reales aún requieren QA manual.**

Esta primera ruta se centra en **personajes humanoides GLB autocontenidos, sin huesos, sin animación, erguidos y preferiblemente en T-Pose**. Su motor inicial es un rig de **19 huesos corporales**. No genera dedos, expresiones faciales, huesos de cabello ni retargeting; estas son fases futuras.

**Por qué Blender y no Three.js:** Three.js se usa para visualizar/inspeccionar el archivo sin modificación. Blender realiza el cálculo de pesos y el export. Se preserva el archivo fuente y se exige reimportación real de GLB/FBX para detectar discrepancias severas.

## Uso en Windows / PowerShell

1. En ORBI 3D Motion Studio, carga un GLB estático sin rig. El nuevo panel **AutoRig Studio** te indicará si cumple las condiciones generales.
2. Instala Blender (se recomienda Blender 4.5 LTS o compatible; no exige GPU dedicada para este MVP).
3. Abre PowerShell desde el directorio `ORBI-LIVING-PRESENCE-LAB` o el worktree independiente de AUTORIG-01, y ejecuta:

```powershell
.\tools\autorig01_windows.ps1 -Step prepare
```

Se abrirá un diálogo para elegir el GLB original. El script crea una carpeta `ORBI_AUTORIG_01_<modelo>` junto al archivo de origen, siempre que no exista ya la salida de la primera etapa.

4. Abre `ORBI_AUTORIG_WORKSPACE.blend` en Blender. Identifica los objetos tipo Empty (esferas) que comienzan con `ORBI_LM_` y ubícalos sobre las **articulaciones anatómicas reales**:
   - pelvis, columna, pecho, cuello, base/superior de la cabeza;
   - hombros, codos, muñecas y manos (izquierda/derecha);
   - caderas, rodillas, tobillos y puntas de pies (izquierda/derecha).
   - El preset fue construido para un personaje humanoide en **T-Pose**. No aceptes codos, muñecas o pies ubicados sobre el aire ni en la extremidad incorrecta.

**Los marcadores iniciales son estimaciones geométricas, NO una detección IA de articulaciones.** Verifica expresamente izquierda/derecha según la orientación real del modelo: algunos GLB llegan mirando hacia +Y, otros hacia -Y, y el preset puede requerir intercambiar marcadores simétricos. Debes revisar la geometría real desde varios ángulos. Si el GLB está en A-Pose o doblado, comienza corrigiendo su postura en Blender sobre una copia; en esta etapa la validación puede bloquearlo. No uses Mint V7/V8 como ejemplo porque esos personajes ya tienen rig.

5. Guarda el workspace corregido (Ctrl+S). Después, desde PowerShell:

```powershell
.\tools\autorig01_windows.ps1 -Step rig
```

Elige el workspace revisado. Blender crea armature y pesos automáticos sobre la copia y comprueba cobertura. Si pasa, reimporta tanto GLB como FBX y exige mantener cantidad de mallas, 19 huesos, vínculo de skinning y límites espaciales compatibles.

## Archivos esperados

**Primera etapa**
- `ORBI_AUTORIG_WORKSPACE.blend`: copia editable con marcadores, SIN rig nuevo.
- `AUTORIG_PREPARE_AUDIT.json`: geometría fuente, hash, avisos y ubicación del proyecto.

**Segunda etapa (solo si pasa controles)**
- `ORBI_AUTORIG_RIGGED.blend`: escena con rig y skinning.
- `ORBI_AUTORIG_RIGGED.glb`: candidato para reimportar en ORBI.
- `ORBI_AUTORIG_RIGGED.fbx`: candidato para pruebas externas.
- `ORBI_AUTORIG_AUDIT.json`: pesos por malla y resultados de reimportación.
- `ORBI_AUTORIG_FAILURE.json`: motivo del bloqueo cuando no supera la auditoría.

No se sobrescriben archivos existentes. El hash del GLB original se comprueba antes y después de riggear. El script de preparación y el de rig operan desde Blender local y no suben ningún archivo.

## Límites y seguridad

- **NO automático todavía:** hay que colocar/ajustar manualmente los marcadores. La interfaz web no puede iniciar Blender local de forma directa.
- Pesos con el operador nativo de Blender `ARMATURE_AUTO`. Puede fallar con mallas abiertas, accesorios flotantes, varias islas de geometría, geometría mal escalada o prendas. En lugar de inventar pesos, bloquea y da el error.
- Auditoría cuantitativa: rechaza mallas con menos de 99.5% de vértices ponderados y rechaza cambios grandes en bounding boxes o recuentos de mallas/huesos. Este umbral NO prueba que codos, hombros o rodillas se doblen correctamente.
- El formato GLB puede dividir vértices en costuras UV y Blender puede alterar la conversión de materiales FBX; por eso se valida integridad espacial y estructura, no igualdad exacta de recuentos de vértices tras reimportar. La apariencia/render y calidad de skinning exigen inspección visual.
- Los modelos VRM/FBX y los GLB con rigs o clips **no se modifican** en esta fase. No se copian controles faciales de Mint ni se editan archivos LUMIA.
- No declarar producción ni Mixamo-compatible hasta la primera prueba con un GLB humanoide real. Este script no ha sido ejecutado aquí con Blender y un modelo verdadero.
- La vista de ORBI y el cálculo del rig no son lo mismo; el software debe mantener la diferencia visible.

## Prueba de aceptación en modelo real (obligatoria)

1. Elegir GLB de humanoide propio o con licencia compatible, sin rig ni animaciones, de baja complejidad, en T-Pose.
2. Preparar marcadores y guardar el workspace.
3. Ejecutar rigging y abrir GLB y FBX resultantes en ORBI/Blender.
4. Flexionar codos, hombros, rodillas y cadera en Blender. Verificar pesos, ropa, piel, intersecciones, manos y pies; usar renders de tres ángulos si es posible.
5. Reimportar en escena vacía y comparar pose neutra, nombre de huesos, materiales, geometría y escalas.
6. Solo si todas las verificaciones visuales pasan, etiquetar como candidato a biblioteca. Un FBX riggeado no significa automáticamente que Mixamo lo acepte.

## Siguiente incremento: AUTORIG-02

- Edición visual 3D de marcadores dentro de ORBI con orbit, selección y raycasting.
- Asistente de correspondencia `ORBI humanoide` / rig VRM / Mint; se requiere retargeting anatómico independiente y nunca copiar 488 huesos por defecto.
- Dedos opcionales, módulos faciales por capacidad detectada, y editor para corregir pesos.
- Pruebas con personajes variados y modelos originales sin rig para determinar límites.
- Automatización IA opcional (UniRig) únicamente si la aceleración y compatibilidad de licencia/artefactos lo permiten.

## Referencias de API Blender

- [Object parenting / ARMATURE_AUTO](https://docs.blender.org/api/current/bpy.ops.object.html)
- [GLB/FBX export operators](https://docs.blender.org/api/current/bpy.ops.export_scene.html)

## AUTORIG-01.1: fallback ante fallo real de pesos por calor (2026-11-09)

Incidente reproducido: Blender 5.2.3 informa que no pudo encontrar solución con pesos por calor y Mesh_0 conserva 0 % de vertices ponderados, aun despues de guardar los marcadores. La geometria concreta causante aun no ha sido determinada; la verificacion ha bloqueado correctamente la exportacion.

El modo predeterminado sigue siendo auto: si Blender ARMATURE_AUTO falla, no produce resultados finales. Solo mediante la opcion explicita -SkinMethod auto-or-distance se permite un metodo geometricamente aproximado (distancia del vertice a 19 segmentos oseos; pesos normalizados y maximo cuatro influencias). Nunca debe confundirse con los pesos por calor ni con un rig listo para animar.

En PowerShell, tras actualizar el repositorio AUTORIG-LAB:

    cd "$env:USERPROFILE\Downloads\ORBI-AUTORIG-LAB"
    & ".\tools\autorig01_windows.ps1" -Step rig -SkinMethod auto-or-distance -WorkspaceFile "$env:USERPROFILE\Downloads\ORBI_AUTORIG_01_lumia 50k\ORBI_AUTORIG_WORKSPACE.blend"

NO vuelvas a preparar marcadores. El archivo .blend ya guardado es el punto de partida.

El informe debe declarar skinMethod.method = distance-approximation, fallbackUsed = true, heatFailure y requiresDeformationQA = true. Si no existe cobertura de huesos criticos, pesos validos o integridad espacial de las exportaciones, el programa bloquea la salida.

La salida de fallback es unicamente un CANDIDATO a evaluar visualmente con flexiones de hombros, codos, munecas, caderas y rodillas. No se considera un rig completo sin esa inspeccion. El modelo de origen y las versiones certificadas de LUMIA no se editan.
