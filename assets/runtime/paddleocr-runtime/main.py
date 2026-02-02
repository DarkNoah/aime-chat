#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
PPStructureV3 persistent service (stdin/stdout JSON protocol)

Request (one JSON per line):
{"id": "uuid", "method": "predict", "params": { "image_path": "/Volumes/Data/workspace/ppu-paddle-ocr-node/long.jpg",   "out_dir": "/Volumes/Data/workspace/ppu-paddle-ocr-node/output2",    "save_json": true,    "save_markdown": true,       "device": "cpu"   }}

Response (one JSON per line):
{
  "id": "...",
  "ok": true,
  "result": {
    "out_dir": "...",
    "items": [
      {
        "index": 0,
        "json_dir": "...",            // if saved
        "markdown_dir": "..."
      }
    ]
  }
}
"""

import sys
import os
import json
import time
import threading
import signal
import traceback
from pathlib import Path
from typing import Any, Dict, Optional

# ---------- Config ----------
DEFAULT_DEVICE = os.environ.get("PPSTRUCTURE_DEVICE", "cpu")  # "gpu" or "cpu"
IDLE_TIMEOUT_SEC = int(os.environ.get("PPSTRUCTURE_IDLE_TIMEOUT", "600"))  # 10 min
BASE_OUT_DIR = os.environ.get("PPSTRUCTURE_OUT_DIR", "output")
os.environ["DISABLE_MODEL_SOURCE_CHECK"] ="True"

# PaddleOCR import (heavy)
from paddleocr import PPStructureV3  # noqa: E402
from paddleocr import PaddleOCRVL
import paddle


class MlxVlmResult:
    def __init__(self, result: Any, input_path: str) -> None:
        self.result = result
        self.input_path = input_path

    def save_to_json(self, save_path: str) -> None:
        pass

    def save_to_markdown(self, save_path: str) -> None:
        out_dir = Path(save_path)
        out_dir.mkdir(parents=True, exist_ok=True)
        stem = Path(self.input_path).stem
        md_path = out_dir / f"{stem}.md"
        with md_path.open("w", encoding="utf-8") as f:
            f.write(self.result.text)


class MlxVlmPipeline:
    def __init__(
        self,
        model: Any,
        processor: Any,
        config: Any,
        prompt: str,
        # formatted_prompt: str,
        generate_fn: Any,
    ) -> None:
        self._model = model
        self._processor = processor
        self._config = config
        self._prompt = prompt
        # self._formatted_prompt = formatted_prompt
        self._generate = generate_fn

    def predict(self, input: str) -> Any:
        # img = mx.read_image(input)
        from mlx_vlm.prompt_utils import apply_chat_template
        image = [input]
        formatted_prompt = apply_chat_template(self._processor, self._config, self._prompt, num_images=len(image))
        result = self._generate(
            self._model,
            self._processor,
            formatted_prompt,
            image,
            verbose=False,
        )
        return [MlxVlmResult(result, input)]


def create_mlx_vlm_pipeline() -> Any:
    from mlx_vlm import load, generate
    from mlx_vlm.prompt_utils import apply_chat_template
    from mlx_vlm.utils import load_config

    model_path = "mlx-community/PaddleOCR-VL-1.5-bf16"
    model, processor = load(model_path)
    config = load_config(model_path)
    prompt = "OCR:" #  | Table Recognition: | Formula Recognition: | Chart Recognition:
    #formatted_prompt = apply_chat_template(processor, config, prompt)

    return MlxVlmPipeline(model, processor, config, prompt, generate)



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
        # print(idle)
        if idle > IDLE_TIMEOUT_SEC:
            # graceful exit: signal main thread to terminate
            os.kill(os.getpid(), signal.SIGTERM)

threading.Thread(target=watchdog, daemon=True).start()


# ---------- Pipeline management ----------
_pipeline = None
_pipeline_lock = threading.Lock()
_pipeline_device = None  # track what device current pipeline uses

def get_pipeline(device: str, mode: str ) -> Any:
    """
    Lazily create or recreate pipeline if device changed.
    """
    global _pipeline, _pipeline_device, _mode
    device = (device or DEFAULT_DEVICE).lower().strip()
    hasGPU = paddle.is_compiled_with_cuda()

    with _pipeline_lock:
        if _pipeline is not None and _pipeline_device == device and _mode == mode:
            return _pipeline

        # Recreate pipeline when first time or device changed
        # You can add other args here: lang="en", use_doc_orientation_classify=True, etc.

        if mode == "default" or mode == "paddleocr-vl":
            print("Using PaddleOCRVL...")
            if sys.platform == "darwin":
                # On macOS, use CPU only for now
                _pipeline = create_mlx_vlm_pipeline()
            else:
                _pipeline = PaddleOCRVL(device="gpu" if hasGPU else device)
        elif mode == "pp-structurev3":
            print("Using PPStructureV3...")
            _pipeline = PPStructureV3(device="gpu" if hasGPU else device)
        else:
            raise ValueError(f"unknown mode: {mode}")
        _mode = mode
        _pipeline_device = device
        return _pipeline


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

def _safe_mkdir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)



# ---------- Core methods ----------
def method_ping(params: Dict[str, Any]) -> Dict[str, Any]:
    return {"ts": time.time(), "device": _pipeline_device or DEFAULT_DEVICE}

def method_predict(params: Dict[str, Any]) -> Dict[str, Any]:
    image_path = params.get("image_path")
    if not image_path:
        raise ValueError("params.image_path is required")

    device = (params.get("device") or DEFAULT_DEVICE).lower().strip()
    mode = params.get("mode", "default").lower().strip()
    save_json = bool(params.get("save_json", True))
    save_markdown = bool(params.get("save_markdown", True))

    out_dir = params.get("out_dir") or BASE_OUT_DIR
    # per-request subdir to avoid overwriting
    req_dir = Path(out_dir)
    _safe_mkdir(req_dir)

    img_path = Path(image_path)
    if not img_path.exists():
        raise FileNotFoundError(f"image not found: {image_path}")

    pipeline = get_pipeline(device=device, mode=mode)

    # Run inference
    output = pipeline.predict(input=str(img_path))

    items = []
    # Each res can be printed/saved. We'll save into req_dir/res_{i}
    for i, res in enumerate(output):
        one_dir = req_dir / f"res_{i}"
        _safe_mkdir(one_dir)

        json_dir = None
        md_dir = None

        # If you still want terminal print, you can keep res.print(),
        # but in service mode it may pollute stdout, so DON'T.
        # res.print()

        if save_json:
            # paddleocr saves as directory with files; we pass path
            res.save_to_json(save_path=str(one_dir))
            json_dir = str(one_dir)

        if save_markdown:
            res.save_to_markdown(save_path=str(one_dir))
            md_dir = str(one_dir)

        items.append({
            "index": i,
            "json_dir": json_dir,
            "markdown_dir": md_dir,
        })

    return {
        "image_path": str(img_path),
        "device": device,
        "out_dir": str(req_dir),
        "count": len(items),
        "items": items,
    }


# ---------- Main loop ----------
def handle_request(req: Dict[str, Any]) -> Dict[str, Any]:
    method = req.get("method")
    params = req.get("params") or {}
    print(params)

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

    # Touch at boot
    touch()

    # Optional: prewarm pipeline on startup (load model once)
    # You can disable by setting env PPSTRUCTURE_PREWARM=0

    prewarm = os.environ.get("PPSTRUCTURE_PREWARM", "1").strip() != "0"
    if prewarm:
        try:
            get_pipeline(DEFAULT_DEVICE, "default")
        except Exception:
            # Don't crash boot; report to stderr only
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
