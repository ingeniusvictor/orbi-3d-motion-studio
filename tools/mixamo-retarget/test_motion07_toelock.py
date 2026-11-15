import importlib.util
import hashlib
import pathlib
import tempfile
import unittest
import zipfile

MODULE = pathlib.Path(__file__).resolve().with_name('motion07_toelock_v4.py')
spec = importlib.util.spec_from_file_location('orbi_motion07', MODULE)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class TestMotion07ToeLockWrapper(unittest.TestCase):
    def test_golden_hashes_are_locked_and_distinct(self):
        self.assertEqual(len(mod.ORIGINAL_SHA),64)
        self.assertEqual(len(mod.GOLDEN_SHA),64)
        self.assertNotEqual(mod.ORIGINAL_SHA,mod.GOLDEN_SHA)
        self.assertEqual(mod.SCRIPT_NAME,'tools/fix_toe_weights_glb.py')

    def test_unknown_source_rejected_without_touching_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source=root/'unknown.glb';source.write_bytes(b'not the approved rig')
            kit=root/'kit.zip';kit.write_bytes(b'fake')
            out=root/'out.glb'
            with self.assertRaisesRegex(ValueError,'SHA-256'):
                mod.run_v4(source,kit,out)
            self.assertFalse(out.exists())

    def test_refuses_overwriting_source_or_prior_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory)
            source=root/'source.glb';source.write_bytes(b'bad')
            kit=root/'kit.zip';kit.write_bytes(b'bad')
            with self.assertRaisesRegex((ValueError,FileExistsError),'sobrescribir'):
                mod.validate_paths(source,kit,source)
            destination=root/'target.glb';destination.write_bytes(b'do not overwrite')
            with self.assertRaises(FileExistsError):
                mod.validate_paths(source,kit,destination)
            self.assertEqual(destination.read_bytes(),b'do not overwrite')

    def test_tampered_reference_script_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory)
            kit=root/'fake.zip'
            with zipfile.ZipFile(kit,'w') as archive:
                archive.writestr(mod.SCRIPT_NAME,
                                 "print('I am not certified')")
            with self.assertRaisesRegex(ValueError,'no coincide'):
                mod.extract_certified_script(kit,root/'script.py')
            self.assertFalse((root/'script.py').exists())

    def test_hash_is_stable(self):
        with tempfile.TemporaryDirectory() as directory:
            sample=pathlib.Path(directory)/'data'
            sample.write_bytes(b'abc')
            self.assertEqual(mod.sha256(sample),
                hashlib.sha256(b'abc').hexdigest())


if __name__=='__main__':
    unittest.main()
