---
name: aime-chat-docs
description: Aime Chat usage and configuration docs with ready-to-run local API scripts. Use when the user asks how Aime Chat features are configured, especially assistant personalities, SOUL.md files, local voices, available model discovery, available Agent discovery, available tool discovery, skill import/management, and PTC (Programmatic Tool Calling) in CodeExecution. Includes Python scripts under scripts/ for calling the Aime Chat local API (list models, Agents, tools, preview and import skills).
---

# Aime Chat Docs

Use this skill when answering questions about Aime Chat configuration and feature conventions.

## Reference Index

- **Assistant personalities**: Read [references/create-personality.md](references/create-personality.md) when explaining how to create or edit an assistant personality, how `SOUL.md` front matter works, or where avatars live.
- **Local voices**: Read [references/create-local-voice.md](references/create-local-voice.md) when explaining how to create local voice folders under user data, what files are required, or how voice IDs are derived.
- **Skill management**: Read [references/manage-skills.md](references/manage-skills.md) when explaining how to create or add Aime Chat skills globally or for the current project.
- **Available models**: Read [references/get-available-models.md](references/get-available-models.md) when explaining how to list configured provider models through the local API server.
- **Available Agents**: Read [references/get-available-agents.md](references/get-available-agents.md) when explaining how to list enabled Agents through the local API server.
- **Available tools**: Read [references/get-available-tools.md](references/get-available-tools.md) when explaining how to list enabled tools through the local API server.
- **PTC (Programmatic Tool Calling)**: Read [references/use-ptc.md](references/use-ptc.md) when explaining how to use the CodeExecution PTC mode to call tools programmatically in code, batch tool calls in a loop, call ChatCompletion inside code, or report progress via the Message tool.

## API Scripts

The `scripts/` folder contains standalone Python scripts (standard library only, Python 3) for the Aime Chat local API. All scripts read the API base URL from the `AIME_CHAT_API_BASE_URL` environment variable and require the local API server to be enabled and running. Prefer running these scripts over hand-writing HTTP requests.

- **[scripts/get_available_models.py](scripts/get_available_models.py)**: List configured provider models. Supports `--type` (`llm`, `embedding`, `reranker`, `image_generation`, `transcription`, `speech`, `ocr`, `music`) and `--json` for raw output.
- **[scripts/get_available_agents.py](scripts/get_available_agents.py)**: List enabled Agents as `- [<agent-id>]: <description>`. Supports `--visible-only` to exclude hidden Agents and `--json` for raw output.
- **[scripts/get_available_tools.py](scripts/get_available_tools.py)**: List enabled tools grouped by type (`mcp`, `build-in`, `skill`), expanding toolkit sub-tools. Supports `--json` for raw output.
- **[scripts/preview_git_skill.py](scripts/preview_git_skill.py)**: Preview the skills available in a git repository, e.g. `python scripts/preview_git_skill.py https://github.com/<owner>/<repo>`.
- **[scripts/import_skills.py](scripts/import_skills.py)**: Import skills globally or into the current project. Use `--repo-or-url` with optional repeatable `--skill` for repo installs, `--file` for `.skill`/`.zip` packages, and `--path <cwd>` for project-scoped installs (omit `--path` for global).

Example:

```bash
python scripts/get_available_models.py --type embedding
python scripts/import_skills.py --repo-or-url https://github.com/resciencelab/opc-skills --skill skills/reddit --path "$PWD"
```
