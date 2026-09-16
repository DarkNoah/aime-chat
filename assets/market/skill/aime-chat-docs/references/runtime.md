# 管理 Runtime 环境

查询 Aime Chat 的 runtime 状态、路径、版本，或按用户要求安装、重装、卸载环境时使用本说明。优先运行 [scripts/runtime.py](../scripts/runtime.py)，只需 Python 3 标准库。

API 地址由 `AIME_CHAT_API_BASE_URL` 提供，需启用并启动 Aime Chat 的本机 API 服务。不要猜测端口。

## 列出环境

```bash
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/runtime.py" list
```

返回 JSON 数组，每项含 `id`、`name`、`status`、`installed`、可用时的 `path` / `dir` / `version`，以及 `dependencies`、`supportedActions`。Node.js 另有 `npmVersion`；UV 的 `pythonRuntime` 包含独立 Python 环境及 pip 的状态、路径和版本。字段缺失表示尚未检测到，不应编造路径或版本。

默认刷新实际状态；`list --cached` 只读缓存。操作执行期间查询返回缓存，目标环境的 `operation` 为 `install`、`reinstall` 或 `uninstall`；此时以 `operation` 判断是否仍在执行，不将旧的 `installed` 当作操作结果。

| id | 环境 | 安装前置条件 | 支持操作 |
| --- | --- | --- | --- |
| `uv` | UV 及独立 Python 环境 | 无 | 安装、重装、卸载 |
| `bun` | Bun | 无 | 安装、重装、卸载 |
| `node` | 系统 Node.js | 无 | 安装；已有 Node 时复用 |
| `paddleOcr` | PaddleOCR | UV 已安装 | 安装、重装、卸载 |
| `qwenAudio` | QwenAudio | UV 已安装 | 安装、重装、卸载 |
| `agentBrowser` | Agent Browser | Node.js 和 npm 可用 | 安装、重装、卸载 |

Node.js 使用系统安装或用户 NVM，不由 Aime Chat 提供重装、卸载。以服务器返回的 `supportedActions` 为准；不绕过接口删除系统 Node。

## 安装、重装、卸载

```bash
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/runtime.py" install uv
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/runtime.py" install qwenAudio
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/runtime.py" reinstall bun
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/runtime.py" uninstall paddleOcr
```

将最后一个参数替换为表中的准确 `id`，区分大小写。查询请求不授权安装或卸载；用户已明确要求某项操作时直接执行，无需重复确认。安装依赖时按顺序执行，接口不自动安装依赖。

- **安装**：调用现有安装流程，结束后验证目标环境；UV 安装还检查独立 Python 环境是否可用。
- **重装**：先检查依赖，再卸载目标环境，确认移除后重新安装。安装失败不会回滚到旧环境；报告失败并查询状态后再决定下一步。
- **卸载**：删除对应运行环境，不删除已下载的模型目录。卸载 UV 也删除独立 `python-runtime` 环境；PaddleOCR / QwenAudio 的目录不会级联删除，但会因缺少 UV 而不可用。Agent Browser 通过 `npm uninstall -g agent-browser` 移除全局 CLI，不承诺删除浏览器下载缓存。

操作请求等待完成并返回该环境的状态对象；失败走 HTTP 错误响应，脚本以非零状态退出。成功后可再运行 `list`，核对版本和依赖环境状态。

安装可能需要下载较大依赖。操作脚本默认等待 1800 秒，可用 `--timeout 3600` 延长。超时或断连不代表取消，不要自动重试重装或卸载；先用 `list --cached` 查看 `operation`，结束后用 `list` 刷新状态。收到 HTTP 409 表示缺少依赖或已有 runtime 操作在执行，按错误信息处理。

## API 约定

```http
GET  /api/runtime/list?refresh=true
POST /api/runtime/install
POST /api/runtime/reinstall
POST /api/runtime/uninstall
```

POST 请求体为 `{"pkg":"bun"}`。`refresh` 默认为 `true`，可传 `true` / `false` / `1` / `0`。无效参数或不支持的操作返回 HTTP 400；依赖不足、操作冲突返回 409；安装、卸载或验证失败返回 500。错误体沿用本机 API 的 `{ "success": false, "message": "..." }` 格式。
