# MOTION-07 · Claude V09 maestra 346 / Mixamo D162 ToeLock V4

## Procedencia comprobada de los artefactos

La implementación parte de **archivos auténticos** recuperados de la Biblioteca del usuario, no de reconstruir el algoritmo por su descripción.

- `LUMIA_CLAUDE_D162_PIES_ESTABLES_V4_KIT.zip`: SHA-256 `c316cc4820091af201d560005e3b1a1fdda5193814d57d9b0bb01ad60b0fff7e`.
- `LUMIA_CLAUDE_MIXAMO_D162.glb` original: `a58a5061c9e2db63370b90d5f985078efb727ec2ef2a2fe49b46b058e293c5fa`.
- `LUMIA_CLAUDE_MIXAMO_D162_PIES_ESTABLES_V4.glb` aprobado: `b85dc554a54d442ea2a9c375f21468349501fd11f568afbd2848b2b8766c0ec0`.
- `LUMIA_CLAUDE_MAESTRA_346.glb`: `4d50eefc4027f731a7ab728cb147a5612dda41785a7c0993021b7e4627e8434d`.
- `ORBI_MIXAMO_RETARGET_COMPLETO.zip` como referencia independiente MOTION-06.
- **El motor original del kit**, `tools/fix_toe_weights_glb.py`, se ejecutó con Python/NumPy sobre el D162 original y **generó exactamente** `b85dc5...c0ec0` (mismo SHA que el aprobado).
- Reproducción real: 1.853 influencias de `J_Bip_L_ToeBase` y 1.855 de `J_Bip_R_ToeBase` transferidas a sus correspondientes `J_Bip_*_Foot`. 3.708 en total, cero restantes, error de suma de pesos 0, 162 huesos, 47.386 vértices, 73.157 triángulos.

Los resultados certificados en Mixamo de los **FBX originales del kit V4** fueron confirmados por el usuario en el desarrollo anterior. Los **FBX generados nuevamente desde ORBI** no se han certificado todavía: hay que volver a cargarlos y comprobarlos en Mixamo.

## Implementación en ORBI

### 1. `src/lib/autoRig/toeWeightTransfer.js`

- Adaptación binaria, determinista y **verificada por SHA de entrada y salida** del procedimiento original.
- Solo admite las dos identidades D162 exactas, con 162 huesos, dos mallas lógicas y la geometría auditada.
- Acepta el D162 original (reparable) o el mismo D162 V4 (sin cambios adicionales).
- Confirma jerarquía ToeBase hijo directo de Foot, nombres únicos, accessor VEC4 y tipado, topología, índice de skin correcto.
- Rechaza `JOINTS_1/WEIGHTS_1`, sparse, normalización incompatible, otros rigs, extensiones obligatorias sin auditoría, topologías no reconocidas.
- Consolida los pesos en Foot y pone a cero el slot consumido, conforme al Python aprobado.
- Conserva el GLB fuente intacto: devuelve un buffer nuevo; si la salida no tiene el SHA exacto de Golden V4, bloquea la descarga.
- El maestro de 346 **jamás** se reescribe; no se tocan caras, UV, materiales, matrices inversas ni clips.

### 2. `src/MixamoToeLockLab.jsx` + `src/ToeLockMiniPreview.jsx`

- El panel MOTION-07 se incorpora **separadamente** al panel MOTION-06.
- Requiere que la LUMIA maestra V09 esté cargada en ORBI y sea reconocida estructuralmente.
- Selecciona la copia D162 (original o V4), informa estado previo, ejecuta en una copia, muestra auditoría, permite exportar GLB y QA JSON.
- Previsualiza la copia D162 en un **canvas independiente**: nunca reemplaza el maestro que está abierto en ORBI.
- El usuario puede seleccionar el ZIP V4 original para crear un nuevo paquete con la copia validada y scripts aprobados de Blender, preservados *byte a byte*. Para impedir ejecución de código cambiado, el ZIP completo y los scripts individuales deben pasar sus SHA.
- Descarga `ORBI_MOTION_07_TOELOCK_V4_MIXAMO.zip` con el GLB corregido bajo el nombre exacto que espera el CMD, el exportador Blender y el informe QA.
- **El navegador no ejecuta Blender**. En Windows el usuario descomprime y ejecuta `CREAR_FBX_MIXAMO.cmd` para producir `COMPAT` y `COLOR`; debe reimportar y auditar los FBX.

### 3. Nuevo perfil de destino V09

`src/lib/autoRig/lumiaMasterProfile.js` inspecciona la pose *real* de los huesos mediante `inverseBindMatrices`:

