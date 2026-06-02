#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import base64
import json
import logging
import os
import re
import sys
import threading
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import soundfile as sf

from config import (
    DEFAULT_DEVICE,
    DEFAULT_DTYPE,
    DEFAULT_QWEN_TTS_CUSTOM_MODEL,
    DEFAULT_QWEN_TTS_MODEL,
    DEFAULT_QWEN_TTS_VOICEDESIGN_MODEL,
    DEFAULT_VOXCPM2_TTS_MODEL,
    DEFAULT_VOXTRAL_TTS_API_BASE_URL,
    DEFAULT_VOXTRAL_TTS_MODEL,
    DEFAULT_VOXTRAL_TTS_OPEN_WEIGHT_MODEL,
    DEFAULT_VOXTRAL_TTS_RESPONSE_FORMAT,
    DEFAULT_VOXTRAL_TTS_VLLM_BASE_URL,
    DEFAULT_VOXTRAL_TTS_VOICE,
    DEFAULT_VOXTRAL_TTS_VOICE_ID,
    IS_DARWIN,
)
from mlx_runtime import ensure_mlx_audio, load_mlx_model_with_modelscope_fallback

# ---------- MLX TTS model management ----------
_mlx_tts_model = None
_mlx_tts_model_key: Optional[str] = None
_mlx_tts_model_lock = threading.Lock()

# ---------- Qwen TTS model management ----------
_qwen_tts_model = None
_qwen_tts_model_key: Optional[str] = None
_qwen_tts_model_lock = threading.Lock()
_qwen_tts_backend_ready = False
_Qwen3TTSModel = None
_qwen_tts_torch = None

# ---------- VoxCPM2 (PyTorch) model management ----------
# Used on Windows/Linux where the MLX backend is unavailable. Backed by the
# official `voxcpm` package (https://github.com/OpenBMB/VoxCPM).
_voxcpm2_torch_model = None
_voxcpm2_torch_model_key: Optional[str] = None
_voxcpm2_torch_model_lock = threading.Lock()
_voxcpm2_torch_backend_ready = False
_VoxCPM = None


def _get_sample_rate(result: Any, model: Any) -> int:
    """Best-effort sampling rate inference."""
    if isinstance(result, dict):
        for key in ("sample_rate", "sr", "sampling_rate"):
            if result.get(key):
                return int(result[key])
    for attr in ("sample_rate", "sr", "sampling_rate"):
        if hasattr(result, attr):
            return int(getattr(result, attr))
    for attr in ("sample_rate", "sr", "sampling_rate"):
        if hasattr(model, attr):
            return int(getattr(model, attr))
    return 24000


def _get_audio(result: Any) -> Any:
    if isinstance(result, dict):
        for key in ("audio", "wav", "samples"):
            if key in result:
                return result[key]
    if hasattr(result, "audio"):
        return result.audio
    return result


def _write_generation_result(
    *,
    output_path: str,
    result: Any,
    model: Any,
) -> Tuple[int, float]:
    import numpy as np  # type: ignore

    sample_rate = _get_sample_rate(result, model)
    audio_np = np.array(_get_audio(result), dtype=np.float32)
    if audio_np.ndim > 1:
        audio_np = audio_np.reshape(-1)
    duration = float(len(audio_np)) / float(sample_rate) if sample_rate else 0.0
    sf.write(output_path, audio_np, sample_rate)
    return sample_rate, duration


def get_mlx_tts_model(model_name: str) -> Any:
    global _mlx_tts_model, _mlx_tts_model_key

    model_name = (model_name or DEFAULT_QWEN_TTS_MODEL).strip()
    key = model_name

    with _mlx_tts_model_lock:
        if _mlx_tts_model is not None and _mlx_tts_model_key == key:
            return _mlx_tts_model

        ensure_mlx_audio(require_voxcpm2=_is_voxcpm2_model(model_name))
        from mlx_audio.tts.utils import load_model as load_tts_model  # type: ignore

        _mlx_tts_model = load_mlx_model_with_modelscope_fallback(
            load_tts_model, model_name
        )
        _mlx_tts_model_key = key
        return _mlx_tts_model


