# 获取单个工具详情

接口：

```http
GET $AIME_CHAT_API_BASE_URL/api/tools/get-tool?id=<tool-id>
```

API 地址从环境变量 `AIME_CHAT_API_BASE_URL` 读取（例如 `http://localhost:4133`），由代码运行环境提供。需要先启用并启动 Aime Chat 的本机 API 服务。

## 优先运行脚本

需要查看某个工具的详情（子工具、输入参数、状态等）时，优先运行 [scripts/get_tool.py](../scripts/get_tool.py)。先用 [scripts/get_available_tools.py](../scripts/get_available_tools.py) 拿到完整工具 `id`，再传给本脚本。

```bash
python scripts/get_tool.py --id skill:local:xlsx   # 格式化详情
python scripts/get_tool.py --id mcp:filesystem --json  # 原始 JSON
```

`--id` 为必填项，取值是完整工具 ID，例如 `skill:local:xlsx`、`mcp:filesystem`、`build-in:Bash`。

输出示例：

```text
[build-in:Bash] Bash
type: build-in
isActive: true
description: Run shell commands.

tools:
- [build-in:Bash]: Run shell commands.
```

如果不能执行代码、`AIME_CHAT_API_BASE_URL` 未设置、`id` 缺失或请求失败，再说明失败原因，并改用已有上下文中的信息回答。

## 查询参数

- `id`（必填）：完整工具 ID。通过查询参数传入，例如 `?id=skill:local:xlsx`。

## 返回结构

返回单个工具对象，字段随工具类型不同而略有差异：

- 公共字段：`id`、`name`、`description`、`isActive`、`type`。
- `mcp` 工具额外包含 `status`、`error`、`version`、`isToolkit`，以及 `tools[]`（每个子工具带 `id`、`name`、`description`、`inputSchema`）。
- `build-in` 工具包含 `isToolkit` 与 `tools[]`（子工具带 `inputSchema`）。
- `skill` 工具返回 skill 元信息与 `isActive`。

MCP 工具包示例：

```json
{
  "id": "mcp:filesystem",
  "name": "filesystem",
  "description": "Filesystem tools.",
  "isActive": true,
  "isToolkit": true,
  "type": "mcp",
  "status": "running",
  "version": "1.0.0",
  "tools": [
    {
      "id": "mcp:filesystem:read_file",
      "name": "read_file",
      "description": "Read a file from the filesystem.",
      "inputSchema": { "type": "object", "properties": {} }
    }
  ]
}
```

注意：

- `id` 是完整工具 ID，启用工具、配置 Agent 工具或调用工具时优先使用这个值。
- 工具不存在时接口会返回错误。
- 需要工具的输入参数（`inputSchema`）时使用本接口，而不是 `available-tools`。
```
