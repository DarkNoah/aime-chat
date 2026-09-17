import io
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import breeze_runtime
import breeze_worker
import mlx_runtime
import model_store
import tts


class BreezeTtsTests(unittest.TestCase):
    def test_routes_breeze_before_generic_transformers_backend(self):
        for darwin, expected in [(True, "mlx-audio"), (False, "breeze")]:
            with self.subTest(darwin=darwin), patch.object(tts, "IS_DARWIN", darwin):
                for params in [
                    {"model": "BreezeBlue/Breeze-TTS-2"},
                    {"model": "BreezeBlue/Breeze-TTS-2", "backend": "transformers"},
                    {"backend": "breeze-tts"},
                ]:
                    self.assertEqual(tts.resolve_tts_backend(params), expected)

    def test_mlx_voice_direction_saves_all_segments_and_metadata(self):
        calls = []

        class Model:
            def generate(self, **kwargs):
                calls.append(kwargs)
                yield SimpleNamespace(audio=np.full(240, 0.25), sample_rate=24000)
                yield SimpleNamespace(audio=np.full(480, -0.25), sample_rate=24000)

        with tempfile.TemporaryDirectory() as tmp:
            reference = str(Path(tmp) / "reference.wav")
            sf.write(reference, np.zeros(240), 24000)
            output = str(Path(tmp) / "output.wav")
            with (
                patch.object(tts, "IS_DARWIN", True),
                patch.object(tts, "get_mlx_tts_model", return_value=Model()) as load,
            ):
                result = tts.method_tts({
                    "model": "mlx-community/Breeze-TTS-2-mlx-4bit",
                    "text": "[笑] 你好。\n欢迎回来。",
                    "language": "Chinese", "instruct": " 温柔清晰的女声 ",
                    "ref_audio": reference, "ref_text": " 参考录音 ",
                    "temperature": 0, "max_tokens": 100,
                    "output_path": output,
                })
            audio, rate = sf.read(output)
            self.assertEqual(len(audio), 720)
            self.assertEqual(rate, 24000)
            np.testing.assert_allclose(audio[:240], 0.25)
            np.testing.assert_allclose(audio[240:], -0.25)
            self.assertEqual(result["duration"], 0.03)
            self.assertEqual(result["model"], "mlx-community/Breeze-TTS-2-mlx-4bit")
            load.assert_called_once_with("mlx-community/Breeze-TTS-2-mlx-4bit")
            self.assertEqual(calls, [{
                "text": "[笑] 你好。\n欢迎回来。", "stream": False, "voice": "S0",
                "instruct": "温柔清晰的女声", "cfg_scale": 4.0,
                "ref_audio": reference, "ref_text": "参考录音",
                "temperature": 0, "max_tokens": 100,
            }])

    def test_design_and_clone_options_do_not_override_each_other(self):
        self.assertEqual(
            tts._breeze_options(None, "calm", None, None),
            {"voice": "S0", "instruct": "calm", "cfg_scale": 4.0},
        )
        self.assertEqual(
            tts._breeze_options("S0", None, "ref.wav", "hello"),
            {"voice": "S0", "ref_audio": "ref.wav", "ref_text": "hello"},
        )

    def test_explicit_breeze_backend_accepts_a_local_checkpoint_path(self):
        with (
            patch.object(tts, "IS_DARWIN", True),
            patch.object(tts, "_run_breeze_mlx_tts", return_value={}) as run,
            patch.object(tts, "_run_mlx_tts") as qwen,
        ):
            tts.method_tts({
                "backend": "breeze", "model": "/models/my-checkpoint",
                "text": "hello", "output_path": "/out.wav",
            })
        self.assertEqual(run.call_args.kwargs["model_name"], "/models/my-checkpoint")
        qwen.assert_not_called()

    def test_rejects_pytorch_checkpoint_on_mlx_before_loading(self):
        with (
            patch.object(tts, "get_mlx_tts_model") as load,
            self.assertRaisesRegex(ValueError, "original PyTorch checkpoint"),
        ):
            tts._run_breeze_mlx_tts("hello", "out.wav", "BreezeBlue/Breeze-TTS-2")
        load.assert_not_called()

    def test_rejects_incomplete_references_and_preset_voices_before_loading(self):
        for options in [
            (None, None, "ref.wav", None),
            (None, None, "ref.wav", "  "),
            (None, None, None, "orphan transcript"),
            ("Vivian", None, None, None),
        ]:
            with self.subTest(options=options), self.assertRaises(ValueError):
                tts._breeze_options(*options)

    def test_rejects_empty_audio_and_mixed_sample_rates(self):
        for results, message in [
            ([], "no audio"),
            ([SimpleNamespace(audio=[], sample_rate=24000)], "no audio"),
            ([SimpleNamespace(audio=[0.1], sample_rate=24000),
              SimpleNamespace(audio=[0.2], sample_rate=48000)], "inconsistent"),
        ]:
            model = SimpleNamespace(generate=lambda **kwargs: iter(results))
            with (
                self.subTest(message=message),
                patch.object(tts, "get_mlx_tts_model", return_value=model),
                patch.object(tts.sf, "write") as write,
                self.assertRaisesRegex(RuntimeError, message),
            ):
                tts._run_breeze_mlx_tts("hello", "out.wav", "Breeze-TTS-2-mlx")
            write.assert_not_called()

    def test_torch_dispatch_preserves_reference_and_instruction(self):
        with (
            patch.object(tts, "IS_DARWIN", False),
            patch.object(tts.os.path, "exists", return_value=True),
            patch.object(breeze_runtime, "run_breeze_tts", return_value={}) as run,
            patch.object(tts, "resolve_model_path", return_value="/managed/breeze"),
        ):
            tts.method_tts({
                "model": "BreezeBlue/Breeze-TTS-2", "text": "hello",
                "ref_audio": "/ref.wav", "ref_text": "reference", "instruct": "calm",
                "output_path": "/out.wav",
            })
        run.assert_called_once_with(
            text="hello", output_path="/out.wav", model_name="BreezeBlue/Breeze-TTS-2",
            model_path="/managed/breeze",
            options={"voice": "S0", "instruct": "calm", "cfg_scale": 4.0,
                     "ref_audio": "/ref.wav", "ref_text": "reference"},
        )

    def test_mlx_capability_update_checks_support_after_install(self):
        with (
            patch.object(mlx_runtime, "_mlx_audio_ready", True),
            patch.dict(sys.modules, {"mlx_audio": SimpleNamespace()}),
            patch.object(mlx_runtime, "_has_breeze_support", side_effect=[False, False, True]),
            patch.object(mlx_runtime, "_uv_add") as install,
        ):
            mlx_runtime.ensure_mlx_audio(require_breeze=True)
        install.assert_called_once_with(
            "mlx-audio", "--prerelease=allow", "--upgrade-package", "mlx-audio"
        )

    def test_mlx_upgrade_failure_is_actionable(self):
        with (
            patch.object(mlx_runtime, "_mlx_audio_ready", True),
            patch.dict(sys.modules, {"mlx_audio": SimpleNamespace()}),
            patch.object(mlx_runtime, "_has_breeze_support", return_value=False),
            patch.object(mlx_runtime, "_uv_add"),
            self.assertRaisesRegex(RuntimeError, "restart the app"),
        ):
            mlx_runtime.ensure_mlx_audio(require_breeze=True)

    def test_pinned_source_install_is_cached_and_separate_from_shared_runtime(self):
        data = io.BytesIO()
        prefix = f"breeze-tts-{breeze_runtime.BREEZE_REVISION}/"
        with zipfile.ZipFile(data, "w") as archive:
            for name in ["infer.py", "breeze_infer/runtime.py", "models/breeze.py", "LICENSE"]:
                archive.writestr(prefix + name, "# fixture")
        data.seek(0)
        with (
            tempfile.TemporaryDirectory() as tmp,
            patch.object(breeze_runtime, "__file__", str(Path(tmp) / "breeze_runtime.py")),
            patch.object(breeze_runtime.urllib.request, "urlopen", return_value=data) as download,
        ):
            runtime = breeze_runtime.ensure_breeze_runtime()
            self.assertEqual(breeze_runtime.ensure_breeze_runtime(), runtime)
            self.assertTrue((runtime / "models/breeze.py").is_file())
            self.assertIn('"torch==2.9.1"', (runtime / "pyproject.toml").read_text())
            self.assertFalse((Path(tmp) / "pyproject.toml").exists())
            download.assert_called_once()

    def test_torch_subprocess_uses_isolated_environment_and_wav_metadata(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = str(Path(tmp) / "out.wav")
            sf.write(output, np.ones(480) * 0.1, 24000)
            with (
                patch.object(breeze_runtime, "ensure_breeze_runtime", return_value=Path(tmp)),
                patch.dict(breeze_runtime.os.environ, {
                    "AIME_AUDIO_UV_PATH": "/bundled/uv", "UV_PROJECT_ENVIRONMENT": "/shared/venv",
                }),
                patch.object(breeze_runtime.subprocess, "run", return_value=SimpleNamespace(returncode=0)) as run,
            ):
                result = breeze_runtime.run_breeze_tts(
                    text='say "hello"', output_path=output,
                    model_name="BreezeBlue/Breeze-TTS-2", model_path="/managed/breeze", options={"voice": "S0"},
                )
            self.assertEqual(run.call_args.args[0][0], "/bundled/uv")
            self.assertEqual(run.call_args.kwargs["env"]["UV_PROJECT_ENVIRONMENT"], str(Path(tmp) / ".venv"))
            self.assertEqual(json.loads(run.call_args.kwargs["input"])["text"], 'say "hello"')
            self.assertEqual(result["sample_rate"], 24000)
            self.assertEqual(result["duration"], 0.02)

    def test_worker_maps_inputs_to_official_cli_without_a_shell(self):
        request = {"text": "[笑] 你好", "model": "BreezeBlue/Breeze-TTS-2",
                   "output_path": "/out.wav", "source": "/source", "model_path": "/managed/breeze",
                   "options": {"instruct": "温柔", "ref_audio": "/ref.wav", "ref_text": "参考"}}
        with (
            patch.object(sys, "stdin", io.StringIO(json.dumps(request))),
            patch.object(sys, "path", list(sys.path)), patch.object(sys, "argv", []),
            patch.dict(sys.modules, {
                "torch": SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: True)),
                "huggingface_hub": SimpleNamespace(snapshot_download=lambda **kwargs: "/checkpoint"),
            }),
            patch.object(model_store, "resolve_model_path", return_value="/checkpoint"),
            patch.object(breeze_worker.runpy, "run_path") as run,
        ):
            breeze_worker.main()
            self.assertEqual(sys.argv, [
                "/source/infer.py", "/checkpoint", "--text", "[笑] 你好", "--output", "/out.wav",
                "--instruction", "温柔", "--cfg-scale", "4", "--ref-audio", "/ref.wav", "--ref-text", "参考",
            ])
            run.assert_called_once_with("/source/infer.py", run_name="__main__")

    def test_worker_rejects_missing_cuda_before_downloading_weights(self):
        with (
            patch.object(sys, "stdin", io.StringIO('{}')),
            patch.dict(sys.modules, {
                "torch": SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: False)),
                "huggingface_hub": SimpleNamespace(snapshot_download=lambda **kwargs: None),
            }),
            patch.object(mlx_runtime, "load_mlx_model_with_modelscope_fallback") as load,
            self.assertRaisesRegex(RuntimeError, "NVIDIA CUDA GPU"),
        ):
            breeze_worker.main()
        load.assert_not_called()


if __name__ == "__main__":
    unittest.main()
