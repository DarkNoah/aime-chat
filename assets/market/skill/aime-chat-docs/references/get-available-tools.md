# 获取可用工具

接口：

```http
GET $AIME_CHAT_API_BASE_URL/api/tools/available-tools
```

API 地址从环境变量 `AIME_CHAT_API_BASE_URL` 读取（例如 `http://localhost:4133`），由代码运行环境提供。需要先启用并启动 Aime Chat 的本机 API 服务。

## 优先运行脚本

需要查询可用工具时，优先运行 [scripts/get_available_tools.py](../scripts/get_available_tools.py)。不要手写猜测工具列表，也不要只根据记忆回答。

```bash
python scripts/get_available_tools.py        # 按类型分组的格式化列表
python scripts/get_available_tools.py --json # 输出原始 JSON
```

输出示例：

```text
MCP:
- [mcp:filesystem:read_file]: Read a file from the filesystem.

BUILD-IN:
- [build-in:Bash]: Run shell commands.
- [build-in:Read]: Read local files.

SKILL:
- [skill:local:xlsx]: Work with xlsx files.
```

如果不能执行代码、`AIME_CHAT_API_BASE_URL` 未设置，或请求失败，再说明失败原因，并改用已有上下文中的信息回答。

## 查询参数

此接口不需要查询参数。

## 返回结构

接口返回按工具类型分组的对象：

```json
{
  "mcp": [
    {
      "id": "mcp:filesystem",
      "name": "filesystem",
      "description": "Filesystem tools.",
      "isActive": true,
      "isToolkit": true,
      "type": "mcp",
      "tools": [
        {
          "id": "mcp:filesystem:read_file",
          "name": "read_file",
          "description": "Read a file from the filesystem."
        }
      ]
    }
  ],
  "build-in": [
    {
      "id": "build-in:Bash",
      "name": "Bash",
      "description": "Run shell commands.",
      "isActive": true,
      "isToolkit": false,
      "type": "build-in",
      "tools": []
    }
  ],
  "skill": [
    {
      "id": "skill:local:xlsx",
      "name": "xlsx",
      "description": "Work with xlsx files.",
      "isActive": true,
      "isToolkit": false,
      "type": "skill"
    }
  ]
}
```

注意：

- 顶层 key 是工具类型，当前包括 `mcp`、`build-in`、`skill`。
- `id` 是完整工具 ID，启用工具、配置 Agent 工具或调用工具时优先使用这个值。
- 默认只返回 `isActive` 为 `true` 的工具。
- `mcp` 只返回已启用且当前运行中的 MCP 工具；MCP 顶层工具通常是工具包，实际可用工具在 `tools` 数组里。
- `build-in` 工具会排除隐藏工具；如果 `isToolkit` 为 `true`，实际输出时使用 `tools[]` 里的子工具。
- `skill` 工具通常不是工具包，直接使用顶层 `id`。
- 默认输出格式按工具类型分组，分组标题为大写类型名，每个工具一行 `- [<tool-id>]: <description>`。
- 没有可用工具时，对应类型返回空数组。
