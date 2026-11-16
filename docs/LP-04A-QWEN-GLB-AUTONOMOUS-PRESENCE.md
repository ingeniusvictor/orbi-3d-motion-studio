# LP-04A — LUMIA GLB 346 + Qwen: presencia motora contextual

## Alcance verificado
Este desarrollo parte de MOTION-07 (`feat/motion-07-claude-v09-mixamo-toelock`) y **no cambia** rigs, ToeLock, FBX, el retargeting, el editor de clips ni los pesos de piel. El modelo base GLB y el modelo Claude V09 comparten los nombres de huesos necesarios y contienen una skin con 346 joints.

ORBI ya disponía de:
- `ollamaMotorIntent.js`: pregunta local a Qwen 3.5 por Ollama y verifica JSON (`motorMode`, `gesture`, `intensity`).
- `voiceMotorBridge.js`: inicia un gesto **solo con el evento real de reproducción de voz**, y detiene/restaura la sesión al terminar o cancelar.
- `gestureDirector.js`: catálogo pequeño de gestos humanos, sin comandos arbitrarios a los huesos.

LP-04A conecta estos componentes con un **GLB de LUMIA de 346 huesos**, que antes quedaba excluido por el bloqueo exclusivo de VRM.

## Funcionalidad
- Nuevo `GlbAutonomyDirector`, activación **manual** y desactivado por defecto en cada carga.
- Microbalanceo/respiración en reposo, calculado en cada fotograma con amplitud pequeña y sin pedir a Qwen un stream de rotaciones.
- Qwen propone solo `resting`, `attentive`, `thinking`, `explaining` y los gestos `none`, `acknowledge`, `curious`, `emphasize`; el controlador rechaza cualquier gesto no reconocido.
- Cabeza, cuello, torso y brazos; **sin tocar pies, dedos, rodillas, caderas ni raíz**.
- El compositor conserva una copia temporal de cada cuaternión aplicado y lo restaura antes del siguiente fotograma/mixer.
- **Prioridad absoluta de los clips Mixamo:** no se superpone microgestualidad cuando un clip está reproduciéndose.
- Voz real antes de gesto: el comportamiento reutiliza los eventos `onstart` de voz del navegador o `playing` de WAV/MP3. El texto que genera Qwen **no inicia por sí solo** una acción.
- Los cambios son visuales; **no se exportan** como animación ni modifican los GLB originales. La futura exportación requiere un módulo de bake separado y QA de curvas.

## Prueba manual en Windows (ORBI)
1. Abrir ORBI desde la rama LP-04A, con la configuración de Ollama local que ya se usa en LP-03C.1.
2. Cargar `LUMIA_CUERPO_BASE.glb` o `LUMIA_CLAUDE_MAESTRA_346.glb`, **sin un baile activo**.
3. Ir a LP-03C.1 «Qwen local + voz sincronizada».
4. Marcar `LP-04A · Movimiento corporal GLB con Qwen`: aparecerá un reposo suave. Desmarcar y comprobar regreso preciso a la pose previa.
5. Marcar «Autorizar movimiento y reproducción de voz». Conectar Ollama y seleccionar el Qwen 3.5 instalado (por ejemplo, 2B en ASUS).
6. Hacer una pregunta, comprobar la respuesta estructurada y reproducirla con voz de navegador o WAV/MP3.
7. Durante la voz observar el gesto puntual y el estado motor; al finalizar comprobar el regreso al reposo.
8. Activar un baile Mixamo: la superposición LP-04A se suspende automáticamente. Pausar el baile para comprobar el estado.
9. Exportar GLB y volverlo a abrir: no deben aparecer pistas de LP-04A ni cambios de geometría, huesos, morphs o skin.

## Seguridad y límites
- El cerebro Qwen **nunca puede enviar rotaciones, nombres de huesos, comandos de sistema ni ejecutar código**. Solo un enum previamente validado.
- Ollama continúa restringido a `127.0.0.1` o `localhost`, no a un servicio externo.
- No habilita aún locomoción autónoma, IK, manos sujetando objetos, gestos largos, coordinación de varias animaciones ni enlace directo con el ejecutable de LUMIA/servidor Kokoro.
- `GlbAutonomyDirector` protege el rig aprobado de 346; otros modelos permanecen sin soporte hasta calibrar y añadir pruebas.
- Los test automáticos comprueban reversibilidad, aislamiento de pies, prioridad de Mixamo y activación con audio. **No sustituyen la inspección visual en Windows.**

## Próximas fases
LP-04B: adaptador explícito de eventos de LUMIA (escuchando, razonando, hablando, interrumpido), con sesión y número de secuencia, para que el Qwen del ejecutable local gobierne ORBI sin duplicar consultas.

LP-04C: director semántico de clips aprobados con transiciones, capas faciales y motoras independientes, límites de postura, pausa/interrupción y protección del apoyo de los pies.

LP-04D: pruebas visuales con la maestra Claude y QA del movimiento simultáneo de boca/ojos/manos, latencia y continuidad; no activar locomoción antes de validarlas.

Esta rama se propone como PR **draft** hacia MOTION-07; no fusionar con main.