def _ensure_qwen_tts_backend() -> Tuple[Any, Any]:
    global _qwen_tts_backend_ready, _Qwen3TTSModel, _qwen_tts_torch
    if _qwen_tts_backend_ready and _Qwen3TTSModel is not None and _qwen_tts_torch is not None:
        return _qwen_tts_torch, _Qwen3TTSModel

    try:
        import torch  # type: ignore
        from qwen_tts import Qwen3TTSModel  # type: ignore
    except Exception:
        print("qwen-tts is missing, trying to install it with uv add...", file=sys.stderr)
        code = os.system("uv add qwen-tts")
        if code != 0:
            raise RuntimeError("qwen-tts is not installed and auto-install failed")
        import torch  # type: ignore
        from qwen_tts import Qwen3TTSModel  # type: ignore

    _qwen_tts_torch = torch
    _Qwen3TTSModel = Qwen3TTSModel
    _qwen_tts_backend_ready = True
    return _qwen_tts_torch, _Qwen3TTSModel


def _resolve_torch_dtype(dtype: str, torch: Any) -> Any:
    norm = (dtype or DEFAULT_DTYPE).lower().strip()
    table = {
        "float16": torch.float16,
        "fp16": torch.float16,
        "half": torch.float16,
        "bfloat16": torch.bfloat16,
        "bf16": torch.bfloat16,
        "float32": torch.float32,
        "fp32": torch.float32,
    }
    if norm not in table:
        raise ValueError(f"unsupported dtype: {dtype}")
    return table[norm]


def _normalize_tts_device(device: str) -> str:
    resolved = (device or DEFAULT_DEVICE).strip().lower()
    if resolved in {"cuda", "gpu"}:
        return "cuda:0"
    return resolved


def get_qwen_tts_model(
    model_name: Optional[str],
    device: Optional[str] = None,
    dtype: Optional[str] = None,
) -> Any:
    global _qwen_tts_model, _qwen_tts_model_key

    torch, Qwen3TTSModel = _ensure_qwen_tts_backend()
    resolved_model_name = (model_name or DEFAULT_QWEN_TTS_MODEL).strip()
    resolved_device = _normalize_tts_device(device or DEFAULT_DEVICE)
    resolved_dtype = (dtype or DEFAULT_DTYPE).strip()
    key = json.dumps(
        {
            "model": resolved_model_name,
            "device": resolved_device,
            "dtype": resolved_dtype,
        },
        sort_keys=True,
        ensure_ascii=False,
    )

    with _qwen_tts_model_lock:
        if _qwen_tts_model is not None and _qwen_tts_model_key == key:
            return _qwen_tts_model

        def _load(name: str) -> Any:
            load_kwargs: Dict[str, Any] = {
                "device_map": resolved_device,
                "dtype": _resolve_torch_dtype(resolved_dtype, torch),
            }
            # When loading from a local directory (cache hit or ModelScope
            # fallback) force offline so transformers never tries to reach
            # Hugging Face again.
            if os.path.isdir(name):
                load_kwargs["local_files_only"] = True

            # Flash attention is optional. If unavailable, retry without it.
            if resolved_device.startswith("cuda"):
                load_kwargs["attn_implementation"] = "flash_attention_2"
            logging.info(
                f"Loading qwen-tts model from {name} with kwargs {load_kwargs}"
            )
            try:
                return Qwen3TTSModel.from_pretrained(name, **load_kwargs)
            except Exception:
                if "attn_implementation" not in load_kwargs:
                    raise
                load_kwargs.pop("attn_implementation", None)
                return Qwen3TTSModel.from_pretrained(name, **load_kwargs)

        _qwen_tts_model = load_mlx_model_with_modelscope_fallback(
            _load, resolved_model_name
        )
        _qwen_tts_model_key = key
        return _qwen_tts_model


_QWEN_TTS_VARIANT_DEFAULTS = {
    "Base": DEFAULT_QWEN_TTS_MODEL,
    "CustomVoice": DEFAULT_QWEN_TTS_CUSTOM_MODEL,
    "VoiceDesign": DEFAULT_QWEN_TTS_VOICEDESIGN_MODEL,
}


