# VIEWER-04 — Causa concreta del pantallazo negro con GLB riggeado sin animación

## Síntoma
El usuario confirmó reiteradamente que el GLB original artístico de Claude
`LUMIA_V09_CLAUDE_ORGANIC_FUSION_CANDIDATE.glb` y otros modelos sin clips
ponen **toda la aplicación de ORBI en negro**, pero una copia del mismo GLB
con un único clip de prueba sí abre. Los parches anteriores de CPU/WebGL no
resolvieron la situación.

## Hallazgo de revisión del código (no hipótesis genérica GPU)

`src/ViewportMotionDock.jsx` **mantiene montado** el componente
`ExistingRigMotionLab` incluso si el panel flotante está cerrado (`display:
none`). Esto era intencional para conservar el estado de los ajustes.

`MotionViewer.getExistingRigMotionStatus()` devolvía si el rig no tenía
animaciones:

```js
{ok:false, reason:'Este rig no incluye animaciones. Importa un clip compatible.'}
```

Sin embargo, **antes de decidir qué rama JSX mostrar**, el componente
`ExistingRigMotionLab` construía incondicionalmente `boneSelectors`:

```jsx
const boneSelectors = roles.map(([role,label])=>
  <select value={status.bones.find(...)} ...>
);
```

Como `status.bones` era `undefined`, React lanzaba
`TypeError: Cannot read properties of undefined (reading 'find')`.
Sin un error boundary de React, el error de renderizado puede desmontar toda
la interfaz de la aplicación. Este mecanismo concuerda directamente con
la diferencia entre V09 original sin clips y la copia con un clip: el
segundo caso entrega `bones` y `clips`, por lo que no falla.

## Solución

1. `MotionViewer.getExistingRigMotionStatus` devuelve siempre un contrato
   completo: `{ok,bones:[],detected:{},clips:[],reason?}`, incluso cuando
   no hay modelo, huesos o animaciones. Un modelo estático con rig
   es válido para visualización.
2. `ExistingRigMotionLab` normaliza defensivamente las matrices
   `bones` y `clips`, y solo construye selectores de huesos cuando
   `status.ok` es verdadero. El estado `ok:false` muestra en su lugar
   un aviso de solo lectura.
3. La solución conserva **sin cambios** GLTFLoader, materiales, pesos,
   esqueleto, morphs y todas las animaciones fuente. El panel flotante,
   AUTORIG-02F, MOTION-06 y las demás funciones se mantienen.
4. Se añade `PanelErrorBoundary` a los editores de animación, rostro,
   AutoRig y Living Presence. Si cualquiera de esos paneles React falla en
   el futuro, la aplicación mantiene la interfaz y muestra un error local
   dentro de ese panel en lugar de desmontar todo el estudio. El modelo,
   el canvas y la biblioteca de movimientos no se sobrescriben.
5. Se agrega `tests/viewer04ZeroClipsReact.test.js`: prueba del contrato
   y prueba de renderización SSR del **componente real React** con dock
   cerrado/abierto, estado completo y estado antiguo que omite arrays.
   Esto valida la interacción que faltaba en las regresiones anteriores.

## QA manual en Windows (obligatorio)

1. Abrir esta rama en laboratorio aparte.
2. Cargar el GLB **original** de Claude, sin animación diagnóstica añadida.
3. El personaje debe verse de cuerpo completo; la biblioteca debe mostrar
   **0 animaciones** sin que la página se vuelva negra.
4. Abrir/cerrar «Animación ▾»: debe aparecer un aviso de que el rig aún
   no tiene movimientos, no un bloqueo.
5. Abrir el GLB de prueba que sí funcionaba y verificar que conserva el clip,
   la edición Arms/Look y el visor flotante.
6. Abrir un FBX estático y después otro animado.
7. Verificar que MOTION-06 continúa operativo; no unir con main antes de
   comparar animaciones Golden.

**Estado:** causa de excepción comprobable directamente en el código; la
prueba con el GLB auténtico en navegador del usuario sigue pendiente.
Si el navegador sigue bloqueándose después de esta corrección, capturar
la consola F12 antes de asumir que otro fallo es la misma causa.

**Integración:** rama basada en `feat/viewer-03-webgl-recovery`, que
incluye el PR #16, #15, #14 y el historial de MOTION-06. Las ramas previas
y `main` no se modifican.
