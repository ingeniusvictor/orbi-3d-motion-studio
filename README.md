# ORBI 3D Motion Studio

Tu espacio para visualizar, inspeccionar y reproducir modelos 3D gratuitamente.

Sitio: https://orbi-3d-motion-studio.vercel.app/
Repositorio: https://github.com/ingeniusvictor/orbi-3d-motion-studio

## Funciones (MOTION-01 beta)
- Importación GLB, glTF (+ recursos), FBX
- Cámara orbital, esqueleto, cuadrícula y wireframe
- Estadísticas y estructura 3D
- Biblioteca de animaciones con controles
- Importación de FBX de un esqueleto estrictamente compatible (experimental)
- Exportación de GLB con verificación de lectura

## Desarrollo
npm install
npm run dev
npm test
npm run build

No efectúa rigging, ni retargeting. Solo integra movimientos basados en la misma estructura y nombres de huesos. Comprueba siempre visualmente el resultado.

Los archivos se procesan en tu navegador y no se suben a servidores ORBI. Se mantiene el modelo original intacto.

Proyecto ORBI Ecosystem · 2026.


## MOTION-02A — Corrección FBX y visualización VRM

- FBX a escala de centímetros: se eliminó la niebla a distancia fija que los podía ocultar y se mejoró el encuadre automático con FOV horizontal y vertical.
- FBX «Without Skin»: son **animaciones sin malla**. El visor explica por qué no aparece el personaje y recomienda cargar el personaje «With Skin» antes de agregar los movimientos.
- VRM 0.x / 1.0: visor dedicado mediante `@pixiv/three-vrm`; se preserva la lógica de materiales MToon, expresiones y simulación VRM durante la reproducción.
- Por seguridad, exportación e integración FBX **no disponibles** sobre VRM hasta poder conservar correctamente sus metadatos; sí se pueden abrir e inspeccionar y reproducir clips existentes.
- Solo el cliente procesa los modelos, sin almacenarlos en servidores.

Validación: ejecutar `npm install`, `npm test` y `npm run build`. Después comprobar visualmente con un FBX *With Skin* real de Mixamo, un FBX *Without Skin* y archivos VRM 0.x y 1.0.

## MOTION-02B — Compatibilidad de importación Mixamo (corrección)

- Un FBX descargado **Without Skin** puede importarse como fuente de movimiento sin requerir geometría.
- La opción «Abrir modelo» continúa exigiendo malla visible: si se abre directamente un FBX solo de animación, informa qué hacer.
- La integración sigue limitada a huesos y jerarquías estrictamente compatibles. No realiza retargeting.
- Los objetos temporales de los FBX importados se liberan al finalizar cada importación.
- Los archivos VRM continúan disponibles solo para inspección y visualización; **no** se convierten ni fusionan con FBX.

Prueba manual pendiente: abrir personaje Mixamo **With Skin** (o su GLB), importar FBX **Without Skin** del mismo rig, reproducir movimientos y reabrir el GLB exportado.

## MOTION-02C — Rig de Mixamo con raíz auxiliar (validación prudente)

- Algunos FBX incluyen un hueso envolvente `root` o `armature` que puede no estar en otro FBX del mismo personaje.
- Si la raíz es neutra, envuelve todo el rig y **el resto de huesos coincide completamente**, se permite importar la animación sin retargeting.
- Las pistas neutras de esa raíz se omiten, y la interfaz advierte que debe revisarse la reproducción antes de exportar.
- Si cambia la jerarquía real, faltan huesos, la raíz tiene transformaciones propias o pistas animadas, el integrador rechaza el FBX por seguridad.
- Reporte original: personaje Thinking.fbx + movimiento Idle.fbx rechazado por hueso `root`. Sin ambos archivos originales no se puede certificar que ese par sea exactamente compatible.
- Pruebas automatizadas de raíz neutra, raíz animada, esqueleto ajeno y escala no neutra. Pendiente prueba manual de ese par de FBX concreto.


## MOTION-02E — Previsualización VRM desde Mixamo
- FBX a FBX/GLB: admite animaciones sobre objetos nombrados y transformaciones compatibles, además de huesos.
- VRM: adaptador experimental de animaciones de Mixamo basado en el ejemplo oficial three-vrm humanoidAnimation. Permite nombres estándar Mixamo o coincidencia con nombres crudos del VRM.
- Mapea caderas, columna, cabeza, brazos y piernas a huesos normalizados de VRM. No cubre cualquier rig ni garantiza movimientos idénticos.
- Nunca exporta desde VRM: sus metadatos y expresiones necesitan tratamiento específico.
- Verificar visualmente con archivos reales; la interfaz informa pistas omitidas y fallos.


## MOTION-02F — FBX con movimiento de malla y vista VRM aproximada
- Un FBX With Skin puede traer pistas de `SkinnedMesh` o del grupo que la contiene (por ejemplo `LUMIA_FULL_SKIN_1.position`). El rig VRM normalizado no tiene un equivalente directo de dichas transformaciones.
- La previsualización del VRM puede transferir únicamente las pistas humanoides y omitir pistas de movimiento de la malla FBX, **con advertencia explícita**. No debe interpretarse como integración fiel ni ofrecerse exportación VRM.
- Solo se permite esta omisión de forma automática para un objeto identificable como malla skinned o grupo que la contiene, con al menos una animación humanoide válida. Las pistas animadas de otros objetos externos siguen produciendo error.
- Confirmar la postura y el desplazamiento con modelos reales; esta fase no realiza exportación ni conserva movimientos externos desconocidos.


## MOTION-02G — Exportación VRM → GLB animado (beta)
- Convierte la animación previsualizada sobre huesos normalizados VRM a pistas muestreadas en huesos reales del skin; clona el modelo y convierte materiales MToon a una aproximación PBR.
- Exporta **GLB estándar**, nunca un archivo VRM equivalente. No se conservan necesariamente materiales MToon, expresiones, físicas spring-bones ni extensiones/metadatos VRM.
- La exportación exige consentimiento explícito sobre posibles pérdidas y valida con reimportación las animaciones y la presencia de un SkinnedMesh.
- Las pistas de movimiento de malla omitidas durante la previsualización NO se restituyen al exportar. Original local intacto; limitar cantidad de clips para no agotar memoria.
- Beta, pendiente prueba manual con VRM de LUMIA y sus clips FBX reales.


## MOTION-03A — Preparación ligera del mismo rig para Mixamo

- El panel **Preparar versión ligera para Mixamo** permite elegir qué mallas corporales conservar. Exporta GLB local sin texturas, sin morph targets, sin animaciones, con una malla skinned válida y nombres de huesos originales. Mantiene el modelo cargado intacto.
- Verifica mediante GLTFLoader el número de huesos del skin después del export (el número puede variar según el modelo, no se impone 155).
- Botón para descargar el script de Blender para convertir cualquier GLB ligero/final a FBX binario. Mixamo exige FBX para personajes riggeados (no acepta GLB directamente).
- La conversión FBX requiere Blender local; el navegador no promete generar FBX nativo y no se añade un backend de pago.
- Formato final: GLB directo; FBX con el script gratuito tras exportar GLB; VRM final nativo pendiente por necesidad de metadatos/extensiones, expresiones y restricciones propias de VRM.
- Tutorial de nueve pasos integrado; no se modifica la visualización o la integración ya verificadas.