def _resolve_qwen_tts_repo(model_name: Optional[str], variant: str) -> str:
    """Map a (possibly "family") TTS model id to a concrete Qwen3-TTS repo.

    The model picker exposes family ids such as ``Qwen/Qwen3-TTS-1.7B`` /
    ``Qwen3-TTS-0.6B`` which are NOT real Hugging Face / ModelScope repos.
    The actual weights live in per-mode repos following the pattern:
        ``Qwen/Qwen3-TTS-12Hz-<size>-<Base|CustomVoice|VoiceDesign>``
    so we reconstruct the canonical id based on the requested ``variant``.
    """
    name = (model_name or "").strip()
    if not name:
        return _QWEN_TTS_VARIANT_DEFAULTS[variant]

    lowered = name.lower()
    # Already a concrete repo (canonical ids contain "12hz") or a local dir.
    if "12hz" in lowered or os.path.isdir(name):
        return name

    # Family id: extract the parameter size (e.g. "1.7B", "0.6B") and rebuild.
    match = re.search(r"(\d+(?:\.\d+)?)\s*b\b", lowered)
    size = f"{match.group(1)}B" if match else "1.7B"
    return f"Qwen/Qwen3-TTS-12Hz-{size}-{variant}"


def _default_qwen_speaker(language: Optional[str]) -> str:
    lang = (language or "").strip().lower()
    if "en" in lang:
        return "Ryan"
    if "japanese" in lang or "jp" in lang:
        return "Ono_Anna"
    if "korean" in lang or "ko" in lang:
        return "Sohee"
    return "Vivian"


def _run_mlx_tts(
    text: str,
    language: str,
    output_path: str,
    model_name: Optional[str] = None,
    voice: Optional[str] = None,
    instruct: Optional[str] = None,
    ref_audio: Optional[str] = None,
    ref_text: Optional[str] = None,
    prompt_text: Optional[str] = None,
    prompt_audio: Optional[str] = None,
    temperature: Optional[float] = None,
    inference_timesteps: Optional[int] = None,
    cfg_value: Optional[float] = None,
    warmup_patches: Optional[int] = None,
    max_tokens: Optional[int] = None,
) -> Dict[str, Any]:
    lang = language.lower() if language else "auto"

    if _is_voxcpm2_model(model_name):
        return _run_voxcpm2_tts(
            text=text,
            output_path=output_path,
            model_name=model_name,
            instruct=instruct,
            ref_audio=ref_audio,
            ref_text=ref_text,
            prompt_text=prompt_text,
            prompt_audio=prompt_audio,
            inference_timesteps=inference_timesteps,
            cfg_value=cfg_value,
            warmup_patches=warmup_patches,
            max_tokens=max_tokens,
        )

    # Routing logic:
    #   1. voice (speaker) provided → CustomVoice model, generate_custom_voice()
    #   2. instruct without voice  → VoiceDesign model, generate_voice_design()
    #   3. ref_audio + ref_text    → Base model, generate() (ICL voice cloning)
    #   4. otherwise               → Base model, generate() (default voice)

    if voice:
        # ── CustomVoice: speaker + optional emotion/style instruct ──
        effective_model = model_name or DEFAULT_QWEN_TTS_CUSTOM_MODEL
        model = get_mlx_tts_model(effective_model)
        kwargs: Dict[str, Any] = {
            "text": text,
            "speaker": voice,
            "language": lang,
        }
        if instruct:
            kwargs["instruct"] = instruct
        if temperature:
            kwargs["temperature"] = temperature
        results = list(model.generate_custom_voice(**kwargs))

    elif instruct:
        # ── VoiceDesign: create any voice from text description ──
        effective_model = model_name or DEFAULT_QWEN_TTS_VOICEDESIGN_MODEL
        model = get_mlx_tts_model(effective_model)
        results = list(model.generate_voice_design(
            text=text,
            language=lang,
            instruct=instruct,
            temperature=temperature,
        ))

    else:
        # ── Base model: predefined voice or voice cloning ──
        effective_model = model_name or DEFAULT_QWEN_TTS_MODEL
        model = get_mlx_tts_model(effective_model)
        kwargs = {
            "text": text,
            "lang_code": lang,
        }
        if ref_audio:
            kwargs["ref_audio"] = ref_audio
        if ref_text:
            kwargs["ref_text"] = ref_text
        if temperature:
            kwargs["temperature"] = temperature
        results = list(model.generate(**kwargs))

    if not results:
        raise RuntimeError("TTS generation failed: no audio output returned")

    sample_rate, duration = _write_generation_result(
        output_path=output_path,
        result=results[0],
        model=model,
    )

    return {
        "output_path": output_path,
        "sample_rate": sample_rate,
        "duration": duration,
        "model": effective_model,
    }


