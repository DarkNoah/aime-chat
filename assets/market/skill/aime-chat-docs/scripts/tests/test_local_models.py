import contextlib
import importlib.util
import io
import json
import os
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("local_models", Path(__file__).parents[1] / "local_models.py")
local_models = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local_models)


class LocalModelsCliTests(unittest.TestCase):
    def run_cli(self, args, base="http://localhost:41100/"):
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.dict(os.environ, {"AIME_CHAT_API_BASE_URL": base}):
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                code = local_models.main(args)
        return code, stdout.getvalue(), stderr.getvalue()

    def test_lists_a_model_type(self):
        result = {"embedding": [{"id": "bge-m3", "isDownloaded": False}]}
        with patch.object(local_models.urllib.request, "urlopen", return_value=io.BytesIO(json.dumps(result).encode())) as http:
            code, output, _ = self.run_cli(["list", "--type", "embedding"])
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(output), result)
        self.assertEqual(http.call_args.args[0].full_url, "http://localhost:41100/api/local-models/list?type=embedding")
        self.assertEqual(http.call_args.args[0].get_method(), "GET")
        self.assertIsNone(http.call_args.kwargs["timeout"])

    def test_default_download_uses_modelscope_without_timeout(self):
        with patch.object(local_models.urllib.request, "urlopen", return_value=io.BytesIO(b'{}')) as http:
            code, _, _ = self.run_cli(["download", "--type", "tts", "--model-id", "BreezeBlue/Breeze-TTS-2"])
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(http.call_args.args[0].data), {
            "type": "tts", "modelId": "BreezeBlue/Breeze-TTS-2", "source": "modelscope",
        })
        self.assertIsNone(http.call_args.kwargs["timeout"])

    def test_default_delete_has_no_timeout(self):
        with patch.object(local_models.urllib.request, "urlopen", return_value=io.BytesIO(b'{}')) as http:
            code, _, _ = self.run_cli(["delete", "--type", "embedding", "--model-id", "bge-m3"])
        self.assertEqual(code, 0)
        self.assertIsNone(http.call_args.kwargs["timeout"])

    def test_opt_in_default_is_forwarded_to_download(self):
        with patch.object(local_models.urllib.request, "urlopen", return_value=io.BytesIO(b'{}')) as http:
            code, _, _ = self.run_cli(["download", "--type", "embedding", "--model-id", "bge-m3", "--set-as-default"])
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(http.call_args.args[0].data), {
            "type": "embedding", "modelId": "bge-m3", "source": "modelscope", "setAsDefault": True,
        })

    def test_download_and_delete_preserve_catalog_id_with_slash(self):
        for action in ("download", "delete"):
            args = [action, "--type", "embedding", "--model-id", "Qwen/Qwen3-Embedding-0.6B", "--timeout", "7200"]
            body = {"type": "embedding", "modelId": "Qwen/Qwen3-Embedding-0.6B"}
            if action == "download":
                args += ["--source", "modelscope"]
                body["source"] = "modelscope"
            with patch.object(local_models.urllib.request, "urlopen", return_value=io.BytesIO(b'{}')) as http:
                code, _, _ = self.run_cli(args)
            self.assertEqual(code, 0)
            request = http.call_args.args[0]
            self.assertEqual(request.get_method(), "POST")
            self.assertEqual(json.loads(request.data), body)
            self.assertEqual(http.call_args.kwargs["timeout"], 7200)

    def test_audio_categories_are_available_for_listing_and_download(self):
        for model_type, model_id in (("tts", "BreezeBlue/Breeze-TTS-2"), ("stt", "Qwen/Qwen3-ASR-1.7B")):
            with patch.object(local_models.urllib.request, "urlopen", return_value=io.BytesIO(b'{}')) as http:
                code, _, _ = self.run_cli(["list", "--type", model_type])
            self.assertEqual(code, 0)
            self.assertTrue(http.call_args.args[0].full_url.endswith("?type=" + model_type))
            with patch.object(local_models.urllib.request, "urlopen", return_value=io.BytesIO(b'{}')) as http:
                code, _, _ = self.run_cli(["download", "--type", model_type, "--model-id", model_id, "--source", "huggingface"])
            self.assertEqual(code, 0)
            self.assertEqual(json.loads(http.call_args.args[0].data), {"type": model_type, "modelId": model_id, "source": "huggingface"})

    def test_missing_base_url_makes_no_request(self):
        with patch.object(local_models.urllib.request, "urlopen") as http:
            code, _, error = self.run_cli(["list"], base="")
        self.assertEqual(code, 1)
        self.assertIn("AIME_CHAT_API_BASE_URL", error)
        http.assert_not_called()

    def test_invalid_timeout_is_rejected(self):
        for value in ("0", "-1", "nan", "inf"):
            with self.assertRaises(SystemExit):
                self.run_cli(["list", "--timeout", value])

    def test_http_error_is_not_retried(self):
        error = urllib.error.HTTPError("http://localhost", 409, "Conflict", {}, io.BytesIO(b'{"message":"UV required"}'))
        with patch.object(local_models.urllib.request, "urlopen", side_effect=error) as http:
            code, output, stderr = self.run_cli(["download", "--type", "embedding", "--model-id", "bge-m3", "--source", "modelscope"])
        self.assertEqual(code, 1)
        self.assertEqual(output, "")
        self.assertIn("UV required", stderr)
        self.assertEqual(http.call_count, 1)

    def test_timeout_requires_status_check_before_retry(self):
        with patch.object(local_models.urllib.request, "urlopen", side_effect=TimeoutError("timed out")) as http:
            code, _, stderr = self.run_cli(["download", "--type", "reranker", "--model-id", "bge-reranker-base", "--source", "huggingface"])
        self.assertEqual(code, 1)
        self.assertIn("list --type reranker", stderr)
        self.assertIn("does not cancel", stderr)
        self.assertEqual(http.call_count, 1)


if __name__ == "__main__":
    unittest.main()
