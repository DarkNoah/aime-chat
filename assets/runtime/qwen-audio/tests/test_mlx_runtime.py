#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


RUNTIME_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RUNTIME_DIR))

import mlx_runtime  # noqa: E402


class MlxRuntimeFallbackTests(unittest.TestCase):
    def test_load_mlx_model_returns_hf_result_without_modelscope(self):
        calls = []

        def load_model(model_name):
            calls.append(model_name)
            return "hf-model"

        with (
            patch.object(mlx_runtime, "resolve_cached_model_path", return_value=None),
            patch.object(mlx_runtime, "download_modelscope_model") as download,
        ):
            result = mlx_runtime.load_mlx_model_with_modelscope_fallback(
                load_model, "mlx-community/Qwen3-ASR-1.7B-bf16"
            )

        self.assertEqual(result, "hf-model")
        self.assertEqual(calls, ["mlx-community/Qwen3-ASR-1.7B-bf16"])
        download.assert_not_called()

    def test_load_mlx_model_uses_hf_cache_before_network(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            snapshot_dir = (
                Path(temp_dir)
                / "models--mlx-community--Qwen3-TTS-12Hz-1.7B-Base-bf16"
                / "snapshots"
                / "abc123"
            )
            snapshot_dir.mkdir(parents=True)
            (snapshot_dir / "config.json").write_text("{}", encoding="utf-8")
            (snapshot_dir / "model.safetensors").write_text("", encoding="utf-8")
            refs_dir = snapshot_dir.parents[1] / "refs"
            refs_dir.mkdir()
            (refs_dir / "main").write_text("abc123", encoding="utf-8")

            calls = []

            def load_model(model_name):
                calls.append(model_name)
                return "cached-model"

            with (
                patch.dict(os.environ, {"HUGGINGFACE_HUB_CACHE": temp_dir}, clear=False),
                patch.object(mlx_runtime, "download_modelscope_model") as download,
            ):
                result = mlx_runtime.load_mlx_model_with_modelscope_fallback(
                    load_model, "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16"
                )

        self.assertEqual(result, "cached-model")
        self.assertEqual(calls, [str(snapshot_dir)])
        download.assert_not_called()

    def test_load_mlx_model_uses_modelscope_cache_before_network(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            model_dir = (
                Path(temp_dir)
                / "models"
                / "mlx-community"
                / "Qwen3-TTS-1___7B-bf16"
            )
            model_dir.mkdir(parents=True)
            (model_dir / "config.json").write_text("{}", encoding="utf-8")
            (model_dir / "model.safetensors").write_text("", encoding="utf-8")

            calls = []

            def load_model(model_name):
                calls.append(model_name)
                return "cached-model"

            with (
                patch.dict(
                    os.environ,
                    {"QWEN_ASR_MODELSCOPE_CACHE_DIR": temp_dir},
                    clear=False,
                ),
                patch.object(mlx_runtime, "download_modelscope_model") as download,
            ):
                result = mlx_runtime.load_mlx_model_with_modelscope_fallback(
                    load_model, "mlx-community/Qwen3-TTS-1.7B-bf16"
                )

        self.assertEqual(result, "cached-model")
        self.assertEqual(calls, [str(model_dir)])
        download.assert_not_called()

    def test_load_mlx_model_falls_back_to_modelscope_path_after_hf_failure(self):
        calls = []

        def load_model(model_name):
            calls.append(model_name)
            if len(calls) == 1:
                raise RuntimeError("hf failed")
            return "modelscope-model"

        with (
            patch.object(mlx_runtime, "resolve_cached_model_path", return_value=None),
            patch.object(
                mlx_runtime,
                "download_modelscope_model",
                return_value="/tmp/modelscope/qwen",
            ) as download,
        ):
            result = mlx_runtime.load_mlx_model_with_modelscope_fallback(
                load_model, "mlx-community/Qwen3-ASR-1.7B-bf16"
            )

        self.assertEqual(result, "modelscope-model")
        self.assertEqual(
            calls,
            ["mlx-community/Qwen3-ASR-1.7B-bf16", "/tmp/modelscope/qwen"],
        )
        download.assert_called_once_with("mlx-community/Qwen3-ASR-1.7B-bf16")

    def test_local_model_path_does_not_fall_back_to_modelscope(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            calls = []

            def load_model(model_name):
                calls.append(model_name)
                raise RuntimeError("local load failed")

            with patch.object(mlx_runtime, "download_modelscope_model") as download:
                with self.assertRaises(RuntimeError):
                    mlx_runtime.load_mlx_model_with_modelscope_fallback(
                        load_model, temp_dir
                    )

        self.assertEqual(calls, [temp_dir])
        download.assert_not_called()

    def test_modelscope_model_id_uses_json_mapping_override(self):
        with patch.dict(
            os.environ,
            {
                "QWEN_ASR_MODELSCOPE_MODEL_MAP": (
                    '{"mlx-community/VoxCPM2-8bit":"AI-ModelScope/VoxCPM2-8bit"}'
                )
            },
            clear=False,
        ):
            self.assertEqual(
                mlx_runtime._modelscope_model_id("mlx-community/VoxCPM2-8bit"),
                "AI-ModelScope/VoxCPM2-8bit",
            )

    def test_fallback_error_includes_original_load_errors(self):
        def load_model(model_name):
            if model_name == "mlx-community/VoxCPM2-8bit":
                raise RuntimeError("hf unavailable")
            raise ValueError("Model type voxcpm2 not supported for tts.")

        with (
            patch.object(mlx_runtime, "resolve_cached_model_path", return_value=None),
            patch.object(
                mlx_runtime,
                "download_modelscope_model",
                return_value="/tmp/modelscope/VoxCPM2-8bit",
            ),
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "hf error: hf unavailable; modelscope error: Model type voxcpm2 not supported",
            ):
                mlx_runtime.load_mlx_model_with_modelscope_fallback(
                    load_model, "mlx-community/VoxCPM2-8bit"
                )


if __name__ == "__main__":
    unittest.main()
