#!/usr/bin/env python3
"""List recent Aime Chat threads (real user conversations) via the local API server.

Endpoint: POST $AIME_CHAT_API_BASE_URL/api/tools/execute-tool
Tool: build-in:ChatHistoryToolkit / ChatHistoryList

Usage:
    python chat_history_list.py [--since DATE] [--until DATE] [--limit N] [--include-cron]

Options:
    --since DATE    ISO date or YYYY-MM-DD; only include threads updated at or after this time
    --until DATE    ISO date or YYYY-MM-DD; only include threads updated at or before this time
    --limit N       Maximum number of threads to return (default: 20)
    --include-cron  Include threads created by cron jobs (excluded by default)
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request


def main() -> int:
    parser = argparse.ArgumentParser(description="List recent Aime Chat threads.")
    parser.add_argument("--since", help="ISO date or YYYY-MM-DD lower bound")
    parser.add_argument("--until", help="ISO date or YYYY-MM-DD upper bound")
    parser.add_argument("--limit", type=int, default=20, help="maximum number of threads")
    parser.add_argument("--include-cron", action="store_true", help="include cron-created threads")
    args = parser.parse_args()

    base = os.environ.get("AIME_CHAT_API_BASE_URL")
    if not base:
        print("AIME_CHAT_API_BASE_URL is not set", file=sys.stderr)
        return 1

    tool_input = {"limit": args.limit, "includeCron": args.include_cron}
    if args.since:
        tool_input["since"] = args.since
    if args.until:
        tool_input["until"] = args.until

    payload = json.dumps(
        {
            "id": "build-in:ChatHistoryToolkit",
            "toolName": "ChatHistoryList",
            "input": tool_input,
        }
    ).encode("utf-8")

    url = base.rstrip("/") + "/api/tools/execute-tool"
    req = urllib.request.Request(
        url, data=payload, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req) as r:
            data = json.load(r)
    except (urllib.error.URLError, ValueError) as e:
        print(f"Request failed: {e}", file=sys.stderr)
        return 1

    if isinstance(data, str):
        print(data)
    else:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
