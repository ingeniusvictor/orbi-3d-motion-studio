# AUTORIG-02E · Controles desplegables directamente sobre el visor 3D

## Problema

Con AUTORIG-02D los controles de edición de animaciones de personajes ya riggeados quedaban muy abajo en la barra lateral. Para cada corrección había que desplazarse entre paneles y volver a subir al modelo para comprobarla. El usuario pidió un botón desplegable en la parte superior de la propia **ventana de visualización del personaje**, con acceso inmediato a los ajustes.

## Solución

En **Visor 3D**, cuando el modelo contiene huesos, aparece un botón **«Animación ▾»** a la derecha de las herramientas de cámara. Abre/cierra una ventana flotante en la parte superior del visor, sin abandonar el personaje.

- El panel se ubica inicialmente a la derecha y ofrece **«Mover panel al otro lado»** para despejar la zona que se quiera observar.
- **Cerrar** solo oculta el panel; no descarta los ajustes ni el clip seleccionado.
- El panel tiene scroll independiente: el canvas Three.js sigue visible y puede rotarse/inspeccionarse fuera de la ventana flotante.
- **Separación de brazos** y **amplitud de movimiento** están a la vista como sliders principales.
- La detección/asignación manual de huesos está en **«Asignación de huesos (avanzado)»**.
- **Look, Overdrive, Trim y Mirror** están en **«Más ajustes»**.
- Reproducción, pausa, tiempo de fotogramas, restauración y botón de **exportación GLB** permanecen dentro del mismo panel.
- Cuando se abre el panel de animación se cierra el de rostro y viceversa, evitando superposiciones.
- En pantalla móvil, el panel ocupa parte inferior del visor y permite ver el personaje por encima.
- El editor antiguo se retiró del final de AutoRig Studio **solo para personajes con rig**. Queda un aviso que orienta al botón de la parte superior.
- La ruta anterior de creación de rig y el preset Blender quedan ocultos para modelos ya riggeados, pero intactos para modelos estáticos.

## Prueba manual

1. Actualizar a `feat/autorig-02e-viewport-motion-dock`.
2. Cargar el modelo **con rig y clips**. No hace falta JSON de marcadores.
3. Pulsar **«Animación ▾»** junto a los botones de Cuadrícula, Huesos y Rostro del visor.
4. Seleccionar `Snake Hip Hop Dance` u otro clip; pulsar Reproducir o Pausar.
5. Probar **Character Arm-Space** 50→65→75, y **Arms** 100→85 observando simultáneamente personaje y panel.
6. Cambiar el panel de derecha a izquierda si tapa una mano o un muslo. Ocultarlo y reabrirlo: valores y clip deben permanecer.
7. Abrir «Más ajustes» para Trim, Look, Overdrive y Mirror. Abrir asignación de huesos solo si no se detectan.
8. Exportar GLB corregido; volver a cargarlo para comprobar texturas, esqueleto, pistas y movimientos.

## Seguridad y alcance

Este cambio **reubica la interfaz**; no altera el motor de rigging, los pesos, el flujo de clips ni el exportador existentes. La modificación/exportación de movimientos continúa siendo el piloto 02D, que debe validarse con el GLB/FBX real. El modelo original nunca se sobrescribe. No se automatizan colisiones ni IK.

La nueva rama está basada en `feat/autorig-02d-edit-existing-rig`. `main` permanece intacta.
