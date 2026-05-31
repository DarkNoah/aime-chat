#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import logging
import os
import shutil
import sys
import tempfile
import threading
import urllib.request
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Callable, Dict, List, Optional, Tuple

import soundfile as sf

from config import (
    DEFAULT_BACKEND,
    DEFAULT_DEVICE,
    DEFAULT_DTYPE,
    DEFAULT_MAX_BATCH,
    DEFAULT_MAX_NEW_TOKENS,
    DEFAULT_MLX_ALIGNER_MODEL,
    DEFAULT_MLX_MAX_CHUNK_SEC,
    DEFAULT_MLX_MERGE_TAIL_SEC,
    DEFAULT_MLX_MIN_SILENCE_SEC,
    DEFAULT_MLX_MODEL,
    DEFAULT_MLX_TAIL_SILENCE_WINDOW_SEC,
    DEFAULT_MODEL,
    DEFAULT_QWEN_ALIGNER_MODEL,
)
from mlx_runtime import ensure_mlx_audio, load_mlx_model_with_modelscope_fallback

_touch_callback: Callable[[], None] = lambda: None


def set_touch_callback(callback: Callable[[], None]) -> None:
    global _touch_callback
    _touch_callback = callback


def touch() -> None:
    _touch_callback()

# ---------- Qwen backend model management ----------
_model = None
_model_lock = threading.Lock()
_model_key: Optional[str] = None

_torch = None
_Qwen3ASRModel = None


def _ensure_qwen_backend() -> Tuple[Any, Any]:
    global _torch, _Qwen3ASRModel
    if _torch is not None and _Qwen3ASRModel is not None:
        return _torch, _Qwen3ASRModel
    try:
        import torch  # type: ignore
        from qwen_asr import Qwen3ASRModel  # type: ignore
    except Exception as exc:
        raise RuntimeError(
            "qwen-asr backend unavailable; install qwen-asr/torch or use backend=mlx-audio"
        ) from exc
    _torch = torch
    _Qwen3ASRModel = Qwen3ASRModel
    return _torch, _Qwen3ASRModel


def _resolve_dtype(dtype: str) -> Any:
    torch, _ = _ensure_qwen_backend()
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


def get_qwen_model(
    model_name: str,
    backend: str,
    device: str,
    dtype: str,
    max_batch: int,
    max_new_tokens: int,
    forced_aligner: Optional[str],
    forced_aligner_kwargs: Optional[Dict[str, Any]],
) -> Any:
    global _model, _model_key
    _, Qwen3ASRModel = _ensure_qwen_backend()

    model_name = (model_name or DEFAULT_MODEL).strip()
    backend = (backend or DEFAULT_BACKEND).strip().lower()
    if backend != "transformers":
        raise ValueError(f"unsupported qwen backend: {backend}")
    device = (device or DEFAULT_DEVICE).strip()
    dtype = (dtype or DEFAULT_DTYPE).strip()
    key = json.dumps(
        {
            "model": model_name,
            "backend": backend,
            "device": device,
            "dtype": dtype,
            "max_batch": max_batch,
            "max_new_tokens": max_new_tokens,
            "forced_aligner": forced_aligner,
            # "forced_aligner_kwargs": forced_aligner_kwargs or {},
        },
        sort_keys=True,
        ensure_ascii=False,
    )

    with _model_lock:
        if _model is not None and _model_key == key:
            return _model

        init_kwargs: Dict[str, Any] = {
            "dtype": _resolve_dtype(dtype),
            "device_map": device,
            "max_inference_batch_size": max_batch,
            "max_new_tokens": max_new_tokens,
        }
        if forced_aligner:
            init_kwargs["forced_aligner"] = forced_aligner
        if forced_aligner_kwargs:
            init_kwargs["forced_aligner_kwargs"] = forced_aligner_kwargs
        logging.info(model_name)
        logging.info(init_kwargs)
        _model = Qwen3ASRModel.from_pretrained(model_name, **init_kwargs)
        _model_key = key
        return _model


# ---------- MLX backend model management ----------
_mlx_model_key: Optional[str] = None
_mlx_model_lock = threading.Lock()
_mlx_asr_model = None
_mlx_aligner_model = None


