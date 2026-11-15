# VIEWER-COMPAT-01 · Visor 3D multipropósito sin modificación de archivos

## Objetivo

El usuario comprobó que `LUMIA_V09_CLAUDE_ORGANIC_FUSION_CANDIDATE.glb` se muestra en un visor externo y que una **copia con un clip de 4 segundos** sí se muestra en ORBI. El original contiene **4 mallas**, **346 huesos**, **41 morph targets**, **15 texturas**, **0 animaciones** y la extensión `KHR_materials_unlit`. No hay evidencia de que sea necesario alterar su geometría, material, pesos o rig.

**Importante:** el código anterior de ORBI ya pretendía admitir GLB estáticos; todavía no se ha reproducido en navegador la causa exacta de que el original V09 no aparezca. Esta rama añade rutas seguras de visualización y diagnósticos, no una afirmación de causa raíz certificada.

## Formatos admitidos para visualización

| Formato | Escena | Materiales y texturas | Esqueleto y animaciones |
| --- | --- | --- | --- |
| **GLB / glTF 2.0** | Sí | PBR, materiales y mapas admitidos por Three.js; recursos externos para .gltf | Si el archivo los incluye |
| **VRM** | Sí | Según compatibilidad VRM 0.x/1.0 de three-vrm | Sí, para funciones soportadas |
| **FBX** | Sí | Subconjunto que admite FBXLoader | Si el FBX los incluye |
| **OBJ + MTL** | Sí | MTL/texturas externos si se seleccionan junto al OBJ | No garantiza rigs/animaciones |
| **STL** | Sí | Material de vista preliminar, sin recuperar materiales inexistentes en STL | No |
| **PLY** | Sí, incluso nube de puntos sin caras | Color por vértice cuando existe | No |
| **DAE (Collada)** | Sí, subconjunto | Recursos externos y funciones limitadas por ColladaLoader | Animaciones que admite el cargador |
| **3DS** | Sí, subconjunto | Texturas compatibles seleccionadas con el archivo | No se garantiza importación de clips |

**No se promete compatibilidad universal:** .blend, .ma/.mb, Alembic, USD/USDZ, .abc, STEP, IGES, CAD propietarios, extensiones glTF de proveedores no implementadas y archivos ZIP de proyecto requieren adaptadores o conversión específicos. No abrir/guardar automáticamente un formato no significa que el modelo esté dañado.

## glTF comprimidos

- Draco: `KHR_draco_mesh_compression`, decodificador local desde `node_modules/three`.
- Meshopt: `EXT_meshopt_compression`, `MeshoptDecoder` incluido por Three.js.
- Texturas KTX2/Basis: `KHR_texture_basisu`, transcoder local y detección de soporte WebGL.
- `KHR_materials_unlit`: gestionado por GLTFLoader, como en LUMIA V09.

`scripts/prepare-viewer-decoders.mjs` copia los codecs del paquete Three.js en `public/decoders` automáticamente antes de ejecutar `npm run dev` y `npm run build`. No se usa un CDN ni se envían archivos de los usuarios a servidores.

## Modelo sin animaciones

El panel distingue **modelo estático válido** de **archivo solo de animación**. La cámara se ajusta usando vértices reales transformados. Para mallas skinned estáticas de tamaño moderado, el visor actualiza la paleta y los límites de skin y omite *frustum culling* de forma temporal, como defensa ante bounds incorrectos de exportadores. No se crea ningún clip ficticio para abrir un GLB real.

El botón **ⓘ Diagnosticar visualización** junto a Centrar vuelve a revisar los límites, las mallas y la presencia de animaciones sin escribir nada en el archivo fuente. El reporte se muestra en la interfaz.

## QA automático

- Lectura de encabezados GLB y JSON glTF 2.0; recuento separado de mallas, skins y animaciones.
- Verificación de la compatibilidad de extensiones y controles de errores Draco/KTX2/Meshopt.
- Carga e inicialización de los distintos tipos de loader en Three.js.
- OBJ geométrico y PLY con nube de puntos sin caras.
- GLB estático **con huesos y skinning, sin pistas**: exportación binaria real con GLTFExporter, reimportación con GLTFLoader y encuadre en cámara.
- Prueba de no modificación de los datos de vértices, pesos, material, huesos y bind de la fuente.
- Regresiones de AUTORIG y editores de animación existentes.

## Prueba manual prioritaria con LUMIA V09

1. Instalar esta rama en la instalación ORBI del usuario, conservando sus archivos originales.
2. Abrir **el GLB original de Claude**, no el GLB de animación diagnóstica.
3. Comprobar el aviso «modelo sin animaciones: se puede visualizar en reposo».
4. Verificar si el personaje se ve completo, incluyendo cuello, cabello, ojos y ropa.
5. Si no se ve, pulsar **ⓘ Diagnosticar visualización** y copiar el texto; abrir F12 > Console, y registrar el error WebGL del equipo.
6. Comparar la vista con el GLB de prueba que sí se veía. **No editar ni simplificar el archivo fuente**.
7. Si ambos se muestran, probar FBX riggeado/animado y modelos OBJ/STL/PLY. Las capacidades de edición y exportación para estos formatos no se equiparan con sus capacidades de visualización.

## Integración segura

Base: `feat/autorig-02f-control-bone-binding`. Nueva rama: `feat/viewer-compat-01-universal-import`. No modificar `main` ni las ramas de retargeting de la otra conversación. El PR permanece en borrador hasta validar LUMIA V09 real en Chrome.
