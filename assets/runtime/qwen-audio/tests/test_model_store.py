import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import config
import model_store
import main


class ManagedAudioModelTests(unittest.TestCase):
    def test_inference_is_offline(self):
        self.assertEqual(os.environ['HF_HUB_OFFLINE'], '1')
        self.assertEqual(os.environ['TRANSFORMERS_OFFLINE'], '1')

    def test_missing_mapping_fails_before_loader_or_download(self):
        loader = Mock()
        with self.assertRaisesRegex(RuntimeError, 'Settings > Local Models'):
            model_store.load_local_model(loader, 'Qwen/Qwen3-ASR-1.7B')
        loader.assert_not_called()

    def test_request_manifest_routes_to_local_files_and_does_not_leak(self):
        with tempfile.TemporaryDirectory() as tmp:
            model = Path(tmp) / 'model'
            model.mkdir()
            (model / 'config.json').write_text('{}')
            paths = {'test/model': str(model)}
            def generate(params):
                loader = Mock(return_value='loaded')
                self.assertEqual(model_store.load_local_model(loader, 'test/model'), 'loaded')
                loader.assert_called_once_with(str(model))
                return {'ok': True}
            for method, handler in [('tts', 'method_tts'), ('predict', 'method_predict')]:
                with patch.object(main, handler, side_effect=generate):
                    self.assertEqual(main.handle_request({'method': method, 'params': {'model_paths': paths}}), {'ok': True})
            with self.assertRaisesRegex(RuntimeError, 'not downloaded'):
                model_store.resolve_model_path('test/model')

    def test_removed_or_relative_model_paths_never_fall_back_to_hub(self):
        for path in ['/does-not-exist', 'relative/model']:
            with model_store.managed_model_paths({'test/model': path}):
                with self.assertRaisesRegex(RuntimeError, 'not downloaded'):
                    model_store.resolve_model_path('test/model')


if __name__ == '__main__':
    unittest.main()
