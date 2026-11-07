# LUMIA — Arquitectura del sistema nervioso digital
## Hoja de ruta LP-02B.1 → LP-03 y posteriores | 7 nov 2026

**Motivación:** la experiencia de Vita.vrm (155 huesos, 30 roles de dedos) confirmó que reproducir un clip de Mixamo o descender los brazos no basta para comunicar reposo humano. Una mano descansando normalmente no conserva las falanges completamente rectas ni hace las mismas microacciones en ambas extremidades.

**Objetivo:** presencia creíble, con intención y continuidad, en la app VRM existente basada en Three.js y @pixiv/three-vrm; conservar LUMIA-ASUS R8 y su voz fuera de la rama experimental.

## Tres capas con frecuencias y responsabilidades diferentes

### 1) Sistema autónomo de presencia — por fotograma de render

- Motor existente: Three.js + Three-VRM. No es necesario migrar a Unity, Godot ni agregar inferencia neuronal para este nivel.
- Ejecuta postura relajada, curvatura de manos, respiración, parpadeo, mirada, pequeños reajustes asimétricos y física secundaria.
- Mantiene reposo vivo durante pausas, durante espera del LLM y en silencio. Nunca consulta al LLM para calcular cada hueso a 60 FPS.
- Curvas continuas, pausas y eventos ocasionales; no generar vibraciones permanentes ni repetir sin variación un mismo clip.
- Asigna roles de huesos y expresiones a propietarios únicos: blend de clip, motor procedural, IK, lookAt y VRM springbone deben conocer las zonas que controlan.

### 2) Cerebelo o coordinador motor — transición y composición temporal

- Un controlador de estados recibe metas, no ángulos crudos: idle, attentive, thinking, speaking, curious, explaining, point, reach, walk, stop.
- Frecuencia de decisiones baja (por evento; la actualización de interpolaciones y del IK puede ser por fotograma).
- Selecciona acciones y límites de seguridad, ajusta velocidades y amplitudes, reserva prioridad por articulación.
- Composición con FBX Mixamo de reposo de LUMIA R8 será **LP-02C**, actualmente pendiente: base clip por un lado, microacciones específicas sobre los huesos que el clip permita, con máscaras, blends y reversión. Evitar que el clip reescriba la capa procedural cada fotograma.
- Para contacto real con superficies, integra cinemática inversa y detección de colisiones en fases posteriores.

### 3) Corteza o puente de intención — IA local por solicitud/evento

- LUMIA puede continuar usando los cerebros locales ya probados: Qwen 3.5 2B en la ASUS y 0.8B en el Ryzen 7. No hace falta cambiar de modelo para mover dedos en tiempo real.
- La IA no escribe una lista de 155 cuaterniones ni manda órdenes por fotograma.
- Un contrato de intención validado sustituye al campo «pensamiento interno». No almacenar razonamientos privados del modelo para orquestar el cuerpo.
- El usuario controla explícitamente permiso de micrófono/cámara y cualquier iniciativa espontánea. El motor nunca supone que ve al usuario mirando un objeto si no existen datos reales.
- Silencio y espera no deben provocar conversaciones no solicitadas. El sistema autónomo se mueve solo y el motor de voz inicia únicamente cuando corresponda por interacción/consentimiento.

## Contrato propuesto de eventos

Ejemplo de orden de alto nivel, no implementada todavía:

```json
{
  "schema": "orbi.lumia.motor-intent.v1",
  "id": "intent-001",
  "type": "attentive",
  "attentionTarget": "camera",
  "gesture": "none",
  "affect": { "label": "curious", "intensity": 0.35 },
  "durationMs": 3500,
  "priority": 20
}
```

La capa motora acepta solo acciones y targets de una lista permitida. Duración, intensidad y prioridad acotadas. Si la IA no responde, se mantiene un reposo seguro y fluido. Si empieza una animación manual, tiene prioridad. Si cambia de modelo, se reinician controladores y se restauran valores originales.

## Plan de implementación

- **LP-02B.1 — Curvatura natural de mano:** perfil independiente para pulgar, índice, medio, anular y meñique; diferentes grados para nudillos/proximal, intermedia y distal; estabilidad por springs, slider de relajación y corrección por mano del sentido de flexión. Código implementado en rama de laboratorio; validación visual en Vita.vrm pendiente.
- **LP-02B.2 — Pulgar y postura de muñeca:** oposición del pulgar, mano suavemente ahuecada, reducción de dedos abiertos en abanico, chequeo de intersección con vestido y cuerpo. Calibración anatómica con captura frontal y lateral de las manos.
- **LP-02C — Composición del FBX R8 con vida procedural:** reproducir Mixamo como base sin bloquear dedos, ojos o microajustes apropiados. Control de máscara por huesos, propietario temporal, interpolación y QA de movimientos existentes. No habilitar hasta probar que las capas no se contradicen.
- **LP-03A — Cerebelo motor:** máquina de estados, planificador de gestos, canales de prioridad, blending y transiciones.
- **LP-03B — IK de interacción:** mirar, señalar, alcanzar, recuperar postura, evadir colisiones; luego suelo/pies/cambio de peso sin deslizamiento.
- **LP-03C — Bridge Qwen:** contrato de intents con validación y cancelación, sincronización con Kokoro/Whisper y respetar el texto/audio reproducido, no una predicción.
- **Certificación:** primero pruebas automatizadas y CI en PR borrador, después revisión visual con VRM/FBX local, pruebas de rendimiento en laptop y solo entonces una rama de integración en LUMIA-ASUS.

## QA inmediato para LP-02B.1

1. Probar con Vita.vrm en localhost:5174 y sin clip seleccionado; activar el laboratorio.
2. Usar postura de brazos 90–95%, curvatura de dedos 75–100%, microactividad al 50–65% y modo de inspección sin amplificar inicialmente.
3. Zoom de manos desde frente y lateral; comprobar mano descansada, falanges no alineadas y pulgar en posición aceptable. Si los dedos doblan hacia afuera, utilizar «Calibrar sentido de flexión» para invertir solo la mano afectada.
4. Apagar el motor: debe regresar exactamente a la pose original, sin drift. Repetir varias veces.
5. Cargar clip FBX de prueba y confirmar que conserva su prioridad; el reposo orgánico sobre Mixamo todavía no existe.
6. Validar FPS, parpadeo, expresiones, materiales y exportación sin regresiones.

**Reglas:** no subir modelos originales a repos públicos ni a CI, no modificar main, no afirmar realismo certificado hasta probarlo visualmente.
