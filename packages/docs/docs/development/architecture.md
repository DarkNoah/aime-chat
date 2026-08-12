---
sidebar_position: 1
---

# 架构概览

AIME Chat 是一个本地优先的 Electron 桌面 Agent 工作区。本页以源码版本 `0.3.47` 为基线，描述当前进程边界、数据流和扩展位置。

## 技术栈

| 层 | 当前主要技术 | 用途 |
|----|--------------|------|
| 桌面运行时 | Electron 35、Node.js 22+ | 窗口、文件系统、进程、IPC 与原生打包 |
| 渲染进程 | React 19、TypeScript 5.x、React Router 7 | 页面、设置、聊天和项目工作区 |
| UI 与样式 | Tailwind CSS 4、Radix UI / shadcn/ui | 组件、主题和响应式布局 |
| 客户端状态 | React Context/Hooks、Zustand 5 | 应用与局部交互状态 |
| Agent 运行时 | Mastra 1.54、AI SDK 5 | Agent、消息流、工具、记忆和工作流 |
| 应用数据 | TypeORM 0.3、better-sqlite3、LibSQL | 配置、实体、消息、知识库和向量/全文索引 |
| 构建与打包 | Webpack 5、electron-builder 26 | 主进程、preload、渲染进程构建和安装包 |
| 测试与检查 | Jest 29、ESLint 8 | 单元测试、组件测试和静态检查 |

仓库不使用 Vite 或 React Query。依赖的精确版本以根目录 `package.json` 和锁文件为准。

## 进程边界

```text
┌──────────────────────────────────────────────────────┐
│ Electron 主进程                                     │
│ 生命周期 · 本地数据库 · Agent/工具 · 文件/进程 · API │
└───────────────────────┬──────────────────────────────┘
                        │ ipcMain / ipcRenderer
┌───────────────────────┴──────────────────────────────┐
│ Preload                                               │
│ contextBridge 暴露类型化 window.electron API          │
└───────────────────────┬──────────────────────────────┘
                        │ React 调用
┌───────────────────────┴──────────────────────────────┐
│ Renderer                                              │
│ 页面 · 聊天流 · 设置 · 项目文件工作区 · 用户交互      │
└──────────────────────────────────────────────────────┘
```

### 主进程

入口是 `src/main/main.ts`，负责初始化数据库和各业务 Manager，并创建 `BrowserWindow`。主要模块包括：

- `src/main/app`：应用设置、运行库、更新、Secrets、Crons、日志
- `src/main/mastra`：聊天、消息持久化、Agent 工作流与本地 API
- `src/main/mastra/agents`：内置和自定义 Agent 的运行时装配
- `src/main/tools`：内置工具、MCP、Skill 与权限配置
- `src/main/knowledge-base`：导入、BM25/向量检索、重排和 SQLite 迁移
- `src/main/project`：项目、Git 克隆与聊天导出
- `src/main/instances`：Chrome/Edge/Chromium 实例检测和启动
- `src/main/providers`：模型服务商与模型适配
- `src/main/db`：TypeORM DataSource 与共享 LibSQL 客户端

Manager 继承 `BaseManager`。带 `@channel(...)` 的方法在构造时注册为 IPC handler；带 `@api(...)` 的方法可以注册到本地 Express API，避免为同一业务逻辑维护两套实现。

### Preload

`src/main/preload.ts` 使用 `contextBridge.exposeInMainWorld` 暴露 `window.electron`。渲染进程通过这里访问对话框、文件、项目、知识库、Provider、Agent、工具等能力，而不是直接获得 Node.js API。

共享调用参数和结果类型位于 `src/types`，IPC 名称集中在 `src/types/ipc-channel.ts`。

### 渲染进程

入口是 `src/renderer/index.tsx`，路由与应用外壳位于 `src/renderer/App.tsx`。主要目录包括：

- `components`：聊天、项目、Agent、任务、设置和基础 UI
- `pages`：Chat、Projects、KnowledgeBase、Tools、Settings、Setup 等页面
- `hooks`、`contexts`、`store`：共享状态和业务 Hook
- `lib`、`styles`：渲染层工具、主题和全局样式

渲染进程使用 `MemoryRouter`，状态按作用域分布在 React Context/Hooks、Zustand store 和组件本地状态中。

## 核心数据流

### 普通业务调用

```text
React 页面
  → window.electron 的类型化方法
  → IPC channel
  → 主进程 Manager
  → SQLite / 文件系统 / 外部服务
  → Promise 或事件返回渲染进程
```

