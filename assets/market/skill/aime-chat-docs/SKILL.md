---
name: aime-chat-docs
description: Aime Chat usage and configuration docs with ready-to-run local API scripts. Use for secret/key management (list, inspect, create, update, delete, global environment injection), application health and doctor diagnostics (API port, proxy, models, providers and runtimes), assistant personalities and SOUL.md, local voices, model/Agent/tool discovery, listing and setting default models, local model downloads and embedding/reranker setup before knowledge base creation, Agent creation, skill management, runtime environments (list/install/reinstall/uninstall), PTC in CodeExecution, creating threads and sending text/images, running threads, projects, chat history, or evaluations (creating/importing datasets, creating and testing scorers, running experiments and comparing results).
autoInstall: true
---

# Aime Chat Docs

Use this skill when answering questions about Aime Chat configuration and feature conventions.

## Reference Index

- **Secret/key management**: Read [references/secrets.md](references/secrets.md) when managing individual records in Settings → Secrets: list/filter, inspect, create, rename, replace values, edit descriptions, toggle global environment injection or delete. Use metadata for routine management and explicit per-record reveal only when the task requires the value.
- **Application doctor**: Read [references/doctor.md](references/doctor.md) when diagnosing application status, API port/health, network proxy, local model downloads, default models, provider enablement/API bases/active models, or runtime availability. Run the read-only doctor first and use the relevant configuration reference for any follow-up repair.
- **Assistant personalities**: Read [references/create-personality.md](references/create-personality.md) when explaining how to create or edit an assistant personality, how `SOUL.md` front matter works, or where avatars live.
- **Local voices**: Read [references/create-local-voice.md](references/create-local-voice.md) when explaining how to create local voice folders under user data, what files are required, or how voice IDs are derived.
- **Skill management**: Read [references/manage-skills.md](references/manage-skills.md) when explaining how to create or add Aime Chat skills globally or for the current project.
- **Runtime environments**: Read [references/runtime.md](references/runtime.md) when listing runtime status, paths and versions, or installing, reinstalling or uninstalling UV/Python, Bun, Node.js, PaddleOCR, QwenAudio or Agent Browser.
- **Available models**: Read [references/get-available-models.md](references/get-available-models.md) when explaining how to list configured provider models through the local API server.
- **Default models**: Read [references/default-models.md](references/default-models.md) when listing, setting or clearing the global default chat, fast, vision, embedding, reranker, OCR, transcription, speech, image or video model.
- **Local models and knowledge bases**: Read [references/local-models.md](references/local-models.md) when listing/downloading/deleting local models or preparing a knowledge base. If local embedding or reranker models are missing, guide their download, verify completion, then create the knowledge base with the selected provider model IDs.
- **Available Agents**: Read [references/get-available-agents.md](references/get-available-agents.md) when explaining how to list enabled Agents through the local API server.
- **Agent detail**: Read [references/get-agent.md](references/get-agent.md) when explaining how to fetch a single Agent's full config (instructions, tools, sub-agents, suggestions) by id through the local API server.
- **Create/update Agent**: Read [references/save-agent.md](references/save-agent.md) when explaining how to create a new Agent or update an existing one (name, instructions, tools, model, tags) through the local API server.
- **Available tools**: Read [references/get-available-tools.md](references/get-available-tools.md) when explaining how to list enabled tools through the local API server.
- **Tool detail**: Read [references/get-tool.md](references/get-tool.md) when explaining how to fetch a single tool's detail (sub-tools, input schema, status) by id through the local API server.
- **PTC (Programmatic Tool Calling)**: Read [references/use-ptc.md](references/use-ptc.md) when explaining how to use the CodeExecution PTC mode to call tools programmatically in code, batch tool calls in a loop, call ChatCompletion inside code, or report progress via the Message tool.
- **Create thread**: Read [references/create-thread.md](references/create-thread.md) when explaining how to create a new chat thread (optionally under a project, with an Agent and model) through the local API server.
- **Send thread message**: Read [references/send-thread-message.md](references/send-thread-message.md) when sending text and/or local images to an existing idle thread and waiting for the final assistant text through the local API server.
- **Running threads**: Read [references/list-running-threads.md](references/list-running-threads.md) when explaining how to list threads that are currently streaming (running) through the local API server.
- **Projects**: Read [references/list-projects.md](references/list-projects.md) when explaining how to list projects (with pagination and title filter) through the local API server.
- **Chat history**: Read [references/chat-history.md](references/chat-history.md) when explaining how to list recent chat threads, read a thread's messages, or keyword-search across chat history through the local API server.
- **Evaluation datasets**: Read [references/manage-eval-datasets.md](references/manage-eval-datasets.md) when creating datasets, adding test cases, or importing/exporting CSV and JSONL samples.
- **Evaluation scorers**: Read [references/create-eval-scorers.md](references/create-eval-scorers.md) when creating, testing, or updating deterministic checks and LLM judges.
- **Evaluation runs**: Read [references/run-eval-experiments.md](references/run-eval-experiments.md) when running dataset tests, waiting for results, comparing experiments, or scoring existing conversations. For a full evaluation workflow, use all three evaluation references.

