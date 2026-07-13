#!/usr/bin/env python3
"""Create a new Aime Chat thread via the local API server.

Endpoint: POST $AIME_CHAT_API_BASE_URL/api/threads/create-thread

Usage:
    python create_thread.py [--project-id ID] [--agent-id ID] [--model ID] [--json]

Options:
    --project-id ID  Create the thread inside this project (optional)
    --agent-id ID    Agent id for the thread, e.g. code-agent (optional)
    --model ID       Model id, e.g. openai/gpt-4.1 (optional)
    --json           Print the raw JSON response instead of the formatted result
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a new Aime Chat thread.")
    parser.add_argument("--project-id", help="project id (optional)")
    parser.add_argument("--agent-id", help="agent id (optional)")
    parser.add_argument("--model", help="model id (optional)")
    parser.add_argument("--json", action="store_true", help="print raw JSON response")
    args = parser.parse_args()

    base = os.environ.get("AIME_CHAT_API_BASE_URL")
    if not base:
        print("AIME_CHAT_API_BASE_URL is not set", file=sys.stderr)
        return 1

    payload = {}
    if args.project_id:
        payload["resourceId"] = f"project:{args.project_id}"
    if args.agent_id:
        payload["agentId"] = args.agent_id
    if args.model:
        payload["model"] = args.model

    url = base.rstrip("/") + "/api/threads/create-thread"
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/json"}, method="POST"
    )

    try:
        with urllib.request.urlopen(req) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        print(f"Request failed: HTTP {e.code} {e.reason}", file=sys.stderr)
        print(e.read().decode("utf-8", errors="replace"), file=sys.stderr)
        return 1
    except (urllib.error.URLError, ValueError) as e:
        print(f"Request failed: {e}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return 0

    print(f"Created thread [{data.get('id')}] {data.get('title') or ''}")
    if data.get("resourceId"):
        print(f"resourceId: {data.get('resourceId')}")
    metadata = data.get("metadata") or {}
    if metadata.get("agentId"):
        print(f"agentId: {metadata.get('agentId')}")
    if metadata.get("model"):
        print(f"model: {metadata.get('model')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
