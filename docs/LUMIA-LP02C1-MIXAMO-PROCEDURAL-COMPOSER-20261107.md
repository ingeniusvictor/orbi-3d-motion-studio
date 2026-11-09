# ORBI 3D Motion Studio — LP-02C.1
## Compositor seguro de reposo Mixamo + Living Presence · 2026-11-07

**Estado:** implementado en rama experimental, validación de CI y QA visual de Vita.vrm por completar.
**Repositorio:** https://github.com/ingeniusvictor/orbi-3d-motion-studio
**Rama:** `feat/lumia-living-presence-lp01-20261107`
**PR borrador:** https://github.com/ingeniusvictor/orbi-3d-motion-studio/pull/2
**Rama main y LUMIA-ASUS R8:** sin modificación.

### Problema resuelto en esta primera entrega
Antes de LP-02C.1, cualquier FBX seleccionado (incluso pausado) tenía propiedad exclusiva de los huesos: `LivingPresence.update(dt,{clipPlaying:true})` salía inmediatamente. Por eso no se podía comprobar el reposo de Mixamo combinado con dedos relajados, respiración y mirada natural, aunque ambos subsistemas funcionaran por separado.

Ahora se ofrece una **mezcla solo para vista previa**, activable voluntariamente, con autorización anatómica específica y sin alterar las pistas AnimationClip.

## Implementación real

**Nuevo:** `src/lib/livingPresence/motionComposer.js`

- Solo permite clips con nombres de reposo reconocibles (Idle, Standing Idle, Rest, Relax, Breathing, Waiting, Reposo, etc.), **cargados al VRM mediante el adaptador experimental Mixamo→VRM**. Rechaza walking/running/jumping/attacking/clapping/etc. y clips embebidos originales, incluso si se llaman Idle.
- Analiza durante la selección del clip cada `QuaternionKeyframeTrack` que pertenezca a huesos normalizados de manos y dedos.
- Umbral inicial de «pista congelada»: desplazamiento angular máximo de 0,65° respecto al primer fotograma. Usa el valor absoluto del producto escalar para no confundir cuaterniones equivalentes `q` y `-q`.
- Peso máximo basado en la intensidad del compositor: 0,90 para dedos congelados o sin pista; 0,08 para dedos realmente animados; 0,28 para muñecas sin movimiento y 0,06 si el FBX las anima; 0,62 para respiración/torso; 0,32/0,16 para cuello/cabeza; 0,14/0,08 para hombros/brazos.
- **Peso cero para caderas, pelvis, rodillas, pies y raíz**. LP-02D foot IK queda inhibido al componer sobre cualquier clip.
- Clasificación conservadora: si el nombre no parece claramente un reposo o el origen no es el FBX importado por nuestro adaptador, no ofrece composición.

**Modificado:** `src/lib/livingPresence/LivingPresence.js`

- Mientras el clip esté seleccionado, mantiene prioridad total del mixer salvo que el compositor esté explícitamente habilitado y autorice el clip de reposo.
- Para composición aprobada, multiplica cada rotación de entrada del mixer por un delta local amortiguado, **escalado por autoridad de rol**. No se aplica la postura de brazos descendidos para corregir T-Pose encima de Mixamo.
- La flexión de dedos sigue el perfil Vita validado visualmente en LP-02B.2 (u otros perfiles/overrides de cada avatar), con amplitud reducida por la autoridad del compositor.
- Mirada y blink usan los controladores ya implementados, conservando la propiedad de otros controladores externos.
- Los clips pausados utilizan la misma política: pueden mostrar una pose congelada con microvida encima y recuperarla al apagar A/B.

**Modificado:** `src/lib/viewer.js`

- Orden por frame: `presence.beforeFrame() → AnimationMixer.update(dt) → presence.update(dt,{composition}) → vrm.update(dt) → render`.
- Selección de clip actualiza `MotionComposer.selectClip(clip,{source})`; cada cambio limpia overlays temporales.
- Nuevas funciones públicas: `getLivingComposerStatus()`, `setLivingComposerEnabled(value)`, `setLivingComposerIntensity(value)`.
- `withPresenceSuspended(operation)` restaura offsets procedurales y sincroniza con `vrm.update(0)` antes de exportar GLB/FBX, para no capturar una pose de inspección como si fuera geometría original. Contador de suspensión y bloque `finally` para recuperación tras excepciones.
- Se mantiene intacta la conversión y exportación aproximada GLB/FBX. **La vista previa procedural no se hornea en los archivos exportados**.

**Modificados:** `src/LivingPresenceLab.jsx` y `src/App.jsx`

