#!/usr/bin/env python3
"""Read-only Aime Chat diagnostics: API, proxy, models, providers and runtimes."""

import argparse
import datetime
import ipaddress
import json
import math
import os
import socket
import sys
import urllib.error
import urllib.parse
import urllib.request


DEFAULT_ROLES = (
    "model", "fastModel", "visionModel", "embeddingModel", "rerankerModel",
    "ocrModel", "transcriptionModel", "speechModel", "generateImageModel",
    "generateVideoModel",
)


def positive_number(value):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError("must be a finite number > 0")
    return number


def redact_url(value):
    try:
        url = urllib.parse.urlsplit(value if "://" in value else "http://" + value)
        if not url.hostname or url.scheme not in ("http", "https", "socks", "socks5", "socks5h"):
            return "[invalid URL]"
        host = "[" + url.hostname + "]" if ":" in url.hostname else url.hostname
        authority = host + (":" + str(url.port) if url.port else "")
        query = urllib.parse.urlencode([(key, "[redacted]") for key, _ in urllib.parse.parse_qsl(url.query)])
        return urllib.parse.urlunsplit((url.scheme, authority, url.path, query, ""))
    except (ValueError, TypeError):
        return "[invalid URL]"


def parse_base(value):
    try:
        url = urllib.parse.urlsplit(value)
        if (url.scheme not in ("http", "https") or not url.hostname
                or url.username is not None or url.password is not None
                or url.query or url.fragment or url.port == 0):
            raise ValueError()
        return url, value.rstrip("/")
    except ValueError:
        raise ValueError("API base URL must be HTTP(S), without credentials, query or fragment") from None


