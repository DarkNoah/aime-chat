# 获取可用工具

使用代码查询 Aime Chat 可用工具时，API 地址从环境变量读取。`AIME_CHAT_API_BASE_URL` 由代码运行环境提供，例如：

```text
http://localhost:4133
```

下面所有请求都基于 `$AIME_CHAT_API_BASE_URL`。

```http
GET $AIME_CHAT_API_BASE_URL/api/tools/available-tools
```

需要先启用并启动 Aime Chat 的本机 API 服务。

## 优先使用代码请求

需要查询可用工具时，优先执行代码发起 HTTP 请求。不要手写猜测工具列表，也不要只根据记忆回答。

请求前先检查环境变量是否存在：

```py
import os

base = os.environ.get('AIME_CHAT_API_BASE_URL')
if not base:
    print('AIME_CHAT_API_BASE_URL is not set')
```

基础请求，并按文档输出样式提取工具 ID 和描述：

```py
import os, json, urllib.request

base = os.environ.get('AIME_CHAT_API_BASE_URL')
if not base:
    print('AIME_CHAT_API_BASE_URL is not set')
else:
    with urllib.request.urlopen(base.rstrip('/') + '/api/tools/available-tools') as r:
        data = json.load(r)
    for group, items in data.items():
        print(group.upper() + ':')
        for item in items:
            if item.get('isToolkit'):
                for t in item.get('tools') or []:
                    print(f"- [{t.get('id')}]: {t.get('description') or ''}")
            else:
                print(f"- [{item.get('id')}]: {item.get('description') or ''}")
        print()
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
