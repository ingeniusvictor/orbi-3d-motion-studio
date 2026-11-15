# MOTION-06 · LUMIA Mixamo Retarget

Integración **aislada** sobre `feat/autorig-02f-control-bone-binding`. No reemplaza el editor de rigs existentes ni el panel flotante, y no altera pesos, mallas, morph targets, bind matrices ni clips fuente.

## Dos rutas (no confundir sus niveles de certificación)

**1. Motor Python de referencia (certificado con la V4 Golden).** El archivo `tools/mixamo-retarget/run_certified_kits.py` ejecuta el motor verificado desde los ZIP de laboratorio. Conserva su código original y usa los activos locales proporcionados por el usuario; no incluye FBX/GLB grandes ni secretos dentro de Git. Es el método recomendado para producir animaciones definitivas. Requiere Python, NumPy y SciPy.

**2. Adaptador web MOTION-06 (experimental).** El módulo `src/lib/autoRig/mixamoRetargetV06.js` y el panel `src/MixamoRetargetLab.jsx` permiten añadir una animación FBX al personaje V06B de 346 huesos desde el navegador sin reemplazar ningún clip. Detecta exclusivamente LUMIA original 155 y LUMIA adulta D162, aplica correcciones de reposo, yaw cuando corresponde, pivote de pelvis, y ofrece diagnóstico y bloqueo opcional de puntas. **No ha demostrado todavía equivalencia fotograma a fotograma con Python Golden**. Cada resultado requiere inspección visual antes de utilizarlo como definitivo.

## Ejecutar el motor Python aprobado

Descarga localmente los tres kits entregados en la conversación anterior: `ORBI_MIXAMO_RETARGET_COMPLETO.zip`, `LUMIA_V06B_WAVE_HIPHOP_D_PRUEBA.zip` y `LUMIA_WAVE_HIPHOP_PIES_V2_KIT.zip`. Los datos permanecen fuera del repositorio.

Perfil A, original 155 → V06B 346:

```powershell
python -m pip install "numpy>=1.26,<3" "scipy>=1.12,<2"
python tools/mixamo-retarget/run_certified_kits.py --profile original-155 --kit "C:\LUMIA\ORBI_MIXAMO_RETARGET_COMPLETO.zip" --source "C:\LUMIA\Snake Hip Hop Dance.fbx" --target "C:\LUMIA\LUMIA_V06_RECOMENDADA.glb" --output "C:\LUMIA\conversion.glb" --golden "C:\LUMIA\LUMIA_V06B_HIPHOP_V4_PIVOTE_PELVIS_CORREGIDO.glb"
```

Perfil B, adulta D162 → V06B 346 (reparación de puntas opcional):

```powershell
python tools/mixamo-retarget/run_certified_kits.py --profile adult-d-162 --kit "C:\LUMIA\LUMIA_V06B_WAVE_HIPHOP_D_PRUEBA.zip" --toe-kit "C:\LUMIA\LUMIA_WAVE_HIPHOP_PIES_V2_KIT.zip" --toes lock --source "C:\LUMIA\Wave Hip Hop Dance.fbx" --target "C:\LUMIA\LUMIA_V06_RECOMENDADA.glb" --output "C:\LUMIA\wave_corregida.glb"
```

Para el perfil D también puede pasarse `--golden C:\\LUMIA\\LUMIA_V06B_WAVE_HIPHOP_D_V2_PIES_CORREGIDOS.glb` a la orden anterior para verificar todas sus pistas contra el archivo aprobado. Solo usar ese Golden con el FBX Wave correspondiente y con `--toes lock` o `--toes auto`.\n\nEl perfil A exige SHA-256 certificado del modelo V06B, 155 huesos y el controlador de orientación original. No es un convertidor Mixamo genérico. El perfil D usa orientación diferente. Si se encuentran rigs desconocidos, el proceso falla, no improvisa mapeos.

La opción `--toes lock` elimina específicamente las pistas de rotación errática de las dos puntas. Esto también suprime flexión válida de dedos; usarla solo tras ver el defecto o consultar el diagnóstico. `--toes auto` exige anomalías en ambas puntas.

## Flujo dentro de ORBI

1. Carga la LUMIA V06B maestra GLB con **346 huesos**.
2. En la biblioteca de animaciones, abre **MOTION-06**.
3. Selecciona un FBX descargado con la LUMIA original de 155 huesos o la versión D de 162.
4. Configura pivote y dedos y ejecuta. Este nuevo clip se añade sin tocar otros clips.
5. Reproduce toda la animación y exporta usando el sistema GLB existente. Si detectas una diferencia con el Golden, usa el conversor Python certificado y carga el GLB generado.

## Criterios de regresión

- Hip Hop V4: 47 pistas, 0° de diferencia angular y tolerancia de traslación 1e-5 m.
- Samba Dancing V1: perfil 155 aprobado visualmente en ORBI (29,8 s).
- Wave Hip Hop D V2: perfil 162 aprobado visualmente, corrección localizada de ambas puntas, 346 huesos, 41 morphs. Re-ejecución independiente sobre el FBX original: **52/52 pistas idénticas al Golden, diferencia angular 0° y traslación 0 m**.
- No reintroducir órbita de pelvis, giros duplicados ±90°, yaw incorrecto, ni confundir T-pose con A-pose.
- La rama no debe modificar las pruebas AUTORIG-02F ni otras funciones existentes.

## Limitaciones pendientes

El port de Python a Three.js todavía necesita golden tests con los FBX/GLB privados completos de referencia antes de considerarse equivalente. Las pruebas unitarias del navegador validan detección, aislamiento, transformación básica y rechazo de entradas incompatibles; **no certifican baile perfecto**. La entrada no soporta modelos de otros rigs como Y Bot.

## Ramas

El PR de MOTION-06 debe apuntar a `feat/autorig-02f-control-bone-binding`, no a `main`, y requiere revisión de usuario antes de fusionarlo.
