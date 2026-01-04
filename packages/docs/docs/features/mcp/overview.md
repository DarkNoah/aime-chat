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

1. 进入 **设置** → **MCP**
2. 点击 **添加服务器**
3. 填写服务器配置：

```json
{
  "name": "my-mcp-server",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem"],
  "env": {
    "ALLOWED_DIRECTORIES": "/path/to/directory"
  }
}
```

### 配置参数说明

| 参数 | 说明 | 必需 |
|------|------|------|
| `name` | 服务器名称 | ✅ |
| `command` | 启动命令 | ✅ |
| `args` | 命令参数 | ❌ |
| `env` | 环境变量 | ❌ |

### 配置示例

#### 文件系统服务器

```json
{
  "name": "filesystem",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem"],
  "env": {
    "ALLOWED_DIRECTORIES": "/Users/username/projects"
  }
}
```

#### GitHub 服务器

```json
{
  "name": "github",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "your_token_here"
  }
}
```

#### PostgreSQL 服务器

```json
{
  "name": "postgres",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-postgres"],
  "env": {
    "POSTGRES_CONNECTION_STRING": "postgresql://user:pass@localhost/db"
  }
}
```

## 常用 MCP 服务器

### 官方服务器

| 服务器 | 功能 | 安装命令 |
|--------|------|----------|
| `@modelcontextprotocol/server-filesystem` | 文件系统访问 | `npx -y @modelcontextprotocol/server-filesystem` |
| `@modelcontextprotocol/server-github` | GitHub 操作 | `npx -y @modelcontextprotocol/server-github` |
| `@modelcontextprotocol/server-slack` | Slack 集成 | `npx -y @modelcontextprotocol/server-slack` |
| `@modelcontextprotocol/server-postgres` | PostgreSQL | `npx -y @modelcontextprotocol/server-postgres` |
| `@modelcontextprotocol/server-puppeteer` | 网页自动化 | `npx -y @modelcontextprotocol/server-puppeteer` |
| `@modelcontextprotocol/server-brave-search` | Brave 搜索 | `npx -y @modelcontextprotocol/server-brave-search` |

### 社区服务器

更多社区开发的 MCP 服务器可以在 [MCP Registry](https://modelcontextprotocol.io/servers) 找到。

## 使用 MCP 工具

### 自动发现

配置 MCP 服务器后，工具会自动出现在工具列表中：

1. 进入 **设置** → **工具**
2. 查找以 `mcp:` 开头的工具
3. 启用需要的工具

### 在 Agent 中使用

在 Agent 配置中选择 MCP 工具：

```typescript
{
  "name": "GitHub Agent",
  "tools": [
    "mcp:github:create_issue",
    "mcp:github:list_issues",
    "mcp:github:get_repository"
  ]
}
```

### 调用示例

```
用户：帮我创建一个 GitHub issue

Agent：[使用 mcp:github:create_issue 工具]
{
  "owner": "username",
  "repo": "repository",
  "title": "Bug report",
  "body": "Description of the bug"
}
```

## 开发自定义 MCP 服务器

### 快速开始

创建一个简单的 MCP 服务器：

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// 创建服务器实例
const server = new Server({
  name: 'my-custom-server',
  version: '1.0.0'
});

// 注册工具列表
server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'calculate',
      description: '执行数学计算',
      inputSchema: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: '数学表达式'
          }
        },
        required: ['expression']
      }
    }
  ]
}));

// 注册工具调用
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'calculate') {
    try {
      const result = eval(args.expression);
      return {
        content: [{
          type: 'text',
          text: `结果: ${result}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `错误: ${error.message}`
        }],
        isError: true
      };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

// 启动服务器
const transport = new StdioServerTransport();
await server.connect(transport);
```

### 服务器类型

MCP 支持多种服务器类型：

| 类型 | 说明 | 适用场景 |
|------|------|----------|
| **stdio** | 标准输入输出 | 本地进程 |
| **SSE** | Server-Sent Events | Web 应用 |
| **WebSocket** | WebSocket 连接 | 实时通信 |

### 工具定义

完整的工具定义示例：

```typescript
{
  name: 'my_tool',
  description: '工具描述',
  inputSchema: {
    type: 'object',
    properties: {
      param1: {
        type: 'string',
        description: '参数1描述'
      },
      param2: {
        type: 'number',
        description: '参数2描述',
        default: 0
      }
    },
    required: ['param1']
  }
}
```

### 资源定义

定义可访问的资源：

```typescript
server.setRequestHandler('resources/list', async () => ({
  resources: [
    {
      uri: 'file:///path/to/file.txt',
      name: 'My File',
      description: '文件描述',
      mimeType: 'text/plain'
    }
  ]
}));

server.setRequestHandler('resources/read', async (request) => {
  const { uri } = request.params;
  const content = await readFile(uri);
  return {
    contents: [{
      uri,
      mimeType: 'text/plain',
      text: content
    }]
  };
});
```

## MCP 最佳实践

### 安全性

1. **验证输入**：始终验证工具参数
2. **限制权限**：只暴露必要的功能
3. **使用环境变量**：敏感信息通过环境变量传递
4. **日志记录**：记录所有操作用于审计

### 性能优化

1. **缓存结果**：缓存频繁访问的数据
2. **异步处理**：使用异步操作避免阻塞
3. **批量操作**：支持批量请求减少往返
4. **错误处理**：优雅处理错误情况

### 用户体验

1. **清晰的描述**：提供详细的工具描述
2. **示例参数**：提供参数示例
3. **错误信息**：提供有用的错误信息
4. **进度反馈**：长时间操作提供进度更新

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

## 进阶主题

### MCP 服务器发布

将自定义服务器发布到 npm：

```bash
# 1. 初始化项目
npm init -y

# 2. 安装依赖
npm install @modelcontextprotocol/sdk

# 3. 编写服务器代码
# (参考上面的示例)

# 4. 发布到 npm
npm publish
```

### MCP 服务器测试

使用 MCP 测试工具：

```bash
# 安装测试工具
npm install -g @modelcontextprotocol/inspector

# 测试服务器
mcp-inspector npx -y @modelcontextprotocol/server-filesystem
```

### MCP 协议版本

MCP 协议持续演进，关注最新版本：
- 查看官方文档
- 关注更新日志
- 参与社区讨论

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
