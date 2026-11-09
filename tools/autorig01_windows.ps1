# AUTORIG-01: safe Windows runner for local Blender, no cloud access.
# Usage: .\tools\autorig01_windows.ps1 -Step prepare
#        .\tools\autorig01_windows.ps1 -Step rig
param(
    [ValidateSet("prepare","rig")][string]$Step="prepare",
    [string]$InputFile="",
    [string]$WorkspaceFile="",
    [string]$OutputDirectory="",
    [string]$BlenderExe=""
)
$ErrorActionPreference="Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $PSScriptRoot "autorig01_blender.py"
if (-not (Test-Path -LiteralPath $scriptPath)) {
    throw "No existe el script AutoRig en $scriptPath."
}
if (-not $BlenderExe) {
    $installDir = Join-Path $env:ProgramFiles "Blender Foundation"
    if (Test-Path $installDir) {
        $BlenderExe = Get-ChildItem -Path $installDir -Filter blender.exe -Recurse -File -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending |
            Select-Object -First 1 -ExpandProperty FullName
    }
    if (-not $BlenderExe) {
        $command=Get-Command blender.exe -ErrorAction SilentlyContinue
        if ($command) { $BlenderExe=$command.Source }
    }
}
if (-not $BlenderExe -or -not (Test-Path -LiteralPath $BlenderExe)) {
    throw "No se encontro Blender. Usa -BlenderExe 'C:\ruta\blender.exe'."
}
function Choose-File([string]$title,[string]$filter) {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog=New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title=$title
    $dialog.Filter=$filter
    $dialog.Multiselect=$false
    if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
        throw "Operacion cancelada por el usuario."
    }
    return $dialog.FileName
}
if ($Step -eq "prepare") {
    if (-not $InputFile) {
        $InputFile=Choose-File "Selecciona un personaje humanoide GLB SIN esqueleto" "GLB (*.glb)|*.glb"
    }
    if (-not (Test-Path -LiteralPath $InputFile -PathType Leaf)) { throw "No existe $InputFile" }
    if (-not $OutputDirectory) {
        $OutputDirectory=Join-Path (Split-Path -Parent $InputFile) ("ORBI_AUTORIG_01_" + [IO.Path]::GetFileNameWithoutExtension($InputFile))
    }
    Write-Host "AUTORIG-01 / Preparando marcadores..." -ForegroundColor Cyan
    & $BlenderExe --background --python $scriptPath -- --mode prepare --input $InputFile --output-dir $OutputDirectory
} else {
    if (-not $WorkspaceFile) {
        $WorkspaceFile=Choose-File "Selecciona el workspace .blend con marcadores revisados" "Archivos Blender (*.blend)|*.blend"
    }
    if (-not (Test-Path -LiteralPath $WorkspaceFile -PathType Leaf)) { throw "No existe $WorkspaceFile" }
    if (-not $OutputDirectory) {
        $OutputDirectory=Split-Path -Parent $WorkspaceFile
    }
    Write-Host "AUTORIG-01 / Generando candidato de rig..." -ForegroundColor Cyan
    & $BlenderExe --background --python $scriptPath -- --mode rig --workspace $WorkspaceFile --output-dir $OutputDirectory
}
if ($LASTEXITCODE -ne 0) {
    Write-Warning "La etapa $Step no paso las validaciones. Revisa el JSON de fallo de la carpeta de salida."
    exit $LASTEXITCODE
}
Write-Host "AUTORIG-01: etapa $Step completada. Carpeta: $OutputDirectory" -ForegroundColor Green
if ($Step -eq "prepare") {
    Write-Host "Abre ORBI_AUTORIG_WORKSPACE.blend, alinea TODOS los marcadores, guarda y ejecuta -Step rig." -ForegroundColor Yellow
} else {
    Write-Host "Rig candidato generado. REVISA VISUALMENTE hombros, codos, cadera, rodillas, piel y materiales." -ForegroundColor Yellow
}
