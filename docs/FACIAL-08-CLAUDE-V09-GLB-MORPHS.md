# FACIAL-08 · Recuperar expresiones y visemas del GLB/FBX LUMIA V09

## Problema validado en el dispositivo del usuario

El usuario confirmó que la integración VIEWER-04 + MOTION-07 abre correctamente GLB y FBX,
tanto estáticos como animados. Sin embargo, las funciones de ojos, boca, expresiones
y sincronización labial que había probado con Vita.vrm aparecen desactivadas al
cargar la nueva LUMIA Claude V09.

**No confundir el formato con las capacidades:** un GLB no necesita metadatos
VRM para conservar morph targets. La falta de VRM solo impide usar directamente
`vrm.expressionManager` / `vrm.lookAt`. El visor anterior creaba
`FbxFaceQA` en todos los GLB/FBX no-VRM y detectaba solo *huesos faciales*;
ignoraba los blendshapes de sus mallas.

## Evidencia real del GLB de Claude (9.872.116 bytes)

Se inspeccionó `LUMIA_CLAUDE_MAESTRA_346.glb` de la biblioteca real, sin
modificarlo ni subirlo a GitHub. El mesh `Face.baked` tiene nueve primitivas
con 41 morph targets cada una y `extras.targetNames` declarados:

- Emociones: **Angry, Fun, Joy, Sorrow, Surprised**.
- Párpados: **Blink, Blink_R, Blink_L**.
- Boca: **A, I, U, E, O**.
- Otros canales: `Shape_05`…`Shape_40` con huecos de numeración
  (nombres genéricos, sin atribuir funciones anatómicas por adivinación).
- También hay huesos `J_Adj_L_FaceEye`, `J_Adj_L_FaceEyeSet`,
  `J_Adj_R_FaceEye` y `J_Adj_R_FaceEyeSet`, pero sus nombres
  **no demuestran** que sean pivotes de ojos con ejes correctamente calibrados.

Las 41 expresiones son las del archivo; el nuevo controlador no crea ninguna.

## Implementación

- `src/lib/livingPresence/glbMorphFaceQA.js`: adaptador no destructivo
  `GlbMorphFaceQA` para las mallas importadas GLB/FBX que realmente tengan
  `morphTargetDictionary` y `morphTargetInfluences`. Reconoce los nombres
  verdaderos de las mallas (sin diferencia por mayúsculas), aplica el mismo
  valor a las **nueve** primitivas del rostro y detecta capacidades por canal.
- Mantiene `FbxFaceQA` para huesos como control alternativo y manual.
  La mirada no se activa automáticamente si falta una pareja ocular inequívoca
  y calibrada. El usuario puede asignar huesos manualmente para hacer
  pruebas leves, reversibles.
- Los canales emoción `Joy` y `Surprised` pueden usarse como aproximaciones
  de sonrisa y elevación de cejas. Son **proxies que pueden mover el rostro
  completo**, no controles musculares localizados.
- Se ofrecen pruebas de parpadeo, las cinco vocales, emociones, apertura
  aproximada de boca, y un movimiento natural discreto **solo al activar
  explícitamente** el sistema facial.
- La sincronización labial utiliza los morfos A/I/U/E/O reales, pero la
  temporización sigue siendo aproximada: el navegador no ofrece muestras
  PCM del sintetizador y el archivo local usa volumen medido más estimación
  vocálica a partir del texto. No es lip-sync fonético exacto.
- Antes de cada AnimationMixer y durante exportación, `beforeFrame` /
  `release` restaura de forma condicional los pesos morfológicos de la
  vista previa. No se editan GLB originales, texturas, skin, matrices de bind,
  clips ni visemas de VRM.
- Se mantienen separados y sin cambios `LipSyncController`, `FacialPresence`
  y `LivingPresence` **VRM**; para GLB/FBX se selecciona el nuevo adaptador
  reversible con respaldo óseo.
- Se reforzó el panel VoiceMotorLab ante diagnóstico parcial para evitar
  otra excepción global React, preservando la corrección VIEWER-04.
- La rama nace de `feat/integration-viewer04-motion07-toelock-v4`.
  No se cambian `main`, MOTION-06, MOTION-07 original ni VIEWER-04.

## QA y limitaciones

Las pruebas unitarias de `tests/facial08GlbMorph.test.js` construyen una
réplica **pequeña** de los nombres reales de 41 morph targets del maestro,
distribuidos en nueve mallas, y comprueban:
parpadeo, vocales, expresiones, audio, reversibilidad, no intervención
sin autorización y mapeo ocular manual. Una prueba React SSR adicional
renderiza los paneles de rostro/voz con un GLB de cero clips para proteger
la corrección de pantalla negra.

No se ha probado en navegador Windows la animación de la maestra real.
Los 41 morphs deben verse sin deformaciones inesperadas, y la reproducción
de voz debe probarse con un audio real antes de dar FACIAL-08 por terminado.

## Pasos de prueba recomendados

1. Conservar intacta la instalación `ORBI-VIEWER-04` validada.
2. Crear laboratorio nuevo desde esta rama y ejecutar **en puerto 5201** una
   vez liberado con Ctrl+C en la terminal anterior.
3. Abrir la maestra `LUMIA_CLAUDE_MAESTRA_346.glb`, confirmar que se ve
   estática sin pantalla negra.
4. Abrir `Controles rápidos de rostro` (icono de deslizadores junto al
   visor), activar **Pruebas faciales reversibles**.
5. Verificar reporte de **41 morph targets**; probar Parpadear, vocal A,
   E, I, O, U, y expresiones Joy/Angry/Surprised/Sorrow/Fun.
6. Mover el rostro hacia la cámara con el botón `Rostro` y comprobar
   que las nueve primitivas reaccionan sin separar ojos/cabello.
7. Probar el motor de voz con un archivo WAV/MP3 (opción local) y texto
   correspondiente. Confirmar que la boca se mueve durante la reproducción
   y vuelve al reposo al detener.
8. La mirada izquierda/derecha necesita mapear manualmente huesos de ojos,
   comprobar la dirección y evitar modificar los originales.
9. Verificar un FBX sin morphs: la UI no debe crashear ni habilitar
   expresiones inexistentes. Después probar un GLB animado.
10. Exportar copia GLB y reimportarla; confirmar que los morphs de la fuente
    no se quedan artificialmente abiertos por la prueba.
11. Repetir MOTION-07 ToeLock sobre la D162, sin alterar la referencia V4.

## Condiciones de aceptación

La corrección queda aprobada cuando el usuario puede recuperar las funciones
correspondientes a morfos reales GLB (Blink, A/I/U/E/O, emociones) sin
introducir pantalla negra ni perder el V09 artístico. Los canales óseos de
mirada y las deformaciones `Shape_XX` se calibran por separado y no deben
presentarse como verificados automáticamente.
