# 创建会话

接口：

```http
POST $AIME_CHAT_API_BASE_URL/api/threads/create-thread
```

API 地址从环境变量 `AIME_CHAT_API_BASE_URL` 读取，需要先启用并启动 Aime Chat 的本机 API 服务。

## 优先运行脚本

需要创建一个新会话时，优先运行 [scripts/create_thread.py](../scripts/create_thread.py)。技能目录可以用环境变量 `AIME_CHAT_SKILL_PATH` 定位。

```bash
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/create_thread.py"
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/create_thread.py" --project-id <project-id> --agent-id code-agent --model openai/gpt-4.1
```

参数均可选：

- `--project-id`：在指定项目下创建会话（对应 `resourceId: project:<id>`）
- `--agent-id`：会话默认 Agent
- `--model`：会话默认模型
- `--json`：输出原始 JSON

输出示例：

```text
Created thread [Kx3fA9dQz] New Chat
resourceId: project:my-project
agentId: code-agent
model: openai/gpt-4.1
```

## 返回结构

返回新建的会话对象：

```json
{
  "id": "Kx3fA9dQz",
  "title": "New Chat",
  "resourceId": "project:my-project",
  "metadata": { "agentId": "code-agent", "model": "openai/gpt-4.1" },
  "createdAt": "...",
  "updatedAt": "..."
}
```

如果不能执行代码、`AIME_CHAT_API_BASE_URL` 未设置或请求失败，说明失败原因即可。
