import importlib.util
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    'run_certified_kits', HERE / 'run_certified_kits.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

class CertifiedKitWrapperTests(unittest.TestCase):
    def test_cli_help_does_not_require_numpy_or_assets(self):
        output = subprocess.run(
            [sys.executable, str(HERE / 'run_certified_kits.py'), '--help'],
            check=True, capture_output=True, text=True)
        self.assertIn('adult-d-162', output.stdout)
        self.assertIn('original-155', output.stdout)

    def test_never_overwrite_source_or_target(self):
        with tempfile.TemporaryDirectory() as td:
            folder=Path(td)
            src=folder/'source.fbx';src.write_bytes(b'source')
            master=folder/'master.glb';master.write_bytes(b'master')
            MODULE.ensure_safe_paths(src,master,folder/'new.glb')
            with self.assertRaisesRegex(ValueError,'sobrescribir'):
                MODULE.ensure_safe_paths(src,master,src)
            with self.assertRaisesRegex(ValueError,'sobrescribir'):
                MODULE.ensure_safe_paths(src,master,master)
            with self.assertRaisesRegex(ValueError,'nuevo .glb'):
                MODULE.ensure_safe_paths(src,master,folder/'new.fbx')

    def test_reuses_original_kit_scripts_without_editing_archive(self):
        with tempfile.TemporaryDirectory() as td:
            folder=Path(td);archive=folder/'kit.zip';out=folder/'source'
            out.mkdir()
            with zipfile.ZipFile(archive,'w') as z:
                z.writestr('ORBI_MIXAMO_RETARGET_KIT/engine/convertir.py',
                           '# true original\nprint("hello")\n')
                z.writestr('ORBI_MIXAMO_RETARGET_KIT/engine/gltf_io.py','# helper')
                z.writestr('ORBI_MIXAMO_RETARGET_KIT/assets/secret.glb',b'binary')
            original=archive.read_bytes()
            result=MODULE.unpack_selected(
                archive,'ORBI_MIXAMO_RETARGET_KIT/engine/',out)
            self.assertEqual(len(result),2)
            self.assertTrue((out/'convertir.py').is_file())
            self.assertFalse((out/'secret.glb').exists())
            self.assertEqual(archive.read_bytes(),original)

if __name__=='__main__':
    unittest.main()
