#!/usr/bin/env python3
"""Keyword search across recent Aime Chat threads via the local API server.

Endpoint: POST $AIME_CHAT_API_BASE_URL/api/tools/execute-tool
Tool: build-in:ChatHistoryToolkit / ChatHistorySearch

Matching excerpts are grouped per thread, each block starting with the
project info (if any), thread id and thread title.

Usage:
    python chat_history_search.py --query TEXT [--since DATE] [--limit N] [--thread-limit N]

Options:
    --query TEXT      Case-insensitive keywords (required); space-separated keywords
                      are fuzzy-matched (all must appear, in any order)
    --since DATE      ISO date or YYYY-MM-DD; only search threads updated at or after this time
    --limit N         Maximum number of matching excerpts to return (default: 20)
    --thread-limit N  Maximum number of threads to scan (default: 50)
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request


def main() -> int:
    parser = argparse.ArgumentParser(description="Keyword search across Aime Chat threads.")
    parser.add_argument(
        "--query",
        required=True,
        help="case-insensitive keywords; space-separated keywords are fuzzy-matched (all must appear)",
    )
    parser.add_argument("--since", help="ISO date or YYYY-MM-DD lower bound")
    parser.add_argument("--limit", type=int, default=20, help="maximum number of excerpts")
    parser.add_argument("--thread-limit", type=int, default=50, help="maximum number of threads to scan")
    args = parser.parse_args()

    base = os.environ.get("AIME_CHAT_API_BASE_URL")
    if not base:
        print("AIME_CHAT_API_BASE_URL is not set", file=sys.stderr)
        return 1

    tool_input = {
        "query": args.query,
        "limit": args.limit,
        "threadLimit": args.thread_limit,
    }
    if args.since:
        tool_input["since"] = args.since

    payload = json.dumps(
        {
            "id": "build-in:ChatHistoryToolkit",
            "toolName": "ChatHistorySearch",
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
