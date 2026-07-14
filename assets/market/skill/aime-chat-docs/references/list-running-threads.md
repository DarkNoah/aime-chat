# 列出运行中的会话

接口：

```http
GET $AIME_CHAT_API_BASE_URL/api/threads/running-threads
```

API 地址从环境变量 `AIME_CHAT_API_BASE_URL` 读取，需要先启用并启动 Aime Chat 的本机 API 服务。

## 优先运行脚本

需要查看当前正在流式对话（运行中）的会话时，优先运行 [scripts/list_running_threads.py](../scripts/list_running_threads.py)。技能目录可以用环境变量 `AIME_CHAT_SKILL_PATH` 定位。

```bash
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/list_running_threads.py"
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/list_running_threads.py" --json
```

输出示例：

```text
RUNNING THREADS:
 - [Kx3fA9dQz] 修复登录问题 (agent: code-agent, model: openai/gpt-4.1)
```

没有运行中的会话时输出 `No running threads.`。

## 返回结构

返回会话数组，只包含正在运行的会话：

```json
[
  {
    "id": "Kx3fA9dQz",
    "title": "修复登录问题",
    "resourceId": "project:my-project",
    "agentId": "code-agent",
    "model": "openai/gpt-4.1",
    "status": "streaming"
  }
]
```

如果不能执行代码、`AIME_CHAT_API_BASE_URL` 未设置或请求失败，说明失败原因即可。