def get_mlx_models(model_name: str, aligner_model_name: str) -> Tuple[Any, Any]:
    global _mlx_asr_model, _mlx_aligner_model, _mlx_model_key

    model_name = (model_name or DEFAULT_MLX_MODEL).strip()
    aligner_model_name = (aligner_model_name or DEFAULT_MLX_ALIGNER_MODEL).strip()
    key = json.dumps(
        {"model": model_name, "aligner_model": aligner_model_name},
        sort_keys=True,
        ensure_ascii=False,
    )

    with _mlx_model_lock:
        if (
            _mlx_asr_model is not None
            and _mlx_aligner_model is not None
            and _mlx_model_key == key
        ):
            return _mlx_asr_model, _mlx_aligner_model

        ensure_mlx_audio()
        from mlx_audio.stt.utils import load_model as load_stt_model  # type: ignore

        _mlx_asr_model = load_mlx_model_with_modelscope_fallback(
            load_stt_model, model_name
        )
        _mlx_aligner_model = load_mlx_model_with_modelscope_fallback(
            load_stt_model, aligner_model_name
        )
        _mlx_model_key = key
        return _mlx_asr_model, _mlx_aligner_model


def _normalize_result_item(item: Any) -> Dict[str, Any]:
    if hasattr(item, "model_dump"):
        data = item.model_dump()
        return data if isinstance(data, dict) else {"text": str(item)}
    if isinstance(item, dict):
        return item

    out: Dict[str, Any] = {}
    for key in ["language", "text", "time_stamps"]:
        if hasattr(item, key):
            out[key] = getattr(item, key)
        if key == "time_stamps":
            out[key] = []
    if not out:
        out["text"] = str(item)
    return out