def is_loopback(host):
    if host.lower() == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def tcp_check(host, port, timeout):
    try:
        with socket.create_connection((host.strip("[]"), port), timeout=timeout):
            pass
        return {"status": "ok", "host": host, "port": port}
    except OSError as error:
        # Do not echo arbitrary server responses or URLs in errors.
        return {"status": "error", "host": host, "port": port,
                "message": "TCP connection failed (" + type(error).__name__ + ")"}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch_json(opener, url, timeout):
    request = urllib.request.Request(url, headers={"Accept": "application/json"}, method="GET")
    try:
        with opener.open(request, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise ValueError("HTTP " + str(error.code) + " (check API version and restart the updated app)") from None
    except (OSError, ValueError) as error:
        raise ValueError("API request failed (" + type(error).__name__ + ")") from None


def project_rows(rows, fields):
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise ValueError("Unexpected API response: expected a list of objects")
    return [{key: row[key] for key in fields if key in row} for row in rows]


def local_models(data):
    if not isinstance(data, dict) or not {"embedding", "reranker"}.issubset(data):
        raise ValueError("Unexpected local model response")
    return {kind: project_rows(rows, ("id", "type", "providerModelId", "status", "isDownloaded", "modelPath"))
            for kind, rows in data.items()}


def default_models(data):
    if not isinstance(data, dict) or any(data.get(key) is not None and not isinstance(data[key], str) for key in DEFAULT_ROLES):
        raise ValueError("Unexpected default model response")
    return {key: data.get(key) for key in DEFAULT_ROLES}


def providers(data):
    rows = project_rows(data, ("id", "name", "type", "isActive", "apiBase", "apiBaseSource", "modelCount", "activeModels"))
    for row in rows:
        if row.get("apiBase"):
            row["apiBase"] = redact_url(row["apiBase"])
        row["activeModels"] = project_rows(row.get("activeModels", []), ("id", "name", "providerModelId"))
    return rows


def runtimes(data):
    rows = project_rows(data, ("id", "name", "status", "installed", "version", "path", "dir",
                               "npmVersion", "pythonRuntime", "dependencies", "operation"))
    for row in rows:
        if row.get("pythonRuntime") is not None:
            row["pythonRuntime"] = project_rows([row["pythonRuntime"]],
                ("installed", "dir", "pythonPath", "pipPath", "pythonVersion", "pipVersion"))[0]
    return rows


def check_proxy(health, api_host, timeout):
    proxy = health.get("proxy")
    if not isinstance(proxy, dict) or proxy.get("mode") not in ("system", "custom", "noproxy"):
        return {"status": "error", "message": "Invalid app proxy snapshot"}
    mode, host, port = proxy["mode"], proxy.get("host"), proxy.get("port")
    result = {"status": "ok", "mode": mode, "host": host, "port": port,
              "note": "App's applied proxy snapshot; TCP reachability does not verify authentication or internet access."}
    if mode == "noproxy" or (mode == "system" and not host and not port):
        result["effective"] = "direct"
        return result
    if not isinstance(host, str) or not host or type(port) is not int or not 0 < port < 65536:
        result.update(status="error", message="Proxy mode is enabled but the applied endpoint is missing or invalid")
    elif not is_loopback(api_host):
        result.update(status="warning", message="Proxy TCP check skipped: run doctor on the same machine as Aime Chat")
    else:
        result["tcp"] = tcp_check(host, port, timeout)
        result["status"] = result["tcp"]["status"]
    return result


def diagnose(args):
    url, base = parse_base(args.base_url)
    # The app binds to loopback. Environment proxies must not intercept diagnosis
    # of the API itself; redirects must not turn a wrong port into a false success.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    report = {
        "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "baseUrl": base,
        "baseUrlSource": "environment",
        "status": "ok",
        "checks": {},
        "notes": ["Read-only checks; no downloads, installs, configuration writes or model inference.",
                  "Optional models/runtimes may be absent. Listed model state is not an inference test."],
    }
    checks = report["checks"]
    checks["environmentProxy"] = {
        "status": "ok", "usedForApiRequests": False,
        "variables": {key: redact_url(os.environ[key]) for key in
                      ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy")
                      if os.environ.get(key)},
        "noProxyConfigured": bool(os.environ.get("NO_PROXY") or os.environ.get("no_proxy")),
        "note": "Shell proxy variables are separate from the app's proxy settings.",
    }
    checks["apiPort"] = tcp_check(url.hostname, url.port or (443 if url.scheme == "https" else 80), args.timeout)
    healthy = False
    if checks["apiPort"]["status"] == "ok":
        try:
            health = fetch_json(opener, base + "/api/health", args.timeout)
            if (not isinstance(health, dict) or health.get("service") != "aime-chat"
                    or health.get("status") != "ok" or not isinstance(health.get("apiServer"), dict)
                    or health["apiServer"].get("status") != "running"):
                raise ValueError("Port is open but did not return a healthy Aime Chat service")
            checks["apiHealth"] = {"status": "ok", "data": {
                key: health.get(key) for key in ("service", "version", "platform", "uptimeSeconds", "apiServer", "insecureTls")}}
            checks["proxy"] = check_proxy(health, url.hostname, args.timeout)
            if health.get("insecureTls"):
                checks["proxy"]["tlsWarning"] = "App TLS certificate verification is disabled"
                if checks["proxy"]["status"] == "ok":
                    checks["proxy"]["status"] = "warning"
            healthy = True
        except ValueError as error:
            checks["apiHealth"] = {"status": "error", "message": str(error)}
    else:
        checks["apiHealth"] = {"status": "skipped", "message": "API port is unavailable; start Aime Chat and enable its API server, then verify the configured port"}
    if not healthy:
        checks["proxy"] = {"status": "skipped", "message": "App proxy settings require a healthy API"}

    endpoints = (
        ("localModels", "/api/local-models/list", args.timeout, local_models),
        ("defaultModels", "/api/app/default-models", args.timeout, default_models),
        ("providers", "/api/providers/status", args.timeout, providers),
        ("runtimes", "/api/runtime/list?refresh=" + ("false" if args.cached else "true"), args.runtime_timeout, runtimes),
    )
    for name, endpoint, timeout, normalize in endpoints:
        if not healthy:
            checks[name] = {"status": "skipped", "message": "Requires a healthy Aime Chat API"}
            continue
        try:
            checks[name] = {"status": "ok", "data": normalize(fetch_json(opener, base + endpoint, timeout))}
        except ValueError as error:
            checks[name] = {"status": "error", "message": str(error)}
    checks["runtimes"]["refreshRequested"] = not args.cached
    for kind in ("embedding", "reranker"):
        rows = checks["localModels"].get("data", {}).get(kind)
        if rows is not None and not any(row.get("isDownloaded") for row in rows):
            report["notes"].append("No downloaded local " + kind + " model. For a local knowledge base, download one with local_models.py and verify completion before creating the knowledge base; configured remote models can also be used.")
    states = [check["status"] for check in checks.values()]
    report["status"] = "error" if "error" in states else "warning" if "warning" in states else "ok"
    return report


