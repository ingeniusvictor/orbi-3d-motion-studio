# AUTORIG-02C.4 · Controles de animación estilo Mixamo

## Origen de la solicitud

El usuario mostró el panel de Mixamo con **Arms**, **Look**, **Overdrive**, **Character Arm-Space**, **Trim** y **Mirror**, durante una animación *Snake Hip Hop Dance* de su personaje LUMIA V06B. Pidió replicar controles para poder separar los brazos de LUMIA 50K cuando atraviesan las piernas durante los movimientos.

**Aclaración importante:** V06B (el modelo que aparece en Mixamo) y LUMIA 50K (el personaje cuyo rig construye ORBI en esta fase) son modelos distintos. La animación descargada de Mixamo se adapta al esqueleto de 19 huesos de LUMIA 50K con la conversión aproximada de AUTORIG-02C.3. No es una copia del rig de V06B.

## Alcance implementado

En AutoRig Studio > generar esqueleto > calcular pesos > **AUTORIG-02C.3 · Animación corporal completa**, aparecen los nuevos controles **AUTORIG-02C.4 · Ajustes de animación estilo Mixamo**:

| Control ORBI | Rango / neutral | Acción |
|---|---|---|
| **Character Arm-Space** | 0–100, neutro 50 | Ajuste adicional sobre las rotaciones locales Z de ambos brazos. Separación simétrica: 100 suma ~35° para alejarlos del torso, 0 reduce ~20°. Comenzar con 65–75 |
| **Arms** | 0–150 %, neutro 100 % | Reduce o aumenta la amplitud de los canales del brazo superior con slerp respecto a la postura neutra |
| **Look** | 0–100, neutro 50 | Ajusta el giro horizontal de la cabeza hasta ±25° como corrección simplificada |
| **Overdrive / velocidad** | 0.25× a 2×, neutro 1× | Control existente de velocidad del reproductor |
| **Trim** | inicio/fin en %, neutro 0–100 | Crea un nuevo clip temporal muestreando únicamente el intervalo seleccionado (mínimo 5 % del original) |
| **Mirror** | Sí / no | Intercambia huesos left/right y refleja sus cuaterniones según plano YZ |
| **Restaurar ajustes** | — | Vuelve al clip fuente sin cambios de parámetros |

Los cambios son **en vivo y reversibles**. No alteran ni el archivo FBX descargado ni el clip de origen en memoria. Los controles son aproximaciones de ORBI: **no se usa ni se replica el algoritmo interno de Mixamo**. Algunas opciones originales de Mixamo varían por tipo de animación y no son equivalentes a nuestros ajustes.

Cada clip dentro de la misma sesión conserva su configuración al cambiar de animación. Los parámetros no se guardan automáticamente entre reinicios. Ahora hay botones **Guardar ajustes JSON** y **Abrir ajustes JSON** para conservar y restaurar la configuración del clip seleccionado, incluida su velocidad. El preset verifica nombre del modelo y del clip, y no contiene FBX, GLB ni mallas.

**No se incluyen estos ajustes en una exportación GLB**: AUTORIG-02C sigue sin exportar un avatar riggeado. La descarga JSON solo guarda parámetros, no una animación con skinning.

## Prueba recomendada con el problema concreto

1. Cargar `lumia 50k.glb`, abrir el JSON con los 22 puntos anatómicos, generar el esqueleto, activar skinning.
2. Reproducir la marcha integrada de ORBI o importar un movimiento FBX de Mixamo descargado *Without Skin*.
3. Desde la vista frontal, localizar el momento donde la mano se aproxima al muslo.
4. Aumentar **Character Arm-Space** de 50 → 65 → 75; observar si disminuye la intersección.
5. Si el brazo se mueve demasiado o se hunde al girar, reducir **Arms** de 100 % a 80 %.
6. Pausar, girar la vista lateral y recorrer los fotogramas con la línea de tiempo. Verificar que el ajuste no haya causado intersecciones con hombro, pecho o ropa.
7. Probar **Mirror** para contrastar si el problema corresponde a una zona de pesos del lado izquierdo/derecho.
8. Pulsar **Restaurar ajustes** y confirmar que el movimiento original vuelve sin residuos.
9. Guardar el JSON anatómico de puntos de AUTORIG-02; este JSON es distinto de los parámetros de animación.

## Límites técnicos

- **Separar los brazos no garantiza evitar colisiones.** Este piloto no detecta contactos entre superficies ni ajusta IK, pies o manos mediante optimización geométrica.
- La rotación de apertura es local. Si el esqueleto Mixamo es radicalmente diferente o el retarget orienta mal un brazo, será necesario mejorar el mapeo del rig.
- La cabeza, los dedos y la ropa pueden requerir pesos adicionales. El rig sigue teniendo 19 huesos.
- Trim/Overdrive no son edición permanente del archivo FBX; solo se aplican a la copia reproducida en el visor.
- No se modifica `main`, el GLB original de LUMIA 50K ni los rigs Vita/Mint.

## Validación

Pruebas sintéticas Three.js de apertura bilateral, amplitud, mirada, espejo, recorte, rechazo de parámetros inválidos, reversibilidad de buffers y reproducción multihueso. El primer test visual completo con un **FBX Mixamo auténtico aplicado a LUMIA 50K** sigue pendiente.