def _run_voxcpm2_tts(
    text: str,
    output_path: str,
    model_name: Optional[str] = None,
    instruct: Optional[str] = None,
    ref_audio: Optional[str] = None,
    ref_text: Optional[str] = None,
    prompt_text: Optional[str] = None,
    prompt_audio: Optional[str] = None,
    inference_timesteps: Optional[int] = None,
    cfg_value: Optional[float] = None,
    warmup_patches: Optional[int] = None,
    max_tokens: Optional[int] = None,
) -> Dict[str, Any]:
    effective_model = model_name or DEFAULT_VOXCPM2_TTS_MODEL
    model = get_mlx_tts_model(effective_model)
    kwargs: Dict[str, Any] = {"text": text}
    if instruct:
        kwargs["instruct"] = instruct
    if ref_audio:
        kwargs["ref_audio"] = ref_audio
    if ref_text:
        kwargs["ref_text"] = ref_text
    if prompt_text:
        kwargs["prompt_text"] = prompt_text
    if prompt_audio:
        kwargs["prompt_audio"] = prompt_audio
    if inference_timesteps is not None:
        kwargs["inference_timesteps"] = inference_timesteps
    if cfg_value is not None:
        kwargs["cfg_value"] = cfg_value
    if warmup_patches is not None:
        kwargs["warmup_patches"] = warmup_patches
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens

    logging.info(
        "Running VoxCPM2 TTS model=%s text_len=%s instruct=%s ref_audio=%s "
        "ref_text=%s prompt_text=%s prompt_audio=%s inference_timesteps=%s cfg_value=%s "
        "warmup_patches=%s max_tokens=%s",
        effective_model,
        len(text),
        bool(instruct),
        ref_audio,
        bool(ref_text),
        bool(prompt_text),
        prompt_audio,
        inference_timesteps,
        cfg_value,
        warmup_patches,
        max_tokens,
    )

    results = list(model.generate(**kwargs))
    if not results:
        raise RuntimeError("TTS generation failed: no audio output returned")

    sample_rate, duration = _write_generation_result(
        output_path=output_path,
        result=results[0],
        model=model,
    )
    return {
        "output_path": output_path,
        "sample_rate": sample_rate,
        "duration": duration,
        "model": effective_model,
    }


def _ensure_voxcpm2_torch_backend() -> Any:
    """Import the official `voxcpm` package, installing it on demand."""
    global _voxcpm2_torch_backend_ready, _VoxCPM
    if _voxcpm2_torch_backend_ready and _VoxCPM is not None:
        return _VoxCPM

    try:
        from voxcpm import VoxCPM  # type: ignore
    except Exception:
        print(
            "voxcpm is missing, trying to install it with uv add...",
            file=sys.stderr,
        )
        package_spec = os.environ.get("VOXCPM2_TTS_PACKAGE", "voxcpm")
        code = os.system(f"uv add {package_spec}")
        if code != 0:
            raise RuntimeError("voxcpm is not installed and auto-install failed")
        from voxcpm import VoxCPM  # type: ignore

    _VoxCPM = VoxCPM
    _voxcpm2_torch_backend_ready = True
    return _VoxCPM


