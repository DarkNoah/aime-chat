#!/usr/bin/env python3
"""List available (enabled) Aime Chat tools via the local API server.

Endpoint: GET $AIME_CHAT_API_BASE_URL/api/tools/available-tools

Usage:
    python get_available_tools.py [--json]

Options:
    --json  Print the raw JSON response instead of the formatted list
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

DESC_MAX_LEN = 100


def truncate(text: str, limit: int = DESC_MAX_LEN) -> str:
    text = " ".join((text or "").split())
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "..."


def main() -> int:
    parser = argparse.ArgumentParser(description="List available Aime Chat tools.")
    parser.add_argument("--json", action="store_true", help="print raw JSON response")
    args = parser.parse_args()

    base = os.environ.get("AIME_CHAT_API_BASE_URL")
    if not base:
        print("AIME_CHAT_API_BASE_URL is not set", file=sys.stderr)
        return 1

    url = base.rstrip("/") + "/api/tools/available-tools"
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
        print("No available tools.")
        return 0

    for group, items in data.items():
        print(group.upper() + ":")
        for item in items:
            if item.get("isToolkit"):
                for t in item.get("tools") or []:
                    print(f"- [{t.get('id')}]: {truncate(t.get('description'))}")
            else:
                print(f"- [{item.get('id')}]: {truncate(item.get('description'))}")
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
