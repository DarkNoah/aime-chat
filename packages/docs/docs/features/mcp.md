---
sidebar_position: 5
---

# MCP 协议

AIME Chat 完全支持 **Model Context Protocol (MCP)**，这是一个开放协议，允许 AI 应用连接各种数据源和工具。

## 什么是 MCP？

MCP (Model Context Protocol) 是一个开放的标准协议，用于连接 AI 应用与外部数据源和工具。它提供了一种标准化的方式，让 AI Agent 能够：

- 访问外部数据源
- 调用第三方服务
- 扩展功能能力
- 保持接口一致性

### MCP 的优势

| 优势 | 说明 |
|------|------|
| **标准化** | 统一的接口规范，易于集成 |
| **可扩展** | 支持自定义工具和数据源 |
| **安全性** | 内置权限控制和验证机制 |
| **社区支持** | 丰富的社区工具和服务器 |
| **跨平台** | 支持多种编程语言和平台 |

## MCP 架构

```
┌──────────────────────────────────────┐
│         AIME Chat                   │
├──────────────────────────────────────┤
│         MCP Client                  │
│  ┌────────────────────────────────┐ │
│  │  Tool Discovery & Management  │ │
│  └────────────────────────────────┘ │
├──────────────────────────────────────┤
│         MCP Protocol                │
│  ┌────────────────────────────────┐ │
│  │  Standard Communication Layer  │ │
│  └────────────────────────────────┘ │
├──────────────────────────────────────┤
│         MCP Servers                 │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ │
│  │File │ │Git  │ │DB   │ │Custom│ │
│  └─────┘ └─────┘ └─────┘ └─────┘ │
└──────────────────────────────────────┘
```

## MCP 核心概念

### MCP Client

MCP 客户端负责：
- 发现和管理 MCP 服务器
- 与服务器通信
- 暴露工具给 Agent
- 处理工具调用

### MCP Server

MCP 服务器提供：
- 工具定义和描述
- 工具执行逻辑
- 资源访问
- 事件通知

### Tools

MCP 工具是可被 Agent 调用的功能单元：
- 输入参数定义
- 输出格式规范
- 执行逻辑
- 错误处理

### Resources

MCP 资源是可被访问的数据：
- 文件
- 数据库记录
- API 响应
- 其他数据源

## 配置 MCP 服务器

### 基本配置

1. 进入 **工具** → **添加MCP服务器**
2. 填写服务器配置：

### Stdio模式导入

```json
{
  "mcpServers": {
    "autoglm-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "autoglm-mcp-server"
      ],
      "env": {
        "AUTOGLM_API_KEY": "<your_api_key>"
      }
    }
  }
}
```

### Stdio 配置参数说明

| 参数 | 说明 | 必需 |
|------|------|------|
| `command` | 启动命令 | ✅ |
| `args` | 命令参数 | ✅ |
| `env` | 环境变量 | ❌ |


### StreamableHttp / SSE 模式导入

```json
{
  "mcpServers": {
    "web-reader": {
      "url": "https://open.bigmodel.cn/api/mcp/web_reader/mcp",
      "headers": {
        "Authorization": "<your_api_key>"
      }
    }
  }
}
```

### StreamableHttp / SSE 配置参数说明

| 参数 | 说明 | 必需 |
|------|------|------|
| `url` | 启动命令 | ✅ |
| `headers` | 命令参数 | ❌ |



### 配置示例

#### chrome_devtools

```json
{
  "mcpServers": {
    "chrome_devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest"
      ],
    }
  }
}
```

## 常用 MCP 集合平台

- [https://playbooks.com/mcp](https://playbooks.com/mcp)
- [https://mcp.so/](https://mcp.so/)


### 社区服务器

更多社区开发的 MCP 服务器可以在 [MCP Registry](https://modelcontextprotocol.io/servers) 找到。

## 使用 MCP 工具

### 自动发现

配置 MCP 服务器后，工具会自动出现在工具列表中：

1. 进入 **工具** → **MCP**
2. 启用需要的工具

## 故障排除

### 服务器无法启动

**检查清单**：
- [ ] 命令路径正确
- [ ] 依赖已安装
- [ ] 环境变量配置正确
- [ ] 端口未被占用

### 工具调用失败

**常见原因**：
1. 参数格式错误
2. 权限不足
3. 服务器未响应
4. 网络问题

**调试步骤**：
1. 查看服务器日志
2. 验证参数格式
3. 检查权限设置
4. 测试网络连接

### 性能问题

**优化建议**：
1. 减少数据传输量
2. 使用缓存机制
3. 优化查询性能
4. 考虑使用连接池

## 资源链接

- [MCP 官方文档](https://modelcontextprotocol.io/)
- [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP 服务器列表](https://modelcontextprotocol.io/servers)
- [MCP 示例](https://github.com/modelcontextprotocol/servers)

## 技术细节

### MCP 协议消息格式

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "my_tool",
    "arguments": {
      "param1": "value1"
    }
  }
}
```

### 与 Mastra 框架集成

AIME Chat 的 MCP 支持完全基于 Mastra 框架：

- Mastra MCP Client
- Mastra Tool Registry
- Mastra Server Management

详细技术文档请参考 [Mastra 官方文档](https://mastra.ai/docs)。
