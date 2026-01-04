---
sidebar_position: 3
---

# 工具系统

AIME Chat 提供强大的工具系统，让 AI Agent 能够执行各种实际操作。基于 Mastra 框架的工具系统，Agent 可以自主调用工具来完成复杂任务。

## 工具系统架构

```
┌──────────────────────────────────────┐
│         AI Agent                     │
├──────────────────────────────────────┤
│         Tool System                  │
├──────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌────────┐ │
│  │  File   │ │  Code   │ │ Network│ │
│  │  Tools  │ │  Tools  │ │ Tools  │ │
│  └─────────┘ └─────────┘ └────────┘ │
├──────────────────────────────────────┤
│         MCP Protocol                 │
│  ┌─────────┐ ┌─────────┐ ┌────────┐ │
│  │ GitHub  │ │ Slack   │ │ Custom │ │
│  └─────────┘ └─────────┘ └────────┘ │
└──────────────────────────────────────┘
```

## 内置工具

### 文件系统工具

#### Read

读取文件内容，支持多种格式。

**参数**：
- `file_path`：文件路径（必需）

**示例**：
```typescript
// 读取 package.json
{
  "file_path": "/path/to/package.json"
}
```

**用途**：
- 查看代码文件
- 读取配置文件
- 检查文档内容

#### Write

写入文件内容，创建新文件或覆盖现有文件。

**参数**：
- `file_path`：文件路径（必需）
- `content`：文件内容（必需）

**示例**：
```typescript
// 创建新文件
{
  "file_path": "/path/to/new-file.txt",
  "content": "Hello, World!"
}
```

**用途**：
- 创建新文件
- 保存代码
- 生成文档

#### Edit

精确编辑文件内容，支持字符串替换。

**参数**：
- `file_path`：文件路径（必需）
- `old_string`：要替换的字符串（必需）
- `new_string`：新字符串（必需）
- `replace_all`：是否替换所有匹配项（可选）

**示例**：
```typescript
// 替换特定内容
{
  "file_path": "/path/to/file.js",
  "old_string": "const x = 1;",
  "new_string": "const x = 2;"
}
```

**用途**：
- 修改代码
- 更新配置
- 精确编辑

#### Grep

在文件中搜索内容，支持正则表达式。

**参数**：
- `pattern`：搜索模式（必需）
- `path`：搜索路径（可选）
- `glob`：文件过滤（可选）
- `output_mode`：输出模式（可选）

**示例**：
```typescript
// 搜索函数定义
{
  "pattern": "function\\s+\\w+",
  "path": "/path/to/src",
  "glob": "*.js"
}
```

**用途**：
- 查找代码
- 搜索关键词
- 代码审计

#### Glob

使用通配符查找文件。

**参数**：
- `pattern`：文件模式（必需）
- `path`：搜索路径（可选）

**示例**：
```typescript
// 查找所有 TypeScript 文件
{
  "pattern": "**/*.ts",
  "path": "/path/to/project"
}
```

**用途**：
- 查找特定文件
- 批量操作
- 文件管理

#### Bash

执行 shell 命令。

**参数**：
- `command`：命令（必需）
- `directory`：工作目录（可选）

**示例**：
```typescript
// 列出文件
{
  "command": "ls -la",
  "directory": "/path/to/project"
}
```

**用途**：
- 运行脚本
- 系统操作
- 构建项目

:::warning 安全提示
Bash 工具执行命令前会要求用户确认，特别是危险操作。
:::

### 代码执行工具

#### Python

执行 Python 代码，支持数据分析、计算等。

**参数**：
- `code`：Python 代码（必需）
- `packages`：需要安装的包（可选）

**示例**：
```python
# 数据分析
import pandas as pd
import numpy as np

data = pd.DataFrame({
    'A': [1, 2, 3],
    'B': [4, 5, 6]
})
print(data.describe())
```

**用途**：
- 数据处理
- 科学计算
- 机器学习

#### Node.js

执行 JavaScript/TypeScript 代码。

**参数**：
- `code`：JavaScript 代码（必需）

**示例**：
```javascript
// API 调用
const response = await fetch('https://api.example.com/data');
const data = await response.json();
console.log(data);
```

**用途**：
- Web 开发
- API 调用
- 脚本执行

### 网络工具

#### Web Fetch

获取网页内容或调用 API。

**参数**：
- `url`：URL（必需）
- `prompt`：处理提示（可选）

**示例**：
```typescript
{
  "url": "https://example.com",
  "prompt": "提取页面标题和主要内容"
}
```

**用途**：
- 抓取网页
- API 调用
- 数据采集

#### Web Search

