"""Resolve only models explicitly downloaded through Aime's local model manager."""

from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path

_model_paths = ContextVar("audio_model_paths", default={})


@contextmanager
def managed_model_paths(paths):
    token = _model_paths.set(paths or {})
    try:
        yield
    finally:
        _model_paths.reset(token)


def resolve_model_path(model_id):
    value = _model_paths.get().get(model_id)
    if value is None and model_id and Path(model_id).is_absolute():
        value = model_id
    if value:
        path = Path(value)
        if path.is_absolute() and path.is_dir() and (path / "config.json").is_file():
            return str(path)
    raise RuntimeError(
        f"Audio model {model_id} is not downloaded or unavailable. "
        "Download it in Settings > Local Models first."
    )


def load_local_model(loader, model_id):
    return loader(resolve_model_path(model_id))
