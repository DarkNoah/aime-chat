import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
with patch.dict(sys.modules, {"soundfile": MagicMock()}):
    import stt


class WordTimestampsTests(unittest.TestCase):
    def test_diarization_uses_words_instead_of_merging_speaker_changes(self):
        words = [{"start": 0, "end": 0.3, "text": "Hi"}, {"start": 0.3, "end": 1, "text": "yes"}]
        sentences = [{"start": 0, "end": 1, "text": "Hi yes"}]
        with patch.object(stt, "_resolve_mlx_audio_path", return_value=("audio.wav", None)), patch.object(
            stt, "_run_mlx_asr", return_value={"text": "Hi yes", "alignment": words, "sentence_segments": sentences}
        ):
            params = {"audio": "audio.wav", "return_time_stamps": True}
            self.assertEqual(stt._predict_mlx(params, "mlx-audio")["items"], sentences)
            self.assertEqual(stt._predict_mlx({**params, "word_timestamps": True}, "mlx-audio")["items"], words)


if __name__ == "__main__":
    unittest.main()
