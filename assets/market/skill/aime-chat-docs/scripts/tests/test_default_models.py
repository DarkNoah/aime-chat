import contextlib
import importlib.util
import io
import json
import os
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("default_models", Path(__file__).parents[1] / "default_models.py")
default_models = importlib.util.module_from_spec(spec)
spec.loader.exec_module(default_models)


class DefaultModelsCliTests(unittest.TestCase):
    def run_cli(self, args, base="http://localhost:41100/"):
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.dict(os.environ, {"AIME_CHAT_API_BASE_URL": base}):
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                code = default_models.main(args)
        return code, stdout.getvalue(), stderr.getvalue()

    def test_list_sends_get_and_prints_effective_defaults(self):
        result = {"model": "provider/chat", "visionModel": ""}
        with patch.object(default_models.urllib.request, "urlopen", return_value=io.BytesIO(json.dumps(result).encode())) as http:
            code, output, _ = self.run_cli(["list"])
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(output), result)
        request = http.call_args.args[0]
        self.assertEqual(request.full_url, "http://localhost:41100/api/app/default-models")
        self.assertEqual(request.get_method(), "GET")
        self.assertIsNone(request.data)

    def test_set_preserves_empty_string_and_omits_unspecified_fields(self):
        with patch.object(default_models.urllib.request, "urlopen", return_value=io.BytesIO(b'{}')) as http:
            code, _, _ = self.run_cli(["set", "--fast-model", "provider/fast", "--vision-model", "", "--generate-video-model", "provider/video"])
        self.assertEqual(code, 0)
        request = http.call_args.args[0]
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(json.loads(request.data), {"fastModel": "provider/fast", "visionModel": "", "generateVideoModel": "provider/video"})

    def test_set_without_fields_is_rejected(self):
        with patch.object(default_models.urllib.request, "urlopen") as http:
            with self.assertRaises(SystemExit) as error:
                self.run_cli(["set"])
        self.assertEqual(error.exception.code, 2)
        http.assert_not_called()

    def test_missing_base_url_makes_no_request(self):
        with patch.object(default_models.urllib.request, "urlopen") as http:
            code, _, error = self.run_cli(["list"], base="")
        self.assertEqual(code, 1)
        self.assertIn("AIME_CHAT_API_BASE_URL", error)
        http.assert_not_called()

    def test_http_error_exits_nonzero_without_retrying(self):
        error = urllib.error.HTTPError("http://localhost", 400, "Bad Request", {}, io.BytesIO(b'{"message":"invalid field"}'))
        with patch.object(default_models.urllib.request, "urlopen", side_effect=error) as http:
            code, output, stderr = self.run_cli(["set", "--model", "provider/model"])
        self.assertEqual(code, 1)
        self.assertEqual(output, "")
        self.assertIn("invalid field", stderr)
        self.assertEqual(http.call_count, 1)

    def test_timeout_directs_a_read_before_retrying(self):
        with patch.object(default_models.urllib.request, "urlopen", side_effect=TimeoutError("timed out")) as http:
            code, _, stderr = self.run_cli(["set", "--model", "provider/model"])
        self.assertEqual(code, 1)
        self.assertIn("run 'list'", stderr)
        self.assertEqual(http.call_count, 1)


if __name__ == "__main__":
    unittest.main()