| Hueso (altura Y en metros) | V06B | Claude V09 |
|---|---:|---:|
| `V8_Bip001-Pelvis` | 1,0564 | 0,9432 |
| `J_Bip_C_Head` | 1,5835 | 1,4177 |

Ambas versiones comparten 346 nombres, pero **342/346 matrices de reposo** difieren a tolerancia 1e-4. Por tanto, no basta una comprobación por nombre. El retarget web original sigue disponible como MOTION-06 para V06B; el nuevo destino `targetVersion:'claude-v09'` exige que los valores de reposo coincidan con la V09 real. Usa la cadena de matrices del destino en el cálculo.

**La equivalencia visual de la transferencia D162 V4 → V09 346 todavía no está certificada**. El Python original certificado de V06B queda como referencia y no se ha sobrescrito.

### 4. Reproducción local / herramientas independientes

Para verificar el JS binario con la D162 original en Windows:

```powershell
node tools/mixamo-retarget/motion07_check_js.mjs "C:\LUMIA\LUMIA_CLAUDE_MIXAMO_D162.glb" "C:\LUMIA\LUMIA_TOELOCK_V4_PRUEBA.glb"
```

Para ejecutar el motor **Python original** del ZIP y cotejar su resultado:

```powershell
python -m pip install numpy
python tools/mixamo-retarget/motion07_toelock_v4.py --kit "C:\LUMIA\LUMIA_CLAUDE_D162_PIES_ESTABLES_V4_KIT.zip" --source "C:\LUMIA\LUMIA_CLAUDE_MIXAMO_D162.glb" --output "C:\LUMIA\LUMIA_TOELOCK_V4_PYTHON.glb"
```

Ambos bloquean la salida si el SHA no coincide con el certificado; ambos se niegan a sobrescribir el origen o un resultado previo.

## Qué NO se ha hecho ni certificado

1. **No** se automatizó la fabricación desde cero del rig D162 partiendo de la maestra V09 de 346 huesos. Se debe conservar el puente aprobado y comparar su correspondencia estructural antes de incorporar ese paso; no convertir arbitrariamente 346 → 162.
2. **No** se ejecutó Blender 5.2.3 ni Mixamo desde ChatGPT en esta integración. Los dos FBX originales V4 fueron aprobados previamente por el usuario; los nuevos FBX obtenidos con el ZIP descargado requieren inspección visual en Mixamo.
3. **No** se declaró equivalente a Golden el nuevo retarget web de V09; debe compararse con Wave, Samba e Hip Hop y comprobar cabeza, cuello, brazos, pelvis, tobillos, dedos, traje, cabello y suelo.
4. **No** se alteraron `src/lib/autoRig/existingRigMotion.js`, `ExistingRigMotionLab.jsx`, `ViewportMotionDock.jsx`, motor Python MOTION-06 ni comandos generales de exportación.
5. No se agregaron assets privados grandes al repositorio: la interfaz requiere los archivos seleccionados localmente.

## Seguridad de ramas e integración

Esta rama **parte exactamente de** `feat/motion-06-lumia-mixamo-retarget-profiles` (SHA inicial `c3514b29`), no de `main`. El PR MOTION-07 se dirige a MOTION-06 y permanece `draft`. En paralelo, la corrección de pantalla negra en modelos sin animaciones sigue certificada en `fix/viewer-04-zero-clips-react-crash`; **no está incluida automáticamente en el PR MOTION-07**, porque se desarrolló en otra rama. Para validar todos los avances simultáneamente hay que crear una rama de integración derivada de VIEWER-04, incorporando los archivos y cambios puntuales de MOTION-07 sin reemplazar el visor.

### QA pendiente en Windows

1. Cargar la maestra **Claude V09 346** y confirmar reconocimiento por reposo.
2. Seleccionar **la D162 original** y ejecutar ToeLock. Debe reportar **1853/1855** influencias y SHA Golden `b85dc5...`.
3. Repetir sobre la **D162 ya corregida**. Debe detectar que ya está aplicada y no escribir pesos nuevos.
4. Previsualizar la copia; descargar el ZIP preparado con el kit original.
5. Ejecutar `CREAR_FBX_MIXAMO.cmd` en Blender 5.2.3; comprobar dos FBX, 162 huesos, dos mallas, 73.157 triángulos, cero ToeBase ponderado.
6. Subir COMPAT y COLOR a Mixamo, probar animación suave y baile de piernas, comprobar que no hay rotaciones deformantes de las puntas.
7. Retarget a Claude V09 346, comparar Golden V06B y confirmar 41 morph targets y materiales intactos.
8. Exportar a GLB nuevo, reimportar en ORBI, validar que la animación no altera la geometría.
