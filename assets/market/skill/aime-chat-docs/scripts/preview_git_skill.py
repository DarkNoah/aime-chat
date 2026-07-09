#!/usr/bin/env python3
"""Preview the skills available in a git repository via the local API server.

Endpoint: POST $AIME_CHAT_API_BASE_URL/api/tools/preview-git-skill

Usage:
    python preview_git_skill.py <git-url>

Example:
    python preview_git_skill.py https://github.com/resciencelab/opc-skills
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request


def main() -> int:
    parser = argparse.ArgumentParser(description="Preview skills in a git repository.")
    parser.add_argument("git_url", help="git repository URL, e.g. https://github.com/<owner>/<repo>")
    args = parser.parse_args()

    base = os.environ.get("AIME_CHAT_API_BASE_URL")
    if not base:
        print("AIME_CHAT_API_BASE_URL is not set", file=sys.stderr)
        return 1

    url = base.rstrip("/") + "/api/tools/preview-git-skill"
    body = json.dumps({"gitUrl": args.git_url}).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")

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
        print(json.dumps(json.loads(text), ensure_ascii=False, indent=2))
    except ValueError:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
