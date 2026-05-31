#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import json
import importlib
import shlex
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, Optional

_mlx_audio_ready = False
_modelscope_ready = False


def _uv_add(package_spec: str, *extra_args: str) -> None:
    command = " ".join(["uv", "add", shlex.quote(package_spec), *extra_args])
    code = os.system(command)
    if code != 0:
        raise RuntimeError(f"uv add failed for {package_spec}")
    importlib.invalidate_caches()


def _has_voxcpm2_support() -> bool:
    try:
        importlib.import_module("mlx_audio.tts.models.voxcpm2")
        return True
    except Exception:
        return False


def ensure_mlx_audio(require_voxcpm2: bool = False) -> None:
    global _mlx_audio_ready
    if _mlx_audio_ready and (not require_voxcpm2 or _has_voxcpm2_support()):
        return
    try:
        import mlx_audio  # noqa: F401
    except ImportError:
        print("mlx-audio is missing, trying to install it with uv add...", file=sys.stderr)
        _uv_add("mlx-audio", "--prerelease=allow")
        import mlx_audio  # noqa: F401

    if require_voxcpm2 and not _has_voxcpm2_support():
        package_spec = os.environ.get(
            "QWEN_ASR_MLX_AUDIO_VOXCPM2_PACKAGE",
            "mlx-audio",
        )
        print(
            f"mlx-audio is missing VoxCPM2 support, trying to update {package_spec}...",
            file=sys.stderr,
        )
        _uv_add(package_spec, "--prerelease=allow", "--upgrade-package", "mlx-audio")

    _mlx_audio_ready = True


def _strtobool(value: str) -> bool:
    return str(value).strip().lower() not in {"0", "false", "off", "no"}


def _is_local_model_path(model_name: str) -> bool:
    path = Path(model_name).expanduser()
    return path.exists() or model_name.startswith((".", "/", "~"))


def _has_model_files(path: Path) -> bool:
    if not path.is_dir() or not (path / "config.json").exists():
        return False
    return any(path.glob("*.safetensors")) or (path / "model.safetensors.index.json").exists()


def _hf_cache_roots() -> Iterable[Path]:
    hub_cache = os.environ.get("HUGGINGFACE_HUB_CACHE")
    if hub_cache:
        yield Path(hub_cache).expanduser()

    hf_home = os.environ.get("HF_HOME")
    if hf_home:
        yield Path(hf_home).expanduser() / "hub"

    yield Path.home() / ".cache" / "huggingface" / "hub"


def _modelscope_cache_roots() -> Iterable[Path]:
    cache_dir = _modelscope_cache_dir()
    if cache_dir:
        root = Path(cache_dir).expanduser()
        yield root
        yield root / "hub"

    yield Path.home() / ".cache" / "modelscope" / "hub"


def _resolve_hf_cached_model_path(model_name: str) -> Optional[str]:
    if "/" not in model_name:
        return None

    repo_cache_name = "models--" + model_name.replace("/", "--")
    for root in _hf_cache_roots():
        repo_dir = root / repo_cache_name
        snapshots_dir = repo_dir / "snapshots"
        if not snapshots_dir.is_dir():
            continue

        ref_path = repo_dir / "refs" / "main"
        if ref_path.exists():
            snapshot = snapshots_dir / ref_path.read_text(encoding="utf-8").strip()
            if _has_model_files(snapshot):
                return str(snapshot)

        snapshots = sorted(
            (p for p in snapshots_dir.iterdir() if _has_model_files(p)),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        if snapshots:
            return str(snapshots[0])

    return None


def _resolve_modelscope_cached_model_path(model_name: str) -> Optional[str]:
    model_id = _modelscope_model_id(model_name)
    if "/" not in model_id:
        return None

    namespace, repo = model_id.split("/", 1)
    escaped_repo = repo.replace(".", "___")
    for root in _modelscope_cache_roots():
        candidates = [
            root / "models" / namespace / repo,
            root / "models" / namespace / escaped_repo,
            root / namespace / repo,
            root / namespace / escaped_repo,
        ]
        for candidate in candidates:
            if _has_model_files(candidate):
                return str(candidate)

    return None


def resolve_cached_model_path(model_name: str) -> Optional[str]:
    model_name = str(model_name).strip()
    if _is_local_model_path(model_name):
        return str(Path(model_name).expanduser())
    return _resolve_hf_cached_model_path(model_name) or _resolve_modelscope_cached_model_path(model_name)


def _modelscope_cache_dir() -> Optional[str]:
    cache_dir = os.environ.get("QWEN_ASR_MODELSCOPE_CACHE_DIR")
    if cache_dir and cache_dir.strip():
        return cache_dir.strip()
    return None


def _modelscope_model_id(model_name: str) -> str:
    mapping_raw = os.environ.get("QWEN_ASR_MODELSCOPE_MODEL_MAP", "").strip()
    if not mapping_raw:
        return model_name

    try:
        mapping: Dict[str, str] = json.loads(mapping_raw)
    except Exception as exc:
        raise RuntimeError("QWEN_ASR_MODELSCOPE_MODEL_MAP must be valid JSON") from exc

    return mapping.get(model_name, model_name)


def _ensure_modelscope() -> None:
    global _modelscope_ready
    if _modelscope_ready:
        return
    try:
        import modelscope  # noqa: F401
    except ImportError:
        print("modelscope is missing, trying to install it with uv add...", file=sys.stderr)
        code = os.system("uv add modelscope")
        if code != 0:
            raise RuntimeError("modelscope is not installed and auto-install failed")
        import modelscope  # noqa: F401
    _modelscope_ready = True


def download_modelscope_model(model_name: str) -> str:
    _ensure_modelscope()
    from modelscope import snapshot_download  # type: ignore

    model_id = _modelscope_model_id(model_name)
    kwargs: Dict[str, Any] = {"model_id": model_id}
    cache_dir = _modelscope_cache_dir()
    if cache_dir:
        kwargs["cache_dir"] = cache_dir

    print(
        f"Hugging Face download failed, trying ModelScope model: {model_id}",
        file=sys.stderr,
    )
    return str(snapshot_download(**kwargs))


def load_mlx_model_with_modelscope_fallback(
    load_model: Callable[[str], Any],
    model_name: str,
) -> Any:
    model_name = str(model_name).strip()
    cached_model_path = resolve_cached_model_path(model_name)
    if cached_model_path:
        try:
            print(
                f"Loading cached local model: {cached_model_path}",
                file=sys.stderr,
            )
            return load_model(cached_model_path)
        except Exception as local_exc:
            raise RuntimeError(
                f"failed to load locally cached model {cached_model_path}: {local_exc}"
            ) from local_exc

    if not _strtobool(os.environ.get("QWEN_ASR_MODELSCOPE_FALLBACK", "1")):
        return load_model(model_name)

    try:
        return load_model(model_name)
    except Exception as hf_exc:
        try:
            local_model_path = download_modelscope_model(model_name)
            return load_model(local_model_path)
        except Exception as ms_exc:
            raise RuntimeError(
                "failed to load model from Hugging Face and ModelScope: "
                f"{model_name}; hf error: {hf_exc}; modelscope error: {ms_exc}"
            ) from ms_exc
