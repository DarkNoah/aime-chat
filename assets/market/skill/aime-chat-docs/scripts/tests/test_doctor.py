import contextlib
import importlib.util
import io
import json
import os
import threading
import unittest
import urllib.error
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("doctor", Path(__file__).parents[1] / "doctor.py")
doctor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(doctor)


class DoctorTests(unittest.TestCase):
    def setUp(self):
        self.health = {"service": "aime-chat", "status": "ok", "version": "1.0",
                       "apiServer": {"status": "running", "host": "127.0.0.1", "port": 43210},
                       "proxy": {"mode": "noproxy", "host": None, "port": None}}
        self.responses = {
            "/api/health": self.health,
            "/api/local-models/list": {"embedding": [{"id": "bge-m3", "status": "not_downloaded", "isDownloaded": False}],
                                       "reranker": [{"id": "reranker", "status": "downloading", "isDownloaded": False}]},
            "/api/app/default-models": {"model": "p/model"},
            "/api/providers/status": [{"id": "p", "name": "P", "type": "openai", "isActive": False,
                "apiBase": "https://secret:secret@api.example/v1?key=secret#secret", "apiKey": "secret", "config": {"token": "secret"},
                "activeModels": [{"id": "model", "providerModelId": "p/model", "apiKey": "secret"}]}],
            "/api/runtime/list": [{"id": "uv", "name": "UV / Python", "installed": False, "status": "not_installed"}],
        }

    def response(self, request, timeout):
        data = self.responses[doctor.urllib.parse.urlsplit(request.full_url).path]
        if isinstance(data, Exception):
            raise data
        return io.BytesIO(json.dumps(data).encode())

    def run_cli(self, args=(), env=None):
        out, err = io.StringIO(), io.StringIO()
        environment = {"AIME_CHAT_API_BASE_URL": "http://127.0.0.1:43210", **(env or {})}
        with patch.dict(os.environ, environment, clear=True), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = doctor.main(list(args))
        return code, out.getvalue(), err.getvalue()

    def test_full_report_bypasses_proxies_and_redacts_secrets(self):
        with patch.object(doctor.socket, "create_connection") as tcp, patch.object(doctor.urllib.request.OpenerDirector, "open", side_effect=self.response) as http:
            code, output, _ = self.run_cli(["--json"], {"HTTPS_PROXY": "http://secret:secret@proxy.example:7890?token=secret"})
        report = json.loads(output)
        self.assertEqual(code, 0)
        self.assertEqual(report["status"], "ok")
        self.assertNotIn("secret", output)
        self.assertFalse(report["checks"]["environmentProxy"]["usedForApiRequests"])
        self.assertEqual(report["checks"]["defaultModels"]["data"]["visionModel"], None)
        self.assertIn("No downloaded local embedding", str(report["notes"]))
        self.assertEqual(http.call_count, 5)
        self.assertEqual(tcp.call_args.args[0], ("127.0.0.1", 43210))
        self.assertTrue(all(call.args[0].get_method() == "GET" for call in http.call_args_list))
        self.assertIn("refresh=true", http.call_args.args[0].full_url)
        self.assertEqual(http.call_args.kwargs["timeout"], 120)
        opener = doctor.urllib.request.build_opener(doctor.urllib.request.ProxyHandler({}), doctor.NoRedirect())
        self.assertFalse(any(isinstance(handler, doctor.urllib.request.ProxyHandler) for handler in opener.handlers))
        self.assertIsNone(doctor.NoRedirect().redirect_request(None, None, 302, "", {}, "http://other"))

    def test_closed_port_produces_complete_report_without_http(self):
        with patch.object(doctor.socket, "create_connection", side_effect=ConnectionRefusedError()), patch.object(doctor.urllib.request.OpenerDirector, "open") as http:
            code, output, _ = self.run_cli(["--json"])
        report = json.loads(output)
        self.assertEqual(code, 1)
        self.assertEqual(report["checks"]["apiPort"]["status"], "error")
        for key in ("apiHealth", "proxy", "localModels", "defaultModels", "providers", "runtimes"):
            self.assertEqual(report["checks"][key]["status"], "skipped")
        http.assert_not_called()

    def test_wrong_service_is_not_treated_as_healthy(self):
        self.health["service"] = "another-app"
        with patch.object(doctor.socket, "create_connection"), patch.object(doctor.urllib.request.OpenerDirector, "open", side_effect=self.response) as http:
            code, output, _ = self.run_cli(["--json"])
        self.assertEqual(code, 1)
        self.assertEqual(http.call_count, 1)
        self.assertEqual(json.loads(output)["checks"]["apiHealth"]["status"], "error")

    def test_endpoint_failure_does_not_hide_other_sections_or_echo_body(self):
        self.responses["/api/local-models/list"] = urllib.error.HTTPError("http://localhost", 500, "secret", {}, io.BytesIO(b'secret'))
        with patch.object(doctor.socket, "create_connection"), patch.object(doctor.urllib.request.OpenerDirector, "open", side_effect=self.response) as http:
            code, output, _ = self.run_cli(["--json", "--cached"], {"AIME_CHAT_API_BASE_URL": "http://localhost:43210/"})
        self.assertEqual(code, 1)
        self.assertNotIn("secret", output)
        report = json.loads(output)
        self.assertEqual(report["baseUrl"], "http://localhost:43210")
        self.assertEqual(report["checks"]["localModels"]["status"], "error")
        self.assertEqual(report["checks"]["runtimes"]["status"], "ok")
        self.assertIn("refresh=false", http.call_args.args[0].full_url)

    def test_proxy_connection_failure_is_reported_but_other_checks_continue(self):
        self.health["proxy"] = {"mode": "system", "host": "127.0.0.1", "port": 7890}
        count = [0]
        def connection(*args, **kwargs):
            count[0] += 1
            if count[0] == 2:
                raise TimeoutError()
            return contextlib.nullcontext()
        with patch.object(doctor.socket, "create_connection", side_effect=connection), patch.object(doctor.urllib.request.OpenerDirector, "open", side_effect=self.response):
            code, output, _ = self.run_cli(["--json"])
        report = json.loads(output)
        self.assertEqual(code, 1)
        self.assertEqual(report["checks"]["proxy"]["tcp"]["status"], "error")
        self.assertEqual(report["checks"]["providers"]["status"], "ok")

    def test_proxy_modes_and_remote_probe_boundary(self):
        self.assertEqual(doctor.check_proxy(self.health, "localhost", 1)["effective"], "direct")
        self.health["proxy"] = {"mode": "system"}
        self.assertEqual(doctor.check_proxy(self.health, "localhost", 1)["effective"], "direct")
        self.health["proxy"] = {"mode": "custom"}
        self.assertEqual(doctor.check_proxy(self.health, "localhost", 1)["status"], "error")
        self.health["proxy"] = {"mode": "custom", "host": "127.0.0.1", "port": 7890}
        with patch.object(doctor.socket, "create_connection") as tcp:
            self.assertEqual(doctor.check_proxy(self.health, "192.0.2.1", 1)["status"], "warning")
            tcp.assert_not_called()

    def test_human_output_lists_all_categories_and_tls_warning(self):
        self.health["insecureTls"] = True
        with patch.object(doctor.socket, "create_connection"), patch.object(doctor.urllib.request.OpenerDirector, "open", side_effect=self.response):
            code, output, _ = self.run_cli()
        self.assertEqual(code, 0)
        for term in ("WARNING", "API 端口", "默认模型", "激活模型", "运行环境", "not_downloaded", "certificate verification"):
            self.assertIn(term, output)
        self.assertNotIn("secret", output)

    def test_bad_response_is_isolated_to_its_section(self):
        self.responses["/api/providers/status"] = {"success": False}
        with patch.object(doctor.socket, "create_connection"), patch.object(doctor.urllib.request.OpenerDirector, "open", side_effect=self.response):
            code, output, _ = self.run_cli(["--json"])
        self.assertEqual(code, 1)
        self.assertEqual(json.loads(output)["checks"]["runtimes"]["status"], "ok")

    def test_invalid_arguments_make_no_network_requests(self):
        with patch.object(doctor.socket, "create_connection") as tcp:
            for base in ("file:///etc/passwd", "http://user:secret@localhost:43210", "http://localhost:0", "http://localhost:bad", "http://localhost?token=secret"):
                code, output, err = self.run_cli(["--json"], {"AIME_CHAT_API_BASE_URL": base})
                self.assertEqual(code, 2)
                self.assertNotIn("secret", output + err)
            for number in ("0", "-1", "nan", "inf"):
                with self.assertRaises(SystemExit):
                    self.run_cli(["--timeout", number])
            tcp.assert_not_called()

    def test_missing_or_empty_environment_address_makes_no_network_requests(self):
        with patch.object(doctor.socket, "create_connection") as tcp, patch.object(doctor.urllib.request.OpenerDirector, "open") as http:
            for environment in ({}, {"AIME_CHAT_API_BASE_URL": ""}, {"AIME_CHAT_API_BASE_URL": "   "}):
                out, err = io.StringIO(), io.StringIO()
                with patch.dict(os.environ, environment, clear=True), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                    self.assertEqual(doctor.main(["--json"]), 2)
                self.assertEqual(out.getvalue(), "")
                self.assertIn("AIME_CHAT_API_BASE_URL", err.getvalue())
            tcp.assert_not_called()
            http.assert_not_called()

    def test_environment_base_and_ipv6_port(self):
        with patch.object(doctor.socket, "create_connection", side_effect=ConnectionRefusedError()) as tcp:
            code, output, _ = self.run_cli(["--json"], {"AIME_CHAT_API_BASE_URL": "http://[::1]:49999/"})
        self.assertEqual(code, 1)
        self.assertEqual(json.loads(output)["baseUrlSource"], "environment")
        self.assertEqual(tcp.call_args.args[0], ("::1", 49999))

    def test_real_http_report_ignores_environment_proxy_and_rejects_redirects(self):
        responses, paths = self.responses, []
        redirect = [False]

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                paths.append(self.path)
                if redirect[0]:
                    self.send_response(302)
                    self.send_header("Location", "/elsewhere")
                    self.end_headers()
                    return
                payload = json.dumps(responses[doctor.urllib.parse.urlsplit(self.path).path]).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

        server = HTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            base = "http://127.0.0.1:" + str(server.server_port)
            self.health["apiServer"]["port"] = server.server_port
            code, output, _ = self.run_cli(["--json", "--cached"],
                                          {"AIME_CHAT_API_BASE_URL": base, "HTTP_PROXY": "http://invalid.invalid:1", "NO_PROXY": ""})
            self.assertEqual(code, 0)
            self.assertEqual(len(paths), 5)
            self.assertEqual(json.loads(output)["checks"]["apiHealth"]["data"]["apiServer"]["port"], server.server_port)
            redirect[0] = True
            paths.clear()
            code, output, _ = self.run_cli(["--json"], {"AIME_CHAT_API_BASE_URL": base})
            self.assertEqual(code, 1)
            self.assertEqual(paths, ["/api/health"])
            self.assertIn("HTTP 302", output)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