def get_voxcpm2_torch_model(
    model_name: Optional[str],
    device: Optional[str] = None,
) -> Any:
    global _voxcpm2_torch_model, _voxcpm2_torch_model_key

    VoxCPM = _ensure_voxcpm2_torch_backend()
    resolved_model_name = (model_name or DEFAULT_VOXCPM2_TTS_MODEL).strip()
    resolved_device = _normalize_tts_device(device or DEFAULT_DEVICE)
    key = json.dumps(
        {"model": resolved_model_name, "device": resolved_device},
        sort_keys=True,
        ensure_ascii=False,
    )

    with _voxcpm2_torch_model_lock:
        if _voxcpm2_torch_model is not None and _voxcpm2_torch_model_key == key:
            return _voxcpm2_torch_model

        def _load(name: str) -> Any:
            # `name` is a local directory when resolved from cache or downloaded
            # via the ModelScope fallback; in that case force offline loading so
            # VoxCPM/huggingface_hub never tries to reach Hugging Face again.
            is_local_dir = os.path.isdir(name)
            logging.info(
                "Loading VoxCPM2 (torch) model from %s on device %s (local=%s)",
                name,
                resolved_device,
                is_local_dir,
            )
            load_kwargs: Dict[str, Any] = {
                "load_denoiser": False,
                "device": resolved_device,
            }
            if is_local_dir:
                load_kwargs["local_files_only"] = True
            return VoxCPM.from_pretrained(name, **load_kwargs)

        _voxcpm2_torch_model = load_mlx_model_with_modelscope_fallback(
            _load, resolved_model_name
        )
        _voxcpm2_torch_model_key = key
        return _voxcpm2_torch_model


def _apply_voxcpm2_instruct(text: str, instruct: Optional[str]) -> str:
    """VoxCPM2 voice design works by prefixing the text with a parenthesized
    natural-language description, e.g. ``(A gentle female voice)Hello``."""
    if not instruct:
        return text
    description = instruct.strip()
    if not description:
        return text
    if not (description.startswith("(") and description.endswith(")")):
        description = f"({description})"
    return f"{description}{text}"


def _run_voxcpm2_torch_tts(
    text: str,
    output_path: str,
    model_name: Optional[str] = None,
    instruct: Optional[str] = None,
    ref_audio: Optional[str] = None,
    ref_text: Optional[str] = None,
    prompt_text: Optional[str] = None,
    prompt_audio: Optional[str] = None,
    inference_timesteps: Optional[int] = None,
    cfg_value: Optional[float] = None,
    device: Optional[str] = None,
) -> Dict[str, Any]:
    import numpy as np  # type: ignore

    effective_model = model_name or DEFAULT_VOXCPM2_TTS_MODEL
    model = get_voxcpm2_torch_model(effective_model, device)

    kwargs: Dict[str, Any] = {"text": _apply_voxcpm2_instruct(text, instruct)}

    # Continuation-style cloning needs a prompt clip paired with its transcript.
    # `ref_audio`+`ref_text` is treated as the highest-fidelity "ultimate cloning"
    # path (same clip used for both prompt and reference) per the VoxCPM2 docs.
    prompt_wav = prompt_audio or (ref_audio if ref_text else None)
    prompt_txt = prompt_text or (ref_text if ref_text else None)
    if prompt_wav and prompt_txt:
        kwargs["prompt_wav_path"] = prompt_wav
        kwargs["prompt_text"] = prompt_txt

    # Timbre cloning does not require a transcript.
    if ref_audio:
        kwargs["reference_wav_path"] = ref_audio

    if cfg_value is not None:
        kwargs["cfg_value"] = cfg_value
    if inference_timesteps is not None:
        kwargs["inference_timesteps"] = inference_timesteps

    logging.info(
        "Running VoxCPM2 (torch) TTS model=%s text_len=%s instruct=%s ref_audio=%s "
        "ref_text=%s prompt_text=%s prompt_audio=%s inference_timesteps=%s cfg_value=%s",
        effective_model,
        len(text),
        bool(instruct),
        ref_audio,
        bool(ref_text),
        bool(prompt_text),
        prompt_audio,
        inference_timesteps,
        cfg_value,
    )

    wav = model.generate(**kwargs)
    if wav is None:
        raise RuntimeError("TTS generation failed: no audio output returned")

    sample_rate = 48000
    tts_model = getattr(model, "tts_model", None)
    if tts_model is not None and getattr(tts_model, "sample_rate", None):
        sample_rate = int(tts_model.sample_rate)
    elif getattr(model, "sample_rate", None):
        sample_rate = int(model.sample_rate)

    audio_np = np.array(wav, dtype=np.float32)
    if audio_np.ndim > 1:
        audio_np = audio_np.reshape(-1)
    duration = float(len(audio_np)) / float(sample_rate) if sample_rate else 0.0

    sf.write(output_path, audio_np, sample_rate)

    return {
        "output_path": output_path,
        "sample_rate": sample_rate,
        "duration": duration,
        "model": effective_model,
        "backend": "voxcpm2",
    }


