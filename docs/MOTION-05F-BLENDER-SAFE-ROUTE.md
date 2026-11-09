# MOTION-05F — Ruta local conservadora Blender para Mint Swimsuit

## Motivo
MOTION-05E.2 bloqueó correctamente el cuerpo `player_019_mint_swimsuit_skin_LOD0`: cobertura geométrica 0% en ambos sentidos, diferencia de centros 82.0388 y de dimensiones 203.5801. Estas métricas **no prueban** por sí solas pérdida de vértices: pueden señalar desplazamiento, escala o deformación en exportación/reimportación.

## Alcance de este primer incremento
- Script: `tools/motion05f_blender.py`, ejecutado **en Windows con Blender instalado**; no requiere subir el Mint original a GitHub.
- Importa desde el FBX original a una escena nueva y exporta a ruta distinta.
- Elimina clips en la copia y coloca los huesos en su base de pose, sin alterar las matrices de bind del FBX original en disco.
- Detecta una pareja anatómica conectada y sin ambigüedad para orientar el conjunto en **Z de Blender**, respetando objetos vinculados.
- Reimporta el FBX resultante y compara nombres de mallas, vértices, polígonos, shape keys, esqueleto y cobertura espacial bidireccional por cada malla.
- Publica candidato y JSON solo si todas las comprobaciones pasan. Si falla, elimina FBX temporal, genera JSON con motivo y conserva el original.
- No sobrescribe un FBX de salida existente.

**Limitaciones:** esta primera ruta aún no prueba el archivo privado de Mint, no verifica apariencia exacta de materiales ni integridad facial mediante render, no certifica pose T/A, no garantiza compatibilidad Mixamo, y no es una integración gráfica al visor ORBI. El script es experimental hasta ejecutarse con Blender real y Mint real; no afirmar que resolvió los defectos visuales. La presencia de un rig auxiliar ChestBow puede exigir una conversión posterior separada; esta fase conserva todos los rigs en lugar de eliminarlos sin permiso.

## PowerShell de operación (elige el FBX original con ventana)
Detén antes el servidor si lo tienes abierto. Ejecuta en PowerShell:

```powershell
cd "$env:USERPROFILE\Downloads\ORBI-LIVING-PRESENCE-LAB"
git status --short
# Si hay archivos rastreados modificados, no hagas pull hasta revisarlos.
git pull --ff-only
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Filter = "FBX original (*.fbx)|*.fbx"
$dialog.Title = "Selecciona el FBX ORIGINAL de Mint Swimsuit"
if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { throw "Cancelado." }
$original = $dialog.FileName
$salida = Join-Path (Split-Path $original) "MINT_MOTION05F_CANDIDATE.fbx"
$blender = Get-ChildItem "$env:ProgramFiles\Blender Foundation" -Filter blender.exe -Recurse -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $blender) {
  $cmd = Get-Command blender.exe -ErrorAction SilentlyContinue
  if ($cmd) { $blender = $cmd.Source }
}
if (-not $blender) { throw "No se encontró Blender. Indica la ruta de blender.exe." }
if (Test-Path $salida) { throw "La salida ya existe; no se sobrescribirá: $salida" }
& $blender --background --python ".\tools\motion05f_blender.py" -- --input $original --output $salida
if ($LASTEXITCODE -ne 0) { Write-Warning "Revisa: $salida.audit.json"; throw "Auditoría MOTION-05F bloqueó la exportación." }
Write-Host "Candidato: $salida" -ForegroundColor Green
Write-Host "Auditoría: $salida.audit.json" -ForegroundColor Green
```

El script se detiene en cualquier ambigüedad anatómica o pérdida de superficie. Si aparece un bloqueo, compartir texto del archivo `.audit.json`, **no hace falta subir el modelo original**. Si pasa, inspeccionar visualmente cuerpo, cadera izquierda, rostro, hombros y cabello en Blender/ORBI; luego revisar si Mixamo acepta el esqueleto. No publicar ni sustituir assets LUMIA hasta superar estas comprobaciones manuales.