## API Scripts

The `scripts/` folder contains standalone Python scripts (standard library only, Python 3) for the Aime Chat local API. Scripts read the API base URL from the `AIME_CHAT_API_BASE_URL` environment variable and require the local API server to be enabled and running. The doctor can also diagnose an unavailable server using that environment-provided address. Do not assume or hardcode an API port. Prefer running these scripts over hand-writing HTTP requests.

- **[scripts/secrets.py](scripts/secrets.py)**: Manage individual secrets using `list [--key NAME] [--global true|false]`, `get --id ID [--reveal]`, `create --file FILE`, `update --id ID --file FILE` and `delete --id ID`. Use `--file -` for JSON on stdin; normal responses omit secret values. Supports `--timeout` on each command.
- **[scripts/doctor.py](scripts/doctor.py)**: Check API TCP/health, applied app proxy and shell proxy settings, local downloads, default models, every configured provider, and runtimes. Reads the API address exclusively from `AIME_CHAT_API_BASE_URL`. Human-readable output by default; use `--json` for a complete report or `--cached` for cached runtime state. No configuration changes or model inference.
- **[scripts/runtime.py](scripts/runtime.py)**: List runtime environments with `list` (or `list --cached`) and manage a runtime with `install <pkg>`, `reinstall <pkg>` or `uninstall <pkg>`. Returns JSON; supports `--timeout` in seconds. Check `supportedActions` and dependencies before mutations.
- **[scripts/default_models.py](scripts/default_models.py)**: List effective defaults with `list`, or update selected fields with `set --model <id> --fast-model <id>` and the other model options shown by `set --help`. Pass an empty string to clear a field; unspecified fields are preserved. Returns JSON.
- **[scripts/local_models.py](scripts/local_models.py)**: List local model status with `list --type embedding` or `list --type reranker`; download with `download --type <type> --model-id <id> --source <source>`, or delete with `delete --type <type> --model-id <id>`. Downloads wait for completion; use `--timeout` to adjust the HTTP timeout and recheck status before creating a knowledge base.
- **[scripts/evals.py](scripts/evals.py)**: Manage evaluation datasets, samples, scorers and experiments. Use `--help` or `<command> --help`; writes JSON to stdout. Body commands take `--file request.json` (or `--file -` for stdin). `start-experiment` accepts `--workspace` and fills a missing JSON workspace from the dataset's server-provided default. `start-experiment` and `get-experiment` support `--wait`, `--wait-timeout` and `--poll-interval`.
- **[scripts/get_available_models.py](scripts/get_available_models.py)**: List configured provider models. Supports `--type` (`llm`, `embedding`, `reranker`, `image_generation`, `video_generation`, `transcription`, `speech`, `ocr`, `music`) and `--json` for raw output.
- **[scripts/get_available_agents.py](scripts/get_available_agents.py)**: List enabled Agents as `- [<agent-id>]: <description>`. Supports `--visible-only` to exclude hidden Agents and `--json` for raw output.
- **[scripts/get_agent.py](scripts/get_agent.py)**: Get a single Agent's full config by id, e.g. `python scripts/get_agent.py --id code-agent`. Shows type, description, tools, sub-agents, suggestions, and instructions. Supports `--json` for raw output.
- **[scripts/save_agent.py](scripts/save_agent.py)**: Create or update an Agent (always saved as active). Requires `--id` (letters/digits/-/_ only), `--name`, `--description`, `--instructions`. Optional repeatable `--suggestion`, `--tool`, and `--sub-agent`.
- **[scripts/get_available_tools.py](scripts/get_available_tools.py)**: List enabled tools grouped by type (`mcp`, `build-in`, `skill`), expanding toolkit sub-tools. Descriptions are truncated to the first 100 characters. Supports `--json` for raw output.
- **[scripts/get_tool.py](scripts/get_tool.py)**: Get a single tool's detail by id, e.g. `python scripts/get_tool.py --id skill:local:xlsx`. Shows type, status, description, and sub-tools. Supports `--json` for raw output.
- **[scripts/preview_git_skill.py](scripts/preview_git_skill.py)**: Preview the skills available in a git repository, e.g. `python scripts/preview_git_skill.py https://github.com/<owner>/<repo>`.
- **[scripts/import_skills.py](scripts/import_skills.py)**: Import skills globally or into the current project. Use `--repo-or-url` with optional repeatable `--skill` for repo installs, `--file` for `.skill`/`.zip` packages, and `--path <cwd>` for project-scoped installs (omit `--path` for global).
- **[scripts/create_thread.py](scripts/create_thread.py)**: Create a new chat thread. Optional `--project-id`, `--agent-id`, `--model`, and `--json` for raw output.
- **[scripts/send_thread_message.py](scripts/send_thread_message.py)**: Send text and/or repeatable local `--image` files to an existing idle thread through the existing `chat()` API. Waits for `chat()` to finish, then prints text from the last returned message. Throws an error instead of queueing when the thread is busy.
- **[scripts/list_running_threads.py](scripts/list_running_threads.py)**: List currently running (streaming) threads. Supports `--json` for raw output.
- **[scripts/list_projects.py](scripts/list_projects.py)**: List projects. Optional `--filter`, `--page`, `--size`, and `--json` for raw output.
- **[scripts/chat_history_list.py](scripts/chat_history_list.py)**: List recent chat threads (normal and project threads grouped by project). Optional `--since`, `--until`, `--limit`, and `--include-cron` (cron-created threads are excluded by default).
- **[scripts/chat_history_read.py](scripts/chat_history_read.py)**: Read messages of a single thread by `--thread-id` (thread meta + plain-text messages). Optional `--limit`, `--since` for delta reads, and `--include-tools` for tool-call summaries.
- **[scripts/chat_history_search.py](scripts/chat_history_search.py)**: Keyword search across recent chat threads with `--query` (space-separated keywords are fuzzy-matched, all must appear), matching message content, thread titles and project names. Excerpts are grouped per thread with project info (if any), thread id and title. Optional `--since`, `--limit`, and `--thread-limit`.

The skills directory can be located via the `AIME_CHAT_SKILL_PATH` environment variable, so scripts can be run from anywhere as `python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/<script>.py"`.

Example:

```bash
python scripts/get_available_models.py --type embedding
python scripts/import_skills.py --repo-or-url https://github.com/resciencelab/opc-skills --skill skills/reddit --path "$PWD"
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/create_thread.py" --project-id <project-id>
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/send_thread_message.py" --thread-id <thread-id> --text "请总结当前进度" --image ./screenshot.png
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/list_running_threads.py"
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/list_projects.py" --filter my
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/chat_history_list.py" --since 2026-07-20
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/chat_history_read.py" --thread-id <thread-id>
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/chat_history_search.py" --query "关键词"
```
