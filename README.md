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
