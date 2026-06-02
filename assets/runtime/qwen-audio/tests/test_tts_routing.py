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

    def test_voxcpm2_model_routes_to_mlx_audio_on_darwin(self):
        with patch.object(tts, "IS_DARWIN", True):
            self.assertEqual(
                tts.resolve_tts_backend({"model": "mlx-community/VoxCPM2-8bit"}),
                "mlx-audio",
            )

    def test_voxcpm2_model_routes_to_torch_off_darwin(self):
        with patch.object(tts, "IS_DARWIN", False):
            self.assertEqual(
                tts.resolve_tts_backend({"model": "openbmb/VoxCPM2"}),
                "voxcpm2",
            )

    def test_explicit_voxcpm2_backend_follows_platform(self):
        with patch.object(tts, "IS_DARWIN", True):
            self.assertEqual(
                tts.resolve_tts_backend({"backend": "voxcpm2"}),
                "mlx-audio",
            )
        with patch.object(tts, "IS_DARWIN", False):
            self.assertEqual(
                tts.resolve_tts_backend({"backend": "voxcpm2"}),
                "voxcpm2",
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

    def test_voxcpm2_torch_voice_design_prepends_instruct(self):
        calls = []

        class FakeTorchModel:
            tts_model = SimpleNamespace(sample_rate=48000)

            def generate(self, **kwargs):
                calls.append(kwargs)
                return [0.0, 0.1, -0.1]

        with (
            patch.object(tts, "IS_DARWIN", False),
            patch.object(tts, "get_voxcpm2_torch_model", return_value=FakeTorchModel()),
            patch.object(tts.sf, "write") as write_file,
        ):
            result = tts.method_tts(
                {
                    "model": "openbmb/VoxCPM2",
                    "text": "Hello, welcome to VoxCPM2!",
                    "instruct": "A young woman, gentle and sweet voice",
                    "cfg_value": 2.0,
                    "inference_timesteps": 10,
                    "output_path": "/tmp/out.wav",
                }
            )

        self.assertEqual(
            calls,
            [
                {
                    "text": "(A young woman, gentle and sweet voice)Hello, welcome to VoxCPM2!",
                    "cfg_value": 2.0,
                    "inference_timesteps": 10,
                }
            ],
        )
        self.assertEqual(result["sample_rate"], 48000)
        self.assertEqual(result["backend"], "voxcpm2")
        self.assertEqual(result["model"], "openbmb/VoxCPM2")
        write_file.assert_called_once()

    def test_voxcpm2_torch_ultimate_cloning_maps_ref_to_prompt(self):
        calls = []

        class FakeTorchModel:
            tts_model = SimpleNamespace(sample_rate=48000)

            def generate(self, **kwargs):
                calls.append(kwargs)
                return [0.0]

        with (
            patch.object(tts, "IS_DARWIN", False),
            patch.object(tts, "get_voxcpm2_torch_model", return_value=FakeTorchModel()),
            patch.object(tts.sf, "write"),
            patch.object(tts.os.path, "exists", return_value=True),
        ):
            tts.method_tts(
                {
                    "model": "openbmb/VoxCPM2",
                    "text": "This is an ultimate cloning demo.",
                    "ref_audio": "/tmp/speaker.wav",
                    "ref_text": "The transcript of the reference audio.",
                    "output_path": "/tmp/out.wav",
                }
            )

        self.assertEqual(
            calls,
            [
                {
                    "text": "This is an ultimate cloning demo.",
                    "prompt_wav_path": "/tmp/speaker.wav",
                    "prompt_text": "The transcript of the reference audio.",
                    "reference_wav_path": "/tmp/speaker.wav",
                }
            ],
        )


if __name__ == "__main__":
    unittest.main()
