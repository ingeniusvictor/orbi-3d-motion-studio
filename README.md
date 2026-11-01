# ORBI 3D Motion Studio

> Tus modelos 3D y sus animaciones, en un solo lugar. Visualiza, inspecciona y reproduce.

**MOTION-01 — beta funcional** · React + Vite + Three.js · procesamiento local en el navegador

**Sitio:** https://orbi-3d-motion-studio.vercel.app/  
**Rama de desarrollo:** `feat/motion-01-viewer-inspector`  
**PR de revisión:** https://github.com/ingeniusvictor/orbi-3d-motion-studio/pull/1

## ¿Qué hace?

- Abre **GLB**, **glTF** (+ archivos .bin / texturas cuando correspondan) y **FBX**.
- Permite rotar, acercar, centrar la cámara, ver cuadrícula, wireframe y esqueleto.
- Inspecciona mallas, vértices, triángulos, materiales, texturas, huesos y jerarquía.
- Detecta y reproduce clips integrados con pausa y velocidad ajustable.
- Acepta **FBX del mismo rig** y rechaza nombres o jerarquías de huesos distintos.
- Exporta una copia GLB con clips y verifica que puede volver a abrirse.

**Importante:** no crea esqueletos, no hace rigging, no hace retargeting, no corrige poses ni reemplaza Blender o Mixamo. Que coincidan los huesos es una condición necesaria, pero no garantiza que dos modelos tengan una pose de reposo idéntica; comprueba siempre los movimientos visualmente antes de utilizar la exportación.

## Cómo usarlo

1. Pulsa **Cargar modelo** o arrastra un GLB, glTF o FBX al visor.
2. Si cargas un glTF con recursos externos, selecciona al mismo tiempo el .gltf, el .bin y las texturas.
3. Inspecciona la composición o selecciona un clip en **Biblioteca de animaciones**.
4. Opcional: prepara en Mixamo movimientos del **mismo personaje base**, descárgalos en FBX (preferiblemente *Without Skin*) e impórtalos con **Añadir animaciones FBX**.
5. Si la validación permite importarlos y su previsualización se ve correcta, pulsa **Exportar GLB integrado**.

Los archivos se abren mediante URLs locales del navegador; no se almacenan en un servidor de ORBI. Se recomienda trabajar con archivos de tamaño moderado para no agotar la memoria del dispositivo.

## Desarrollo

Requiere Node.js 22 o compatible con Vite 6.

```bash
npm install
npm run dev
npm test
npm run build
npm run preview
```

El pipeline de GitHub Actions ejecuta `npm test` y `npm run build` en cada PR. La validación con los GLB/FBX reales de LUMIA y Mixamo debe realizarse en navegador antes de considerar certificada la integración.

## Seguridad, licencias y alcance

- Código separado de LUMIA Motion; no cambia sus archivos.
- Los modelos originales no son alterados: cada exportación crea un archivo nuevo.
- No subas contenidos de terceros sin los derechos necesarios.
- Mixamo es un servicio de Adobe ajeno a ORBI; las animaciones se preparan allí y se importan por el usuario.
- Alojamiento de prueba en Vercel Hobby sujeto a las condiciones de uso del plan.

Proyecto del ecosistema **ORBI**, 2026.
