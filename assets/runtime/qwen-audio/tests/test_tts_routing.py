#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


RUNTIME_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RUNTIME_DIR))

import tts  # noqa: E402


class TtsRoutingTests(unittest.TestCase):
    def test_voxtral_cloud_model_routes_to_mistral_api(self):
        self.assertEqual(
            tts.resolve_tts_backend({"model": "voxtral-mini-tts-2603"}),
            "voxtral-api",
        )

    def test_voxtral_open_weight_model_routes_to_vllm_endpoint(self):
        self.assertEqual(
            tts.resolve_tts_backend({"model": "mistralai/Voxtral-4B-TTS-2603"}),
            "voxtral-vllm",
        )

    def test_voxcpm2_model_routes_to_mlx_audio(self):
        self.assertEqual(
            tts.resolve_tts_backend({"model": "mlx-community/VoxCPM2-8bit"}),
            "mlx-audio",
        )

    def test_build_voxtral_api_payload_uses_saved_voice_id(self):
        payload = tts.build_voxtral_speech_payload(
            backend="voxtral-api",
            text="hello",
            model_name="voxtral-mini-tts-2603",
            voice="voice-123",
            response_format="wav",
        )

        self.assertEqual(
            payload,
            {
                "model": "voxtral-mini-tts-2603",
                "input": "hello",
                "response_format": "wav",
                "voice_id": "voice-123",
            },
        )

    def test_build_voxtral_vllm_payload_uses_voice_name(self):
        payload = tts.build_voxtral_speech_payload(
            backend="voxtral-vllm",
            text="hello",
            model_name="mistralai/Voxtral-4B-TTS-2603",
            voice="casual_male",
            response_format="wav",
        )

        self.assertEqual(
            payload,
            {
                "model": "mistralai/Voxtral-4B-TTS-2603",
                "input": "hello",
                "response_format": "wav",
                "voice": "casual_male",
            },
        )

    def test_voxcpm2_generation_uses_unified_generate_kwargs(self):
        calls = []

        class FakeModel:
            sample_rate = 48000

            def generate(self, **kwargs):
                calls.append(kwargs)
                yield SimpleNamespace(audio=[0.0, 0.1, -0.1], sample_rate=48000)

        with (
            patch.object(tts, "get_mlx_tts_model", return_value=FakeModel()),
            patch.object(tts.sf, "write") as write_file,
            patch.object(tts.os.path, "exists", return_value=True),
        ):
            result = tts.method_tts(
                {
                    "backend": "mlx-audio",
                    "model": "mlx-community/VoxCPM2-8bit",
                    "text": "hello",
                    "instruct": "warm voice",
                    "ref_audio": "/tmp/reference.wav",
                    "ref_text": "reference text",
                    "prompt_text": "previous sentence",
                    "prompt_audio": "/tmp/prompt.wav",
                    "inference_timesteps": 12,
                    "cfg_value": 2.5,
                    "warmup_patches": 1,
                    "max_tokens": 1200,
                    "temperature": 0.7,
                    "output_path": "/tmp/out.wav",
                }
            )

        self.assertEqual(
            calls,
            [
                {
                    "text": "hello",
                    "instruct": "warm voice",
                    "ref_audio": "/tmp/reference.wav",
                    "ref_text": "reference text",
                    "prompt_text": "previous sentence",
                    "prompt_audio": "/tmp/prompt.wav",
                    "inference_timesteps": 12,
                    "cfg_value": 2.5,
                    "warmup_patches": 1,
                    "max_tokens": 1200,
                }
            ],
        )
        self.assertEqual(result["sample_rate"], 48000)
        self.assertEqual(result["model"], "mlx-community/VoxCPM2-8bit")
        write_file.assert_called_once()

    def test_voxcpm2_generation_does_not_add_instruct_parentheses(self):
        calls = []

        class FakeModel:
            sample_rate = 48000

            def generate(self, **kwargs):
                calls.append(kwargs)
                yield SimpleNamespace(audio=[0.0], sample_rate=48000)

        with (
            patch.object(tts, "get_mlx_tts_model", return_value=FakeModel()),
            patch.object(tts.sf, "write"),
        ):
            tts.method_tts(
                {
                    "backend": "mlx-audio",
                    "model": "mlx-community/VoxCPM2-8bit",
                    "text": "Hello, welcome to VoxCPM2!",
                    "instruct": "(A young woman, gentle and sweet voice)",
                    "output_path": "/tmp/out.wav",
                }
            )

        self.assertEqual(
            calls,
            [
                {
                    "text": "Hello, welcome to VoxCPM2!",
                    "instruct": "(A young woman, gentle and sweet voice)",
                }
            ],
        )


if __name__ == "__main__":
    unittest.main()
