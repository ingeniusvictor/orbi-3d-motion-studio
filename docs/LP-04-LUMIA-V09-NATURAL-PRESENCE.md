# LP-04 · Presencia natural reversible para LUMIA Claude V09

## Necesidad y contexto

El usuario validó **STUDIO-09** como una mejora profesional del visor y
solicitó continuar con las recomendaciones de movimiento natural, partiendo
de la maestra **Claude V09**, preservando las capacidades de rostro y voz,
el VIEWER-04 que solucionó GLB/FBX sin clips, y MOTION-06/07.

**Este cambio NO habilita por fuerza LP-01/02/03A/B VRM sobre el GLB.**
Introduce un nuevo **LP-04**, adaptador específico de Claude V09 para vista
previa *idle* y de amplitud controlada, totalmente opt-in.

## Auditoría realizada sobre la maestra real GLB

El GLB original conservado de la conversación contiene un skin de **346
huesos** y la jerarquía verdadera de V09:

- `V8_Bip001-Pelvis` → `V8_Bip001-Spine` →
  `V8_Bip001-Spine1` → `V8_Bip001-Spine2`.
- `V8_Bip001-Spine2` es padre de ambas clavículas, de cada brazo
  y del montaje de cuello.
- `J_Bip_C_Neck` → `J_Bip_C_Head` en la cabeza adulta, conectada
  mediante el montaje especial de V09. El adaptador comprueba la relación
  de descendencia, **no asume que el cuello del adulto sea hijo directo de
  la columna**.
- Brazos: `V8_Bip001-L/R-UpperArm`, muñecas `...-Hand`.
- Dedos raíz por lado: `V8_Bip001-L/R-Finger0` a
  `V8_Bip001-L/R-Finger4`, 10 candidatos. Sus ejes reales no están
  certificados para flexión anatómica; por eso su movimiento es opcional
  y apagado de inicio.
- La maestra se reconoce primero mediante el test existente de **pose de
  reposo inverse-bind**: pelvis Y ≈ 0,9432 m y cabeza Y ≈ 1,4177 m.
  Rechaza V06B (pelvis ≈1,0564 m, cabeza ≈1,5835 m) y rigs genéricos.

La ejecución no se basa en encontrar 346 huesos solamente: comprueba además
nombres únicos, jerarquía de cabeza, columna, brazos y manos. Si algo falla,
el motor permanece deshabilitado.

## Funciones implementadas

**Previsualización sin animación seleccionada:**

1. **Respiración suave (activada por defecto tras consentir LP-04):**
   variaciones mínimas locales en Spine1/Spine2, sin mover root, pelvis,
   piernas, talones o dedos del pie.
2. **Cabeza y cuello (activado por defecto tras consentir LP-04):**
   oscilaciones locales discretas sobre `J_Bip_C_Neck/Head`.
   No implica detección de mirada ni orientación automática de los ojos.
3. **Brazos/muñecas (optativo):** oscilaciones muy pequeñas desde
   UpperArm/Hand, sin cambiar las posiciones base.
4. **Dedos (optativo):** microflexión en **solo los diez huesos raíz**
   identificados. Los ejes deben auditarse visualmente en Windows antes de
   anunciar gestos o animación anatómica certificada.
5. Intensidad limitada al rango 0–65 % y velocidad a 30–150 %. La
   activación tiene entrada gradual para evitar tirones.
6. Interruptor A/B completamente reversible. Desactivarlo, cambiar modelo,
   detener la preview o exportar debe restaurar sus rotaciones previas.

## Contrato de no interferencia

- Una animación **seleccionada**, incluso si está pausada, tiene
  **propiedad exclusiva del esqueleto**. LP-04 se suspende automáticamente
  (`clipSelected: this.current !== null`), sin alterar la pista ni aplicar
  movimientos encima de Mixamo.
- Orden de render:
  `beforeFrame()` retira el overlay previo → AnimationMixer →
  `LumiaV09BodyPresence.update()` solo si idle → expresiones de rostro →
  render.
- `release()` restaura una rotación antigua **solo si** el hueso sigue
  exactamente en la rotación aplicada por LP-04; respeta modificaciones
  externas posteriores.