搜索互联网获取最新信息。

**参数**：
- `query`：搜索查询（必需）

**示例**：
```typescript
{
  "query": "最新 AI 技术趋势 2024"
}
```

**用途**：
- 获取最新信息
- 研究资料
- 新闻查询

### 图像工具

#### Vision

分析图像内容，支持多种图像格式。

**参数**：
- `file_path`：图像文件路径（必需）

**示例**：
```typescript
{
  "file_path": "/path/to/image.png"
}
```

**用途**：
- 图像识别
- OCR 文字识别
- 场景分析

#### RMBG

移除图像背景。

**参数**：
- `file_path`：图像文件路径（必需）
- `save_path`：保存路径（必需）

**示例**：
```typescript
{
  "file_path": "/path/to/image.png",
  "save_path": "/path/to/output.png"
}
```

**用途**：
- 背景移除
- 图像处理
- 设计辅助

### 数据库工具

#### LibSQL

操作 LibSQL 数据库。

**参数**：
- `query`：SQL 查询（必需）
- `database`：数据库路径（可选）

**示例**：
```sql
SELECT * FROM users WHERE age > 18;
```

**用途**：
- 数据查询
- 数据管理
- 数据分析

### 任务管理工具

#### Todo

创建和管理任务列表。

**参数**：
- `todos`：任务列表（必需）

**示例**：
```typescript
{
  "todos": [
    {
      "content": "完成文档编写",
      "status": "pending",
      "activeForm": "正在编写文档"
    }
  ]
}
```

**用途**：
- 任务跟踪
- 进度管理
- 待办事项

#### Task

分解和执行复杂任务。

**参数**：
- `description`：任务描述（必需）
- `prompt`：详细指令（必需）

**示例**：
```typescript
{
  "description": "分析代码库",
  "prompt": "分析项目结构，找出所有 API 端点"
}
```

**用途**：
- 复杂任务分解
- 多步骤执行
- 自动化流程

## 工具配置

### 全局启用

1. 进入 **设置** → **工具**
2. 查看所有可用工具
3. 启用或禁用需要的工具

### 会话级别

在聊天输入框旁边：

1. 点击工具图标
2. 选择本次会话要使用的工具
3. 工具选择只影响当前会话

### Agent 级别

在 Agent 配置中：

1. 进入 **Agent 管理**
2. 选择或创建 Agent
3. 在工具配置中选择可用工具

:::tip 工具优先级
Agent 级别 > 会话级别 > 全局设置
:::

## MCP 协议支持

AIME Chat 支持 **Model Context Protocol (MCP)**，可以扩展第三方工具。

### 什么是 MCP？

MCP 是一个开放协议，允许 AI 应用连接各种数据源和工具。通过 MCP，您可以：

- 连接自定义工具服务器
- 使用社区开发的工具
- 构建自己的工具扩展
- 实现工具的标准化接口

### MCP 架构

```
┌──────────────────────────────────────┐
│         AIME Chat                   │
├──────────────────────────────────────┤
│         MCP Client                  │
├──────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌────────┐ │
│  │ GitHub  │ │ Slack   │ │ Custom │ │
│  │ Server  │ │ Server  │ │ Server │ │
│  └─────────┘ └─────────┘ └────────┘ │
└──────────────────────────────────────┘
```

### 配置 MCP 服务器

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

4. 保存并启用

### 常用 MCP 服务器

| 服务器 | 功能 | 安装命令 |
|--------|------|----------|
| `@modelcontextprotocol/server-filesystem` | 文件系统访问 | `npx -y @modelcontextprotocol/server-filesystem` |
| `@modelcontextprotocol/server-github` | GitHub 操作 | `npx -y @modelcontextprotocol/server-github` |
| `@modelcontextprotocol/server-slack` | Slack 集成 | `npx -y @modelcontextprotocol/server-slack` |
| `@modelcontextprotocol/server-postgres` | PostgreSQL | `npx -y @modelcontextprotocol/server-postgres` |
| `@modelcontextprotocol/server-puppeteer` | 网页自动化 | `npx -y @modelcontextprotocol/server-puppeteer` |

### 开发自定义 MCP 服务器

创建自定义 MCP 服务器：

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'my-custom-server',
  version: '1.0.0'
});

// 注册工具
server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'my_tool',
      description: 'My custom tool',
      inputSchema: {
        type: 'object',
        properties: {
          param: { type: 'string' }
        }
      }
    }
  ]
}));

