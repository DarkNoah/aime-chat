#!/usr/bin/env python3
"""List, install, reinstall or uninstall Aime Chat runtimes via the local API."""

import argparse
import json
import math
import os
import sys
import urllib.error
import urllib.request


RUNTIMES = ("uv", "bun", "node", "paddleOcr", "qwenAudio", "agentBrowser")


def positive_number(value):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError("must be a finite number > 0")
    return number


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    listing = commands.add_parser("list", help="List environments and supported actions")
    listing.add_argument("--cached", action="store_true", help="Read cached status without probing runtimes")
    listing.add_argument("--timeout", type=positive_number, default=120, help="HTTP timeout in seconds (default: 120)")
    for action in ("install", "reinstall", "uninstall"):
        command = commands.add_parser(action)
        command.add_argument("pkg", choices=RUNTIMES)
        command.add_argument("--timeout", type=positive_number, default=1800, help="HTTP timeout in seconds (default: 1800)")
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    base = os.environ.get("AIME_CHAT_API_BASE_URL", "").strip()
    if not base:
        print("AIME_CHAT_API_BASE_URL is not set; enable the Aime Chat local API server first.", file=sys.stderr)
        return 1

    url = base.rstrip("/") + "/api/runtime/" + args.command
    payload = None
    if args.command == "list":
        url += "?refresh=" + ("false" if args.cached else "true")
    else:
        payload = json.dumps({"pkg": args.pkg}).encode("utf-8")
    request = urllib.request.Request(
        url, data=payload, method="GET" if payload is None else "POST",
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=args.timeout) as response:
            result = json.load(response)
        if isinstance(result, dict) and result.get("success") is False:
            raise ValueError(result.get("message") or "Runtime operation failed")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        print(f"HTTP {error.code}: {detail}", file=sys.stderr)
    except (OSError, ValueError) as error:
        print(f"Runtime request failed: {error}", file=sys.stderr)
        if args.command != "list":
            print("The operation may still be running. Query 'list --cached' before retrying; a timeout does not cancel it.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
