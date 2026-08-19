---
sidebar_position: 3
---

# 工具系统

AIME Chat 通过工具让 Agent 读取文件、运行命令、查询知识库或连接外部服务。当前工具来源分为三类：

| 类型 | 说明 |
|------|------|
| Built-in | 随应用注册的工具与 Toolkit |
| MCP | 通过本地进程或远程 HTTP MCP Server 加载的工具 |
| Skill | 从本地或市场安装的 Skill，并在需要时向 Agent 提供指引与脚本 |

工具是否可用取决于全局启用状态、Agent 的工具配置、当前模型能力和运行库是否已经安装。

## 主要内置能力

| 类别 | 当前能力 |
|------|----------|
| 文件系统 | Glob、Grep、Read、Write、Edit |
| Shell | Bash、BashOutput、ListBash、KillBash |
| 代码执行 | CodeExecution（Python，支持 PTC 模式） |
| Web 与浏览器 | WebSearch、WebFetch、AgentBrowser |
| 图像 | GenerateImage、EditImage、RemoveBackground |
| 音频 | SpeechToText、TextToSpeech、MusicGeneration、ListVoices |
| 数据 | LibSQLRun、ListTable、DescribeTable、DatabaseInfo |
| 任务与目标 | TaskCreate/Get/List/Update、Create/Update/GetGoal、CreatePlan |
| 知识与历史 | KnowledgeBase、Memory、ChatHistory Toolkit |
| 自动化 | Crons List/Create/Update/Delete |
| 协作与交互 | Agent、AskUserQuestion、Message、InteractiveHtml |
| 其他 | Extract、Translation、Tool 管理与 Skill |

具体列表可能随版本、开发模式和启用状态变化，以应用中的 **工具** 页面和 Agent 配置界面为准。

## 文件系统工具

### Read

Read 读取本地文件。文本文件支持按行分页；二进制文件会根据类型进入文档解析、OCR、媒体转写或视觉分析流程。

常用参数：

- `file_path`：绝对文件路径
- `offset`、`limit`：文本文件的起始行和最大行数
- `showLineNumbers`：是否显示行号
- `args`：图片裁剪框或 Excel 工作表/范围参数，使用 JSON 字符串
- `useVision`：图片使用视觉模型；为 `false` 时使用 OCR

普通文本：

```json
{
  "file_path": "/path/to/package.json"
}
```

Excel 指定工作表与范围：

```json
{
  "file_path": "/path/to/orders.xlsx",
  "args": "{\"sheet\":\"Orders\",\"range\":\"A1:H50\"}"
}
```

也可以使用从 `1` 开始的工作表序号：

```json
{
  "file_path": "/path/to/orders.xlsx",
  "args": "{\"sheetIndex\":9}"
}
```

Excel 默认返回非空单元格的有界预览，并保留原始行列坐标。大型工作簿会提示被省略的工作表、行、列或被截断的单元格，可再次指定工作表和 A1 范围。

Read 当前可处理：

- 文本与代码文件
- PDF、Word、Excel 和 PowerPoint
- 图片（OCR 或视觉分析）
- 音频、视频（返回转写内容）
- Jupyter Notebook（单元格及其输出）

### Write 与 Edit

- **Write** 创建文件或写入完整内容
- **Edit** 在已读取的文件中执行精确字符串替换

这两个工具接受绝对路径，也可以在 Agent 的项目工作区中操作。它们本身不是操作系统沙箱；在授权前应检查目标路径和拟写入的内容。

### Glob 与 Grep

- **Glob** 按文件名模式查找文件
- **Grep** 使用文本或正则表达式搜索内容，并可限制目录和文件模式

对于代码审计和项目搜索，应优先使用它们，而不是让 Bash 拼接平台相关的 `find`/`grep` 命令。

## Bash 与后台会话

Bash 在指定工作目录中执行命令。Windows 可配置 PowerShell 或 cmd；macOS/Linux 使用 Bash。

常用参数：

- `command`：要执行的命令
- `directory`：绝对工作目录
- `description`：便于审批与回顾的命令说明
- `timeout`：超时时间，最大 600000 毫秒
- `env`：本次命令使用的环境变量
- `run_in_background`：转为后台执行

后台命令会得到 Shell ID：

