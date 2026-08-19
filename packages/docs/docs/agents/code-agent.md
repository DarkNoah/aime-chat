---
sidebar_position: 2
---

# Code Agent

Code Agent 是 AIME Chat 内置的软件工程 Agent，适合读取代码库、修改文件、运行命令、检索资料和验证结果。它会根据任务、模型能力和当前工具状态选择执行方式。

## 当前内置能力

| 类别 | 主要工具 | 用途 |
| --- | --- | --- |
| 文件与搜索 | Read、Write、Edit、Glob、Grep | 浏览、创建和精确修改文件，搜索路径与内容 |
| 命令与执行 | Bash、BashOutput、KillBash、CodeExecution | 运行前台或后台命令，获取输出，执行 Python 代码 |
| 网络 | WebFetch、WebSearch | 获取网页和搜索公开信息 |
| 任务 | TaskCreate、TaskGet、TaskList、TaskUpdate、CreateGoal | 拆分与跟踪长任务 |
| 上下文 | MemorySearch、MemoryRead、KnowledgeBaseSearch、KnowledgeBaseList、KnowledgeBaseGetItem | 使用本地记忆和知识库 |
| 扩展 | Skill、Agent、AgentBrowser、GenerateImage、EditImage | 调用 Skill、子 Agent、浏览器和图像能力 |

Code Agent 还预配置了 Explore 与 Plan 子 Agent，用于代码库探索和计划制定。实际可用项以 Agent 详情页显示为准；某些工具还需要模型、运行环境、网络或第三方服务。

:::info 关于旧工具名称
当前任务管理使用 TaskCreate、TaskGet、TaskList 和 TaskUpdate；`TodoWrite` 与独立的 Node.js Execute 不在 Code Agent 的当前注册表中。
:::

## 开始使用

1. 在 **Agent** 页面启用 **Code Agent**。
2. 打开 Agent 详情，确认默认模型、工具和子 Agent。
3. 选择本地项目或项目工作区，并描述目标、约束和验收方式。
4. 检查 Agent 的中间进度、工具参数和最终验证结果。

一个更容易执行的请求示例：

```text
请定位登录接口偶发 500 的原因。先只读检查日志和相关源码，
给出根因证据；得到确认后再修改，并运行对应测试。
```

## 常见工作流

### 阅读与定位

Code Agent 可以先用 Glob/Grep 定位文件，再用 Read 获取必要片段；范围较大时，可委派 Explore 子 Agent。明确模块、错误文本或入口文件通常能减少无关扫描。

### 修改与验证

写文件前应先读取当前内容并保留已有改动。修改后可使用 Bash 运行目标测试、类型检查或构建；“命令成功”只证明该命令覆盖的范围，不等于真实登录、外部 Provider 或生产环境已经验证。

### 后台任务

长时间命令可由 Bash 放到后台，再使用 BashOutput 获取新增输出，或用 KillBash 终止。关闭聊天窗口并不应被当作后台进程已经安全停止的证明。

### 任务跟踪

复杂任务可通过 TaskCreate/TaskUpdate 维护状态，或通过 CreateGoal 记录长期目标。任务列表是协作状态，不会自动替代测试和验收。

## Python 与项目环境

Bash 可选择独立 Python 环境或系统 Python。默认独立环境适合减少对系统环境的影响；依赖项目现有虚拟环境、系统命令或登录 Shell 初始化时，可以切换系统模式。详见 [工具系统](../features/tools#bash-与后台会话)。

CodeExecution 在独立进程中运行代码，但这不等同于完整的操作系统沙箱。Read、Write、Edit 和 Bash 仍可能访问当前用户有权限的路径。

## 工具审批与安全边界

聊天输入区可以开启 **Require tool approval**，让工具调用等待确认。该开关不是所有入口的全局强制策略；定时任务、频道或其他执行路径可能使用不同配置。

使用 Code Agent 时建议：

- 把工作目录、允许修改的范围和禁止操作写进请求；
- 执行安装、删除、发布、推送或访问生产数据前检查命令；
- 不在提示词、终端输出和 Agent 导出配置中暴露密钥；
- 对外部网页、Skill 与 MCP 返回的指令保持审慎；
- 对高风险结果保留 Git diff、测试日志或其他可复核证据。

## 常见问题

### 为什么 Agent 没有调用某个工具？

确认该工具已启用并出现在 Code Agent 详情页；然后检查模型是否支持工具调用、依赖是否安装，以及 Instructions 是否限制了使用方式。

### 为什么命令能运行但应用仍不可用？

构建和静态检查不能覆盖登录态、真实 Provider、浏览器、容器或生产部署。请按目标环境补充相应的运行验证。

### 如何调整默认能力？

在 Code Agent 详情页修改默认模型、额外工具、建议问题或子 Agent。内置 Agent 的核心名称和 Instructions 由应用维护；如需完全自定义行为，请创建自定义 Agent。