- Nuevo panel LP-02C.1 con estado del clip elegido, checkbox de composición, control de intensidad de 0–100%, conteos de pistas de dedos estáticas/animadas/ausentes y explicación de bloqueo.
- La casilla está desactivada por defecto y vuelve a apagarse al cambiar de animación.
- El laboratorio requiere el VRM cargado, presencia A/B activada y un clip de reposo importado compatible.

## Pruebas automáticas

- `tests/livingPresenceComposer.test.js`: test del clasificador de reposo, varianza angular y doble hemisferio de cuaterniones; mezcla usando `THREE.AnimationMixer` real; preservación de cadera y brazos; dedos congelados; prioridad de acciones; pausa y desactivación reversible.
- `tests/livingPresenceExportSafety.test.js`: suspensión de exportación, sincronización de pose original, anidamiento y limpieza tras excepción.
- Ejecutar `npm.cmd test` y `npm.cmd run build`; conservar también todos los tests anteriores.

## Procedimiento de QA en Vita.vrm (Windows)

1. En la ventana de PowerShell que sirve el puerto 5174, detener Vite con Ctrl+C.
2. Abrir `C:\Users\ingvm\Downloads\ORBI-LIVING-PRESENCE-LAB`, revisar `git status --short` y si está limpio ejecutar `git pull --ff-only`, `npm.cmd test`, `npm.cmd run build`, `npm.cmd run dev -- --port 5174 --strictPort`.
3. Abrir `http://localhost:5174/`, recargar con Ctrl+Shift+R y cargar el `Vita.vrm` original sin subirlo a GitHub.
4. Añadir un FBX **de reposo** de Mixamo, con nombre reconocible, por ejemplo `Standing Idle.fbx` o `Idle.fbx`; el usuario usará su archivo personal real, no necesita generar ni publicar assets de muestra.
5. Seleccionarlo en la Biblioteca de animaciones y reproducirlo. Activar **Presencia natural · vista A/B**.
6. En **LP-02C.1 Mixamo + Presencia viva**, verificar que el clip aparece como elegible. Encender **Superponer presencia natural sobre el reposo FBX**. Comenzar con mezcla 45–65%.
7. Verificar desde frente y perfil: manos levemente curvadas y cambiantes, respiración, ojos/mirada y cabeza; la pose de brazos procedente del FBX debe mantenerse (no imponer T→A otra vez).
8. Pausar el FBX y alternar solo el compositor; la pose de Mixamo debe quedar estable mientras la microvida aparece/desaparece.
9. Cargar un clip Walking/Clapping; el compositor debe aparecer bloqueado. Revisar que no haya cambios en movimiento de piernas, cadera o dedos animados.
10. Desactivar el compositor; el clip original debe volver sin drift. Desactivar la presencia para comparar A/B original.
11. Exportar una copia GLB/FBX de prueba siguiendo las advertencias de pérdida de extensiones VRM: **no** debe incluir la pose procedural por estar encendido el laboratorio. Volver a importarla para verificar.
12. Medir FPS y fluidez con el VRM real, especialmente al alternar 20 veces; no inferir rendimiento solo del CI.

## Limitaciones que no debemos ocultar

- No es aún la composición general de todos los gestos, locomoción, objetos o expresiones habladas. Solo **reposo identificado + FBX importado al VRM**.
- Los pesos son conservadores y deben calibrarse visualmente para el clip y la anatomía; un FBX puede contener dedos estáticos ya parcialmente flexionados, por lo que incluso la mezcla 65% necesita revisar hiperflexión.
- Reconocer el nombre no demuestra semánticamente que un clip sea reposo. Es una barrera preventiva inicial, no un sistema de clasificación avanzada.
- La prueba es de código sobre rigs sintéticos. No tenemos el archivo privado Vita ni los FBX en CI; no existe certificación de naturalidad visual ni medición de GPU local.
- La exportación **no incorpora procedural/VRMA**. La capa solo modifica el personaje durante reproducción, y los clips originales se conservan.
- LP-03 Cerebelo Motor, detección de fatiga/OU, retarget universal, cálculos biomecánicos completos y manos con contacto de palma aún pendientes.

## Próximas etapas

**LP-02C.2:** estabilizar y medir máscaras, clasificar mejor clips/partes del cuerpo, corregir dedos ya flexionados en el FBX, diagnosticar movimientos concurrentes, y permitir edición de prioridades mediante QA.

**LP-03A:** cerebelo motor y coordinación entre intención de escucha/pensamiento/habla, gaze y gestos, sin consultas LLM por fotograma.

**No fusionar este PR a main ni copiar código a LUMIA R8 hasta aprobar el QA visual real de Vita.vrm y Mixamo en la ASUS.**
