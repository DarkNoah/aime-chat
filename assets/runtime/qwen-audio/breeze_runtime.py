"""Run official Breeze inference in its own uv environment.

The official Torch 2.9.1 runtime must not replace Qwen/VoxCPM's dependencies.
Source is pinned to an upstream revision; weights use the shared model cache.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path
from typing import Any, Dict

import soundfile as sf

BREEZE_REVISION = "008f769016b0a24711becd7a4925030bc93f608c"
BREEZE_SOURCE_URL = (
    f"https://codeload.github.com/breezeblue-ai/breeze-tts/zip/{BREEZE_REVISION}"
)
BREEZE_PYPROJECT = '''[project]
name = "aime-breeze-tts-runtime"
version = "0.1.0"
requires-python = ">=3.12,<3.13"
dependencies = [
    "torch==2.9.1",
    "torchaudio==2.9.1",
    "qwen-tts==0.1.1",
    "transformers==4.57.3",
    "numpy>=2.0",
    "soundfile>=0.13",
    "modelscope",
]

[tool.uv]
environments = ["sys_platform == 'linux'", "sys_platform == 'win32'"]

[tool.uv.sources]
torch = { index = "pytorch-cu128" }
torchaudio = { index = "pytorch-cu128" }

[[tool.uv.index]]
name = "pytorch-cu128"
url = "https://download.pytorch.org/whl/cu128"
explicit = true
'''


def ensure_breeze_runtime() -> Path:
    root = Path(__file__).resolve().parent
    runtime = root / f"breeze-tts-{BREEZE_REVISION}"
    if (runtime / ".ready").is_file():
        return runtime

    print("Preparing the isolated Breeze TTS 2 runtime...", file=sys.stderr)
    with tempfile.TemporaryDirectory(prefix="breeze-install-", dir=root) as tmp:
        staging = Path(tmp)
        archive_path = staging / "source.zip"
        with urllib.request.urlopen(BREEZE_SOURCE_URL, timeout=120) as response:
            with archive_path.open("wb") as output:
                shutil.copyfileobj(response, output)
        source = staging / "source"
        source.mkdir()
        prefix = f"breeze-tts-{BREEZE_REVISION}/"
        with zipfile.ZipFile(archive_path) as archive:
            for member in archive.infolist():
                if member.is_dir() or not member.filename.startswith(prefix):
                    continue
                relative = Path(member.filename[len(prefix):])
                if relative.is_absolute() or ".." in relative.parts:
                    raise RuntimeError("Invalid path in Breeze runtime archive")
                if relative.parts[0] not in {
                    "breeze_infer", "models", "configs", "infer.py", "LICENSE"
                }:
                    continue
                destination = source / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(member) as src, destination.open("wb") as dst:
                    shutil.copyfileobj(src, dst)
        for required in ("infer.py", "breeze_infer/runtime.py", "models/breeze.py"):
            if not (source / required).is_file():
                raise RuntimeError(f"Incomplete Breeze runtime archive: {required}")
        (source / "pyproject.toml").write_text(BREEZE_PYPROJECT, encoding="utf-8")
        (source / ".ready").write_text(BREEZE_REVISION, encoding="utf-8")
        source.rename(runtime)
    return runtime


def run_breeze_tts(
    *, text: str, output_path: str, model_name: str, model_path: str, options: Dict[str, Any]
) -> Dict[str, Any]:
    if model_name.lower().startswith("mlx-community/"):
        raise ValueError("MLX Breeze models require Apple Silicon; select BreezeBlue/Breeze-TTS-2")
    uv = os.environ.get("AIME_AUDIO_UV_PATH") or shutil.which("uv")
    if not uv:
        raise RuntimeError("UV runtime is not installed")
    runtime = ensure_breeze_runtime()
    output = str(Path(output_path).resolve())
    request = {
        "text": text, "model": model_name, "model_path": model_path, "output_path": output,
        "options": options, "source": str(runtime),
    }
    env = os.environ.copy()
    # An inherited uv project override must never target the shared audio venv.
    env.pop("VIRTUAL_ENV", None)
    env["UV_PROJECT_ENVIRONMENT"] = str(runtime / ".venv")
    env["HF_HUB_OFFLINE"] = "1"
    env["TRANSFORMERS_OFFLINE"] = "1"
    result = subprocess.run(
        [uv, "run", "--project", str(runtime), "--python", "3.12",
         "python", str(Path(__file__).with_name("breeze_worker.py"))],
        input=json.dumps(request, ensure_ascii=False),
        text=True, encoding="utf-8", errors="replace", capture_output=True,
        cwd=runtime, env=env, timeout=1800,
    )
    if result.returncode:
        raise RuntimeError(f"Breeze TTS 2 inference failed: {result.stderr[-4000:]}")
    info = sf.info(output)
    if info.frames <= 0:
        raise RuntimeError("Breeze TTS 2 generation returned no audio")
    return {
        "output_path": output, "sample_rate": info.samplerate,
        "duration": info.duration, "model": model_name, "backend": "breeze",
    }
