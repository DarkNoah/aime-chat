#!/usr/bin/env python3
"""Manage Aime Chat's stored environment-variable secrets through the local API."""

import argparse
import json
import math
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def positive_number(value):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError("must be a finite number > 0")
    return number


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("list", "get", "create", "update", "delete"):
        command = commands.add_parser(name)
        command.add_argument("--timeout", type=positive_number, default=30)
        if name in ("get", "update", "delete"):
            command.add_argument("--id", required=True, help="Record id returned by list/create")
        if name in ("create", "update"):
            command.add_argument("--file", required=True, help="JSON object file; use - to read stdin")
        if name == "get":
            command.add_argument("--reveal", action="store_true", help="Explicitly include this secret's plaintext value")
        if name == "list":
            command.add_argument("--key", help="Filter by exact key name")
            command.add_argument("--global", dest="global_filter", choices=("true", "false"))
    return parser


def public_result(data, reveal=False):
    if isinstance(data, list):
        return [public_result(row) for row in data]
    if not isinstance(data, dict) or "id" not in data:
        raise ValueError("Unexpected secret API response")
    fields = ("id", "key", "description", "global", "hasValue", "success")
    if reveal:
        fields += ("value",)
    return {key: data[key] for key in fields if key in data}


def main(argv=None):
    args = build_parser().parse_args(argv)
    base = os.environ.get("AIME_CHAT_API_BASE_URL", "").strip()
    if not base:
        print("AIME_CHAT_API_BASE_URL is not set; enable the Aime Chat local API server first.", file=sys.stderr)
        return 1
    try:
        parsed = urllib.parse.urlsplit(base)
        if (parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.port == 0
                or parsed.username is not None or parsed.password is not None or parsed.query or parsed.fragment):
            raise ValueError()
    except ValueError:
        print("AIME_CHAT_API_BASE_URL must be HTTP(S), without credentials, query or fragment.", file=sys.stderr)
        return 1

    url = base.rstrip("/") + "/api/secrets"
    query = {}
    payload = None
    method = {"list": "GET", "get": "GET", "create": "POST", "update": "PATCH", "delete": "DELETE"}[args.command]
    if args.command in ("get", "update", "delete"):
        if not args.id.strip():
            print("A non-empty record id is required.", file=sys.stderr)
            return 1
        url += "/" + urllib.parse.quote(args.id, safe="")
    if args.command == "get" and args.reveal:
        query["reveal"] = "true"
    if args.command == "list":
        if args.key is not None:
            query["key"] = args.key
        if args.global_filter is not None:
            query["global"] = args.global_filter
    if query:
        url += "?" + urllib.parse.urlencode(query)
    if args.command in ("create", "update"):
        try:
            if args.file == "-":
                payload = json.load(sys.stdin)
            else:
                with open(args.file, encoding="utf-8") as stream:
                    payload = json.load(stream)
            if not isinstance(payload, dict) or not payload:
                raise ValueError()
        except (OSError, ValueError):
            print("Input must be a readable JSON file/stdin containing a non-empty object.", file=sys.stderr)
            return 1

    request = urllib.request.Request(
        url, data=json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None,
        method=method, headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    # Do not forward key values through shell proxies or an HTTP redirect.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(request, timeout=args.timeout) as response:
            result = json.load(response)
        if isinstance(result, dict) and result.get("success") is False:
            raise ValueError("Secret request failed")
        result = public_result(result, args.command == "get" and args.reveal)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except urllib.error.HTTPError as error:
        messages = {400: "Invalid query or secret fields (key, value, description, global).",
                    404: "Secret or API endpoint not found.", 409: "A secret with this key already exists.",
                    500: "Secret storage operation failed."}
        print("HTTP " + str(error.code) + ": " + messages.get(error.code, "Secret API request failed."), file=sys.stderr)
    except (OSError, ValueError) as error:
        # Error bodies/exception text can contain credentials; never echo them.
        print("Secret request failed (" + type(error).__name__ + ").", file=sys.stderr)
    if args.command in ("create", "update", "delete"):
        print("The write may have completed. Check list/get before retrying; no automatic retry was made.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
