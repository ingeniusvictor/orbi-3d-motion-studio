# LUMIA · LP-03D.2 — QA facial junto al visor, sin desplazamientos

**Fecha:** 2026-11-08
**Repositorio:** https://github.com/ingeniusvictor/orbi-3d-motion-studio
**Rama:** `feat/lumia-living-presence-lp01-20261107`
**PR:** https://github.com/ingeniusvictor/orbi-3d-motion-studio/pull/2 (borrador).
**Alcance:** navegación/UX del laboratorio y observabilidad; no cambia el motor Qwen, Kokoro, R8 estable ni las exportaciones.

## Observación del usuario y cambio de enfoque

Vita ya responde y el usuario **ha comprobado visualmente el movimiento de los labios durante una respuesta**. Sin embargo, los botones de cejas, pestañas, parpadeos, miradas y vocales estaban cada vez más abajo en el panel lateral. Para presionarlos había que desplazar la página y, al regresar al visor, la microacción ya había terminado. No era solo un problema de scrolling: los controles estaban lejos del objeto que inspeccionan.

## Solución implementada

### 1. `src/FaceQuickDock.jsx` y estilos

- Nuevo **Rostro · QA rápido**, superpuesto en el lado derecho del visor 3D, por debajo de la barra de herramientas; opcional y con botón de cierre.
- Se abre automáticamente cuando se carga un modelo **VRM** y puede abrirse/cerrarse con el icono de rostro de la barra de herramientas del visor.
- Dos pestañas compactas: **Ojos y expresiones** (parpadeo, miradas izquierda/derecha/arriba/abajo, cejas, sonrisa, mejillas, entrecerramiento, mandíbula) y **Labios** (vocales A/E/I/O/U).
- **Acercar rostro** ajusta solamente la cámara y OrbitControls al hueso `head` cuando está disponible. **Vista general** recupera el encuadre completo. La cámara no altera pose, VRM, Mixamo, visemas o expresión.
- Los botones consultan las capacidades reales de `VRMExpressionManager` y `VRMLookAt`, y se bloquean si falta un morph o la presencia general está apagada. Durante una voz activa los previews manuales quedan bloqueados.
- Mensaje de confirmación de acción y un estado de habla/apertura de boca para observar en vivo.
- No inicia ni modifica automáticamente gestos (solo petición por clic); cada preview termina según el temporizador establecido por su controlador y restaura la expresión anterior.

### 2. Repetir respuesta sin volver a buscar los botones

- En el mismo visor aparecen **Reproducir respuesta** y **Detener**.
- `App.jsx` comunica los controles existentes de `VoiceMotorLab` mediante una referencia de React y estado de disponibilidad. **No crea un segundo sintetizador, no duplica tokens de gesto ni invoca Qwen en cada replay**.
- Flujo: generar o preparar una respuesta una vez en LP-03C, autorizar voz; volver al visor, pulsar Reproducir respuesta tantas veces como se necesite. Así se puede inspeccionar la cara durante la misma frase y detenerla de inmediato.
- Si no hay respuesta o no se autorizó voz en la interfaz, el botón queda deshabilitado y un texto explica el requisito.
- La prioridad del FBX respecto a los huesos corporales sigue protegida; el replay utiliza el mismo `VoiceMotorBridge` y `LipSyncController` existentes.

### 3. Reducción del scroll lateral

- `VoiceMotorLab.jsx`: diagnóstico y controles detallados LP-03D.1 (rostro) y LP-03C.2 (visemas) pasan a `<details>` con resúmenes compactos. La consulta y reproducción de Qwen se mantienen a la vista.
- `LivingPresenceLab.jsx`: la sección grande de opciones de manos, Mixamo, calibración de dedos, gestos y motor corporal queda bajo **Movimiento avanzado** desplegable. Los controles principales de Presencia A/B y voz permanecen visibles.
- Los estados/calibraciones son persistentes mientras se abren o cierran las secciones: no se desmontan los motores por colapsar el HTML.
- CSS responsivo para visores menores, con scroll solo dentro del dock si el dispositivo tiene poco alto.

## Cómo validar la respuesta visualmente

Durante una reproducción de Qwen o demostración:
1. **Labios:** observar si las vocales generan cambios apreciables, no solo boca abierta fija.
2. **Párpados y ojos:** ver parpadeos ocasionales, mirada que cambia de objetivo y ausencia de movimientos repetitivos muy rápidos.
3. **Cejas/mejillas/sonrisa:** ver cambios sutiles cuando existan las expresiones, pero no esperar movimientos de morphs ausentes.
4. **Cabeza/cuerpo:** corroborar que Mixamo y la presencia corporal siguen naturales, sin sacudidas y sin pies deslizantes.
5. **Fin de audio:** comprobar que labios y expresiones recuperan neutralidad y que no queda la boca abierta.
6. **Compatibilidad:** desde `QA rápido`, pulsar cada prueba con el personaje cercano. Un botón deshabilitado significa función no disponible (morph ausente o permiso desactivado), no un error silencioso.
7. **Fluidez:** comparar los FPS/latencia observados con el dock cerrado/abierto; el polling de estado solo se realiza cuando el dock está abierto.

**No se ha afirmado validación visual en Vita real desde CI**: los test de código verifican disponibilidad de acciones y que acercar la cámara no modifique el rig.

## Prueba local

Detener Vite en localhost:5174 con Ctrl+C. Ejecutar:
```powershell
cd "$env:USERPROFILE\Downloads\ORBI-LIVING-PRESENCE-LAB"
git status --short
git pull --ff-only
npm.cmd test
npm.cmd run build
npm.cmd run dev -- --port 5174 --strictPort
```
Si `git status --short` muestra cambios locales, revisarlos **antes** del pull.

Abrir `http://localhost:5174/` (Ctrl+Shift+R). Cargar Vita.vrm. Activar Presencia natural A/B una vez. El dock aparece en el visor. Pulsar Acercar rostro, Parpadear, Mirar izquierda/derecha, Sonrisa y Vocal A. Luego preparar una respuesta en LP-03C y autorizar voz. Regresar al visor y pulsar Reproducir respuesta: ahora la prueba se inicia desde el mismo lugar donde se observa.

## Próximas mejoras

- Si el usuario confirma la utilidad del dock, añadir recuadro de cámara `Primer plano / Medio cuerpo / Cuerpo completo` y comparación A/B de rostro sin tener que navegar por la escena.
- Si los visemas resultan demasiado genéricos, iniciar LP-03C.3 con timestamps fonéticos de Kokoro y calibración por morph; no vender el fallback temporal como lip-sync fonético exacto.
- Solo portar estas mejoras a LUMIA R8 tras QA de Vita y rendimiento real en la laptop.
