#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import urllib.error
import urllib.request

# ---------- Config ----------
IS_DARWIN = sys.platform == "darwin"
IS_WINDOWS = sys.platform == "win32"

DEFAULT_QWEN_MODEL = os.environ.get("QWEN_ASR_QWEN_MODEL", "Qwen/Qwen3-ASR-1.7B")
DEFAULT_QWEN_ALIGNER_MODEL = os.environ.get(
    "QWEN_ASR_QWEN_ALIGNER_MODEL", "Qwen/Qwen3-ForcedAligner-0.6B"
)
DEFAULT_MLX_MODEL = os.environ.get(
    "QWEN_ASR_MLX_MODEL", "mlx-community/Qwen3-ASR-1.7B-bf16"
)
DEFAULT_MLX_ALIGNER_MODEL = os.environ.get(
    "QWEN_ASR_MLX_ALIGNER_MODEL", "mlx-community/Qwen3-ForcedAligner-0.6B-8bit"
)

DEFAULT_MODEL = os.environ.get(
    "QWEN_ASR_MODEL", DEFAULT_MLX_MODEL if IS_DARWIN else DEFAULT_QWEN_MODEL
)

# TTS model defaults (see: https://github.com/Blaizzy/mlx-audio/tree/main/mlx_audio/tts/models/qwen3_tts)
#
# Available models and their capabilities:
#   Base models (generate): predefined voices + voice cloning via ref_audio/ref_text
#     - mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16         (fast)
#     - mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16         (higher quality)
#   CustomVoice models (generate_custom_voice): predefined voices + emotion/style via instruct
#     - mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-bf16  (fast)
#     - mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16  (better emotion control)
#   VoiceDesign model (generate_voice_design): create any voice from text description
#     - mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16
#
# Speakers (Base/CustomVoice):
#   Chinese: Vivian, Serena, Uncle_Fu, Dylan (Beijing Dialect), Eric (Sichuan Dialect)
#   English: Ryan, Aiden
#
# The unified model.generate() API auto-routes based on tts_model_type in config.

DEFAULT_QWEN_TTS_MODEL = os.environ.get(
    "QWEN_TTS_MODEL", "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16"
) if IS_DARWIN else "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
DEFAULT_QWEN_TTS_VOICEDESIGN_MODEL = os.environ.get(
    "QWEN_TTS_VOICEDESIGN_MODEL",
    "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16",
) if IS_DARWIN else "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
DEFAULT_QWEN_TTS_CUSTOM_MODEL = os.environ.get(
    "QWEN_TTS_CUSTOM_MODEL",
    "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16",
) if IS_DARWIN else "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"
# On Apple Silicon we use the quantized MLX build; on every other platform we
# fall back to the official PyTorch weights served through the `voxcpm` package.
DEFAULT_VOXCPM2_TTS_MODEL = os.environ.get(
    "VOXCPM2_TTS_MODEL",
    "mlx-community/VoxCPM2-bf16" if IS_DARWIN else "openbmb/VoxCPM2",
)


def _resolve_default_device() -> str:
    configured = os.environ.get("QWEN_ASR_DEVICE")
    if configured and configured.strip():
        return configured.strip()

    if IS_WINDOWS:
        try:
            import torch  # type: ignore

            if torch.cuda.is_available():
                return "cuda:0"
        except Exception:
            pass

    return "cpu"


DEFAULT_DEVICE = _resolve_default_device()
DEFAULT_DTYPE = os.environ.get("QWEN_ASR_DTYPE", "bf16")
DEFAULT_BACKEND = os.environ.get(
    "QWEN_ASR_BACKEND", "mlx-audio" if IS_DARWIN else "transformers"
).strip().lower()
DEFAULT_MAX_BATCH = int(os.environ.get("QWEN_ASR_MAX_BATCH", "2"))
DEFAULT_MAX_NEW_TOKENS = int(os.environ.get("QWEN_ASR_MAX_NEW_TOKENS", "8192"))
IDLE_TIMEOUT_SEC = int(os.environ.get("QWEN_ASR_IDLE_TIMEOUT", "600"))

DEFAULT_MLX_MAX_CHUNK_SEC = float(os.environ.get("QWEN_ASR_MLX_MAX_CHUNK_SEC", "120"))
DEFAULT_MLX_MIN_SILENCE_SEC = float(
    os.environ.get("QWEN_ASR_MLX_MIN_SILENCE_SEC", "0.2")
)
DEFAULT_MLX_TAIL_SILENCE_WINDOW_SEC = float(
    os.environ.get("QWEN_ASR_MLX_TAIL_SILENCE_WINDOW_SEC", "3.0")
)
DEFAULT_MLX_MERGE_TAIL_SEC = float(os.environ.get("QWEN_ASR_MLX_MERGE_TAIL_SEC", "60"))


def _strtobool(value: str) -> bool:
    return str(value).strip().lower() not in {"0", "false", "off", "no"}


def _can_reach_hf(endpoint: str, timeout_sec: float = 2.0) -> bool:
    url = endpoint.rstrip("/")
    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"
    try:
        req = urllib.request.Request(url, method="HEAD")
        with urllib.request.urlopen(req, timeout=timeout_sec):
            return True
    except urllib.error.HTTPError:
        return True
    except Exception:
        return False


def _configure_hf() -> None:
    use_mirror = _strtobool(os.environ.get("QWEN_ASR_HF_MIRROR", "1"))
    endpoint = "https://hf-mirror.com" if use_mirror else os.environ.get(
        "HF_ENDPOINT", "https://huggingface.co"
    )
    os.environ["HF_ENDPOINT"] = endpoint
    if not _can_reach_hf(endpoint):
        os.environ["HF_HUB_OFFLINE"] = "1"
        print(
            "! cannot reach Hugging Face endpoint, enabled offline mode",
            file=sys.stderr,
        )


_configure_hf()


DEFAULT_VOXTRAL_TTS_MODEL = os.environ.get("VOXTRAL_TTS_MODEL", "voxtral-mini-tts-2603")
DEFAULT_VOXTRAL_TTS_OPEN_WEIGHT_MODEL = os.environ.get(
    "VOXTRAL_TTS_OPEN_WEIGHT_MODEL", "mistralai/Voxtral-4B-TTS-2603"
)
DEFAULT_VOXTRAL_TTS_API_BASE_URL = os.environ.get(
    "VOXTRAL_TTS_API_BASE_URL",
    os.environ.get("MISTRAL_API_BASE_URL", "https://api.mistral.ai/v1"),
)
DEFAULT_VOXTRAL_TTS_VLLM_BASE_URL = os.environ.get(
    "VOXTRAL_TTS_VLLM_BASE_URL", "http://127.0.0.1:8000/v1"
)
DEFAULT_VOXTRAL_TTS_RESPONSE_FORMAT = os.environ.get(
    "VOXTRAL_TTS_RESPONSE_FORMAT", "wav"
)
DEFAULT_VOXTRAL_TTS_VOICE = os.environ.get("VOXTRAL_TTS_VOICE", "casual_male")
DEFAULT_VOXTRAL_TTS_VOICE_ID = os.environ.get("VOXTRAL_TTS_VOICE_ID")
