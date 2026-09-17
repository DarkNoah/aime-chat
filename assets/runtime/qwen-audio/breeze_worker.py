"""Entry point executed by the isolated Breeze uv environment."""

import json
import runpy
import sys
from pathlib import Path


def main():
    request = json.load(sys.stdin)
    import torch
    from model_store import resolve_model_path

    if not torch.cuda.is_available():
        raise RuntimeError(
            "Breeze TTS 2 PyTorch inference requires an NVIDIA CUDA GPU. "
            "Check the NVIDIA driver; Apple Silicon should use an MLX model."
        )

    checkpoint = resolve_model_path(request["model_path"])
    options = request["options"]
    source = Path(request["source"])
    argv = [
        str(source / "infer.py"), checkpoint,
        "--text", request["text"], "--output", request["output_path"],
    ]
    if options.get("instruct"):
        argv.extend(["--instruction", options["instruct"], "--cfg-scale", "4"])
    if options.get("ref_audio"):
        argv.extend([
            "--ref-audio", options["ref_audio"], "--ref-text", options["ref_text"]
        ])
    sys.path.insert(0, str(source))
    sys.argv = argv
    runpy.run_path(str(source / "infer.py"), run_name="__main__")


if __name__ == "__main__":
    main()
