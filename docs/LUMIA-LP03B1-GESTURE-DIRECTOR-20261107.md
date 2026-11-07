# LUMIA Living Presence · LP-03B.1 Director de Gestos Naturales

**Fecha:** 2026-11-07
**Estado:** laboratorio experimental; QA visual con Vita.vrm y el FBX real pendiente.
**Repositorio:** https://github.com/ingeniusvictor/orbi-3d-motion-studio
**Rama:** `feat/lumia-living-presence-lp01-20261107`
**PR:** https://github.com/ingeniusvictor/orbi-3d-motion-studio/pull/2 (borrador)

## Motivación

El usuario confirmó que LP-02C.2 suaviza eficazmente el reposo Mixamo, y que LP-03A permite coordinar cabeza, torso y brazos. LP-03A.1 aclaró que, cuando un clip FBX está seleccionado, hay que habilitar LP-02C.1 para que se ejecuten el sistema ocular y el resto de la presencia.

La siguiente evolución busca **acciones con intención**, no oscilaciones extras: LUMIA debe poder asentir suavemente, mirar con curiosidad o acompañar un concepto con un énfasis discreto, y regresar al reposo aprobado.

## Implementación

**`src/lib/livingPresence/gestureDirector.js`** añade `GestureDirector`, un planificador sin dependencias de Three.js ni de inferencia local. Contiene únicamente tres gestos declarativos de QA:

| Acción | Huesos autorizados | Objetivo |
|---|---|---|
| `acknowledge` | cabeza, cuello, pecho; objetivo ocular | Asentimiento breve, hasta unos 3,2° en cabeza a intensidad 100% |
| `curious` | cabeza, cuello, pecho superior; objetivo ocular | Giro horizontal sutil y ligera inclinación |
| `emphasize` | pecho, brazos superiores y muñecas; objetivo ocular | Enfatizar una idea sin grandes movimientos de brazos |

Cada acción progresa por cuatro fases con curvas ease-in/out:
1. `anticipation`: pequeño desplazamiento preparatorio.
2. `action`: avance suave al gesto principal.
3. `hold`: breve mantenimiento de la pose.
4. `recovery`: regreso gradual a la postura normal.

- La activación es **manual, one-shot, desactivada por defecto**; no hay gestos espontáneos adicionales, ni cola automática ni inferencia de Qwen.
- Se rechazan comandos inválidos o gestos superpuestos mientras otra acción esté activa. Los ángulos de cada articulación están acotados a pocos grados; no hay root motion ni modificaciones a caderas, rodillas y pies.
- La mirada sigue bajo el dueño `VRMLookAt` del runtime actual. La intención de mirada del gesto se mezcla con las fijaciones independientes existentes y luego vuelve suavemente a ellas. Si otro controlador posee el objetivo ocular, se respeta el control externo.
- `setEnabled(false)` y `resetOverlay()` cancelan la secuencia. Las poses procedurales se eliminan antes del siguiente frame sin alterar los clips originales. El cuello/cabeza conserva la recuperación orgánica amortiguada: no exigimos un salto irreal a cero en un frame.

**`src/lib/livingPresence/LivingPresence.js`** agrega las intenciones de gesto como cuaterniones locales separados sobre el motor de LP-02C.2 y el Cerebelo LP-03A. No modifica sus springs ni sus perfiles de calibración de manos Vita.

**`src/lib/viewer.js`** incorpora cuatro funciones:
- `setLivingGestureEnabled(boolean)`
- `setLivingGestureIntensity(number)`
- `triggerLivingGesture(name)`
- `getLivingGestureStatus()`

La validación de autoridad rechaza ejecutar un gesto si hay un FBX seleccionado pero el compositor LP-02C.1 no está activo y autorizado. Esto se aplica igual con el clip pausado.

**`src/LivingPresenceLab.jsx`** muestra un panel nuevo **LP-03B.1 Director de gestos naturales**, con A/B, intensidad 0–100% y tres botones de prueba. La interfaz consulta la disponibilidad de presencia y explica la necesidad de LP-02C.1 cuando hay un Idle seleccionado.

## Arquitectura de prioridades durante una prueba

