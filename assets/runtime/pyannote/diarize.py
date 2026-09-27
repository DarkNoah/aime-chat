# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["pyannote.audio==4.0.4", "torch==2.8.0", "torchaudio==2.8.0", "torchcodec==0.7.0", "soundfile>=0.13,<0.14"]
# ///
"""Isolated pyannote worker. Only explicitly managed, complete local weights."""
import argparse
import json
import os
from pathlib import Path

REQUIRED_FILES = (
    "config.yaml", "segmentation/pytorch_model.bin", "embedding/pytorch_model.bin",
    "plda/plda.npz", "plda/xvec_transform.npz",
)
DOWNLOAD_HINT = (
    'Read skill:local:aime-chat-docs (references/local-models.md) and run: '
    'python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/local_models.py" download '
    '--type diarization --model-id pyannote/speaker-diarization-community-1\n'
    'Then use list --type diarization and wait for isDownloaded=true before retrying. '
    'Default source is ModelScope; omit --timeout. '
    'Alternatively use Settings > Local Models > Speaker diarization.'
)


def validate_model(model_path):
    root = Path(model_path)
    if not root.is_absolute() or not root.is_dir():
        raise RuntimeError(f"Download Pyannote Community-1 first. {DOWNLOAD_HINT}")
    for name in REQUIRED_FILES:
        file = root / name
        if not file.is_file() or file.stat().st_size == 0:
            raise RuntimeError(f"Pyannote model is incomplete ({name}). {DOWNLOAD_HINT}")
        if file.suffix in {".bin", ".npz"}:
            with file.open("rb") as stream:
                if stream.read(128).startswith(b"version https://git-lfs.github.com/spec/"):
                    raise RuntimeError(f"Pyannote weights are Git LFS pointers. {DOWNLOAD_HINT}")
    if any(file.name.endswith((".incomplete", ".tmp")) for file in root.rglob("*")):
        raise RuntimeError(f"Pyannote download is incomplete. {DOWNLOAD_HINT}")
    return root


def diarize(model_path, audio_path):
    root = validate_model(model_path)
    # Set before importing Hub/pyannote; no implicit model fetch or telemetry.
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["PYANNOTE_METRICS_ENABLED"] = "0"
    import soundfile as sf
    import torch
    from pyannote.audio import Pipeline

    pipeline = Pipeline.from_pretrained(root)
    if pipeline is None:
        raise RuntimeError(f"Unable to load local Pyannote pipeline. {DOWNLOAD_HINT}")
    if torch.cuda.is_available():
        pipeline.to(torch.device("cuda"))
    # Decode with libsndfile: no external TorchCodec/FFmpeg decoder required.
    samples, sample_rate = sf.read(audio_path, dtype="float32", always_2d=True)
    waveform = torch.from_numpy(samples.T.copy())
    output = pipeline({"waveform": waveform, "sample_rate": sample_rate})
    return [
        {"start": float(turn.start), "end": float(turn.end), "speaker": str(speaker)}
        for turn, _, speaker in output.exclusive_speaker_diarization.itertracks(yield_label=True)
    ]


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--audio", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    Path(args.output).write_text(json.dumps(diarize(args.model, args.audio)), encoding="utf-8")
