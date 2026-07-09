#!/usr/bin/env python3
"""Get details of a single Aime Chat tool via the local API server.

Endpoint: GET $AIME_CHAT_API_BASE_URL/api/tools/get-tool?id=<tool-id>

Usage:
    python get_tool.py --id <tool-id> [--json]

Options:
    --id ID  Full tool id, e.g. skill:local:xlsx, mcp:filesystem,
             build-in:Bash (required)
    --json   Print the raw JSON response instead of the formatted detail
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def main() -> int:
    parser = argparse.ArgumentParser(description="Get one Aime Chat tool detail.")
    parser.add_argument("--id", required=True, help="full tool id")
    parser.add_argument("--json", action="store_true", help="print raw JSON response")
    args = parser.parse_args()

    base = os.environ.get("AIME_CHAT_API_BASE_URL")
    if not base:
        print("AIME_CHAT_API_BASE_URL is not set", file=sys.stderr)
        return 1

    url = (
        base.rstrip("/")
        + "/api/tools/get-tool?"
        + urllib.parse.urlencode({"id": args.id})
    )
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
        print("Tool not found.")
        return 0

    print(f"[{data.get('id')}] {data.get('name') or ''}")
    if data.get("type"):
        print(f"type: {data.get('type')}")
    if "isActive" in data:
        print(f"isActive: {data.get('isActive')}")
    if data.get("status"):
        print(f"status: {data.get('status')}")
    if data.get("version"):
        print(f"version: {data.get('version')}")
    if data.get("description"):
        print(f"description: {data.get('description')}")

    tools = data.get("tools") or []
    if tools:
        print()
        print("tools:")
        for t in tools:
            print(f"- [{t.get('id')}]: {t.get('description') or ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
