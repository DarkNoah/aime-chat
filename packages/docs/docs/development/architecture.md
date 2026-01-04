---
sidebar_position: 1
---

# 架构概览

AIME Chat 是一个基于 Electron 的跨平台 AI 聊天应用，采用现代化的技术栈和架构设计。

## 技术栈

### 前端技术

| 技术 | 版本 | 用途 |
|------|------|------|
| **React** | 18.x | UI 框架 |
| **TypeScript** | 5.x | 类型安全 |
| **Electron** | 最新 | 桌面应用框架 |
| **shadcn/ui** | 最新 | UI 组件库 |
| **Tailwind CSS** | 3.x | 样式框架 |
| **Zustand** | 最新 | 状态管理 |
| **React Query** | 最新 | 数据获取 |

### 后端技术

| 技术 | 版本 | 用途 |
|------|------|------|
| **Node.js** | 18.x | 运行时 |
| **TypeScript** | 5.x | 类型安全 |
| **Mastra** | 最新 | AI 框架 |
| **TypeORM** | 最新 | ORM |
| **LibSQL** | 最新 | 数据库 |
| **FastEmbed** | 最新 | 向量化 |

### 构建工具

| 技术 | 版本 | 用途 |
|------|------|------|
| **Vite** | 5.x | 构建工具 |
| **Electron Builder** | 最新 | 打包工具 |
| **ESLint** | 最新 | 代码检查 |
| **Prettier** | 最新 | 代码格式化 |

## 项目结构

```
aime-chat/
├── src/
│   ├── main/              # Electron 主进程
│   │   ├── index.ts       # 主进程入口
│   │   ├── ipc/          # IPC 通信
│   │   └── database/     # 数据库管理
│   ├── renderer/         # 渲染进程（前端）
│   │   ├── App.tsx       # 应用入口
│   │   ├── components/   # React 组件
│   │   ├── pages/        # 页面组件
│   │   ├── hooks/        # 自定义 Hooks
│   │   ├── store/        # 状态管理
│   │   └── utils/       # 工具函数
│   ├── entities/         # 数据库实体
│   ├── types/           # TypeScript 类型
│   └── utils/           # 共享工具
├── packages/
│   ├── docs/            # 文档站点
│   └── mastra/         # Mastra 框架
├── release/             # 构建输出
└── package.json
```

## 架构设计

### Electron 架构

```
┌──────────────────────────────────────┐
│         Electron App                │
├──────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐ │
│  │ Main Process │  │Renderer Proc. │ │
│  │  (Node.js)   │  │  (React)     │ │
│  └──────────────┘  └──────────────┘ │
│         ↓                ↑          │
│         IPC Communication          │
└──────────────────────────────────────┘
```

### 主进程 (Main Process)

主进程负责：
- 应用生命周期管理
- 窗口管理
- 系统级操作
- 数据库操作
- 文件系统访问

**主要模块**：
- `index.ts`：主进程入口
- `ipc/`：IPC 通信处理
- `database/`：数据库管理
- `services/`：业务服务

### 渲染进程 (Renderer Process)

渲染进程负责：
- UI 渲染
- 用户交互
- 状态管理
- 数据展示

**主要模块**：
- `App.tsx`：应用入口
- `components/`：UI 组件
- `pages/`：页面组件
- `store/`：状态管理
- `hooks/`：自定义 Hooks

## 数据流

### 状态管理

使用 Zustand 进行状态管理：

```typescript
interface AppState {
  // Agent 状态
  agents: Agent[];
  currentAgent: Agent | null;

  // 工具状态
  tools: Tool[];
  activeTools: string[];

  // 会话状态
  sessions: Session[];
  currentSession: Session | null;

  // Actions
  setAgents: (agents: Agent[]) => void;
  setCurrentAgent: (agent: Agent) => void;
  // ...
}
```

### 数据获取

使用 React Query 进行数据获取：

```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ['agents'],
  queryFn: () => ipcRenderer.invoke('get-agents')
});
```

### IPC 通信

主进程和渲染进程通过 IPC 通信：