def _run_qwen_tts(
    text: str,
    language: str,
    output_path: str,
    model_name: Optional[str] = None,
    voice: Optional[str] = None,
    instruct: Optional[str] = None,
    ref_audio: Optional[str] = None,
    ref_text: Optional[str] = None,
) -> Dict[str, Any]:
    import numpy as np  # type: ignore
    import soundfile as sf  # type: ignore

    lang = language if language else "English"

    # Routing aligns with _run_mlx_tts:
    # 1. voice -> CustomVoice model
    # 2. instruct (without voice) -> VoiceDesign model
    # 3. ref_audio + ref_text -> Base model voice clone
    # 4. no mode params -> CustomVoice default speaker
    logging.info(f"Running qwen-tts with voice {voice}, instruct {instruct}, ref_audio {ref_audio}, ref_text {ref_text}")
    if voice:
        effective_model = _resolve_qwen_tts_repo(model_name, "CustomVoice")
        model = get_qwen_tts_model(effective_model)
        kwargs: Dict[str, Any] = {
            "text": text,
            "language": lang,
            "speaker": voice,
        }
        if instruct:
            kwargs["instruct"] = instruct
        wavs, sample_rate = model.generate_custom_voice(**kwargs)
    elif instruct:
        effective_model = _resolve_qwen_tts_repo(model_name, "VoiceDesign")
        model = get_qwen_tts_model(effective_model)
        wavs, sample_rate = model.generate_voice_design(
            text=text,
            language=lang,
            instruct=instruct,
        )
    elif ref_audio or ref_text:
        if not ref_audio or not ref_text:
            raise ValueError("ref_audio and ref_text must be provided together")
        effective_model = _resolve_qwen_tts_repo(model_name, "Base")
        model = get_qwen_tts_model(effective_model)
        wavs, sample_rate = model.generate_voice_clone(
            text=text,
            language=lang,
            ref_audio=ref_audio,
            ref_text=ref_text,
        )
    else:
        effective_model = _resolve_qwen_tts_repo(model_name, "CustomVoice")
        model = get_qwen_tts_model(effective_model)
        wavs, sample_rate = model.generate_custom_voice(
            text=text,
            language=lang,
            speaker=_default_qwen_speaker(lang),
        )

    if wavs is None:
        raise RuntimeError("TTS generation failed: no audio output returned")

    if isinstance(wavs, (list, tuple)):
        if not wavs:
            raise RuntimeError("TTS generation failed: empty audio output")
        audio = wavs[0]
    else:
        audio = wavs

    audio_np = np.array(audio, dtype=np.float32)
    if audio_np.ndim > 1:
        audio_np = audio_np.reshape(-1)
    sample_rate = int(sample_rate) if sample_rate else 24000
    duration = float(len(audio_np)) / float(sample_rate) if sample_rate else 0.0

    sf.write(output_path, audio_np, sample_rate)

    return {
        "output_path": output_path,
        "sample_rate": sample_rate,
        "duration": duration,
        "model": effective_model,
    }