def _normalize_dtype_in_dict(kwargs: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(kwargs)
    if "dtype" in out and isinstance(out["dtype"], str):
        out["dtype"] = _resolve_dtype(out["dtype"])
    return out


def _resolve_audio_input(params: Dict[str, Any]) -> Any:
    if "audio" in params:
        return params["audio"]
    if "audio_path" in params:
        p = Path(params["audio_path"])
        if not p.exists():
            raise FileNotFoundError(f"audio not found: {p}")
        return str(p)
    if "audio_url" in params:
        return params["audio_url"]
    raise ValueError(
        "one of params.audio / params.audio_path / params.audio_url is required"
    )


def _to_ns_alignment_item(item: Any) -> SimpleNamespace:
    if isinstance(item, dict):
        start = item.get("start_time", item.get("start", 0.0))
        end = item.get("end_time", item.get("end", start))
        text = item.get("text", "")
    else:
        start = getattr(item, "start_time", getattr(item, "start", 0.0))
        end = getattr(item, "end_time", getattr(item, "end", start))
        text = getattr(item, "text", "")

    try:
        start_value = float(start)
    except Exception:
        start_value = 0.0
    try:
        end_value = float(end)
    except Exception:
        end_value = start_value

    return SimpleNamespace(
        start_time=start_value,
        end_time=end_value,
        text=str(text or ""),
    )


def _alignment_to_list(alignment: List[SimpleNamespace]) -> List[Dict[str, Any]]:
    return [
        {
            "start": item.start_time,
            "end": item.end_time,
            "text": item.text,
            "time_stamps": [item.start_time, item.end_time],
        }
        for item in alignment
    ]


def _find_tail_silence_start(
    alignment: List[SimpleNamespace],
    chunk_len_sec: float,
    min_silence_sec: float,
    tail_silence_window_sec: float,
) -> Optional[float]:
    if not alignment:
        return None

    window_start = max(0.0, chunk_len_sec - tail_silence_window_sec)
    gaps: List[Tuple[float, float]] = []

    first = alignment[0]
    if first.start_time >= min_silence_sec:
        gaps.append((0.0, first.start_time))

    for i in range(len(alignment) - 1):
        gap_start = alignment[i].end_time
        gap_end = alignment[i + 1].start_time
        if gap_end - gap_start >= min_silence_sec:
            gaps.append((gap_start, gap_end))

    last = alignment[-1]
    if chunk_len_sec - last.end_time >= min_silence_sec:
        gaps.append((last.end_time, chunk_len_sec))

    if not gaps:
        return None

    tail_gaps = [gap for gap in gaps if gap[1] < window_start and gap[0] < chunk_len_sec]
    if not tail_gaps:
        return None
    return max(tail_gaps, key=lambda gap: gap[0])[0]


def _build_sentence_segments(
    asr_text: str, alignment_result: List[SimpleNamespace]
) -> List[Dict[str, Any]]:
    punct = set("，。！？；：、,.!?;:…")
    if not alignment_result:
        return []

    def _norm_char(ch: str) -> str:
        if "A" <= ch <= "Z":
            return ch.lower()
        return ch

    asr_clean: List[str] = []
    punct_positions = set()
    for ch in asr_text:
        if ch.isspace():
            continue
        if ch in punct:
            if asr_clean:
                punct_positions.add(len(asr_clean) - 1)
            continue
        asr_clean.append(_norm_char(ch))

    align_clean: List[str] = []
    align_char_token: List[int] = []
    for token_idx, item in enumerate(alignment_result):
        token_text = str(item.text)
        for ch in token_text:
            if ch.isspace() or ch in punct:
                continue
            align_clean.append(_norm_char(ch))
            align_char_token.append(token_idx)

    token_boundaries = set()
    asr_idx = 0
    for align_idx, ch in enumerate(align_clean):
        while asr_idx < len(asr_clean) and asr_clean[asr_idx] != ch:
            asr_idx += 1
        if asr_idx >= len(asr_clean):
            break
        if asr_idx in punct_positions:
            token_boundaries.add(align_char_token[align_idx])
        asr_idx += 1

    segments: List[Dict[str, Any]] = []
    cur_text: List[str] = []
    cur_start: Optional[float] = None
    cur_end: Optional[float] = None
    for token_idx, item in enumerate(alignment_result):
        if cur_start is None:
            cur_start = item.start_time
        cur_end = item.end_time
        cur_text.append(str(item.text))
        if token_idx in token_boundaries:
            text = "".join(cur_text).strip()
            if text and cur_end is not None:
                segments.append(
                    {
                        "start": cur_start,
                        "end": cur_end,
                        "text": text,
                        "time_stamps": [cur_start, cur_end],
                    }
                )
            cur_text = []
            cur_start = None
            cur_end = None

    if cur_text and cur_start is not None and cur_end is not None:
        text = "".join(cur_text).strip()
        if text:
            segments.append(
                {
                    "start": cur_start,
                    "end": cur_end,
                    "text": text,
                    "time_stamps": [cur_start, cur_end],
                }
            )
    return segments


def _resolve_mlx_audio_path(audio_input: Any) -> Tuple[str, Optional[str]]:
    if isinstance(audio_input, str):
        if audio_input.startswith(("http://", "https://")):
            url_no_query = audio_input.split("?", 1)[0]
            suffix = Path(url_no_query).suffix or ".wav"
            fd, temp_path = tempfile.mkstemp(prefix="mlx_audio_", suffix=suffix)
            os.close(fd)
            try:
                with urllib.request.urlopen(audio_input, timeout=30) as resp:
                    with open(temp_path, "wb") as dst:
                        shutil.copyfileobj(resp, dst)
            except Exception:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                raise
            return temp_path, temp_path

        path = Path(audio_input)
        if path.exists():
            return str(path), None

    raise FileNotFoundError(
        "mlx-audio backend requires params.audio_path (existing file) or params.audio_url"
    )


def _run_mlx_asr(
    audio_path: str,
    model_name: str,
    aligner_model_name: str,
    language: Optional[str],
    max_chunk_sec: float,
    min_silence_sec: float,
    tail_silence_window_sec: float,
    merge_tail_sec: float,
) -> Dict[str, Any]:
    import soundfile as sf  # type: ignore

    asr_model, aligner_model = get_mlx_models(model_name, aligner_model_name)
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"audio file not found: {audio_path}")

    audio_data, sr = sf.read(audio_path, always_2d=True)
    total_samples = int(audio_data.shape[0])
    total_sec = total_samples / float(sr) if sr else 0.0
    asr_text = ""
    alignment_result: List[SimpleNamespace] = []

    asr_kwargs: Dict[str, Any] = {"verbose": True}
    if language:
        asr_kwargs["language"] = language
    align_kwargs: Dict[str, Any] = {}
    if language:
        align_kwargs["language"] = language

    if total_sec <= max_chunk_sec:
        asr_result = asr_model.generate(audio_path, **asr_kwargs)
        asr_text = str(getattr(asr_result, "text", "") or "").strip()
        if asr_text:
            raw_alignment = aligner_model.generate(
                audio_path,
                text=asr_text,
                **align_kwargs,
            )
            alignment_result = [_to_ns_alignment_item(x) for x in (raw_alignment or [])]
    else:
        max_chunk_samples = int(max_chunk_sec * sr)
        temp_dir = tempfile.mkdtemp(prefix="mlx_audio_stream_")
        try:
            start = 0
            idx = 0
            while start < total_samples:
                end = min(start + max_chunk_samples, total_samples)
                if total_samples - end < int(merge_tail_sec * sr):
                    end = total_samples

                chunk_path = os.path.join(temp_dir, f"chunk_{idx:03d}.wav")
                sf.write(chunk_path, audio_data[start:end], sr)

                chunk_asr = asr_model.generate(chunk_path, **asr_kwargs)
                touch()
                chunk_text = str(getattr(chunk_asr, "text", "") or "").strip()
                if chunk_text:
                    asr_text = f"{asr_text} {chunk_text}".strip()

                raw_chunk_alignment = []
                if chunk_text:
                    raw_chunk_alignment = aligner_model.generate(
                        chunk_path,
                        text=chunk_text,
                        **align_kwargs,
                    )
                chunk_alignment = [
                    _to_ns_alignment_item(x) for x in (raw_chunk_alignment or [])
                ]

                chunk_len = (end - start) / float(sr)
                cut_start = None
                if chunk_alignment:
                    cut_start = _find_tail_silence_start(
                        alignment=chunk_alignment,
                        chunk_len_sec=chunk_len,
                        min_silence_sec=min_silence_sec,
                        tail_silence_window_sec=tail_silence_window_sec,
                    )

                offset = start / float(sr)
                if end >= total_samples:
                    next_start = total_samples
                elif chunk_alignment:
                    if cut_start is None:
                        last_end = chunk_alignment[-1].end_time
                        next_start = int(round((offset + last_end) * sr))
                    else:
                        next_start = int(round((offset + cut_start) * sr))
                    if next_start <= start:
                        next_start = end
                else:
                    next_start = end

                trim_at = cut_start if cut_start is not None and next_start < end else None
                if trim_at is None:
                    trimmed_alignment = chunk_alignment
                else:
                    trimmed_alignment = [
                        item for item in chunk_alignment if item.end_time <= trim_at
                    ]

                for item in trimmed_alignment:
                    alignment_result.append(
                        SimpleNamespace(
                            start_time=item.start_time + offset,
                            end_time=item.end_time + offset,
                            text=item.text,
                        )
                    )

                if next_start > total_samples:
                    next_start = total_samples
                start = next_start
                idx += 1
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    sentence_segments = _build_sentence_segments(asr_text, alignment_result)
    if not sentence_segments and asr_text:
        if alignment_result:
            start = alignment_result[0].start_time
            end = alignment_result[-1].end_time
        else:
            start = 0.0
            end = total_sec
        sentence_segments = [
            {
                "start": start,
                "end": end,
                "text": asr_text,
                "time_stamps": [start, end],
            }
        ]

    return {
        "text": asr_text,
        "sentence_segments": sentence_segments,
        "alignment": _alignment_to_list(alignment_result),
        "sample_rate": int(sr),
        "duration": total_sec,
    }


