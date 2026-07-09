# 获取单个 Agent 详情

接口：

```http
GET $AIME_CHAT_API_BASE_URL/api/agents/get-agent?id=<agent-id>
```

API 地址从环境变量 `AIME_CHAT_API_BASE_URL` 读取（例如 `http://localhost:4133`），由代码运行环境提供。需要先启用并启动 Aime Chat 的本机 API 服务。

## 优先运行脚本

需要查看某个 Agent 的完整配置（说明、工具、子 Agent、提示建议等）时，优先运行 [scripts/get_agent.py](../scripts/get_agent.py)。先用 [scripts/get_available_agents.py](../scripts/get_available_agents.py) 拿到 Agent 的 `id`，再传给本脚本。

```bash
python scripts/get_agent.py --id code-agent          # 格式化详情
python scripts/get_agent.py --id code-agent --json   # 原始 JSON
```

`--id` 为必填项，取值是 Agent ID，例如 `code-agent`、`default`。

输出示例：

```text
[code-agent] Code Agent
type: build_in
isActive: true
description: A code agent that can help with code related tasks.
tags: code

tools:
- build_in:Task

subAgents:
- explore
- plan

instructions:
...
```

如果不能执行代码、`AIME_CHAT_API_BASE_URL` 未设置、`id` 缺失或请求失败，再说明失败原因，并改用已有上下文中的信息回答。

## 查询参数

- `id`（必填）：Agent ID。通过查询参数传入，例如 `?id=code-agent`。

## 返回结构

返回单个 Agent 对象，字段与 `available-agents` 一致，并会解析 `instructions` 内容：

```json
{
  "id": "code-agent",
  "name": "Code Agent",
  "description": "A code agent that can help with code related tasks.",
  "instructions": "...",
  "isActive": true,
  "suggestions": [],
  "tools": ["build_in:Task"],
  "subAgents": ["explore", "plan"],
  "tags": ["code"],
  "type": "build_in",
  "defaultModelId": "openai/gpt-4.1",
  "greeting": "..."
}
```

注意：

- `id` 是完整 Agent ID，调用或修改 Agent 时优先使用这个值。
- Agent 不存在时接口会返回错误。
- `tools` 与 `subAgents` 会合并内置 Agent 默认项和用户配置项并去重。
- 需要查看某个 Agent 的完整 `instructions`、工具与子 Agent 时使用本接口，而不是 `available-agents`。
```
