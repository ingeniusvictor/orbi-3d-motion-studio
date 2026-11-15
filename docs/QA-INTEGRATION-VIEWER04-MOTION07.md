# ORBI QA-INTEGRATION — VIEWER-04 + MOTION-07 ToeLock V4

## Para qué sirve

Esta rama permite probar **sin regresiones de pantalla negra** las mejoras de
MOTION-07 junto al VIEWER-04 certificado por el usuario, sus controles
AUTORIG-02C/02D/02E/02F y MOTION-06.

La integración se creó desde `fix/viewer-04-zero-clips-react-crash`
(PR #17), incorporando exclusivamente archivos nuevos de MOTION-07 y pequeños
cambios en `App.jsx` y `viewer.js`. Se conservaron los archivos del
visor 3D, el panel React de contingencia y las defensas WebGL. Después se
registró un merge commit real con el historial íntegro de la rama MOTION-07
(PR #18), **sin modificar ambas ramas fuente**.

## QA automático

- 367 pruebas JS aprobadas y cero fallidas en la integración anterior al merge
  ([Actions 43762889599](https://github.com/ingeniusvictor/orbi-3d-motion-studio/actions/runs/43762889599)).
- Pruebas Python MOTION-06/MOTION-07 y compilación Vite correctas.
- Prueba nueva de montaje React que carga simultáneamente el panel ToeLock V4 y
  MOTION-06 en un personaje sin clips, evitando la regresión de VIEWER-04.
- CI del merge commit: comprobar la ejecución de Actions correspondiente.

## Qué se conserva intacto

- Visualización correcta de GLB y FBX sin animaciones, validada en Windows.
- Recuperación ante pérdida de WebGL y botón de diagnóstico de vista.
- `ExistingRigMotionLab.jsx`, `ViewportMotionDock.jsx`, `PanelErrorBoundary.jsx`.
- `existingRigMotion.js`, importación GLB/FBX, controles de clips Arms,
  Look, Overdrive, Mirror, Trim y editor de rig experimental.
- MOTOR Python Golden de MOTION-06; los scripts originales del kit V4 no se
  publican ni se reimplementan en el repositorio.

## Prueba Windows SIN cambiar el puerto acordado 5201

**No editar ni borrar `ORBI-VIEWER-04`**; esa carpeta es el estado conocido bueno.

1. En la terminal de VIEWER-04 pulsar `Ctrl + C` para liberar el puerto 5201.
2. Crear el laboratorio QA separado como `ORBI-MOTION-07-QA` con
   `git worktree add --detach` desde la rama de integración.
3. Instalar dependencias en el laboratorio QA y ejecutar
   `npm.cmd run dev -- --host 127.0.0.1 --port 5201 --strictPort`.
4. Abrir `http://127.0.0.1:5201/`. El puerto sigue siendo el **mismo**.
5. Cargar `LUMIA_CLAUDE_MAESTRA_346.glb` real, maestra 346 sin clips.
6. Verificar que VISOR-04 sigue mostrando personaje completo con texturas,
   rostro, cuello y cabello, sin pantalla negra.
7. En Biblioteca de animaciones, abrir `MOTION-07` y seleccionar el archivo
   original `LUMIA_CLAUDE_MIXAMO_D162.glb` (SHA a58a...).
8. Pulsar `Auditar y preparar copia ToeLock V4`, comprobar 1853/1855,
   SHA `b85dc5...`, abrir mini visor (sin reemplazar maestra).
9. Descargar GLB V4 e informe; verificar que la maestra sigue intacta.
10. Si se desea generar FBX: seleccionar también el kit V4 original ZIP
    y descargar `ORBI_MOTION_07_TOELOCK_V4_MIXAMO.zip`.
    Descomprimir fuera de ORBI y ejecutar `CREAR_FBX_MIXAMO.cmd` en Windows
    con Blender 5.2.3. Reimportar FBX COMPAT y COLOR y comprobar modelo.
11. Probar FBX nuevos en Mixamo con baile; revisar ambos ToeBase.
12. En MOTION-06, ejecutar retarget de los FBX originales a maestra Claude V09,
    comparar Wave, Samba y Hip Hop y verificar el pivot, cara, 41 morphs y
    estabilidad de las dos puntas.
13. Repetir carga GLB/FBX sin animaciones y clips Golden existentes.
14. Si aparece un error, enviar texto exacto de ORBI, informe ToeLock,
    último paso y Console F12, sin sustituir el archivo artístico.

## Estado de certificación

- Reproducción exacta del motor **Python** original V4 sobre la D162 real:
  **APROBADA, SHA idéntico**.
- Compatibilidad de VIEWER-04 con modelos estáticos en PC:
  **APROBADA por el usuario en la rama original**.
- Adaptador ToeLock JavaScript en navegador con el original D162 real:
  **PENDIENTE DE QA MANUAL** (la compuerta SHA bloquea resultados diferentes).
- FBX Blender generados con el paquete ORBI y Mixamo real:
  **PENDIENTE DE QA MANUAL**.
- Retarget web Claude V09 D162 con comparación Golden:
  **PENDIENTE DE QA VISUAL**.
- La construcción automática del proxy D162 desde la maestra V09
  no está implementada: se usa el puente ya certificado.
- No fusionar a `main` ni marcar el PR como terminado hasta superar la QA.

## Ramas

- Base estable: `fix/viewer-04-zero-clips-react-crash`.
- Función independiente: `feat/motion-07-claude-v09-mixamo-toelock`.
- QA combinado: `feat/integration-viewer04-motion07-toelock-v4`.
