#!/usr/bin/env python3
"""List available (enabled) Aime Chat Agents via the local API server.

Endpoint: GET $AIME_CHAT_API_BASE_URL/api/agents/available-agents

Usage:
    python get_available_agents.py [--json] [--visible-only]

Options:
    --json          Print the raw JSON response instead of the formatted list
    --visible-only  Exclude Agents whose isHidden is true
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request


def main() -> int:
    parser = argparse.ArgumentParser(description="List available Aime Chat Agents.")
    parser.add_argument("--json", action="store_true", help="print raw JSON response")
    parser.add_argument("--visible-only", action="store_true", help="exclude hidden Agents")
    args = parser.parse_args()

    base = os.environ.get("AIME_CHAT_API_BASE_URL")
    if not base:
        print("AIME_CHAT_API_BASE_URL is not set", file=sys.stderr)
        return 1

    url = base.rstrip("/") + "/api/agents/available-agents"
    try:
        with urllib.request.urlopen(url) as r:
            data = json.load(r)
    except (urllib.error.URLError, ValueError) as e:
        print(f"Request failed: {e}", file=sys.stderr)
        return 1

    if args.visible_only:
        data = [agent for agent in data if not agent.get("isHidden")]

    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return 0

    if not data:
        print("No available agents.")
        return 0

    print("AVAILABLE AGENTS:")
    for agent in data:
        print(f" - [{agent.get('id')}]: {agent.get('description') or ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
