#!/usr/bin/env python3
"""Get details of a single Aime Chat Agent via the local API server.

Endpoint: GET $AIME_CHAT_API_BASE_URL/api/agents/get-agent?id=<agent-id>

Usage:
    python get_agent.py --id <agent-id> [--json]

Options:
    --id ID  Agent id, e.g. CodeAgent (required)
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
    parser = argparse.ArgumentParser(description="Get one Aime Chat Agent detail.")
    parser.add_argument("--id", required=True, help="Agent id")
    parser.add_argument("--json", action="store_true", help="print raw JSON response")
    args = parser.parse_args()

    base = os.environ.get("AIME_CHAT_API_BASE_URL")
    if not base:
        print("AIME_CHAT_API_BASE_URL is not set", file=sys.stderr)
        return 1

    url = (
        base.rstrip("/")
        + "/api/agents/get-agent?"
        + urllib.parse.urlencode({"id": args.id})
    )
    try:
        with urllib.request.urlopen(url) as r:
            data = json.load(r)
    except (urllib.error.URLError, ValueError) as e:
        print(f"Request failed: {e}", file=sys.stderr)
        return 1

    if not data:
        print("Agent not found.")
        return 0

    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return 0

    print(f"[{data.get('id')}] {data.get('name') or ''}")
    if data.get("type"):
        print(f"type: {data.get('type')}")
    if "isActive" in data:
        print(f"isActive: {data.get('isActive')}")
    if data.get("description"):
        print(f"description: {data.get('description')}")
    if data.get("defaultModelId"):
        print(f"defaultModelId: {data.get('defaultModelId')}")
    if data.get("tags"):
        print(f"tags: {', '.join(data.get('tags'))}")

    tools = data.get("tools") or []
    if tools:
        print()
        print("tools:")
        for t in tools:
            print(f"- {t}")

    sub_agents = data.get("subAgents") or []
    if sub_agents:
        print()
        print("subAgents:")
        for s in sub_agents:
            print(f"- {s}")

    suggestions = data.get("suggestions") or []
    if suggestions:
        print()
        print("suggestions:")
        for s in suggestions:
            print(f"- {s}")

    if data.get("instructions"):
        print()
        print("instructions:")
        print(data.get("instructions"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