```
THREE.AnimationMixer (FBX seleccionado)
  ↓
ClipSwayReducer (solo Idle autorizado; suavizado del torso)
  ↓
LivingPresence / MotionComposer (máscaras por hueso)
  ├─ Reposo orgánico
  ├─ Mirada y parpadeo
  ├─ LP-03A coordinación motora
  └─ LP-03B.1 gestos puntuales con cuatro fases
  ↓
VRM runtime: huesos normalizados → constraints / expresiones / spring bones
  ↓
Render
```

LP-03B no asume prioridad completa: si un FBX de reposo tiene una pista de articulación ya animada, los deltas del gesto quedan reducidos por la autoridad del compositor. **Clips de acción, locomoción y FBX no elegibles mantienen propiedad exclusiva.**

## QA automatizada

`tests/livingPresenceGestureDirector.test.js` verifica:
- Catálogo cerrado sin articulaciones inferiores y amplitud acotada.
- Continuidad entre preparación/acción/mantenimiento/recuperación.
- Activación explícita, sin gestos simultáneos, cancelación y retorno al reposo.
- Secuencias deterministas para reproducción de errores.
- Comparación con idéntica semilla de LP-03A, comprobando diferencia natural y posterior recuperación amortiguada.
- Composición sobre `THREE.AnimationMixer` con un FBX `Standing Idle`; caderas y pies originales.
- Inhibición con una animación `Clapping`.
- Bloqueo de `triggerLivingGesture` cuando hay un clip seleccionado sin permiso LP-02C.1.

**Las pruebas de código no certifican naturalidad del VRM privado ni rendimiento GPU.**

## Protocolo de prueba local

1. En PowerShell que sirve el puerto 5174, detener Vite con Ctrl+C.
2. `cd "$env:USERPROFILE\Downloads\ORBI-LIVING-PRESENCE-LAB"`.
3. Revisar `git status --short` y si está limpio, ejecutar `git pull --ff-only`, `npm.cmd test`, `npm.cmd run build`, `npm.cmd run dev -- --port 5174 --strictPort`.
4. Abrir `http://localhost:5174/`, recargar con Ctrl+Shift+R, cargar Vita.vrm localmente.
5. Activar Presencia natural A/B y, si hay un Idle Mixamo seleccionado, activar explícitamente LP-02C.1 y su suavizado de balanceo como antes.
6. Activar LP-03B.1 y fijar intensidad **50–60%**. Pulsar **Asentir suavemente** y verificar anticipación, asentimiento y recuperación gradual. Observar perfil de cuello y barbilla.
7. Pulsar **Mirar con curiosidad**: los ojos deberían cambiar primero de orientación y la cabeza acompañar con suavidad. Confirmar que no se crucen ojos ni se produzcan giros repentinos.
8. Pulsar **Énfasis discreto**: las manos y los brazos se reajustan levemente. Inspeccionar frente y perfil para detectar intersección de brazos con vestido.
9. Alternar LP-03B OFF/ON; el Idle LP-02C.2 debe mantenerse sin alteraciones cuando el director está apagado.
10. Seleccionar Walking/Clapping y confirmar que los botones se deshabilitan o el comando se rechaza. Probar pausa, cambio de clip y recarga del VRM; nada debe quedar acumulado.
11. Verificar performance/FPS en laptop real y preservar VRM/FBX privados sin subirlos a CI.

## Siguientes fases

- **LP-03B.2:** gestor de prioridades y propiedad temporal de huesos para gestos más complejos, IK de manos, detección de colisiones y transiciones entre gestos compatibles; no asumir que los tres gestos pequeños ya son actuación humana completa.
- **LP-03C:** conectar intenciones estructuradas y validadas desde Qwen local (pensar/escuchar/explicar) y sincronizar gestos con audio TTS realmente reproducido. No consultar el LLM por fotograma.
- **LP-04:** verificar integración en LUMIA R8 mediante rama específica tras certificación visual de Vita y mediciones de rendimiento. No modificar main por ahora.

**Seguridad:** PR siempre en borrador, sin merge. Ningún archivo VRM/FBX privado se escribe o exporta con gestos procedurales.
