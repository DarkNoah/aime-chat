#!/usr/bin/env python3
"""Manage Aime Chat evaluation datasets, scorers and experiments (stdlib only)."""

import argparse
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


GET_COMMANDS = {
    "list-datasets": ("page", "perPage", "name"),
    "get-dataset": ("id",),
    "list-dataset-items": ("datasetId", "page", "perPage", "search"),
    "export-dataset": ("datasetId", "format"),
    "list-experiments": ("datasetId", "page", "perPage"),
    "get-experiment": ("datasetId", "experimentId"),
    "list-scorers": (),
    "list-thread-scores": ("threadId", "page", "perPage"),
}
BODY_COMMANDS = (
    "create-dataset", "update-dataset", "add-dataset-items",
    "update-dataset-item", "delete-dataset-item", "start-experiment",
    "compare-experiments", "save-scorer", "test-scorer", "score-thread",
)
FLAGS = {
    "datasetId": "dataset-id", "experimentId": "experiment-id",
    "threadId": "thread-id", "perPage": "per-page",
}


def positive_number(value):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError("must be a finite number > 0")
    return number


def page_number(value):
    number = int(value)
    if number < 0:
        raise argparse.ArgumentTypeError("must be an integer >= 0")
    return number


def page_size(value):
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError("must be an integer >= 1")
    return number


def read_file(path):
    return sys.stdin.read() if path == "-" else Path(path).read_text(encoding="utf-8")


def request(base, command, *, query=None, body=None, timeout=60):
    url = base.rstrip("/") + "/api/evals/" + command
    if query:
        url += "?" + urllib.parse.urlencode(query)
    payload = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url, data=payload,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="GET" if body is None else "POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {error.code}: {detail}") from error
    if isinstance(result, dict) and result.get("success") is False:
        raise RuntimeError(result.get("message") or "API request failed")
    return result


def wait_for_experiment(base, dataset_id, experiment_id, *, timeout, interval, request_timeout):
    deadline = time.monotonic() + timeout
    print(f"Waiting: datasetId={dataset_id} experimentId={experiment_id}", file=sys.stderr)
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError(
                f"Wait timed out; the experiment was not cancelled. Resume with "
                f"get-experiment --dataset-id {dataset_id} --experiment-id {experiment_id} --wait"
            )
        result = request(
            base, "get-experiment",
            query={"datasetId": dataset_id, "experimentId": experiment_id},
            timeout=min(request_timeout, remaining),
        )
        experiment = result.get("experiment") if isinstance(result, dict) else None
        if not isinstance(experiment, dict):
            raise RuntimeError(f"Experiment not found: {experiment_id}")
        status = experiment.get("status")
        if status in ("completed", "failed"):
            return result
        if status not in ("pending", "running"):
            raise RuntimeError(f"Unexpected experiment status: {status!r}")
        time.sleep(min(interval, max(0, deadline - time.monotonic())))


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for command in (*GET_COMMANDS, *BODY_COMMANDS, "import-dataset", "delete-dataset", "delete-scorer"):
        sub = commands.add_parser(command)
        sub.add_argument("--request-timeout", type=positive_number, default=60,
                         help="HTTP timeout in seconds (default: 60)")
        if command in GET_COMMANDS:
            for field in GET_COMMANDS[command]:
                options = {"dest": field}
                if field in ("id", "datasetId", "experimentId", "threadId", "format"):
                    options["required"] = True
                if field == "format":
                    options["choices"] = ("csv", "jsonl")
                elif field in ("page", "perPage"):
                    options["type"] = page_number if field == "page" else page_size
                sub.add_argument("--" + FLAGS.get(field, field), **options)
        elif command in BODY_COMMANDS:
            sub.add_argument("--file", required=True, help="UTF-8 JSON request object; '-' reads stdin")
        elif command == "import-dataset":
            sub.add_argument("--dataset-id", dest="datasetId", required=True)
            sub.add_argument("--format", choices=("csv", "jsonl"), required=True)
            sub.add_argument("--file", required=True, help="CSV/JSONL file; '-' reads stdin")
        else:
            sub.add_argument("--id", required=True)
        if command == "start-experiment":
            sub.add_argument("--workspace", help="absolute working directory; overrides the JSON field")
        if command in ("start-experiment", "get-experiment"):
            sub.add_argument("--wait", action="store_true", help="poll until completed or failed")
            sub.add_argument("--wait-timeout", type=positive_number, default=600,
                             help="maximum polling time in seconds (default: 600)")
            sub.add_argument("--poll-interval", type=positive_number, default=2,
                             help="poll interval in seconds (default: 2)")
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    base = os.environ.get("AIME_CHAT_API_BASE_URL")
    if not base:
        print("AIME_CHAT_API_BASE_URL is not set; enable the Aime Chat local API server.", file=sys.stderr)
        return 1
    try:
        query, body = None, None
        if args.command in GET_COMMANDS:
            query = {key: getattr(args, key) for key in GET_COMMANDS[args.command]
                     if getattr(args, key) is not None}
        elif args.command in BODY_COMMANDS:
            body = json.loads(read_file(args.file))
            if not isinstance(body, dict):
                raise ValueError("--file must contain a JSON object")
            if args.command == "start-experiment" and not body.get("datasetId"):
                raise ValueError("start-experiment requires datasetId in the JSON object")
            if args.command == "start-experiment":
                if args.workspace is not None:
                    body["workspace"] = args.workspace
                if "workspace" not in body:
                    dataset = request(base, "get-dataset", query={"id": body["datasetId"]}, timeout=args.request_timeout)
                    body["workspace"] = dataset.get("defaultWorkspace")
                workspace = body.get("workspace")
                if not isinstance(workspace, str) or not workspace.strip():
                    raise ValueError("workspace is required; supply an absolute path in JSON or with --workspace")
                body["workspace"] = workspace.strip()
        elif args.command == "import-dataset":
            body = {"datasetId": args.datasetId, "format": args.format, "content": read_file(args.file)}
        else:
            body = {"id": args.id}

        if args.command == "get-experiment" and args.wait:
            result = wait_for_experiment(
                base, args.datasetId, args.experimentId,
                timeout=args.wait_timeout, interval=args.poll_interval,
                request_timeout=args.request_timeout,
            )
        else:
            result = request(base, args.command, query=query, body=body, timeout=args.request_timeout)
            if args.command == "start-experiment" and args.wait:
                experiment_id = result.get("experimentId") if isinstance(result, dict) else None
                if not experiment_id:
                    raise RuntimeError(f"Start response has no experimentId: {result!r}")
                result = wait_for_experiment(
                    base, body["datasetId"], experiment_id,
                    timeout=args.wait_timeout, interval=args.poll_interval,
                    request_timeout=args.request_timeout,
                )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if isinstance(result, dict):
            experiment = result.get("experiment") or {}
            if experiment.get("status") == "failed" or experiment.get("failedCount", 0) > 0:
                return 1
            if args.command == "test-scorer" and (result.get("error") or result.get("score") is None):
                return 1
            if args.command == "import-dataset" and result.get("skipped", 0) > 0:
                return 1
        return 0
    except TimeoutError as error:
        print(str(error), file=sys.stderr)
        return 2
    except (OSError, ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
