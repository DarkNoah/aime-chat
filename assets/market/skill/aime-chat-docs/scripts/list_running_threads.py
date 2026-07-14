#!/usr/bin/env python3
"""List currently running (streaming) Aime Chat threads via the local API server.

Endpoint: GET $AIME_CHAT_API_BASE_URL/api/threads/running-threads

Usage:
    python list_running_threads.py [--json]

Options:
    --json  Print the raw JSON response instead of the formatted list
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request


def main() -> int:
    parser = argparse.ArgumentParser(description="List running Aime Chat threads.")
    parser.add_argument("--json", action="store_true", help="print raw JSON response")
    args = parser.parse_args()

    base = os.environ.get("AIME_CHAT_API_BASE_URL")
    if not base:
        print("AIME_CHAT_API_BASE_URL is not set", file=sys.stderr)
        return 1

    url = base.rstrip("/") + "/api/threads/running-threads"
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
        print("No running threads.")
        return 0

    print("RUNNING THREADS:")
    for thread in data:
        extras = []
        if thread.get("agentId"):
            extras.append(f"agent: {thread.get('agentId')}")
        if thread.get("model"):
            extras.append(f"model: {thread.get('model')}")
        suffix = f" ({', '.join(extras)})" if extras else ""
        print(f" - [{thread.get('id')}] {thread.get('title') or ''}{suffix}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
