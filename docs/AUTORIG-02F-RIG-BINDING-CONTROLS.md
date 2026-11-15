# AUTORIG-02F · Reparación de Arms y Look en modelos FBX con rig existente

## Síntoma real

El usuario confirmó que el panel de animación sobre el visor AUTORIG-02E se ve correctamente, con un FBX riggeado de ~7,6 MB y clip de ~27,37 s. Los deslizadores **Overdrive, inicio y fin de Trim** se aplicaban, pero **Character Arm-Space, Arms y Look** regresaban a sus valores 50 / 100 / 50. La captura mostró que los controles no estaban deshabilitados.

## Diagnóstico del código

- `editExistingRigClip` rechaza explícitamente movimientos de brazos cuando no encuentra **ambos huesos superiores** y rechaza Look sin un hueso de cabeza.
- Las denominaciones de huesos pueden variar entre FBX/Mixamo, Blender, Character Creator y otros.
- `ExistingRigMotionLab` manejaba el rechazo mediante un `catch` que dejaba intacto el estado del slider; **el error solo se imprimía al final del panel**, después de la exportación, fuera de la zona visible. Por eso parecía que el control no podía activarse.
- Otra posibilidad era la ausencia de una pista de cuaternión de cabeza/brazo en el clip importado; el editor no generaba ningún movimiento para ese hueso.
- Sin el FBX original no se puede determinar cuál de esos casos concretos corresponde al usuario; las soluciones cubren ambos.

## Corrección aplicada

1. **Reconocimiento ampliado y conservador** de nombres de los huesos superiores y cabeza con variaciones: `mixamorigLeftArm`, `mixamorig:LeftArm`, `mixamorig1LeftArm`, `LeftUpperArm`, `J_Bip_L_UpperArm`, `CC_Base_L_Upperarm`, `DEF-upper_arm.L`, `Bip01 L UpperArm`, `UpperArm_Right`, `Head_JNT`, etc. No se toma `forearm`, `elbow`, `hand`, `shoulder`, `hair` o `eye` como un brazo superior/cabeza. En candidatos ambiguos no se adivina: se pide elegir manualmente.
2. **Mensajes de error en el mismo bloque “Ajustes en vivo”**, antes de los sliders y no escondidos al fondo de la ventana. Si faltan huesos se muestra un botón **Identificar brazos** o **Identificar cabeza** que abre la sección “Asignación de huesos (avanzado)”.
3. Los selectores manuales usan ahora **UUID de hueso**, que distingue incluso nodos con el mismo nombre FBX. Las asignaciones automáticas existentes por nombre continúan siendo compatibles.
4. **Rutas FBX Mixamo con nomenclaturas distintas:** se corrige el caso donde el esqueleto se llama `mixamorig:LeftArm` pero la animación usa `mixamorigLeftArm.quaternion` (o viceversa). Las pistas editadas y las copias destinadas al exportador GLB apuntan al UUID real del hueso, conservando las originales intactas.
5. Cuando se ajusta `Look` o `Character Arm-Space` pero el clip no tenía ninguna pista de cuaternión para el hueso correspondiente, ORBI agrega **una pista temporal** `QuaternionKeyframeTrack` sobre la copia del clip a partir de su cuaternión seguro en reposo. No crea ni sustituye huesos, no reescribe pistas existentes ni modifica pesos. `Arms` (escala de amplitud) sin pista fuente de rotación, en cambio, da un error explícito porque no hay movimiento que escalar.
6. Si el FBX usa rotación Euler en lugar de cuaterniones, no se fuerza un override inseguro: se informa que hace falta una conversión de pistas.

## Prueba en el equipo

1. Actualizar a `feat/autorig-02f-control-bone-binding`, conservando el GLB/FBX original.
2. Cargar el personaje animado, abrir **Animación ▾** encima del visor y elegir el clip.
3. Revisar si “Asignación de huesos (avanzado)” indica que faltan brazos. Si falta alguno, elegir su **hueso superior verdadero**, no el hombro ni el antebrazo. Ejemplos típicos `mixamorigLeftArm` y `mixamorigRightArm`.
4. Llevar **Character Arm-Space de 50 a 70**. El número debe quedarse en 70 y la posición de ambos brazos cambiar en la secuencia.
5. Probar **Arms de 100 a 85**. Debería reducir el rango de movimiento de los brazos existentes.
6. Abrir Más ajustes y mover **Look de 50 a 65**. Si el nombre de cabeza no se reconoce, seleccionar el hueso real en “Asignación de huesos”.
7. Pausar y arrastrar la línea de tiempo hasta un fotograma con intersección mano-muslo. Verificar frente y perfil.
8. Volver a valores neutrales y verificar que el clip base se recupera sin pérdidas. Solo exportar a GLB después de constatar que el resultado realmente cambia.

**Límites:** el editor continúa siendo aproximado, sin IK ni sistema de detección automática de colisiones. No se ha probado el FBX específico del usuario. Mantener branch/PR experimental separado de main.
