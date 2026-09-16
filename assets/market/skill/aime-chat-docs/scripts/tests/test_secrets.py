import contextlib
import importlib.util
import io
import json
import os
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("aime_secrets_cli", Path(__file__).parents[1] / "secrets.py")
secrets_cli = importlib.util.module_from_spec(spec)
spec.loader.exec_module(secrets_cli)


class SecretsCliTests(unittest.TestCase):
    def run_cli(self, args, stdin="", base="http://localhost:41100/"):
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.dict(os.environ, {"AIME_CHAT_API_BASE_URL": base}, clear=True), patch.object(secrets_cli.sys, "stdin", io.StringIO(stdin)):
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                code = secrets_cli.main(args)
        return code, stdout.getvalue(), stderr.getvalue()

    def test_list_filters_and_default_output_omit_values(self):
        data = [{"id": "one", "key": "KEY", "hasValue": True, "global": False, "value": "secret-token"}]
        with patch.object(secrets_cli.urllib.request.OpenerDirector, "open", return_value=io.BytesIO(json.dumps(data).encode())) as http:
            code, output, _ = self.run_cli(["list", "--key", "KEY", "--global", "false"])
        self.assertEqual(code, 0)
        self.assertNotIn("secret-token", output)
        request = http.call_args.args[0]
        self.assertEqual(request.full_url, "http://localhost:41100/api/secrets?key=KEY&global=false")
        self.assertEqual(request.get_method(), "GET")
        self.assertEqual(json.loads(output)[0]["global"], False)

    def test_only_explicit_get_reveal_returns_value(self):
        data = {"id": "a/b", "key": "KEY", "value": "secret-token"}
        for reveal in (False, True):
            with patch.object(secrets_cli.urllib.request.OpenerDirector, "open", return_value=io.BytesIO(json.dumps(data).encode())) as http:
                code, output, _ = self.run_cli(["get", "--id", "a/b"] + (["--reveal"] if reveal else []))
            self.assertEqual(code, 0)
            self.assertEqual("value" in json.loads(output), reveal)
            self.assertEqual(http.call_args.args[0].full_url, "http://localhost:41100/api/secrets/a%2Fb" + ("?reveal=true" if reveal else ""))

    def test_create_stdin_preserves_value_and_global_false_without_echo(self):
        payload = {"key": "KEY", "value": " secret-token\n ", "global": False}
        with patch.object(secrets_cli.urllib.request.OpenerDirector, "open", return_value=io.BytesIO(b'{"id":"one","key":"KEY","value":"secret-token"}')) as http:
            code, output, _ = self.run_cli(["create", "--file", "-", "--timeout", "7"], json.dumps(payload))
        self.assertEqual(code, 0)
        self.assertNotIn("secret-token", output)
        request = http.call_args.args[0]
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(json.loads(request.data), payload)
        self.assertEqual(http.call_args.kwargs["timeout"], 7)

    def test_update_from_file_sends_only_selected_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory, "patch.json")
            file.write_text('{"global":false,"description":""}', encoding="utf-8")
            with patch.object(secrets_cli.urllib.request.OpenerDirector, "open", return_value=io.BytesIO(b'{"id":"one","global":false}')) as http:
                code, _, _ = self.run_cli(["update", "--id", "one", "--file", str(file)])
        self.assertEqual(code, 0)
        request = http.call_args.args[0]
        self.assertEqual(request.get_method(), "PATCH")
        self.assertEqual(json.loads(request.data), {"global": False, "description": ""})

    def test_delete_uses_record_id_without_body(self):
        with patch.object(secrets_cli.urllib.request.OpenerDirector, "open", return_value=io.BytesIO(b'{"success":true,"id":"one"}')) as http:
            code, output, _ = self.run_cli(["delete", "--id", "one"])
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(output), {"success": True, "id": "one"})
        self.assertEqual(http.call_args.args[0].get_method(), "DELETE")
        self.assertIsNone(http.call_args.args[0].data)

    def test_http_error_and_timeout_never_echo_values_or_retry_writes(self):
        errors = [urllib.error.HTTPError("http://secret-token", 409, "secret-token", {}, io.BytesIO(b'secret-token')),
                  TimeoutError("secret-token")]
        for error in errors:
            with patch.object(secrets_cli.urllib.request.OpenerDirector, "open", side_effect=error) as http:
                code, output, stderr = self.run_cli(["update", "--id", "one", "--file", "-"], '{"value":"secret-token"}')
            self.assertEqual(code, 1)
            self.assertNotIn("secret-token", output + stderr)
            self.assertIn("Check list/get", stderr)
            self.assertEqual(http.call_count, 1)

    def test_invalid_base_or_body_never_sends_request_or_echoes_input(self):
        with patch.object(secrets_cli.urllib.request.OpenerDirector, "open") as http:
            for base in ("", "http://user:secret-token@localhost", "http://localhost:bad", "file:///secret-token"):
                code, output, stderr = self.run_cli(["list"], base=base)
                self.assertEqual(code, 1)
                self.assertNotIn("secret-token", output + stderr)
            for data in ("secret-token", "[]", "null", "{}"):
                code, output, stderr = self.run_cli(["create", "--file", "-"], data)
                self.assertEqual(code, 1)
                self.assertNotIn("secret-token", output + stderr)
            self.assertEqual(self.run_cli(["delete", "--id", " "])[0], 1)
            http.assert_not_called()

    def test_response_errors_are_not_echoed(self):
        for data in ('{"success":false,"message":"secret-token"}', 'secret-token'):
            with patch.object(secrets_cli.urllib.request.OpenerDirector, "open", return_value=io.BytesIO(data.encode())):
                code, output, stderr = self.run_cli(["list"])
            self.assertEqual(code, 1)
            self.assertNotIn("secret-token", output + stderr)

    def test_sensitive_requests_disable_redirects_and_environment_proxy_handlers(self):
        with patch.dict(os.environ, {"HTTP_PROXY": "http://invalid.invalid:1"}, clear=True):
            opener = secrets_cli.urllib.request.build_opener(secrets_cli.urllib.request.ProxyHandler({}), secrets_cli.NoRedirect())
        self.assertFalse(any(isinstance(handler, secrets_cli.urllib.request.ProxyHandler) for handler in opener.handlers))
        self.assertIsNone(secrets_cli.NoRedirect().redirect_request(None, None, 307, "", {}, "http://other"))

    def test_nonpositive_or_nonfinite_timeouts_are_rejected(self):
        for timeout in ("0", "-1", "nan", "inf"):
            with self.assertRaises(SystemExit):
                self.run_cli(["list", "--timeout", timeout])


if __name__ == "__main__":
    unittest.main()
