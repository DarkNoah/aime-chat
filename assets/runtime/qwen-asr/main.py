#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Qwen3-ASR persistent service (stdin/stdout JSON protocol)

Request (one JSON per line):
{"id":"uuid","method":"predict","params":{
  "audio_path":"C:/tmp/a.wav",
  "model":"Qwen/Qwen3-ASR-1.7B",
  "device":"cuda:0",
  "dtype":"bfloat16",
  "language": null,
  "return_time_stamps": false
}}

Response (one JSON per line):
{"id":"...","ok":true,"result":{"text":"...","items":[...]}}
"""

import sys
import os
import json
import time
import threading
import signal
import traceback
from pathlib import Path
from typing import Any, Dict, Optional, List

# ---------- Config ----------
DEFAULT_MODEL = os.environ.get("QWEN_ASR_MODEL", "Qwen/Qwen3-ASR-1.7B")
DEFAULT_DEVICE = os.environ.get("QWEN_ASR_DEVICE", "cpu")
DEFAULT_DTYPE = os.environ.get("QWEN_ASR_DTYPE", "float32")
DEFAULT_BACKEND = os.environ.get("QWEN_ASR_BACKEND", "transformers")
DEFAULT_MAX_BATCH = int(os.environ.get("QWEN_ASR_MAX_BATCH", "8"))
DEFAULT_MAX_NEW_TOKENS = int(os.environ.get("QWEN_ASR_MAX_NEW_TOKENS", "256"))
IDLE_TIMEOUT_SEC = int(os.environ.get("QWEN_ASR_IDLE_TIMEOUT", "120"))

import torch  # noqa: E402
from qwen_asr import Qwen3ASRModel  # noqa: E402


# ---------- Idle watchdog ----------
_last_active = time.time()
_last_active_lock = threading.Lock()


def touch() -> None:
    global _last_active
    with _last_active_lock:
        _last_active = time.time()


def watchdog() -> None:
    while True:
        time.sleep(1)
        with _last_active_lock:
            idle = time.time() - _last_active
        if idle > IDLE_TIMEOUT_SEC:
            os.kill(os.getpid(), signal.SIGTERM)


threading.Thread(target=watchdog, daemon=True).start()


# ---------- Model management ----------
_model = None
_model_lock = threading.Lock()
_model_key: Optional[str] = None


def _resolve_dtype(dtype: str) -> torch.dtype:
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


def get_model(
    model_name: str,
    backend: str,
    device: str,
    dtype: str,
    max_batch: int,
    max_new_tokens: int,
    forced_aligner: Optional[str],
    forced_aligner_kwargs: Optional[Dict[str, Any]],
    vllm_kwargs: Optional[Dict[str, Any]],
) -> Any:
    global _model, _model_key
    model_name = (model_name or DEFAULT_MODEL).strip()
    backend = (backend or DEFAULT_BACKEND).strip().lower()
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
            "forced_aligner_kwargs": forced_aligner_kwargs or {},
            "vllm_kwargs": vllm_kwargs or {},
        },
        sort_keys=True,
        ensure_ascii=False,
    )

    with _model_lock:
        if _model is not None and _model_key == key:
            return _model

        if backend == "vllm":
            init_kwargs: Dict[str, Any] = {
                "model": model_name,
                "max_inference_batch_size": max_batch,
                "max_new_tokens": max_new_tokens,
            }
            if forced_aligner:
                init_kwargs["forced_aligner"] = forced_aligner
            if forced_aligner_kwargs:
                init_kwargs["forced_aligner_kwargs"] = forced_aligner_kwargs
            if vllm_kwargs:
                init_kwargs.update(vllm_kwargs)
            _model = Qwen3ASRModel.LLM(**init_kwargs)
        else:
            init_kwargs = {
                "dtype": _resolve_dtype(dtype),
                "device_map": device,
                "max_inference_batch_size": max_batch,
                "max_new_tokens": max_new_tokens,
            }
            if forced_aligner:
                init_kwargs["forced_aligner"] = forced_aligner
            if forced_aligner_kwargs:
                init_kwargs["forced_aligner_kwargs"] = forced_aligner_kwargs
            _model = Qwen3ASRModel.from_pretrained(model_name, **init_kwargs)
        _model_key = key
        return _model


# ---------- Helpers ----------
def _json_write(obj: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _err(id_: Optional[str], err: str, tb: Optional[str] = None) -> None:
    payload = {"id": id_, "ok": False, "error": err}
    if tb:
        payload["traceback"] = tb
    _json_write(payload)


def _ok(id_: Optional[str], result: Any) -> None:
    _json_write({"id": id_, "ok": True, "result": result})


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
    if not out:
        out["text"] = str(item)
    return out


def _normalize_dtype_in_dict(kwargs: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(kwargs)
    if "dtype" in out and isinstance(out["dtype"], str):
        out["dtype"] = _resolve_dtype(out["dtype"])
    return out


# ---------- Core methods ----------
def method_ping(params: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "ts": time.time(),
        "loaded": _model is not None,
        "model_key": _model_key,
        "default_model": DEFAULT_MODEL,
        "default_device": DEFAULT_DEVICE,
        "default_dtype": DEFAULT_DTYPE,
    }


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


def method_predict(params: Dict[str, Any]) -> Dict[str, Any]:
    model_name = params.get("model") or DEFAULT_MODEL
    backend = params.get("backend") or DEFAULT_BACKEND
    device = params.get("device") or DEFAULT_DEVICE
    dtype = params.get("dtype") or DEFAULT_DTYPE
    max_batch = int(params.get("max_inference_batch_size", DEFAULT_MAX_BATCH))
    max_new_tokens = int(params.get("max_new_tokens", DEFAULT_MAX_NEW_TOKENS))
    forced_aligner = params.get("forced_aligner")
    forced_aligner_kwargs = _normalize_dtype_in_dict(
        params.get("forced_aligner_kwargs") or {}
    )
    vllm_kwargs = params.get("vllm_kwargs") or {}
    language = params.get("language")
    return_time_stamps = bool(params.get("return_time_stamps", False))
    transcribe_kwargs = params.get("transcribe_kwargs") or {}

    audio_input = _resolve_audio_input(params)
    model = get_model(
        model_name=model_name,
        backend=backend,
        device=device,
        dtype=dtype,
        max_batch=max_batch,
        max_new_tokens=max_new_tokens,
        forced_aligner=forced_aligner,
        forced_aligner_kwargs=forced_aligner_kwargs,
        vllm_kwargs=vllm_kwargs,
    )

    results = model.transcribe(
        audio=audio_input,
        language=language,
        return_time_stamps=return_time_stamps,
        **transcribe_kwargs,
    )
    if not isinstance(results, list):
        results = [results]

    items: List[Dict[str, Any]] = [_normalize_result_item(x) for x in results]
    text = "\n".join(
        [
            str(x.get("text", "")).strip()
            for x in items
            if str(x.get("text", "")).strip()
        ]
    ).strip()

    return {
        "model": model_name,
        "backend": backend,
        "device": device,
        "dtype": dtype,
        "language": language,
        "return_time_stamps": return_time_stamps,
        "count": len(items),
        "text": text,
        "items": items,
    }


# ---------- Main loop ----------
def handle_request(req: Dict[str, Any]) -> Dict[str, Any]:
    method = req.get("method")
    params = req.get("params") or {}

    if method == "ping":
        return method_ping(params)
    if method == "predict":
        return method_predict(params)

    raise ValueError(f"unknown method: {method}")


def main() -> None:
    def _handle_term(_signum: int, _frame: Any) -> None:
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, _handle_term)
    signal.signal(signal.SIGINT, _handle_term)

    touch()

    prewarm = os.environ.get("QWEN_ASR_PREWARM", "0").strip() != "0"
    if prewarm:
        try:
            get_model(
                model_name=DEFAULT_MODEL,
                device=DEFAULT_DEVICE,
                dtype=DEFAULT_DTYPE,
                max_batch=DEFAULT_MAX_BATCH,
                max_new_tokens=DEFAULT_MAX_NEW_TOKENS,
            )
        except Exception:
            traceback.print_exc(file=sys.stderr)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        touch()

        try:
            req = json.loads(line)
            req_id = req.get("id")
            result = handle_request(req)
            _ok(req_id, result)
        except Exception as e:
            req_id = None
            try:
                req_id = json.loads(line).get("id")
            except Exception:
                pass
            _err(req_id, str(e), traceback.format_exc())


if __name__ == "__main__":
    main()
