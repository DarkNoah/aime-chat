# 获取可用 Agent

使用代码查询 Aime Chat 可用 Agent 时，API 地址从环境变量读取。`AIME_CHAT_API_BASE_URL` 由代码运行环境提供，例如：

```text
http://localhost:4133
```

下面所有请求都基于 `$AIME_CHAT_API_BASE_URL`。

```http
GET $AIME_CHAT_API_BASE_URL/api/agents/available-agents
```

需要先启用并启动 Aime Chat 的本机 API 服务。

## 优先使用代码请求

需要查询可用 Agent 时，优先执行代码发起 HTTP 请求。不要手写猜测 Agent 列表，也不要只根据记忆回答。

请求前先检查环境变量是否存在：

```py
import os

base = os.environ.get('AIME_CHAT_API_BASE_URL')
if not base:
    print('AIME_CHAT_API_BASE_URL is not set')
```

基础请求，并按文档输出样式提取 Agent ID 和描述：

```py
import os, json, urllib.request

base = os.environ.get('AIME_CHAT_API_BASE_URL')
if not base:
    print('AIME_CHAT_API_BASE_URL is not set')
else:
    with urllib.request.urlopen(base.rstrip('/') + '/api/agents/available-agents') as r:
        data = json.load(r)
    print('AVAILABLE AGENTS:')
    for agent in data:
        print(f" - [{agent.get('id')}]: {agent.get('description') or ''}")
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
- `isHidden` 为 `true` 的 Agent 仍可能出现在接口结果中；如果调用场景明确只需要对用户展示的 Agent，再自行过滤。
- `tools` 会合并内置 Agent 默认工具和用户配置工具，并去重。
- `subAgents` 会合并内置 Agent 默认子 Agent 和用户配置子 Agent，并去重。
- `type` 通常为 `build_in`、`custom` 或 `a2a`。
- 没有可用 Agent 时返回空数组 `[]`。
