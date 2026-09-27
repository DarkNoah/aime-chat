import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from diarize import REQUIRED_FILES, diarize, validate_model


class DiarizeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in REQUIRED_FILES:
            file = self.root / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(b"fixture weights")

    def test_missing_weights_and_lfs_pointer_rejected(self):
        weight = self.root / "embedding/pytorch_model.bin"
        weight.unlink()
        with self.assertRaisesRegex(RuntimeError, "scripts/local_models.py") as caught:
            validate_model(self.root)
        self.assertIn("--type diarization --model-id pyannote/speaker-diarization-community-1", str(caught.exception))
        self.assertIn("isDownloaded=true", str(caught.exception))
        weight.write_bytes(b"version https://git-lfs.github.com/spec/v1")
        with self.assertRaisesRegex(RuntimeError, "Git LFS"):
            validate_model(self.root)

    def test_incomplete_download_rejected(self):
        (self.root / ".aime-download.incomplete").touch()
        with self.assertRaisesRegex(RuntimeError, "incomplete"):
            validate_model(self.root)

    def test_remote_repo_id_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "Download"):
            validate_model("pyannote/speaker-diarization-community-1")

    def test_local_pipeline_waveform_and_exclusive_turns(self):
        pipeline_class = MagicMock()
        pipeline = pipeline_class.from_pretrained.return_value
        pipeline.return_value.exclusive_speaker_diarization.itertracks.return_value = [
            (SimpleNamespace(start=0.1, end=1.5), None, "SPEAKER_00"),
            (SimpleNamespace(start=1.5, end=3), None, "SPEAKER_01"),
        ]
        sf = MagicMock()
        samples = MagicMock()
        sf.read.return_value = (samples, 16000)
        torch = MagicMock()
        torch.cuda.is_available.return_value = False
        with patch.dict(os.environ, {}, clear=False), patch.dict("sys.modules", {
            "soundfile": sf, "torch": torch,
            "pyannote": MagicMock(), "pyannote.audio": SimpleNamespace(Pipeline=pipeline_class),
        }):
            turns = diarize(self.root, "input.wav")
            self.assertEqual(os.environ["HF_HUB_OFFLINE"], "1")
            pipeline_class.from_pretrained.assert_called_once_with(self.root)
            pipeline.assert_called_once_with({"waveform": torch.from_numpy.return_value, "sample_rate": 16000})
        self.assertEqual(turns[1], {"start": 1.5, "end": 3.0, "speaker": "SPEAKER_01"})


if __name__ == "__main__":
    unittest.main()
