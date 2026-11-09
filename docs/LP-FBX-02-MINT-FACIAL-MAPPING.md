# LP-FBX-02 — Mapeo facial de Mint V8 con controles reversibles

**Contexto del fallo real (usuario, 2026-11-08):** El panel de rostro se abre y la cámara sigue la cabeza, pero los botones de expresiones y boca permanecían deshabilitados en `Mint_Swimsuit_V8_LUMIA_NO_CAT_EARS_ANIMATED.fbx`. Este FBX tiene 488 huesos y no contiene shape keys según el informe de Codex; **488 huesos NO certifican controles de ojos, boca ni visemas**.

## Modificaciones en la rama experimental
- El visor sigue utilizando la cámara facial estable LP-FBX-01.
- `FbxFaceQA` reconoce canales solo con parejas únicas y válidas por nombre; ofrece además un mapa manual por **UUID real de hueso cargado**, nunca por coincidencias ambiguas.
- Roles seleccionables: ojos izquierda/derecha, párpados superiores, cejas, mandíbula, comisuras, mejillas. El usuario puede buscar entre los huesos **reales de la malla SkinnedMesh**.
- Cada par (ojos, párpados, cejas, comisuras o mejillas) habilita su canal únicamente cuando sus dos huesos están mapeados. Mandíbula se controla por separado. **Sin rig facial identificado, no se habilita ninguna expresión falsa.**
- El usuario puede activar/desactivar el QA; al cargar un FBX está siempre desactivado, incluso si existen controles inferidos. La pose de prueba se restaura en cada fotograma antes de actualizar el AnimationMixer.
- Se impide asignar un mismo hueso a varios roles, usar UUID inexistentes o cambiar mapeo mientras hay sesión de voz.
- `FaceQuickDock` proporciona selector de rol, búsqueda de huesos, asignación, desactivación, restauración de reconocimiento automático y descarga directa del diagnóstico del rig.
- El panel LP-03D de voz se sincroniza con el estado real de habilitación del QA FBX; no se confunde apertura aproximada de mandíbula con visemas fonéticos ni se habilita el motor corporal VRM.
- No se guarda el mapeo de la sesión en los archivos FBX ni se exporta en el clip. No se modifica Mint V8 ni ningún archivo del equipo. El cambio está limitado al visualizador.

## Procedimiento de QA real
1. Abrir el FBX V8 animado original en ORBI.
2. Pulsar «Rostro» en el visor y luego «Controles faciales».
3. Abrir «Mapear huesos faciales» y buscar en el selector por `eye`, `lid`, `brow`, `jaw`, `lip`, `mouth` o `cheek`. Revisar la jerarquía si el nombre es desconocido.
4. Asignar ambos huesos de un canal (por ejemplo Ojo izquierdo y Ojo derecho). Verificar que quede activable el control Mirar izquierda/derecha.
5. Autorizar «Activar pruebas faciales reversibles», pausar la animación mientras se inspecciona el eje, probar el botón correspondiente y observar **si se mueve la región correcta, en dirección correcta y sin deformar**.
6. Si hay movimiento invertido/no visible, desactivar QA, no exportar ese resultado ni atribuir al rig un control inexistente. Descargar el diagnóstico desde el mismo panel; enviarlo para crear un perfil Mint V8 específico, basado en huesos reales.
7. Con mandíbula reconocida, probar apertura A sin voz y luego reproducir una demostración con voz del navegador o WAV/MP3 local. La voz puede sonar aun sin control labial: no inventar lip-sync fonético.
8. Regresar a Vista general y comprobar que la animación V8 sigue intacta al desactivar QA.

**Límite:** Estas son pruebas óseas genéricas con rotaciones acotadas, sin conocimiento de la dirección anatómica local del rig. Pueden no ser suficientes para los ojos, pestañas ni boca de Mint; la calibración requiere comparar el archivo real y/o su diagnóstico. El motor corporal LP-02/03 exclusivo de VRM no se habilita automáticamente en el FBX de 488 huesos. Para esa migración se requiere un adaptador humanoide específico, no quitar `disabled` de los controles.

### Gate de aceptación
CI verifica funciones sintéticas, reversibilidad, ausencia de asignaciones duplicadas y compilación. **CI no valida los 488 huesos, los pesos ni el movimiento facial auténtico del FBX privado.** No afirmar que Mint tiene una sonrisa, visemas o párpados operativos hasta las pruebas reales.