def _predict_qwen(params: Dict[str, Any], backend: str) -> Dict[str, Any]:
    if backend != "transformers":
        raise ValueError(f"unsupported backend: {backend}, expected transformers or mlx-audio")

    model_name = params.get("model") or DEFAULT_MODEL
    device = params.get("device") or DEFAULT_DEVICE
    dtype = params.get("dtype") or DEFAULT_DTYPE
    max_batch = int(params.get("max_inference_batch_size", DEFAULT_MAX_BATCH))
    max_new_tokens = int(params.get("max_new_tokens", DEFAULT_MAX_NEW_TOKENS))
    forced_aligner = (
        params.get("aligner_model")
        or params.get("forced_aligner")
        or DEFAULT_QWEN_ALIGNER_MODEL
    )
    forced_aligner_kwargs = _normalize_dtype_in_dict(
        params.get("forced_aligner_kwargs") or {
            "dtype": dtype,
            "device_map": device,
        }
    )
    forced_aligner_kwargs = dict(dtype=_resolve_dtype(dtype),device_map=device)
    language = params.get("language")
    return_time_stamps = bool(params.get("return_time_stamps", False))
    transcribe_kwargs = params.get("transcribe_kwargs") or {}

    audio_input = _resolve_audio_input(params)
    model = get_qwen_model(
        model_name=model_name,
        backend=backend,
        device=device,
        dtype=dtype,
        max_batch=max_batch,
        max_new_tokens=max_new_tokens,
        forced_aligner=forced_aligner,
        forced_aligner_kwargs=forced_aligner_kwargs,
    )

    results = model.transcribe(
        audio=audio_input,
        language=language,
        return_time_stamps=return_time_stamps,
        **transcribe_kwargs,
    )
    if not isinstance(results, list):
        results = [results]

    # items: List[Dict[str, Any]] = [_normalize_result_item(x) for x in results]
    text = results[0].text.strip()

    items = [
        {
            "start": item.start_time,
            "end": item.end_time,
            "text": item.text,
        }
        for item in results[0].time_stamps.items
    ]
    info = sf.info(audio_input)

    return {
        "model": model_name,
        "backend": backend,
        "device": device,
        "dtype": dtype,
        "language": results[0].language,
        "aligner_model": forced_aligner,
        "return_time_stamps": return_time_stamps,
        "count": len(results),
        "text": text,
        "items": items,
        "duration": info.duration,
        "sample_rate": info.samplerate,
    }


