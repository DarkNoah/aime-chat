#!/usr/bin/env python3
"""Create or update an Aime Chat Agent via the local API server.

Endpoint: POST $AIME_CHAT_API_BASE_URL/api/agents/save-agent

The request body is an Agent object. Reuse an existing --id to update that
Agent; use a new --id to create one. Saved Agents are always active.

Usage:
    python save_agent.py --id my-agent --name "My Agent" \
        --description "Does things" --instructions "You are helpful." \
        --tool build-in:Bash --tool build-in:Read

Options:
    --id ID              Agent id (required; letters/digits/-/_ only, no spaces)
    --name NAME          Agent display name (required)
    --description DESC   Agent description (required)
    --instructions TEXT  Agent system instructions (required)
    --suggestion TEXT    Prompt suggestion (optional, repeatable)
    --tool ID            Tool id, e.g. build-in:Bash (optional, repeatable)
    --sub-agent ID       Sub-agent id (optional, repeatable)
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")


def main() -> int:
    parser = argparse.ArgumentParser(description="Create or update an Aime Chat Agent.")
    parser.add_argument("--id", required=True,
                        help="Agent id (letters/digits/-/_ only, no spaces)")
    parser.add_argument("--name", required=True, help="Agent display name")
    parser.add_argument("--description", required=True, help="Agent description")
    parser.add_argument("--instructions", required=True, help="Agent system instructions")
    parser.add_argument("--suggestion", action="append", default=[], metavar="TEXT",
                        help="prompt suggestion (repeatable)")
    parser.add_argument("--tool", action="append", default=[], metavar="ID",
                        help="tool id (repeatable)")
    parser.add_argument("--sub-agent", action="append", default=[], metavar="ID",
                        help="sub-agent id (repeatable)")
    args = parser.parse_args()

    if not ID_PATTERN.match(args.id):
        parser.error("--id must contain only letters, digits, '-' or '_' (no spaces)")

    base = os.environ.get("AIME_CHAT_API_BASE_URL")
    if not base:
        print("AIME_CHAT_API_BASE_URL is not set", file=sys.stderr)
        return 1

    payload = {
        "id": args.id,
        "name": args.name,
        "description": args.description,
        "instructions": args.instructions,
        "isActive": True,
    }
    if args.suggestion:
        payload["suggestions"] = args.suggestion
    if args.tool:
        payload["tools"] = args.tool
    if args.sub_agent:
        payload["subAgents"] = args.sub_agent

    url = base.rstrip("/") + "/api/agents/save-agent"
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/json"}, method="POST"
    )

    try:
        with urllib.request.urlopen(req) as r:
            text = r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        print(f"Request failed: HTTP {e.code} {e.reason}", file=sys.stderr)
        print(e.read().decode("utf-8", errors="replace"), file=sys.stderr)
        return 1
    except urllib.error.URLError as e:
        print(f"Request failed: {e}", file=sys.stderr)
        return 1

    try:
        data = json.loads(text)
    except ValueError:
        print(text)
        return 0

    print(f"Saved agent [{data.get('id')}] {data.get('name') or ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
