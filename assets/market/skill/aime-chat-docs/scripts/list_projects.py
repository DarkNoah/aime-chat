#!/usr/bin/env python3
"""List Aime Chat projects via the local API server.

Endpoint: GET $AIME_CHAT_API_BASE_URL/api/projects/list

Usage:
    python list_projects.py [--filter TEXT] [--page N] [--size N] [--json]

Options:
    --filter TEXT  Filter projects by title (optional)
    --page N       Zero-indexed page number (default: 0)
    --size N       Page size (default: 20)
    --json         Print the raw JSON response instead of the formatted list
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def main() -> int:
    parser = argparse.ArgumentParser(description="List Aime Chat projects.")
    parser.add_argument("--filter", help="filter projects by title")
    parser.add_argument("--page", type=int, default=0, help="zero-indexed page number")
    parser.add_argument("--size", type=int, default=20, help="page size")
    parser.add_argument("--json", action="store_true", help="print raw JSON response")
    args = parser.parse_args()

    base = os.environ.get("AIME_CHAT_API_BASE_URL")
    if not base:
        print("AIME_CHAT_API_BASE_URL is not set", file=sys.stderr)
        return 1

    query = {"page": args.page, "size": args.size}
    if args.filter:
        query["filter"] = args.filter

    url = base.rstrip("/") + "/api/projects/list?" + urllib.parse.urlencode(query)
    try:
        with urllib.request.urlopen(url) as r:
            data = json.load(r)
    except (urllib.error.URLError, ValueError) as e:
        print(f"Request failed: {e}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return 0

    items = data.get("items") or []
    if not items:
        print("No projects found.")
        return 0

    print(f"PROJECTS (total: {data.get('total')}):")
    for project in items:
        print(f" - [{project.get('id')}] {project.get('title') or ''}: {project.get('path') or ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