持续状态（例如后台任务、知识库重算和频道状态）通过主进程事件推送到渲染进程；一次性 CRUD 通常使用 `ipcRenderer.invoke`。

### 聊天与 Agent

```text
用户消息
  → MastraManager 组装 thread/resource/project 上下文
  → Agent + 已授权工具 + Provider 模型
  → 流式模型/工具事件
  → Renderer 渲染
  → Mastra LibSQL storage 持久化消息与线程
```

项目聊天使用 `project:<projectId>` 作为资源范围，把线程、文件工作区和项目级后台 Bash 状态关联起来。取消信号会沿聊天和工具执行链路传递。

### 知识库

```text
文件/网页/文本
  → 解析与分块
  → BM25 全文索引
  → 可选 embedding 向量
  → 查询时融合并可选 rerank
  → 返回片段，再按条目读取原文
```

没有 embedding 时知识库仍可使用 BM25。更换 embedding 会在临时表中重算全部向量，成功后再原子替换旧索引。

## 本地存储

主要持久化文件是应用数据目录下的 `data/main.db`：

- TypeORM 管理 Provider、Settings、Agents、Tools、Projects、KnowledgeBase、Secrets、Instances、Channels、Crons 和请求日志等实体
- Mastra 的 `LibSQLStore` 与 `LibSQLVector` 在同一数据库中保存线程、消息、记忆和向量数据
- 知识库使用 LibSQL 表与全文索引保存片段、BM25 数据和可选向量

项目文件仍保存在用户选择的原始目录；本地模型、运行库、Skill 和浏览器实例数据位于应用用户资料目录的独立子目录。

## 本地 HTTP 与 MCP

MastraManager 可以在 `127.0.0.1` 启动 Express API，为聊天、线程和其他标记了 `@api(...)` 的能力提供本机接口。MCP 客户端和应用内 MCP Server 由工具系统管理。

本地监听不等同于鉴权边界。扩展 API 或 MCP 路由时，需要继续限制监听地址、验证输入，并避免在响应或日志中返回 Secret。

## 安全边界

- Renderer 启用 `contextIsolation`，并关闭 `nodeIntegration`
- 文件、Shell、浏览器和系统操作由主进程执行，渲染层只通过 preload API 请求
- Bash、写文件等高影响工具可由 Agent 工具清单和聊天级 `requireToolApproval` 限制，但审批并非始终开启，也不是系统级沙箱
- 当前 BrowserWindow 配置包含 `webSecurity: false`，因此不要把远程页面直接当作可信应用内容，也不要放宽现有导航边界
- Secrets 当前作为本地数据库记录保存，并在需要时注入工具环境；应保护操作系统账户、应用数据库和备份，不要把它们当作可公开配置

## 目录结构

```text
aime-chat/
├── .erb/                         # Webpack、打包脚本与 Docker 构建
├── assets/                       # 图标、模型目录和内置资源
├── packages/docs/                # Docusaurus 文档站
├── src/
│   ├── entities/                 # TypeORM 实体
│   ├── i18n/                     # 应用中英文文案
│   ├── main/                     # Electron 主进程与业务 Manager
│   ├── renderer/                 # React UI
│   ├── types/                    # 跨进程共享类型与 channel
│   └── utils/                    # 主/渲染共享工具
├── release/app/                  # electron-builder 应用目录
├── release/build/                # 安装包与兼容性报告
└── package.json
```

## 开发与验证

```bash
# 安装依赖
pnpm install

# 启动 Webpack dev server 与 Electron
pnpm start

# 主进程和渲染进程生产构建
pnpm build

# Jest
pnpm test

# ESLint
pnpm lint

# 当前平台安装包
pnpm package

# Docker Buildx 构建 GLIBC 2.28 基线的 Linux ARM64 .deb
pnpm package:linux-arm64
```

开发调试也可以直接使用仓库的 VSCode **Electron: Main** 启动配置，或使用 **Electron: All** 同时附加主进程与渲染进程。生产构建输出到 `release`，文档站有自己独立的 `packages/docs/package.json` 与构建流程。

## 扩展位置

- 新业务域：在 `src/main/<domain>` 添加 Manager，并在 preload/types 中提供最小调用面
- 新内置工具：继承现有 `BaseTool`，补齐 schema、配置与工具注册
- 新 Provider：复用 `src/main/providers` 的 Provider 管理和模型协议
- 新 UI：优先使用 `src/renderer/components/ui` 的共享组件和现有主题 token
- 新文档：放入 `packages/docs/docs`，并在 `sidebars.ts` 接入导航后运行文档构建

架构会随依赖升级变化；修改本页中的版本或调用示例前，应以当前源码和锁文件为准。
