#!/usr/bin/env python3
"""MOTION-06: run the ORIGINAL verified LUMIA Python engines from user-owned kits.

The certified engines are kept in their original ZIP artifacts, not rewritten.
This wrapper never overwrites sources, the master GLB, or the approved Golden.
Requires: numpy and scipy. No Blender needed for the conversion.
"""
import argparse
import json
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

def unpack_selected(archive: Path, prefix: str, dest: Path):
    if not archive.is_file():
        raise FileNotFoundError(f'No se encuentra el kit: {archive}')
    with zipfile.ZipFile(archive) as z:
        selected = [n for n in z.namelist() if n.startswith(prefix)
                    and n.endswith('.py') and '/' not in n[len(prefix):]]
        if not selected:
            raise ValueError(f'El kit no contiene los scripts esperados: {prefix}')
        for name in selected:
            (dest / name.rsplit('/', 1)[-1]).write_bytes(z.read(name))
    return selected

def run(command):
    p = subprocess.run(command, text=True, capture_output=True, check=False)
    if p.returncode:
        raise RuntimeError(f'El motor devolvió error {p.returncode}:\n{p.stderr}\n{p.stdout}')
    return p.stdout

def ensure_safe_paths(source: Path, target: Path, output: Path):
    if not source.is_file() or not target.is_file():
        raise FileNotFoundError('Falta el FBX de entrada o el GLB maestro aprobado.')
    if len({source.resolve(), target.resolve(), output.resolve()}) != 3:
        raise ValueError('Está prohibido sobrescribir un modelo o animación fuente.')
    if output.suffix.lower() != '.glb':
        raise ValueError('El resultado debe ser un nuevo .glb.')

def compare_golden_with_extracted_reader(generated, reference, directory):
    """Match all clip channels against the actual user-approved GLB, not screenshots."""
    import numpy as np
    from scipy.spatial.transform import Rotation
    sys.path.insert(0, str(directory))
    from gltf_io import read_glb, tracks_by_name
    generated_tracks = tracks_by_name(*read_glb(generated))
    approved_tracks = tracks_by_name(*read_glb(reference))
    if set(generated_tracks) != set(approved_tracks):
        raise AssertionError('Diferencia en los canales de animación del Golden.')
    max_translation, max_angle = 0., 0.
    for key, (values, *_) in generated_tracks.items():
        ref_values = approved_tracks[key][0]
        if values.shape != ref_values.shape:
            raise AssertionError('Diferencia en las muestras del Golden: ' + str(key))
        if key[1] == 'rotation':
            angles = (Rotation.from_quat(values) *
                      Rotation.from_quat(ref_values).inv()).magnitude()
            max_angle = max(max_angle, float(np.max(np.rad2deg(angles))))
        else:
            max_translation = max(max_translation, float(np.max(abs(values - ref_values))))
    if max_angle > .001 or max_translation > 1e-5:
        raise AssertionError(
            f'Golden distinto: {max_angle:.6f} grados, {max_translation:.8f} m')
    return {'status':'MATCH','tracks':len(generated_tracks),
            'max_angle_deg':max_angle,'max_translation_m':max_translation}


def main():
    p = argparse.ArgumentParser(description='ORBI MOTION-06: retarget local con perfiles LUMIA probados')
    p.add_argument('--profile', required=True, choices=['original-155', 'adult-d-162'])
    p.add_argument('--kit', type=Path, required=True,
                   help='Kit completo de 155 o laboratorio Wave D según el perfil')
    p.add_argument('--source', type=Path, required=True, help='FBX de Mixamo animado')
    p.add_argument('--target', type=Path, required=True, help='LUMIA V06B maestra estática 346')
    p.add_argument('--output', type=Path, required=True, help='Nuevo GLB')
    p.add_argument('--golden', type=Path, help='Golden V4 del perfil 155, solo con Snake Hip Hop')
    p.add_argument('--toe-kit', type=Path, help='Kit Wave Hip Hop V2 (contiene corregir_dedos_pies.py)')
    p.add_argument('--toes', choices=['keep', 'auto', 'lock'], default='keep')
    args = p.parse_args()
    source, target, output = map(lambda x: x.resolve(), [args.source, args.target, args.output])
    ensure_safe_paths(source, target, output)
    if args.toes != 'keep' and args.profile != 'adult-d-162':
        raise ValueError('La reparación de pies aprobada se limita al perfil D.')
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='orbi-motion-06-') as td:
        base = Path(td)
        if args.profile == 'original-155':
            unpack_selected(args.kit.resolve(),
                'ORBI_MIXAMO_RETARGET_KIT/engine/', base)
            converter = base / 'convertir.py'
            if not converter.exists():
                raise FileNotFoundError('No existe convertir.py en el kit A.')
            command = [sys.executable, str(converter), '--source', str(source),
                       '--target', str(target), '--out', str(output)]
            if args.golden:
                command += ['--golden', str(args.golden.resolve())]
            print(run(command))
        else:
            unpack_selected(args.kit.resolve(), 'LUMIA_V06B_WAVE_HIPHOP_D/', base)
            converter = base / 'retarget_d162_to_v06b346.py'
            if not converter.exists():
                raise FileNotFoundError('Falta el motor de 162 huesos.')
            temp_raw = base / 'd162_raw.glb'
            temp_pivot = base / 'd162_pivot.glb'
            print(run([sys.executable, str(converter), '--source', str(source),
                '--target', str(target), '--output', str(temp_raw),
                '--orientation', '0']))
            print(run([sys.executable, str(base / 'fix_pivot_v4.py'),
                str(temp_raw), str(temp_pivot), '--mode', 'anchored']))
            if args.toes == 'keep':
                output.write_bytes(temp_pivot.read_bytes())
            else:
                if not args.toe_kit:
                    raise ValueError('Para reparar las puntas se requiere --toe-kit.')
                with zipfile.ZipFile(args.toe_kit.resolve()) as z:
                    (base / 'corregir_dedos_pies.py').write_bytes(
                        z.read('corregir_dedos_pies.py'))
                print(run([sys.executable, str(base / 'corregir_dedos_pies.py'),
                    str(temp_pivot), str(output), '--mode',
                    'auto' if args.toes == 'auto' else 'lock']))
            if args.golden:
                print(json.dumps({'golden_d162':compare_golden_with_extracted_reader(
                    output, args.golden.resolve(), base)}, indent=2))
    if not output.exists() or output.stat().st_size == 0:
        raise RuntimeError('El motor no produjo un GLB válido.')
    print(json.dumps({'status':'GENERADO_PENDIENTE_QA_VISUAL',
        'profile':args.profile,'output':str(output),
        'bytes':output.stat().st_size}, indent=2, ensure_ascii=False))

if __name__ == '__main__':
    main()
