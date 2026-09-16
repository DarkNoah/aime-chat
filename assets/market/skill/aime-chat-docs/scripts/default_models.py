#!/usr/bin/env python3
"""List or update Aime Chat's global default models through the local API."""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request


FIELDS = {
    "model": "model",
    "fastModel": "fast-model",
    "visionModel": "vision-model",
    "embeddingModel": "embedding-model",
    "rerankerModel": "reranker-model",
    "ocrModel": "ocr-model",
    "transcriptionModel": "transcription-model",
    "speechModel": "speech-model",
    "generateImageModel": "generate-image-model",
    "generateVideoModel": "generate-video-model",
}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("list", help="List effective default model settings")
    setting = commands.add_parser("set", help="Update only the specified defaults")
    for field, flag in FIELDS.items():
        setting.add_argument("--" + flag, dest=field, metavar="MODEL_ID", help='Full model ID; "" clears this default')
    args = parser.parse_args(argv)
    patch = {key: getattr(args, key) for key in FIELDS if getattr(args, key, None) is not None}
    if args.command == "set" and not patch:
        parser.error("set requires at least one model option")

    base = os.environ.get("AIME_CHAT_API_BASE_URL", "").strip()
    if not base:
        print("AIME_CHAT_API_BASE_URL is not set; enable the Aime Chat local API server first.", file=sys.stderr)
        return 1
    request = urllib.request.Request(
        base.rstrip("/") + "/api/app/default-models",
        data=json.dumps(patch, ensure_ascii=False).encode("utf-8") if args.command == "set" else None,
        method="POST" if args.command == "set" else "GET",
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.load(response)
        if isinstance(result, dict) and result.get("success") is False:
            raise ValueError(result.get("message") or "Default model request failed")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except urllib.error.HTTPError as error:
        print(f"HTTP {error.code}: {error.read().decode('utf-8', errors='replace')}", file=sys.stderr)
    except (OSError, ValueError) as error:
        print(f"Default model request failed: {error}", file=sys.stderr)
        if args.command == "set":
            print("The save may have completed; run 'list' to check before retrying.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