- `withPresenceSuspended()` elimina el overlay **antes** de exportar GLB/
  FBX o tomar instantáneas del personaje.
- El motor no edita matrices inverse-bind, atributos de geometría, pesos,
  morph targets, materiales, clips, nombres, archivos ni posiciones base.
- No se modifica el motor original `LivingPresence(vrm)`, el compositor
  VRM, el retargeting MOTION-06/07 ni FACIAL-08.

## UI en STUDIO-09

Nueva sección **LP-04 · LUMIA Claude V09** al principio del panel
flotante **LP cuerpo**. Muestra compatibilidad, 346 huesos, cantidad de
dedos candidatos, estado de suspensión con clip, interruptor A/B,
opciones independientes para respirar, cabeza, brazos y dedos, intensidad
y velocidad. La matriz de LP señala que LP-04 es **parcial**, sin etiquetar
falsamente LP-01/02/03 como compatibles con GLB/FBX.

## QA automatizada

`tests/lp04V09NaturalPresence.test.js` construye un rig sintético de 346
huesos con **los nombres y jerarquía verdaderos**, y comprueba:

- Reconocimiento V09 vs. V06B y rechazo de jerarquías desconocidas.
- No movimiento previo a activación explícita.
- Respiración/cabeza reversibles, brazos/dedos apagados inicialmente.
- Activación optativa de diez raíces de dedos.
- Cualquier clip seleccionado bloquea la superposición (incluso pausado).
- Un editor externo puede modificar un hueso sin que `release()` lo pise.
- `withPresenceSuspended()` restaura antes de exportar y preserva buffers
  de geometría, skeleton y parámetros.
- Render del componente real React en STUDIO-09 sin pérdida de la sesión
  VIEWER-04 ni cambio de módulos VRM.

Las pruebas automatizadas **no certifican** naturalidad, ejes y deformaciones
artísticas en el personaje real. La auditoría visual en Chrome sigue
pendiente.

## Prueba sugerida en el equipo del usuario

1. No sobrescribir la carpeta validada `ORBI-VIEWER-04`; iniciar un
   `git worktree` en `ORBI-LP-04-QA`.
2. Detener cualquier Vite que use el puerto **5201** (`Ctrl+C`), iniciar
   la nueva rama en ese mismo puerto.
3. Cargar **LUMIA_CLAUDE_MAESTRA_346.glb** original, sin clips; confirmar
   que el visor sigue funcionando, y los ojos/expresiones FACIAL-08.
4. Abrir **LP cuerpo** → **LP-04**. Debe reconocer la maestra V09 y mostrar
   10 raíces de dedos candidatas.
5. Activar **Presencia natural V09 (prueba A/B)** con solo respiración y
   cabeza; centrar cámara y ampliar torso/cabeza. Valorar naturalidad y
   confirmar que cuello/cabello/cara no se deforman.
6. Activar brazos, revisar ambas clavículas, axilas y muñecas. Desactivar
   para recuperar pose original.
7. Activar dedos **solo para una prueba controlada**, revisar pulgares
   y dedos por separado; si alguno gira incorrectamente, desactivar
   hasta calibrar ejes y límites.
8. Cargar un GLB/FBX con clip seleccionado: LP-04 debe suspenderse
   automáticamente y no disputar rotaciones con la animación.
9. Exportar copia GLB con presencia activada, reimportarla, verificar que
   no haya movimientos residuales; confirmar que siguen presentes todos
   los morphs de la cara.
10. Comprobar VRM original: motor corporal antiguo y LP-03D operativos.
11. Si aparece un defecto visual, registrar qué opción lo genera y una
    captura desde el visor (sin modificar la maestra).

## Estado

**Implementado como PR en borrador sobre STUDIO-09**, sin modificación
de `main`, VIEWER-04 ni las ramas anteriores. Validación visual en
Windows pendiente. Próxima etapa tras validación: identificar ejes de
dedos por lado, ampliar a gestos reales y preparar compatibilidad con
animaciones idle cuidadosamente filtradas, sin sobrescribir los Golden.