// 启动服务器
const transport = new StdioServerTransport();
await server.connect(transport);
```

详细开发指南请参考 [MCP 官方文档](https://modelcontextprotocol.io/)。

## 工具安全

### 权限控制

AIME Chat 实现了多层安全机制：

| 安全层级 | 说明 |
|----------|------|
| **工具级别** | 每个工具有自己的权限检查 |
| **用户确认** | 危险操作需要用户确认 |
| **沙箱隔离** | 代码执行在隔离环境中 |
| **访问限制** | 文件操作限制在指定目录 |

### 安全最佳实践

1. **只启用需要的工具**
   - 减少攻击面
   - 提高性能
   - 降低风险

2. **定期检查工具使用记录**
   - 监控异常行为
   - 审计工具调用
   - 发现潜在问题

3. **对敏感操作保持警惕**
   - 文件删除
   - 系统命令
   - 网络请求

4. **使用沙箱环境**
   - 代码执行隔离
   - 限制资源使用
   - 防止恶意代码

### 工具权限矩阵

| 工具 | 读取 | 写入 | 执行 | 网络 | 需要确认 |
|------|------|------|------|------|----------|
| Read | ✅ | ❌ | ❌ | ❌ | ❌ |
| Write | ❌ | ✅ | ❌ | ❌ | ⚠️ |
| Edit | ✅ | ✅ | ❌ | ❌ | ⚠️ |
| Bash | ❌ | ❌ | ✅ | ❌ | ✅ |
| Python | ❌ | ❌ | ✅ | ⚠️ | ⚠️ |
| Web Fetch | ❌ | ❌ | ❌ | ✅ | ⚠️ |
| Web Search | ❌ | ❌ | ❌ | ✅ | ❌ |

## 工具使用技巧

### 组合使用工具

Agent 可以智能组合多个工具完成任务：

```
用户：分析这个项目的代码结构

Agent：
1. [Glob] 查找所有 .ts 文件
2. [Read] 读取关键文件
3. [Grep] 搜索特定模式
4. [Python] 分析代码复杂度
5. [Write] 生成报告
```

### 工具链

创建工具链实现自动化流程：

```
[Web Search] → [Web Fetch] → [Python] → [Write]
   获取信息      抓取内容      处理数据      保存结果
```

### 错误处理

工具执行失败时的处理策略：

1. **重试机制**：自动重试失败的操作
2. **降级策略**：使用替代工具
3. **错误报告**：清晰的错误信息
4. **用户提示**：引导用户解决问题

## 性能优化

### 工具执行优化

- **并行执行**：多个工具可以并行运行
- **缓存机制**：缓存工具结果
- **懒加载**：按需加载工具
- **资源限制**：限制工具资源使用

### 监控工具性能

监控指标：
- 工具调用次数
- 执行时间
- 成功率
- 错误率

## 常见问题

### 工具执行失败

**可能原因**：
1. 工具未启用
2. 依赖缺失
3. 权限不足
4. 参数错误

**解决方案**：
1. 检查工具是否已启用
2. 确认相关依赖已安装
3. 检查权限设置
4. 查看错误日志获取详情

### MCP 服务器无法连接

**可能原因**：
1. 服务器配置错误
2. 网络连接问题
3. 服务器进程未运行

**解决方案**：
1. 确认服务器配置正确
2. 检查网络连接
3. 确认服务器进程正在运行
4. 查看服务器日志

### 工具响应慢

**可能原因**：
1. 网络延迟
2. 资源限制
3. 工具实现问题

**解决方案**：
1. 优化网络配置
2. 增加资源配额
3. 优化工具实现
4. 使用缓存机制

### 如何调试工具？

1. **启用调试模式**：在设置中启用详细日志
2. **查看工具调用**：监控工具执行过程
3. **检查参数**：确认工具参数正确
4. **测试工具**：单独测试工具功能

## 技术细节

### 工具数据结构

```typescript
interface Tool {
  id: string;
  name: string;
  description?: string;
  type: ToolType;
  mcpConfig?: any;
  isActive?: boolean;
  value?: any;
  toolkitId?: string;
}

enum ToolType {
  BUILTIN = 'builtin',
  MCP = 'mcp',
  CUSTOM = 'custom'
}
```

### 工具执行流程

```
1. Agent 决定使用工具
   ↓
2. 验证工具权限
   ↓
3. 检查参数有效性
   ↓
4. 执行工具
   ↓
5. 处理结果
   ↓
6. 返回给 Agent
```

### 与 Mastra 框架集成

AIME Chat 的工具系统完全基于 Mastra 框架：

- Mastra Tool API
- Mastra Tool Registry
- Mastra Tool Execution
- Mastra MCP Support

详细技术文档请参考 [Mastra 官方文档](https://mastra.ai/docs)。
















