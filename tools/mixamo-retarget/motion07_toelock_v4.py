#!/usr/bin/env python3
"""MOTION-07: invoke the EXACT original ToeLock V4 reference engine from ZIP.

Fail closed on SHA mismatch, unexpected assets or output path collision.
This is a Windows/CLI reproducibility path, separate from the experimental
browser binary adapter and entirely separate from the GLB master.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ORIGINAL_SHA = 'a58a5061c9e2db63370b90d5f985078efb727ec2ef2a2fe49b46b058e293c5fa'
GOLDEN_SHA = 'b85dc554a54d442ea2a9c375f21468349501fd11f568afbd2848b2b8766c0ec0'
SCRIPT_NAME = 'tools/fix_toe_weights_glb.py'
SCRIPT_SHA = '4d462dcc5e49f95d117293c0d91acfdc4ed72f69e0f12de9ec9251936dc4939e'


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def validate_paths(source: Path, kit: Path, output: Path):
    if not source.is_file() or not kit.is_file():
        raise FileNotFoundError('Falta el GLB D162 o el ZIP de referencia ToeLock V4.')
    if output.exists():
        raise FileExistsError('No se sobrescribirá una copia existente: '+str(output))
    if output.suffix.lower() != '.glb':
        raise ValueError('La salida debe ser GLB.')
    if len({source.resolve(), kit.resolve(), output.resolve()}) != 3:
        raise ValueError('Prohibido sobrescribir archivo fuente o kit.')
    identity = sha256(source)
    if identity not in (ORIGINAL_SHA, GOLDEN_SHA):
        raise ValueError('D162 no reconocido: SHA-256 distinto de la referencia V4.')
    if kit.stat().st_size > 20 * 1024 * 1024:
        raise ValueError('El kit supera el tamaño máximo autorizado.')
    return identity


def extract_certified_script(kit: Path, destination: Path):
    with zipfile.ZipFile(kit) as archive:
        names = archive.namelist()
        if SCRIPT_NAME not in names or len(names) > 20:
            raise ValueError('No es el kit original de ToeLock V4.')
        script = archive.read(SCRIPT_NAME)
    sha = hashlib.sha256(script).hexdigest()
    if sha != SCRIPT_SHA:
        raise ValueError('El script de reparación no coincide con la V4 aprobada.')
    destination.write_bytes(script)
    return sha


def run_v4(source: Path, kit: Path, output: Path):
    source, kit, output = source.resolve(), kit.resolve(), output.resolve()
    identity = validate_paths(source, kit, output)
    output.parent.mkdir(parents=True, exist_ok=True)
    if identity == GOLDEN_SHA:
        output.write_bytes(source.read_bytes())
        return {'status': 'ALREADY_CERTIFIED', 'input_sha256': identity,
                'output_sha256': sha256(output), 'file': str(output),
                'moved': {'J_Bip_L_ToeBase': 0, 'J_Bip_R_ToeBase': 0}}
    with tempfile.TemporaryDirectory(prefix='orbi-motion-07-') as td:
        directory = Path(td)
        script = directory / 'fix_toe_weights_glb.py'
        extract_certified_script(kit, script)
        candidate = directory / 'toelock_v4_candidate.glb'
        process = subprocess.run(
            [sys.executable, str(script), str(source), str(candidate)],
            capture_output=True, text=True, check=False
        )
        if process.returncode:
            raise RuntimeError('Motor ToeLock V4 original falló:\n' +
                               process.stderr + '\n' + process.stdout)
        try:
            reference_report = json.loads(process.stdout)
        except json.JSONDecodeError as exc:
            raise RuntimeError('El motor no devolvió un JSON de auditoría.') from exc
        generated_sha = sha256(candidate)
        if generated_sha != GOLDEN_SHA:
            raise RuntimeError('La salida no coincide con el SHA Golden V4: ' +
                               generated_sha)
        if reference_report.get('toe_influences_moved') != {
                'J_Bip_L_ToeBase': 1853, 'J_Bip_R_ToeBase': 1855}:
            raise RuntimeError('El motor produjo un número de influencias inesperado.')
        if reference_report.get('weight_sum_max_error') != 0:
            raise RuntimeError('La suma de pesos no coincide con la referencia.')
        # Only after every check passes is the vetted candidate published.
        with candidate.open('rb') as reader, output.open('xb') as writer:
            for block in iter(lambda: reader.read(1024 * 1024), b''):
                writer.write(block)
    return {'status': 'GOLDEN_SHA_MATCH', 'input_sha256': identity,
            'output_sha256': sha256(output), 'file': str(output),
            'moved': reference_report['toe_influences_moved'],
            'max_weight_sum_error': reference_report['weight_sum_max_error'],
            'blender_validation': 'PENDIENTE',
            'mixamo_validation': 'PENDIENTE'}


def main(argv=None):
    p = argparse.ArgumentParser(description='ORBI MOTION-07: ToeLock V4 original sin tocar la maestra')
    p.add_argument('--source', type=Path, required=True,
                   help='LUMIA_CLAUDE_MIXAMO_D162.glb, NO la maestra 346')
    p.add_argument('--kit', type=Path, required=True,
                   help='LUMIA_CLAUDE_D162_PIES_ESTABLES_V4_KIT.zip')
    p.add_argument('--output', type=Path, required=True,
                   help='Copia nueva GLB de transporte para Mixamo')
    a = p.parse_args(argv)
    print(json.dumps(run_v4(a.source, a.kit, a.output),
                     ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
