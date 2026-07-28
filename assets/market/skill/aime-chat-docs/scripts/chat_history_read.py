#!/usr/bin/env python3
"""Read messages of a single Aime Chat thread via the local API server.

Endpoint: POST $AIME_CHAT_API_BASE_URL/api/tools/execute-tool
Tool: build-in:ChatHistoryToolkit / ChatHistoryRead

Usage:
    python chat_history_read.py --thread-id ID [--limit N] [--since DATE] [--include-tools]

Options:
    --thread-id ID   Thread id, as returned by chat_history_list.py (required)
    --limit N        Maximum number of messages to return, most recent N (default: 80)
    --since DATE     ISO date or YYYY-MM-DD; only return messages created at or after this time
    --include-tools  Include tool-call summaries in the output
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request


def main() -> int:
    parser = argparse.ArgumentParser(description="Read messages of an Aime Chat thread.")
    parser.add_argument("--thread-id", required=True, help="thread id")
    parser.add_argument("--limit", type=int, default=80, help="maximum number of messages")
    parser.add_argument("--since", help="ISO date or YYYY-MM-DD lower bound")
    parser.add_argument("--include-tools", action="store_true", help="include tool-call summaries")
    args = parser.parse_args()

    base = os.environ.get("AIME_CHAT_API_BASE_URL")
    if not base:
        print("AIME_CHAT_API_BASE_URL is not set", file=sys.stderr)
        return 1

    tool_input = {
        "threadId": args.thread_id,
        "limit": args.limit,
        "includeTools": args.include_tools,
    }
    if args.since:
        tool_input["since"] = args.since

    payload = json.dumps(
        {
            "id": "build-in:ChatHistoryToolkit",
            "toolName": "ChatHistoryRead",
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
