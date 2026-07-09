# 创建或更新 Agent

接口：

```http
POST $AIME_CHAT_API_BASE_URL/api/agents/save-agent
```

请求体是一个 Agent 对象。API 地址从环境变量 `AIME_CHAT_API_BASE_URL` 读取（例如 `http://localhost:4133`），由代码运行环境提供。需要先启用并启动 Aime Chat 的本机 API 服务。

## 创建 Agent 的推荐流程

创建 Agent 前不要凭记忆猜测工具和子 Agent，先按下面的顺序收集信息，再决定组合：

1. **查看当前可用工具**：运行 [scripts/get_available_tools.py](../scripts/get_available_tools.py)（参考 [get-available-tools.md](get-available-tools.md)）列出所有已启用工具，拿到完整工具 ID。需要确认某个工具的用途、输入参数或子工具时，用 [scripts/get_tool.py](../scripts/get_tool.py)（参考 [get-tool.md](get-tool.md)）查看详情。
2. **搜索是否有合适的技能（skill）**：可用 skill 会出现在 `get_available_tools.py` 输出的 `skill` 分组里，先在其中查找与任务匹配的技能。如果本地没有合适的 skill，可用 [scripts/preview_git_skill.py](../scripts/preview_git_skill.py) 预览远程仓库的技能，再用 [scripts/import_skills.py](../scripts/import_skills.py) 导入后重新查看可用工具。
3. **参考 CodeAgent 的默认配置**：把内置 `CodeAgent` 作为基线，了解一个通用编码 Agent 通常需要哪些工具与子 Agent（见下方“CodeAgent 默认配置参考”），据此增删得到目标 Agent 的组合。可用 [scripts/get_agent.py](../scripts/get_agent.py) `--id CodeAgent` 查看其实际配置。
4. **选定 tool 与 subAgent 组合**：结合任务目标，从第 1~3 步的结果中挑选 `--tool`（可含 `build-in:` 与 `skill:` 前缀）与 `--sub-agent`。只保留任务真正需要的项，避免堆砌无关工具。
5. **通过 save-agent 接口创建**：用 [scripts/save_agent.py](../scripts/save_agent.py) 提交，`--id/--name/--description/--instructions` 为必填，工具与子 Agent 通过可重复的 `--tool`、`--sub-agent` 传入。

以此为基线，删掉与目标任务无关的工具、加上任务特有的 skill，即可得到更聚焦的 Agent。以实际运行 `get_agent.py --id CodeAgent` 的结果为准。

## 优先运行脚本

需要新建或修改 Agent 时，优先运行 [scripts/save_agent.py](../scripts/save_agent.py)。不要手写猜测请求体。修改前可先用 [scripts/get_available_agents.py](../scripts/get_available_agents.py) 拿到目标 Agent 的 `id` 和现有字段。

```bash
# 新建或更新一个 Agent
python scripts/save_agent.py --id my-agent --name "My Agent" \
    --description "Does things" --instructions "You are helpful." \
    --tool build-in:Bash --tool build-in:Read
```

复用已存在的 `--id` 会更新该 Agent，使用新的 `--id` 会创建一个 `custom` 类型 Agent。保存的 Agent 始终为启用状态（`isActive` 固定为 `true`）。

如果不能执行代码、`AIME_CHAT_API_BASE_URL` 未设置，或请求失败，再说明失败原因。

## 参数

必填：

- `--id`：Agent ID，只能包含英文字母、数字、`-`、`_`，不能有空格或其他特殊字符。
- `--name`：显示名称。
- `--description`：描述。
- `--instructions`：系统提示词。

可选：

- `--suggestion`：提示建议，可重复。
- `--tool`：工具 ID，可重复，如 `build-in:Bash`、`skill:local:xlsx`。用 `get_available_tools.py` 获取完整工具 ID。
- `--sub-agent`：子 Agent ID，可重复。

请求体示例：

```json
{
  "id": "my-agent",
  "name": "My Agent",
  "description": "Does things",
  "instructions": "You are helpful.",
  "tools": ["build-in:Bash", "build-in:Read"],
  "isActive": true
}
```

## 返回结构

接口返回保存后的 Agent 对象：

```json
{
  "id": "my-agent",
  "name": "My Agent",
  "description": "Does things",
  "instructions": "You are helpful.",
  "tools": ["build-in:Bash", "build-in:Read"],
  "type": "custom",
  "isActive": true
}
```

注意：

- 新建的 Agent 类型为 `custom`。
- `build-in:` 前缀的工具会在保存时校验，无法构建的会被忽略。
- 只有 `custom` 类型的 Agent 能被删除；内置 Agent 可更新但不可删除。
- 脚本输出格式为 `Saved agent [<agent-id>] <name>`。
```
