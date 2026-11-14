# AUTORIG-02A/B — Editor 3D nativo de marcadores y esqueleto (borrador seguro)

Estado: **implementación experimental**, en `feat/autorig-02-native-editor`, basada en `feat/autorig-01`. No está fusionada con `main`. No modifica archivos VRM, FBX ni GLB originales.

## Objetivo alcanzado

La colocación de marcadores y la generación **preliminar** del esqueleto ya no dependen de Blender.
Se utiliza el mismo visor Three.js de ORBI (sin WebGL adicional), con 22 marcadores anatómicos y un esqueleto corporal de 19 huesos con los mismos nombres y padres de AUTORIG-01.

### Uso
1. Iniciar el visor en la rama de desarrollo, instalar dependencias y abrir un **GLB estático sin rig ni animaciones**, vertical en T-Pose.
2. En AutoRig Studio, pulsar **Iniciar editor 3D sin Blender**.
3. Seleccionar una esfera en el modelo o escoger su nombre en el desplegable.
4. Arrastrar el manipulador XYZ para moverla; **Mayús + clic** sobre la superficie del personaje reposiciona la articulación sobre la malla (luego se puede mover hacia dentro con el manipulador XYZ).
5. Editar manualmente XYZ cuando sea necesario, reflejar un punto hacia el lado opuesto, o restaurar el preset.
6. Comprobar los avisos de orientación, simetría y longitud. Estos avisos **no sustituyen** un análisis anatómico visual.
7. Pulsar **Generar esqueleto de 19 huesos** para mostrar huesos y relaciones padre-hijo en la misma escena. Es **solo una vista preliminar**, el esqueleto no está vinculado a la malla.
8. Pulsar **Guardar proyecto AUTORIG-02 (JSON)**. El JSON incluye marcadores en coordenadas globales Y-up y 19 huesos: **no contiene pesos de skinning**.
9. Reabrir ese GLB y cargar el JSON para continuar. El editor rechaza JSON asociados a otro nombre de origen.

## Restricciones y riesgos conocidos

- Solo se habilita con GLB sin huesos ni animaciones. La geometría debe estar erguida en **Three.js Y-up**. No asumir que un archivo esté bien orientado por su extensión.
- Los marcadores iniciales salen de una caja envolvente y del antiguo preset Z-up convertido una vez a Y-up; **no son detección automática de articulaciones**.
- La izquierda/derecha del preset depende del frente real del personaje. Confirmar con varias vistas.
- El modo de colocación por superficie puede ubicar un punto en piel/ropa y no en el centro anatómico: ajustar profundidad con XYZ.
- El reflejo utiliza el plano X de la pelvis; no supone que el cuerpo real sea perfectamente simétrico.
- Los huesos visibles son `THREE.Bone` en jerarquía temporal, más líneas de guía. **No se vinculan a un SkinnedMesh**. Ningún GLB, VRM o FBX riggeado es exportado en esta fase.
- Guardar proyecto JSON antes de cambiar de modelo o cerrar la pestaña: no existe autoguardado ni almacenamiento de archivos fuente.
- El panel, puntos, materiales auxiliares y controles de transformación se eliminan al salir de la edición o cambiar de modelo.
- La importación JSON rechaza datos invalidos/incompletos, y el UI limita el tamaño a 200 KB.
- La ruta anterior AUTORIG-01 con Blender se conserva solo como opción heredada para ensayos de skinning; no es requisito de este editor.

## Plan de QA con modelo auténtico

- Abrir `lumia 50k.glb` **sin rig** y verificar orientación/escala.
- Seleccionar, mover y reflejar hombros, codos, caderas, rodillas y tobillos.
- Verificar el punto desde frente, perfil y espalda.
- Generar el esqueleto y comprobar visualmente las 19 conexiones, sin saltos ni segmentos de longitud nula.
- Guardar JSON, cerrar editor, volver a abrir el modelo, cargar JSON y comparar coordenadas.
- Intentar cargar un GLB con rig o el Mint de 643 huesos: editor debe bloquearlo.
- Asegurar que original y versiones LUMIA V6/V7/V8 mantienen idénticos bytes.
- Ejecutar `npm test` y `npm run build`.

## Etapas siguientes (NO realizadas)

**AUTORIG-02C:** motor nativo de pesos (inicial geométrico, después topológico), máximo 4 influencias, conservación de geometría y shape keys, pincel de corrección, auditoría de cobertura.

**AUTORIG-02D:** simulación de flexiones, comparación pose de referencia y deformaciones, tolerancias objetivas.

**AUTORIG-02E:** exportar GLB con SkinnedMesh y verificación por reimportación; formatos VRM y FBX serán etapas separadas con QA y respeto por metadatos.

No certificar como `Mixamo-ready`, ni como reemplazo total de Blender, hasta probar skinning y exportación con modelos reales.
