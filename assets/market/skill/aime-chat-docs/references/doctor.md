# Application doctor

Use `scripts/doctor.py` for an overview of Aime Chat's application state. It uses Python 3's standard library and performs read-only checks. Run it on the same machine as the desktop application.

```bash
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/doctor.py"
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/doctor.py" --json
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/doctor.py" --cached
```

Read the API address exclusively from `AIME_CHAT_API_BASE_URL`. Do not assume or hardcode a port. If the variable is missing or empty, the script exits before making any network requests; obtain the API address from Aime Chat's environment. If the configured address is unavailable, start Aime Chat and enable its API server in Settings. Restart the updated application if a required endpoint returns HTTP 404.

`--timeout` controls each TCP and ordinary HTTP request (default 5 seconds). Runtime probes use `--runtime-timeout` (default 120 seconds); use `--cached` to read their last known state. A timeout does not cancel a server-side runtime probe.

## Checks

| Check | What it reports |
| --- | --- |
| API port | Direct TCP connection to the selected host and port. |
| API health | Aime Chat service identity, actual listening address/port, app version, process uptime, platform and TLS verification setting. An unrelated open port is not accepted as healthy. |
| Network proxy | App proxy mode (`noproxy`, `system`, `custom`), applied host/port and proxy TCP reachability. Shell HTTP/HTTPS/ALL proxy variables are listed separately; API requests bypass them. |
| Local models | Every catalog model by type, download state (`not_downloaded`, `downloading`, `downloaded`, `incomplete`, `deleting`), provider model ID and path. |
| Default models | Effective chat, fast, vision, embedding, reranker, OCR, transcription, speech, image and video defaults; empty/missing values appear as unconfigured. |
| Providers | All configured providers, including disabled ones: ID/name/type, enablement, API base and its source, number of configured models, and activated model IDs. |
| Runtimes | UV/managed Python, Bun, Node/npm, PaddleOCR, QwenAudio and Agent Browser: installed state, versions, paths, dependencies and active operations. |

The proxy snapshot is what Aime Chat last applied, including the last resolved system proxy. In system mode with no resolved endpoint, the app uses a direct connection. A custom proxy without a valid applied endpoint is an error. For a non-loopback API URL, proxy TCP probing is skipped because the script cannot establish the desktop host's network state from another machine. TLS verification disabled in the app produces a warning.

TCP reachability does not verify proxy authentication, actual outbound routing, remote-provider credentials or model inference. Runtime/model state is reported separately from API liveness. Optional components being absent do not make the API unhealthy. During runtime installation/removal, the runtime API returns cached state with an `operation` field.

Provider `activeModels` reflects saved activation selections, even when the provider itself is disabled; it is not a remote model discovery or availability test. The built-in `local` provider's downloaded models appear in the local-model section. API bases use the configured value or the adapter/catalog default; `apiBaseSource: unknown` means the default could not be resolved. API keys and provider config are omitted; URL userinfo, query values and fragments are removed/redacted. Arbitrary HTTP error bodies are not echoed.

## Result and next steps

- Human-readable output is the default. `--json` writes one report containing `status`, `checks` and `notes` to stdout.
- Exit `0`: requested checks completed, possibly with warnings. Exit `1`: a connection/API/configuration check failed. Exit `2`: invalid CLI input or missing/invalid `AIME_CHAT_API_BASE_URL`.
- If the health check fails, app-dependent sections are explicitly marked `skipped`. If one later endpoint fails, the other sections still run.
- Missing local embedding/reranker models produce preparation guidance. For a knowledge base that will use local models, follow [local-models.md](local-models.md), download the selected models, verify `isDownloaded: true`, then create the knowledge base. Existing remote models can also be used.
- For repairs, use [default-models.md](default-models.md), [local-models.md](local-models.md) or [runtime.md](runtime.md). Doctor itself never downloads, installs, uninstalls, changes defaults or invokes paid models.

## Health API

`GET /api/health` is a lightweight liveness endpoint. It does not query the settings database, instantiate models or probe runtime executables. It returns HTTP `200` while the API server is listening (`503` for an unavailable snapshot) and `Cache-Control: no-store`.

Example response excerpt below. The full response also includes `apiServer.host` and `apiServer.port` with the actual listening address; obtain the request URL from `AIME_CHAT_API_BASE_URL`.

```json
{
  "service": "aime-chat",
  "status": "ok",
  "version": "0.3.55",
  "checkedAt": "2026-09-16T00:00:00.000Z",
  "uptimeSeconds": 42,
  "platform": "darwin",
  "apiServer": { "status": "running" },
  "proxy": { "mode": "noproxy", "host": null, "port": null },
  "insecureTls": false
}
```

The doctor additionally calls these GET endpoints:

- `/api/local-models/list`
- `/api/app/default-models`
- `/api/providers/status` (safe diagnostic fields only)
- `/api/runtime/list?refresh=true` (or `refresh=false` with `--cached`)
