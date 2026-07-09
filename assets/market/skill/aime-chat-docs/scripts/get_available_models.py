#!/usr/bin/env python3
"""List available Aime Chat models via the local API server.

Endpoint: GET $AIME_CHAT_API_BASE_URL/api/providers/available-models[?type=<type>]

Usage:
    python get_available_models.py [--type TYPE] [--json]

Options:
    --type TYPE  Model type: llm (default), embedding, reranker,
                 image_generation, transcription, speech, ocr, music
    --json       Print the raw JSON response instead of the formatted list
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

MODEL_TYPES = [
    "llm",
    "embedding",
    "reranker",
    "image_generation",
    "transcription",
    "speech",
    "ocr",
    "music",
]


def main() -> int:
    parser = argparse.ArgumentParser(description="List available Aime Chat models.")
    parser.add_argument("--type", choices=MODEL_TYPES, default=None, help="model type (default: llm)")
    parser.add_argument("--json", action="store_true", help="print raw JSON response")
    args = parser.parse_args()

    base = os.environ.get("AIME_CHAT_API_BASE_URL")
    if not base:
        print("AIME_CHAT_API_BASE_URL is not set", file=sys.stderr)
        return 1

    url = base.rstrip("/") + "/api/providers/available-models"
    if args.type:
        url += "?" + urllib.parse.urlencode({"type": args.type})

    try:
        with urllib.request.urlopen(url) as r:
            data = json.load(r)
    except (urllib.error.URLError, ValueError) as e:
        print(f"Request failed: {e}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return 0

    if not data:
        print("No available models.")
        return 0

    for provider in data:
        print(provider.get("name") or provider.get("id") or "")
        for model in provider.get("models") or []:
            print(f"- [{model.get('id')}]: {model.get('name') or ''}")
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