def render(report):
    print("Aime Chat doctor — " + report["status"].upper())
    print("API: " + report["baseUrl"] + " (" + report["baseUrlSource"] + ")")
    labels = {"apiPort": "API 端口", "apiHealth": "健康检查", "proxy": "应用网络代理",
              "environmentProxy": "环境代理", "localModels": "本地模型与下载状态",
              "defaultModels": "默认模型", "providers": "模型供应商", "runtimes": "运行环境"}
    for name in ("apiPort", "apiHealth", "proxy", "environmentProxy", "localModels", "defaultModels", "providers", "runtimes"):
        check = report["checks"][name]
        print("\n[" + check["status"].upper() + "] " + labels[name])
        if "data" not in check:
            print("  " + json.dumps({key: value for key, value in check.items() if key != "status"}, ensure_ascii=False))
            continue
        data = check["data"]
        if name == "localModels":
            for kind, rows in data.items():
                for row in rows:
                    print("  " + kind + " / " + row.get("id", "?") + ": " + str(row.get("status")) + " | " + str(row.get("modelPath", "")))
        elif name == "defaultModels":
            for role, model in data.items():
                print("  " + role + ": " + (model or "(未配置)"))
        elif name == "providers":
            if not data:
                print("  (无已配置供应商)")
            for row in data:
                print("  " + str(row.get("name")) + " [" + str(row.get("id")) + "] " + ("开启" if row.get("isActive") else "关闭") + " | " + str(row.get("type")))
                print("    API base: " + str(row.get("apiBase") or "(无法解析默认地址)") + " (" + str(row.get("apiBaseSource")) + ")")
                print("    激活模型: " + (", ".join(model["providerModelId"] for model in row["activeModels"]) or "(无)"))
        elif name == "runtimes":
            print("  " + ("已请求刷新；操作进行中时接口返回缓存" if check["refreshRequested"] else "缓存状态"))
            for row in data:
                print("  " + str(row.get("name", row.get("id"))) + ": " + str(row.get("status")) + " | " + json.dumps(row, ensure_ascii=False))
        else:
            print("  " + json.dumps(data, ensure_ascii=False))
    for note in report["notes"]:
        print("\n- " + note)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, epilog="API URL is read from AIME_CHAT_API_BASE_URL (required).")
    parser.add_argument("--timeout", type=positive_number, default=5, help="TCP / API request timeout in seconds (default: 5)")
    parser.add_argument("--runtime-timeout", type=positive_number, default=120, help="Runtime probe request timeout in seconds (default: 120)")
    parser.add_argument("--cached", action="store_true", help="Read cached runtime state instead of refreshing probes")
    parser.add_argument("--json", action="store_true", help="Print the complete report as JSON")
    args = parser.parse_args(argv)
    args.base_url = os.environ.get("AIME_CHAT_API_BASE_URL", "").strip()
    if not args.base_url:
        print("AIME_CHAT_API_BASE_URL is not set; use the API address provided by Aime Chat.", file=sys.stderr)
        return 2
    try:
        report = diagnose(args)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        render(report)
    return 1 if report["status"] == "error" else 0


if __name__ == "__main__":
    sys.exit(main())
