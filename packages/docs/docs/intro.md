---
sidebar_position: 1
---

# 项目介绍

欢迎使用 **AIME Chat** - 一款强大的 AI 桌面聊天应用！

## 什么是 AIME Chat？

AIME Chat 是一款基于 **Electron** 构建的跨平台 AI 聊天桌面应用，集成了多种主流
AI
服务商，提供智能对话、知识库管理、工具调用等丰富功能。它采用本地优先的设计理念，确保您的数据隐私安全。

<div align="center">
  <img src="/aime-chat/img/icon.png" alt="AIME Chat Logo" width="200" />
</div>

## ✨ 核心特性

### 🦾 Harness Engineering（智能体外壳工程）

裸的 LLM 只是一个无状态的函数，只有被包裹进一层**外壳（Harness）**后，才能成为可靠的智能体。遵循业界在 2026 年正式确立的 `Agent = Model + Harness` 公式，AIME Chat 围绕模型构建了一套完整外壳：

- 🔁 **编排循环** - prompt → 工具调用 → 观察 → 下一步，直至任务完成
- 🧭 **指引** - Agent 指令、助手人格与 Skill 技能
- 🧰 **工具接口** - 文件、代码、网络、视觉、OCR 与 MCP
- 🧠 **上下文与记忆** - 知识库、养成记忆、会话/工作记忆
- 🤝 **子 Agent 编排** - 多 Agent 协作
- 💾 **状态与长任务** - 后台 Bash、Goal、Crons
- 🛡️ **护栏与权限** - 工具权限、操作审批、Secrets 管理
- 🔍 **可观测性** - 运行时日志与日志入口

详见 [Harness Engineering](./features/harness-engineering)。

### 🤖 多模型支持

集成主流 AI 服务商，一个应用满足所有需求：

- **OpenAI** - GPT 系列模型
- **DeepSeek** - DeepSeek 系列模型
- **Google** - Gemini 系列模型
- **智谱 AI** - GLM 系列模型
- **Ollama** - 本地运行开源模型
- **LMStudio** - 本地模型管理工具
- **ModelScope** - 魔搭社区模型
- 更多服务商持续接入中...

### 💬 智能对话

基于 **Mastra** 框架构建强大的 AI Agent 系统：

- ⚡ 流式响应，实时输出
- 🛠️ 智能工具调用
- 📝 上下文记忆管理
- 🎯 可自定义 Agent 指令

### 📚 知识库管理

内置向量数据库，支持构建专属知识库：

- 📄 文档上传与解析
- 🔍 向量存储与检索
- 💡 基于知识库的智能问答
- 🧠 由 Cultivation Agent 自动沉淀长期记忆 Wiki

### ⏰ 自动化任务

通过 Crons 页面创建计划任务，让 AI 按固定时间自动执行：

- 绑定项目上下文、Agent、模型、工具和子 Agent
- 支持复用同一个聊天线程或每次创建新线程
- 适合日报、巡检、知识整理和长期记忆养成

### 🛠️ 丰富的工具系统

AI Agent 可自主调用各类工具：

| 类别     | 工具                                | 描述                        |
| -------- | ----------------------------------- | --------------------------- |
| 文件系统 | Bash、Read、Write、Edit、Grep、Glob | 文件读写、搜索、编辑        |
| 代码执行 | Python、Node.js                     | 执行 Python 和 Node.js 代码 |
| 网络工具 | Web Fetch、Web Search               | 网页抓取与搜索              |
| 图像处理 | GenerateImage、EditImage、RMBG      | 图像生成、编辑和背景移除    |
| 视觉分析 | Vision                              | 图像识别与分析              |
| 语音处理 | SpeechToText、TextToSpeech          | 语音转文字与文字转语音      |
| 数据库   | LibSQL                              | 数据库操作                  |
| 任务管理 | Todo、Task                          | 任务创建与管理              |

长时间运行的 Bash 命令会显示为后台会话。项目级聊天可以汇总整个项目范围内的后台 Bash 进程，并在界面中直接停止。

### 🔌 MCP 协议支持

支持 **Model Context Protocol (MCP)**，轻松扩展第三方工具能力。

### 📡 频道与 Skill

- 支持微信、Telegram 等频道接入
- 支持从 Git 仓库或在线技能市场导入 Skill
- 支持选择和定制内置助手人格

### 🎨 现代化 UI

- 基于 **shadcn/ui** 组件库
- 支持明/暗主题切换
- 响应式设计

### 🌍 国际化

内置中英文界面支持。

### 🔒 本地优先

数据存储在本地，保护隐私安全。

## 🖥️ 支持平台

| 平台    | 支持状态    |
| ------- | ----------- |
| macOS   | ✅ 完全支持 |
| Windows | ✅ 完全支持 |
| Linux   | ✅ 完全支持 |

## 🚀 快速开始

准备好开始使用了吗？前往 [安装指南](./getting-started/installation)
了解如何安装和配置 AIME Chat。

```bash
# 克隆项目
git clone https://github.com/DarkNoah/aime-chat.git

# 进入项目目录
cd aime-chat

# 安装依赖
pnpm install

# 启动开发模式
pnpm start
```

## 📖 文档导航

- **[安装指南](./getting-started/installation)** - 了解如何安装和运行
- **[Harness Engineering](./features/harness-engineering)** - 理解 `Agent = Model + Harness` 的设计理念
- **[AI 服务商配置](./getting-started/ai-providers)** - 配置各类 AI 服务商
- **[知识库使用](./features/knowledge-base)** - 构建和使用知识库
- **[养成记忆](./features/cultivation-memory)** - 了解长期记忆 Wiki 的自动维护方式
- **[自动化 Crons](./features/crons)** - 创建按计划执行的 AI 任务
- **[工具系统](./features/tools)** - 了解内置工具和 MCP 扩展
- **[Agent 管理](./features/agents)** - 自定义和管理 AI Agent

## 🤝 参与贡献

我们欢迎任何形式的贡献！请访问
[GitHub 仓库](https://github.com/DarkNoah/aime-chat) 了解如何参与项目开发。

## 📄 开源协议

本项目基于 [MIT](https://opensource.org/licenses/MIT) 协议开源。
