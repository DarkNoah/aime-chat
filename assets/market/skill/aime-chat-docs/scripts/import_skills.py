#!/usr/bin/env python3
"""Import Aime Chat skills (global or project scope) via the local API server.

Endpoint: POST $AIME_CHAT_API_BASE_URL/api/tools/import-skills

Usage:
    # Import a specific skill from a repo into the global scope
    python import_skills.py --repo-or-url https://github.com/resciencelab/opc-skills \
        --skill skills/reddit

    # Import via a direct SKILL.md URL (no --skill needed)
    python import_skills.py \
        --repo-or-url https://github.com/resciencelab/opc-skills/blob/main/skills/reddit/SKILL.md

    # Import into the current project (pass the project working directory)
    python import_skills.py --repo-or-url https://github.com/resciencelab/opc-skills \
        --skill skills/reddit --path "$PWD"

    # Import packaged skill files (<file>.skill or <file>.zip)
    python import_skills.py --file /path/to/my-skill.zip --path "$PWD"

Options:
    --repo-or-url URL  Git repo URL, skill directory URL, or SKILL.md URL
    --skill PATH       Skill folder path inside the repo (repeatable); required
                       when --repo-or-url points to a repo root
    --file PATH        Packaged skill file, .skill or .zip (repeatable)
    --path DIR         Project working directory for a project-scoped install;
                       omit for a global install
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request


def main() -> int:
    parser = argparse.ArgumentParser(description="Import Aime Chat skills.")
    parser.add_argument("--repo-or-url", help="git repo URL, skill directory URL, or SKILL.md URL")
    parser.add_argument("--skill", action="append", default=[], metavar="PATH",
                        help="skill folder path inside the repo (repeatable)")
    parser.add_argument("--file", action="append", default=[], metavar="PATH",
                        help="packaged skill file, .skill or .zip (repeatable)")
    parser.add_argument("--path", help="project working directory; omit for a global install")
    args = parser.parse_args()

    if not args.repo_or_url and not args.file:
        parser.error("provide --repo-or-url and/or --file")

    base = os.environ.get("AIME_CHAT_API_BASE_URL")
    if not base:
        print("AIME_CHAT_API_BASE_URL is not set", file=sys.stderr)
        return 1

    payload = {}
    if args.repo_or_url:
        payload["repo_or_url"] = args.repo_or_url
    if args.skill:
        payload["selectedSkills"] = args.skill
    if args.file:
        payload["files"] = args.file
    if args.path:
        payload["path"] = args.path

    url = base.rstrip("/") + "/api/tools/import-skills"
    body = json.dumps(payload).encode("utf-8")
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
