---
sidebar_position: 5
---

# MCP 服务器

AIME Chat 可以作为 MCP 客户端连接本地或远程服务器，并把服务器暴露的工具交给 Agent 使用。当前支持手动填写、导入 JSON，以及安装 `.mcpb`（MCP Bundle）三种方式。

:::warning 运行边界
MCP 服务器和 MCP Bundle 可能在当前用户权限下执行本地程序、访问文件或调用网络服务。只添加可信来源，并在启用工具前核对命令、地址、权限和所需密钥。
:::

## 添加服务器

进入 **工具 → 添加 MCP**，然后选择一种配置方式。

### 手动配置

本地进程使用 **Stdio**：

| 字段 | 说明 |
| --- | --- |
| 名称 | 在 AIME Chat 中显示的服务器名称 |
| 命令 | 启动服务器的可执行文件，例如 `npx`、`uvx` 或绝对路径 |
| 参数 | 每行一个命令行参数 |
| 环境变量 | 每行一个 `KEY=VALUE` |

远程服务器使用 **Streamable HTTP / SSE**：

| 字段 | 说明 |
| --- | --- |
| 名称 | 在 AIME Chat 中显示的服务器名称 |
| URL | MCP 服务地址 |
| Headers | JSON 对象；不需要请求头时填写 `{}` |

### 导入 JSON

Stdio 示例：

```json
{
  "mcpServers": {
    "example-local": {
      "command": "npx",
      "args": ["-y", "example-mcp-server"],
      "env": {
        "EXAMPLE_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

Streamable HTTP / SSE 示例：

```json
{
  "mcpServers": {
    "example-remote": {
      "url": "https://example.com/mcp",
      "headers": {
        "Authorization": "Bearer <your-token>"
      }
    }
  }
}
```

不要把真实密钥提交到仓库、截图或公开日志中。若服务器由第三方提供，请以其文档给出的命令、参数和认证方式为准。

## 导入 MCP Bundle

`.mcpb` 会把服务器清单、运行文件和用户配置打包在一起。你可以：

- 在 **工具 → 添加 MCP → MCP Bundle** 中选择文件；
- 或把 `.mcpb` 文件直接拖入 AIME Chat 窗口。

安装前，AIME Chat 会显示名称、版本、作者、服务器类型、工具列表和支持的平台。按清单填写必需配置后才能安装；与当前系统不兼容的包会被阻止。

若同名 Bundle 已安装，界面会提示重装或升级。新版本会先在临时目录完成解包和配置校验，成功后再替换工具配置；配置生成失败时会清理本次安装文件。即便如此，Bundle 中的程序仍属于第三方代码，安装前应自行确认来源。

## 让 Agent 使用 MCP 工具

服务器保存成功后：

1. 回到 **工具** 页面，确认服务器及所需工具已启用。
2. 在 Agent 配置中选择相应 MCP 工具。
3. 发起新对话，并在工具调用前检查参数和目标。

工具是否可用还取决于服务器能否启动、网络是否可达、认证是否有效，以及当前 Agent 的工具选择。

## 故障排除

### 本地服务器无法启动

- 在终端确认 `command` 可执行，并检查其是否位于应用可见的 `PATH` 中。
- 核对参数是否逐行填写，环境变量是否使用 `KEY=VALUE`。
- 使用相对路径时，确认服务器对工作目录没有额外假设；必要时改用绝对路径。
- 查看工具页显示的错误信息和服务器日志。

### 远程服务器连接失败

- 确认 URL、网络和代理设置。
- 确认 Headers 是合法 JSON，认证值没有过期。
- 核对服务端支持的传输方式是 Streamable HTTP 还是 SSE。

### Bundle 无法安装

- 确认扩展名为 `.mcpb`，文件没有损坏。
- 检查预览中的平台兼容性和所有必填配置。
- 同名版本异常时，重新选择 Bundle 并执行重装；旧工具配置只有在新安装成功后才会被替换。

## 进一步阅读

- [MCP 官方文档](https://modelcontextprotocol.io/)
- [MCP Registry](https://modelcontextprotocol.io/registry/about)
- [MCP 示例](https://modelcontextprotocol.io/examples)