def _predict_mlx(params: Dict[str, Any], backend: str) -> Dict[str, Any]:
    model_name = params.get("model") or DEFAULT_MODEL or DEFAULT_MLX_MODEL
    aligner_model = (
        params.get("aligner_model")
        or params.get("forced_aligner")
        or DEFAULT_MLX_ALIGNER_MODEL
    )
    language = params.get("language")
    device = params.get("device") or "mps"
    dtype = params.get("dtype") or "float16"
    return_time_stamps = bool(params.get("return_time_stamps", False))

    max_chunk_sec = float(params.get("max_chunk_sec", DEFAULT_MLX_MAX_CHUNK_SEC))
    min_silence_sec = float(params.get("min_silence_sec", DEFAULT_MLX_MIN_SILENCE_SEC))
    tail_silence_window_sec = float(
        params.get("tail_silence_window_sec", DEFAULT_MLX_TAIL_SILENCE_WINDOW_SEC)
    )
    merge_tail_sec = float(params.get("merge_tail_sec", DEFAULT_MLX_MERGE_TAIL_SEC))

    audio_input = _resolve_audio_input(params)
    audio_path, cleanup_path = _resolve_mlx_audio_path(audio_input)
    try:
        mlx_result = _run_mlx_asr(
            audio_path=audio_path,
            model_name=model_name,
            aligner_model_name=aligner_model,
            language=language,
            max_chunk_sec=max_chunk_sec,
            min_silence_sec=min_silence_sec,
            tail_silence_window_sec=tail_silence_window_sec,
            merge_tail_sec=merge_tail_sec,
        )
    finally:
        if cleanup_path and os.path.exists(cleanup_path):
            os.remove(cleanup_path)

    asr_text = str(mlx_result.get("text", "") or "")
    sentence_segments = mlx_result.get("sentence_segments") or []
    alignment = mlx_result.get("alignment") or []

    if return_time_stamps:
        items = sentence_segments or alignment
    else:
        items = [{"text": seg.get("text", "")} for seg in sentence_segments]
        if not items and asr_text:
            items = [{"text": asr_text}]

    return {
        "model": model_name,
        "backend": backend,
        "device": device,
        "dtype": dtype,
        "language": language,
        "aligner_model": aligner_model,
        "return_time_stamps": return_time_stamps,
        "count": len(items),
        "text": asr_text,
        "items": items,
        "duration": mlx_result.get("duration"),
        "sample_rate": mlx_result.get("sample_rate"),
    }


def method_predict(params: Dict[str, Any]) -> Dict[str, Any]:
    backend = (params.get("backend") or DEFAULT_BACKEND).strip().lower()
    if backend in {"mlx", "mlx_audio", "mlx-audio"}:
        return _predict_mlx(params, backend="mlx-audio")
    if backend != "transformers":
        raise ValueError(f"unsupported backend: {backend}, expected transformers or mlx-audio")
    return _predict_qwen(params, backend=backend)



def get_stt_status() -> Dict[str, Any]:
    return {
        "loaded": (_model is not None) or (_mlx_asr_model is not None),
        "model_key": _model_key if _model_key is not None else _mlx_model_key,
    }