- `BashOutput` 读取后续输出
- `ListBash` 查看当前线程或项目中的会话
- `KillBash` 停止仍在运行的进程

项目聊天会按项目汇总后台 Bash 状态，适合管理开发服务器、构建或长时间数据处理。

### Python 运行器

在 Agent 的 Bash 工具配置中，可以选择：

- **独立运行器（推荐）**：使用 AIME Chat 通过 UV 管理的隔离环境，并复用应用维护的依赖缓存
- **系统运行器**：通过用户登录 Shell 加载系统 PATH 和既有 Python 环境

独立环境尚未准备好时，应用会尝试安装；安装失败或不可用时会回退到系统 Python。需要稳定、可复现的环境时，应先在 **设置 → 运行库** 完成 UV / Python 安装。

## CodeExecution

CodeExecution 用于结构化的 Python 执行、数据处理和文件生成。Python 运行时会使用应用管理的虚拟环境和依赖缓存，但执行进程仍拥有当前用户权限，不应将它描述为安全沙箱。

启用 PTC 时，模型可以通过代码组合多个工具调用，减少模型与工具之间的往返。架构和适用场景见 [PTC 模式](./ptc)。

## Web、浏览器和图像

- **WebSearch** 搜索网络；具体可用性取决于 Provider/搜索配置
- **WebFetch** 获取网页或 API 内容
- **AgentBrowser** 使用配置好的浏览器实例执行页面任务，详见 [浏览器实例](./browser-instances)
- **GenerateImage / EditImage** 调用已配置的图像模型
- **RemoveBackground** 使用本地背景移除模型，详见 [背景移除](./tools/rmbg)

图片文件的普通识别入口是 Read：`useVision=true` 使用视觉模型，否则使用 OCR。独立 Vision 工具当前不在默认内置工具列表中。

## 数据库、任务与知识库

### LibSQL Toolkit

数据库 Toolkit 由四个工具组成：

- `LibSQLRun`：执行 SQL，并可选择全局或工作区数据库作用域
- `LibSQLListTable`：列出表
- `LibSQLDescribeTable`：读取表结构
- `LibSQLDatabaseInfo`：查看数据库、索引和视图信息

数据库写操作可能不可逆，执行前应检查作用域、SQL 和参数。需要导出结果时，由 `LibSQLRun` 的格式与保存路径参数控制。

### Task Toolkit

结构化任务使用 `TaskCreate`、`TaskGet`、`TaskList` 和 `TaskUpdate`。任务状态存入当前请求上下文，便于 Agent 跟踪多步骤工作；旧文档中的 `TodoWrite` 不属于当前默认注册工具。

### KnowledgeBase Toolkit

当前 Toolkit 包含 List、Search、GetItem、Add 和 Create。Search 返回相关片段，GetItem 可以用 `pattern`、`offset` 和 `limit` 定位并分页读取原文。检索、模型回退和全文返回说明见 [知识库管理](./knowledge-base)。

## MCP 与 Skill

MCP 工具可来自本地 stdio Server 或远程 HTTP Server；Skill 可以从 Git 仓库或技能市场安装。配置、导入和排障见 [MCP 协议支持](./mcp)。

不要把 MCP Server 或 Skill 当成天然可信代码。安装前检查来源、命令、环境变量、工作目录和它将获得的 Secret。

## 启用、配置与审批

1. 在 **工具** 页面启用需要的 Built-in、MCP 或 Skill
2. 在 Agent 配置中选择允许使用的 Toolkit/子工具，并填写模型或运行时配置
3. 在聊天输入区域按需要打开 **Require tool approval**
4. 检查每次工具调用的参数，再批准有副作用的操作

审批开关是聊天级策略，并非 Bash 或写文件工具始终强制弹出的固定行为。关闭审批后，已授权给 Agent 的工具可能自动执行。

## 安全边界

- 文件与 Shell 工具以当前操作系统用户权限运行，并不自动限制在项目目录内
- CodeExecution 使用临时工作目录和虚拟环境，但不是 OS 级沙箱
- Secret 可被注入工具环境；不要在命令输出、日志或聊天中回显敏感值
- 外部网页、MCP Server、Skill 和生成代码都应视为不可信输入
- 删除、覆盖、数据库写入和进程终止等操作应在批准前确认目标范围
