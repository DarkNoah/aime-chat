#!/usr/bin/env python3
"""Send text and local images through the Aime Chat chat endpoint.

Endpoint: POST $AIME_CHAT_API_BASE_URL/api/threads/chat

The request waits for chat() and prints text from its last returned message.
"""

import argparse
import json
import mimetypes
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request
import uuid


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Send text and images to an idle Aime Chat thread."
    )
    parser.add_argument("--thread-id", required=True, help="target thread id")
    parser.add_argument("--text", default="", help="text message (optional with --image)")
    parser.add_argument(
        "--image",
        action="append",
        default=[],
        help="local image path; repeat to send multiple images",
    )
    parser.add_argument("--json", action="store_true", help="print raw JSON response")
    args = parser.parse_args()

    base = os.environ.get("AIME_CHAT_API_BASE_URL")
    if not base:
        print("AIME_CHAT_API_BASE_URL is not set", file=sys.stderr)
        return 1
    if not args.text.strip() and not args.image:
        print("At least one of --text or --image is required", file=sys.stderr)
        return 1

    parts = []
    if args.text.strip():
        parts.append({"type": "text", "text": args.text})
    for value in args.image:
        image = Path(value).expanduser().resolve()
        media_type = mimetypes.guess_type(image.name)[0]
        if not image.is_file() or not media_type or not media_type.startswith("image/"):
            print(f"Invalid image file: {value}", file=sys.stderr)
            return 1
        parts.append(
            {
                "type": "file",
                "url": image.as_uri(),
                "path": str(image),
                "filename": image.name,
                "mediaType": media_type,
            }
        )

    payload = {
        "chatId": args.thread_id,
        "messages": [
            {
                "id": str(uuid.uuid4()),
                "role": "user",
                "parts": parts,
            }
        ],
        "requireToolApproval": False,
    }
    url = base.rstrip("/") + "/api/threads/chat"
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request) as response:
            data = json.load(response)
    except urllib.error.HTTPError as error:
        raw_body = error.read().decode("utf-8", errors="replace")
        try:
            body = json.loads(raw_body)
            detail = body.get("error") or body.get("message") or raw_body
        except ValueError:
            detail = raw_body
        print(f"Request failed: HTTP {error.code}: {detail}", file=sys.stderr)
        return 1
    except (urllib.error.URLError, ValueError) as error:
        print(f"Request failed: {error}", file=sys.stderr)
        return 1

    if not data.get("success"):
        print(f"Request failed: {data.get('error') or 'Unknown error'}", file=sys.stderr)
        return 1

    messages = data.get("messages") or []
    if not messages:
        print("Request failed: chat returned no messages", file=sys.stderr)
        return 1
    content = messages[-1].get("content")
    if isinstance(content, str):
        final_text = content
    else:
        content_parts = content if isinstance(content, list) else (content or {}).get("parts", [])
        final_text = "".join(
            part.get("text", "")
            for part in content_parts
            if part.get("type") == "text"
        )
    if not final_text:
        print("Request failed: last chat message has no text", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        print(final_text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
