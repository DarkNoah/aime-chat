#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Qwen audio persistent service (stdin/stdout JSON protocol).

The JSON protocol remains compatible with the original single-file runtime:
- method="predict" performs STT/ASR
- method="tts" performs TTS with Qwen/MLX or Voxtral backends
"""

import json
import os
import signal
import sys
import threading
import time
import traceback
from typing import Any, Dict, Optional

from config import (
    DEFAULT_BACKEND,
    DEFAULT_DEVICE,
    DEFAULT_DTYPE,
    DEFAULT_MAX_BATCH,
    DEFAULT_MAX_NEW_TOKENS,
    DEFAULT_MLX_ALIGNER_MODEL,
    DEFAULT_MODEL,
    DEFAULT_QWEN_ALIGNER_MODEL,
    IDLE_TIMEOUT_SEC,
)
from stt import get_qwen_model, get_mlx_models, get_stt_status, method_predict, set_touch_callback
from tts import get_tts_status, method_tts


if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


_last_active = time.time()
_last_active_lock = threading.Lock()
_busy_count = 0
_busy_lock = threading.Lock()


def touch() -> None:
    global _last_active
    with _last_active_lock:
        _last_active = time.time()


def begin_busy() -> None:
    global _busy_count
    with _busy_lock:
        _busy_count += 1


def end_busy() -> None:
    global _busy_count
    with _busy_lock:
        if _busy_count > 0:
            _busy_count -= 1
    touch()


def _is_busy() -> bool:
    with _busy_lock:
        return _busy_count > 0


def watchdog() -> None:
    while True:
        time.sleep(1)
        if _is_busy():
            continue
        with _last_active_lock:
            idle = time.time() - _last_active
        if idle > IDLE_TIMEOUT_SEC:
            os.kill(os.getpid(), signal.SIGTERM)


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


def method_ping(_params: Dict[str, Any]) -> Dict[str, Any]:
    stt_status = get_stt_status()
    tts_status = get_tts_status()
    return {
        "ts": time.time(),
        "platform": sys.platform,
        "default_model": DEFAULT_MODEL,
        "default_backend": DEFAULT_BACKEND,
        "default_device": DEFAULT_DEVICE,
        "default_dtype": DEFAULT_DTYPE,
        "default_qwen_aligner_model": DEFAULT_QWEN_ALIGNER_MODEL,
        "default_mlx_aligner_model": DEFAULT_MLX_ALIGNER_MODEL,
        **stt_status,
        **tts_status,
    }


def handle_request(req: Dict[str, Any]) -> Dict[str, Any]:
    method = req.get("method")
    params = req.get("params") or {}

    if method == "ping":
        return method_ping(params)
    if method == "predict":
        return method_predict(params)
    if method == "tts":
        return method_tts(params)

    raise ValueError(f"unknown method: {method}")


def main() -> None:
    def _handle_term(_signum: int, _frame: Any) -> None:
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, _handle_term)
    signal.signal(signal.SIGINT, _handle_term)
    set_touch_callback(touch)
    threading.Thread(target=watchdog, daemon=True).start()

    touch()
    prewarm = os.environ.get("QWEN_ASR_PREWARM", "0").strip() != "0"

    if prewarm:
        try:
            if DEFAULT_BACKEND in {"mlx", "mlx_audio", "mlx-audio"}:
                get_mlx_models(DEFAULT_MODEL, DEFAULT_MLX_ALIGNER_MODEL)
            else:
                get_qwen_model(
                    model_name=DEFAULT_MODEL,
                    backend=DEFAULT_BACKEND,
                    device=DEFAULT_DEVICE,
                    dtype=DEFAULT_DTYPE,
                    max_batch=DEFAULT_MAX_BATCH,
                    max_new_tokens=DEFAULT_MAX_NEW_TOKENS,
                    forced_aligner=DEFAULT_QWEN_ALIGNER_MODEL,
                    forced_aligner_kwargs=None,
                )
        except Exception:
            traceback.print_exc(file=sys.stderr)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        touch()
        begin_busy()
        try:
            req = json.loads(line)
            req_id = req.get("id")
            result = handle_request(req)
            _ok(req_id, result)
        except Exception as exc:
            req_id = None
            try:
                req_id = json.loads(line).get("id")
            except Exception:
                pass
            _err(req_id, str(exc), traceback.format_exc())
        finally:
            end_busy()


if __name__ == "__main__":
    main()