# ---------- Voxtral TTS ----------
def _normalize_backend(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    return value.strip().lower().replace("_", "-")


def _is_voxtral_model(model_name: Optional[str]) -> bool:
    return "voxtral" in (model_name or "").strip().lower()


def _is_voxcpm2_model(model_name: Optional[str]) -> bool:
    return "voxcpm2" in (model_name or "").strip().lower()


def _voxcpm2_backend() -> str:
    """VoxCPM2 runs through MLX on Apple Silicon and through the PyTorch
    `voxcpm` package on every other platform (e.g. Windows/Linux)."""
    return "mlx-audio" if IS_DARWIN else "voxcpm2"


def resolve_tts_backend(params: Dict[str, Any]) -> str:
    explicit = _normalize_backend(params.get("backend") or params.get("tts_backend"))
    if explicit:
        if explicit == "voxcpm2":
            return _voxcpm2_backend()
        if explicit in {"mlx", "mlx-audio"}:
            return "mlx-audio"
        if explicit in {"qwen", "qwen-tts", "transformers"}:
            return "qwen"
        if explicit in {"voxtral", "voxtral-api", "mistral", "mistral-api"}:
            return "voxtral-api"
        if explicit in {"voxtral-vllm", "vllm", "vllm-omni", "openai-compatible"}:
            return "voxtral-vllm"
        raise ValueError(f"unsupported TTS backend: {explicit}")

    model_name = params.get("model")
    if _is_voxcpm2_model(model_name):
        return _voxcpm2_backend()
    if _is_voxtral_model(model_name):
        normalized_model = str(model_name).strip().lower()
        if normalized_model.startswith("mistralai/"):
            return "voxtral-vllm"
        return "voxtral-api"

    return "mlx-audio" if IS_DARWIN else "qwen"


def _response_format_from_path(output_path: str) -> str:
    suffix = Path(output_path).suffix.lower().lstrip(".")
    if suffix in {"mp3", "wav", "pcm", "flac", "opus"}:
        return suffix
    return DEFAULT_VOXTRAL_TTS_RESPONSE_FORMAT


def _base64_audio_data(path: str) -> str:
    with open(path, "rb") as src:
        return base64.b64encode(src.read()).decode("ascii")


def build_voxtral_speech_payload(
    *,
    backend: str,
    text: str,
    model_name: str,
    voice: Optional[str] = None,
    ref_audio: Optional[str] = None,
    response_format: Optional[str] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "model": model_name,
        "input": text,
        "response_format": response_format or DEFAULT_VOXTRAL_TTS_RESPONSE_FORMAT,
    }

    if ref_audio:
        payload["ref_audio"] = _base64_audio_data(ref_audio)

    if backend == "voxtral-api":
        voice_id = voice or DEFAULT_VOXTRAL_TTS_VOICE_ID
        if voice_id:
            payload["voice_id"] = voice_id
    else:
        payload["voice"] = voice or DEFAULT_VOXTRAL_TTS_VOICE

    return payload


def _decode_voxtral_response(body: bytes, content_type: str) -> bytes:
    if "json" not in content_type.lower():
        return body

    data = json.loads(body.decode("utf-8"))
    audio_data = data.get("audio_data") or data.get("audio")
    if isinstance(audio_data, str):
        return base64.b64decode(audio_data)
    raise RuntimeError("Voxtral TTS response did not include audio_data")


def _post_voxtral_audio_speech(
    *,
    backend: str,
    base_url: str,
    payload: Dict[str, Any],
    api_key: Optional[str],
) -> bytes:
    url = base_url.rstrip("/") + "/audio/speech"
    headers = {"Content-Type": "application/json"}
    if backend == "voxtral-api":
        token = api_key or os.environ.get("MISTRAL_API_KEY")
        if not token:
            raise RuntimeError(
                "Voxtral API TTS requires VOXTRAL_TTS_API_KEY or MISTRAL_API_KEY"
            )
        headers["Authorization"] = f"Bearer {token}"

    request = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return _decode_voxtral_response(
                response.read(), response.headers.get("content-type", "")
            )
    except urllib.error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Voxtral TTS request failed: {exc.code} {details}") from exc


def _audio_file_info(path: str) -> Tuple[int, float]:
    try:
        info = sf.info(path)
        return int(info.samplerate or 24000), float(info.duration or 0.0)
    except Exception:
        return 24000, 0.0


def _run_voxtral_tts(
    text: str,
    output_path: str,
    backend: str,
    model_name: Optional[str] = None,
    voice: Optional[str] = None,
    ref_audio: Optional[str] = None,
    response_format: Optional[str] = None,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
) -> Dict[str, Any]:
    if ref_audio and not os.path.exists(ref_audio):
        raise FileNotFoundError(f"reference audio not found: {ref_audio}")

    effective_model = model_name or (
        DEFAULT_VOXTRAL_TTS_OPEN_WEIGHT_MODEL
        if backend == "voxtral-vllm"
        else DEFAULT_VOXTRAL_TTS_MODEL
    )
    effective_format = response_format or _response_format_from_path(output_path)
    effective_base_url = base_url or (
        DEFAULT_VOXTRAL_TTS_VLLM_BASE_URL
        if backend == "voxtral-vllm"
        else DEFAULT_VOXTRAL_TTS_API_BASE_URL
    )
    payload = build_voxtral_speech_payload(
        backend=backend,
        text=text,
        model_name=effective_model,
        voice=voice,
        ref_audio=ref_audio,
        response_format=effective_format,
    )
    audio_bytes = _post_voxtral_audio_speech(
        backend=backend,
        base_url=effective_base_url,
        payload=payload,
        api_key=api_key or os.environ.get("VOXTRAL_TTS_API_KEY"),
    )

    with open(output_path, "wb") as dst:
        dst.write(audio_bytes)

    sample_rate, duration = _audio_file_info(output_path)
    return {
        "output_path": output_path,
        "sample_rate": sample_rate,
        "duration": duration,
        "model": effective_model,
        "backend": backend,
    }


def method_tts(params: Dict[str, Any]) -> Dict[str, Any]:
    text = params.get("text")
    if not text:
        raise ValueError("params.text is required for TTS")

    output_path = params.get("output_path")
    if not output_path:
        raise ValueError("params.output_path is required for TTS")

    language = params.get("language", "English")
    model_name = params.get("model")
    voice = params.get("voice")
    instruct = params.get("instruct")
    ref_audio = params.get("ref_audio")
    ref_text = params.get("ref_text")
    prompt_text = params.get("prompt_text")
    prompt_audio = params.get("prompt_audio")
    backend = resolve_tts_backend(params)

    if ref_audio and not os.path.exists(ref_audio):
        raise FileNotFoundError(f"reference audio not found: {ref_audio}")
    if prompt_audio and not os.path.exists(prompt_audio):
        raise FileNotFoundError(f"prompt audio not found: {prompt_audio}")

    if backend in {"voxtral-api", "voxtral-vllm"}:
        return _run_voxtral_tts(
            text=text,
            output_path=output_path,
            backend=backend,
            model_name=model_name,
            voice=voice,
            ref_audio=ref_audio,
            response_format=params.get("response_format"),
            api_key=params.get("api_key"),
            base_url=params.get("base_url"),
        )

    if backend == "voxcpm2":
        return _run_voxcpm2_torch_tts(
            text=text,
            output_path=output_path,
            model_name=model_name,
            instruct=instruct,
            ref_audio=ref_audio,
            ref_text=ref_text,
            prompt_text=prompt_text,
            prompt_audio=prompt_audio,
            inference_timesteps=params.get("inference_timesteps"),
            cfg_value=params.get("cfg_value"),
            device=params.get("device"),
        )

    if backend == "mlx-audio":
        return _run_mlx_tts(
            text=text,
            language=language,
            output_path=output_path,
            model_name=model_name,
            voice=voice,
            instruct=instruct,
            ref_audio=ref_audio,
            ref_text=ref_text,
            prompt_text=prompt_text,
            prompt_audio=prompt_audio,
            temperature=params.get("temperature"),
            inference_timesteps=params.get("inference_timesteps"),
            cfg_value=params.get("cfg_value"),
            warmup_patches=params.get("warmup_patches"),
            max_tokens=params.get("max_tokens"),
        )

    return _run_qwen_tts(
        text=text,
        language=language,
        output_path=output_path,
        model_name=model_name,
        voice=voice,
        instruct=instruct,
        ref_audio=ref_audio,
        ref_text=ref_text,
    )


def get_tts_status() -> Dict[str, Any]:
    return {
        "tts_loaded": (
            (_mlx_tts_model is not None)
            or (_qwen_tts_model is not None)
            or (_voxcpm2_torch_model is not None)
        ),
        "tts_model_key": (
            _mlx_tts_model_key
            if _mlx_tts_model_key is not None
            else (_qwen_tts_model_key or _voxcpm2_torch_model_key)
        ),
        "default_tts_model": DEFAULT_QWEN_TTS_MODEL,
        "default_tts_voicedesign_model": DEFAULT_QWEN_TTS_VOICEDESIGN_MODEL,
        "default_voxcpm2_tts_model": DEFAULT_VOXCPM2_TTS_MODEL,
        "default_voxtral_tts_model": DEFAULT_VOXTRAL_TTS_MODEL,
        "default_voxtral_tts_open_weight_model": DEFAULT_VOXTRAL_TTS_OPEN_WEIGHT_MODEL,
    }
