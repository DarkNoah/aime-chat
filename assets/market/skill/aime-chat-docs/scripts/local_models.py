#!/usr/bin/env python3
"""List, download or delete Aime Chat's catalogued local models."""

import argparse
import json
import math
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


MODEL_TYPES = ("embedding", "reranker", "clip", "ocr", "other", "tts", "stt")


def positive_number(value):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError("must be a finite number > 0")
    return number


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    listing = commands.add_parser("list", help="List the catalog and download status")
    listing.add_argument("--type", choices=MODEL_TYPES)
    listing.add_argument("--timeout", type=positive_number, default=None,
                         help="Request timeout in seconds (default: no timeout)")
    for action in ("download", "delete"):
        command = commands.add_parser(action)
        command.add_argument("--type", required=True, choices=MODEL_TYPES)
        command.add_argument("--model-id", required=True, help="Catalog id, without the local/ provider prefix")
        command.add_argument("--timeout", type=positive_number, default=None,
                             help="Request timeout in seconds (default: no timeout)")
        if action == "download":
            command.add_argument("--source", default="modelscope", choices=("modelscope", "huggingface"),
                                 help="Download source (default: modelscope)")
            command.add_argument("--set-as-default", action="store_true",
                                 help="Set the matching model default after a successful download")
    args = parser.parse_args(argv)
    base = os.environ.get("AIME_CHAT_API_BASE_URL", "").strip()
    if not base:
        print("AIME_CHAT_API_BASE_URL is not set; enable the Aime Chat local API server first.", file=sys.stderr)
        return 1
    url = base.rstrip("/") + "/api/local-models/" + args.command
    payload = None
    if args.command == "list":
        if args.type:
            url += "?" + urllib.parse.urlencode({"type": args.type})
    else:
        payload = {"type": args.type, "modelId": args.model_id}
        if args.command == "download":
            payload["source"] = args.source
            if args.set_as_default:
                payload["setAsDefault"] = True
    request = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8") if payload is not None else None,
        method="POST" if payload is not None else "GET",
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=args.timeout) as response:
            result = json.load(response)
        if isinstance(result, dict) and result.get("success") is False:
            raise ValueError(result.get("message") or "Local model operation failed")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except urllib.error.HTTPError as error:
        print(f"HTTP {error.code}: {error.read().decode('utf-8', errors='replace')}", file=sys.stderr)
    except (OSError, ValueError) as error:
        print(f"Local model request failed: {error}", file=sys.stderr)
        if args.command != "list":
            print("The operation may still be running. Query 'list --type " + args.type + "' before retrying; a timeout does not cancel it.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
