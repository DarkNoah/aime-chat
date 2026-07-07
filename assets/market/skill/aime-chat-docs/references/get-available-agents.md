# 获取可用 Agent

接口：

```http
GET $AIME_CHAT_API_BASE_URL/api/agents/available-agents
```

API 地址从环境变量 `AIME_CHAT_API_BASE_URL` 读取（例如 `http://localhost:4133`），由代码运行环境提供。需要先启用并启动 Aime Chat 的本机 API 服务。

## 优先运行脚本

需要查询可用 Agent 时，优先运行 [scripts/get_available_agents.py](../scripts/get_available_agents.py)。不要手写猜测 Agent 列表，也不要只根据记忆回答。

```bash
python scripts/get_available_agents.py                 # 格式化列表
python scripts/get_available_agents.py --visible-only  # 过滤 isHidden 的 Agent
python scripts/get_available_agents.py --json          # 输出原始 JSON
```

输出示例：

```text
AVAILABLE AGENTS:
 - [default]: General purpose assistant.
 - [code-agent]: A code agent that can help with code related tasks.
```

如果不能执行代码、`AIME_CHAT_API_BASE_URL` 未设置，或请求失败，再说明失败原因，并改用已有上下文中的信息回答。

## 查询参数

此接口不需要查询参数。

## 返回结构

接口返回 Agent 数组。只返回当前启用的 Agent：

```json
[
  {
    "id": "code-agent",
    "name": "Code Agent",
    "description": "A code agent that can help with code related tasks.",
    "instructions": "...",
    "isActive": true,
    "suggestions": [],
    "tools": [
      "build_in:Task"
    ],
    "subAgents": [
      "explore",
      "plan"
    ],
    "tags": [
      "code"
    ],
    "type": "build_in",
    "isHidden": false,
    "defaultModelId": "openai/gpt-4.1",
    "greeting": "..."
  }
]
```

注意：

- `id` 是完整 Agent ID，调用或展示 Agent 时优先使用这个值。
- `isActive` 为 `true` 的 Agent 才会出现在返回结果里。
- 默认输出格式为 `AVAILABLE AGENTS:` 加 ` - [<agent-id>]: <description>` 列表。
- `isHidden` 为 `true` 的 Agent 仍可能出现在接口结果中；如果调用场景明确只需要对用户展示的 Agent，使用 `--visible-only` 过滤。
- `tools` 会合并内置 Agent 默认工具和用户配置工具，并去重。
- `subAgents` 会合并内置 Agent 默认子 Agent 和用户配置子 Agent，并去重。
- `type` 通常为 `build_in`、`custom` 或 `a2a`。
- 没有可用 Agent 时返回空数组 `[]`。