```typescript
// 渲染进程
const result = await ipcRenderer.invoke('get-agents');

// 主进程
ipcMain.handle('get-agents', async () => {
  return await agentService.getAll();
});
```

## 数据库设计

### 实体关系

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│ Agents   │────▶│ Sessions │────▶│ Messages │
└──────────┘     └──────────┘     └──────────┘
     ↓
┌──────────┐
│  Tools   │
└──────────┘

┌──────────────┐     ┌──────────────┐
│KnowledgeBase │────▶│   KB Items   │
└──────────────┘     └──────────────┘

┌──────────┐
│Providers │
└──────────┘
```

### 主要实体

| 实体 | 说明 | 字段 |
|------|------|------|
| **Agents** | AI Agent | id, name, instructions, tools |
| **Tools** | 工具定义 | id, name, type, config |
| **Sessions** | 对话会话 | id, agentId, createdAt |
| **Messages** | 消息记录 | id, sessionId, role, content |
| **KnowledgeBase** | 知识库 | id, name, embedding |
| **Providers** | AI 服务商 | id, name, apiKey, models |

## Mastra 集成

### Agent 系统

```typescript
import { Agent } from '@mastra/core';

const agent = new Agent({
  name: 'my-agent',
  instructions: 'You are a helpful assistant',
  tools: [readTool, writeTool, bashTool]
});
```

### 工具系统

```typescript
import { Tool } from '@mastra/core';

const myTool = new Tool({
  name: 'my-tool',
  description: 'My custom tool',
  execute: async (params) => {
    // 工具逻辑
    return result;
  }
});
```

### 记忆系统

```typescript
import { Memory } from '@mastra/core';

const memory = new Memory({
  type: 'semantic',
  vectorStore: libsqlStore
});
```

## 安全设计

### 数据安全

- **本地存储**：所有数据存储在本地
- **加密存储**：敏感数据加密存储
- **权限控制**：严格的权限管理
- **沙箱隔离**：代码执行在沙箱中

### API 安全

- **Key 管理**：API Key 安全存储
- **请求验证**：所有请求验证
- **错误处理**：完善的错误处理
- **日志记录**：详细的操作日志

## 性能优化

### 前端优化

- **代码分割**：按路由分割代码
- **懒加载**：组件懒加载
- **虚拟滚动**：长列表虚拟滚动
- **缓存策略**：合理使用缓存

### 后端优化

- **数据库索引**：优化查询性能
- **连接池**：数据库连接池
- **缓存机制**：减少重复计算
- **异步处理**：异步处理耗时操作

## 扩展性设计

### 插件系统

支持插件扩展：

```typescript
interface Plugin {
  name: string;
  version: string;
  init: (context: PluginContext) => void;
  tools?: Tool[];
  agents?: Agent[];
}
```

### MCP 支持

完整的 MCP 协议支持：

- MCP 客户端
- MCP 服务器管理
- MCP 工具集成

## 开发工作流

### 开发模式

```bash
# 启动开发模式
pnpm start

# 热重载已启用
# 修改代码自动重新加载
```

### 构建流程

```bash
# 构建
pnpm build

# 打包
pnpm package

# 输出到 release/build/
```

### 调试

- **主进程调试**：Chrome DevTools
- **渲染进程调试**：React DevTools
- **日志查看**：控制台输出

## 技术债务

### 已知问题

- [ ] 部分组件需要重构
- [ ] 性能优化空间
- [ ] 测试覆盖率不足

### 改进计划

- [ ] 增加单元测试
- [ ] 优化构建速度
- [ ] 改进错误处理
- [ ] 完善文档

## 贡献指南

### 代码规范

- 使用 ESLint 和 Prettier
- 遵循 TypeScript 最佳实践
- 编写清晰的注释
- 提交前运行测试

### 提交规范

```
feat: 添加新功能
fix: 修复 bug
docs: 更新文档
style: 代码格式调整
refactor: 代码重构
test: 添加测试
chore: 构建/工具链更新
```

## 相关资源

- [Electron 文档](https://www.electronjs.org/docs)
- [React 文档](https://react.dev)
- [Mastra 文档](https://mastra.ai/docs)
- [TypeORM 文档](https://typeorm.io)
