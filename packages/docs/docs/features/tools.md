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
| 视频 | GenerateVideo |
| 3D | Generate3D |
| 音频 | SpeechToText、TextToSpeech、MusicGeneration、ListVoices |
| 数据 | LibSQLRun、ListTable、DescribeTable、DatabaseInfo |
| 任务与目标 | TaskCreate/Get/List/Update、Create/Update/GetGoal、CreatePlan |
| 知识与历史 | KnowledgeBase、Memory、ChatHistory Toolkit |
| 自动化 | Crons List/Create/Update/Delete |
| 协作与交互 | Agent、AskUserQuestion、Message、InteractiveHtml |
| 其他 | Extract、Translation、Tool 管理与 Skill |

具体列表可能随版本、开发模式和启用状态变化，以应用中的 **工具** 页面和 Agent 配置界面为准。

## 3D 模型生成

**Generate3D** 支持文生、单图和多图生成，通过通用 3D 模型接口调用供应商。在工具配置的模型选择器中选择 Alibaba 的 **Tripo H3.1** 或 **Tripo P1.0**；沿用供应商 API Key、Workspace ID 和 Region。当前接口仅支持 `cn-beijing`，需先在百炼开通 Tripo 模型服务。

每次调用只提供 `prompt` 或 `images` 之一。工具提交一次任务，每 15 秒查询进度，完成后保存 GLB 模型和可用的预览图。无需再次传入任务 ID；停止工具会中止本地等待，云端任务可能继续执行。

- 文生：`prompt` 为 1–1024 个字符。
- 单图：`images` 传入 1 个对象，包含图片 URL 或本地路径（`image` 字段），无需指定 `view`。
- 多图：`images` 为 2–4 张图片，每张包含 `view`（`front`、`left`、`back`、`right`）和 `image`，视角不可重复。工具自动按接口要求排序并补齐缺失视角。无文件扩展名的多图 URL 需填写 `format`（`jpeg` 或 `png`）。
- 图片要求：JPEG/PNG、每张不超过 20 MB、宽高均在 20–6000 像素之间。本地图片在上传前校验实际格式、大小和尺寸；公网图片由服务端校验。本地绝对路径、工作区相对路径和 `file://` 路径会复用 Alibaba 视频生成的临时 OSS 上传流程，按所选 Tripo 模型申请凭证，提交生成时自动添加资源解析请求头。HTTP(S) URL 和已有 `oss://` 引用直接传入。
- 贴图和 PBR 材质固定开启，不暴露 `textured` 输入参数。`texture_quality` 可选 `standard` / `detailed`；`geometry_quality` 可选 `standard` / `ultra`，仅 H3.1 支持，P1.0 应省略。
- `save_path` 为以 `.glb` 结尾的绝对路径或工作区相对路径；未指定时生成随机文件名。预览图使用同名加 `-preview` 后缀。预览下载失败时仍返回已保存模型。

文生示例：

```json
{ "prompt": "一只可爱的橘猫，站姿，完整身体", "save_path": "cat.glb" }
```

单图示例：

```json
{ "images": [{ "image": "references/cat.png" }], "save_path": "cat.glb" }
```

多图示例（前、后两个视角）：

```json
{
  "images": [
    { "view": "front", "image": "https://example.com/front.png" },
    { "view": "back", "image": "https://example.com/back.jpg" }
  ],
  "save_path": "cat.glb"
}
```

接口详情参见[阿里云 Tripo 3D API 文档](https://help.aliyun.com/zh/model-studio/tripo-3d-generation-api-reference)。

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

### GenerateVideo

通用视频生成工具，当前接入 MiniMax V2 和阿里云万相 3.0。先配置并启用对应供应商，在 **设置 → 默认模型 → 默认视频生成模型** 中选择模型；也可以在工具配置中单独指定模型，覆盖默认设置。

使用 `prompt` 描述视频，`save_path` 指定保存路径（相对路径位于当前工作区，未指定时自动生成 MP4 文件名）。支持 `duration`、`resolution`、`aspect_ratio`，以及可选的 `first_frame` / `last_frame` 或 `reference_images` / `reference_videos` / `reference_audios`。MiniMax 本地图片、视频（MP4/MOV）和音频通过 `/v1/files/upload` 自动上传，使用 `purpose=video_generation_input`，返回 `mm_file://` 供生成接口引用；已有公网 URL、Data URI 或供应商文件引用直接传递；首尾帧不能与参考媒体混用。

- **H3**：4–15 秒，768P / 2K，支持多模态参考。
- **H3 Max**：5–15 秒，480P / 768P，支持文生视频和首尾帧，不支持多模态参考。
- **Wan 3.0 Video / Prime**：2–30 秒或 `duration=-1` 自动时长，480P / 720P / 1080P，支持首帧、首尾帧、多模态参考、视频编辑和延长。默认 5 秒、1080P、自适应比例。

万相使用 **Alibaba / Alibaba (China)** 供应商。在供应商编辑页分别填写 **Workspace ID** 和 **Region**，系统自动构建视频接口地址。Region 默认 `cn-beijing`，可选择 `ap-southeast-1`、`ap-northeast-1`、`eu-central-1`、`us-east-1`、`cn-hongkong`，也可直接输入自定义地域。API Key、业务空间、地域必须匹配。

通用接口按供应商能力处理引用媒体：万相优先使用支持的 Base64 格式，否则上传；MiniMax 本地文件统一上传。万相本地图片转为 JPEG/PNG/BMP/WebP Data URI，单图不超过 20 MB；本地视频支持 MP4/MOV、最大 100 MB，本地音频支持 WAV/MP3、最大 15 MB。本地参考视频、音频自动上传至百炼临时存储，并使用返回的 `oss://` 地址调用模型；公网 URL 或已有 `oss://` 地址直接传递。临时上传使用相同业务空间、地域、API Key 和模型，生成请求自动添加 OSS 地址解析请求头。最多 10 张参考图、5 段参考视频、5 段参考音频。参考视频总时长和音频总时长各不超过 15 秒，输入视频与输出视频合计不超过 30 秒，媒体尺寸与时长由服务端进一步校验。尾帧必须同时提供首帧。

视频工具不再提供 `audio`、`watermark`、`seed`、`prompt_extend`、`reference_file`、`reference_link` 输入参数。万相生成默认开启音频、关闭水印，随机种子及提示词扩展使用内部默认值。

工具在一次调用内创建任务并持续查询状态，生成完成后自动下载、保存并返回视频文件，可在聊天工具结果中预览。无需传入任务 ID，也不会在等待 60 秒后提前返回。生成失败或用户停止时结束等待。MiniMax 在已取得任务 ID 后停止时会重新查询状态，仅对 `queued` 任务请求取消；`running` 无法取消，已完成任务不会主动删除。取消成功、不可取消或取消失败会给出提示。万相停止本地等待不会取消供应商侧任务。

接口依据：[MiniMax 取消任务](https://platform.minimax.cn/docs/api-reference/video-generation-v2-delete)、[MiniMax 上传文件](https://platform.minimax.cn/docs/api-reference/file-management-upload)、[临时文件上传](https://help.aliyun.com/zh/model-studio/get-temporary-file-url)、[万相 3.0 API](https://www.alibabacloud.com/help/zh/model-studio/wan3-video-generation-api-reference)、[MiniMax 创建视频任务](https://platform.minimax.cn/docs/api-reference/video-generation-v2-create)、[查询任务](https://platform.minimax.cn/docs/api-reference/video-generation-v2-query)。

## 音频识别与音乐生成

**SpeechToText** 支持 MiniMax `asr-1.0`。配置并启用 MiniMax 供应商后，在 **设置 → 默认模型 → 默认语音识别模型** 中选择 **MiniMax ASR 1.0**，或在工具配置中覆盖默认模型。输入 `source` 可以是本地文件、工作区相对路径或公网音视频 URL，视频和非 WAV 音频会先转换为 WAV。`output_type` 默认 `text`，也可选 `srt` 或 `ass`，时间戳用于生成字幕文件。MiniMax 单次输入限制为 50 MB、500 秒；语言默认自动识别。

**阿里云非实时识别** 同样通过 SpeechToText 使用。在 Alibaba / Alibaba (China) 供应商中配置 API Key、Workspace ID 和 Region，然后在默认语音识别模型或工具配置中选择模型。沿用视频生成的 Workspace ID / Region 配置，接口地址自动构建；模型按地域筛选：北京支持 Qwen Audio 3.0、Fun ASR、Qwen3 ASR 和 Paraformer，新加坡支持前三类，美国弗吉尼亚提供 Qwen3 ASR Flash US。

- 长音频模型：Qwen Audio 3.0 ASR Filetrans、Fun ASR / Multilingual、Qwen3 ASR Flash Filetrans、Paraformer V2 / Multilingual V1。工具自动提交、轮询并取回完整识别结果，不需要传入任务 ID。支持文本与基于毫秒时间戳转换的 SRT/ASS 字幕。
- 同步模型：Qwen Audio 3.0 ASR Flash、Fun ASR Flash、Qwen3 ASR Flash。Qwen3 ASR Flash 仅返回文本，不能生成带时间戳字幕；生成字幕请选 Filetrans 等模型。
- 本地音频：支持 Base64 的模型优先使用 Base64；编码后超过 10 MB 或异步模型要求 URL 时，使用与模型、账号和地域绑定的临时 OSS 上传，并添加 OSS 地址解析请求头。临时上传最大 1 GB，Qwen3 ASR Flash 本地原始文件最大 10 MB。长音频异步服务最多支持 12 小时 / 2 GB，超过临时上传限制的文件请提供公网 URL；同步模型最多 5 分钟，具体格式与时长由服务端校验。
- 公网 URL：模型支持时直接传入，保留签名和查询参数；需要格式参数的 Flash 模型遇到无法判断格式的 URL 时，先下载并转换为 WAV。点击停止会终止本地上传、请求或轮询，不会取消已提交的供应商任务。

接口依据：[非实时语音识别指南](https://help.aliyun.com/zh/model-studio/non-realtime-speech-recognition-user-guide)、[Qwen-ASR RESTful API（含临时 OSS URL 支持）](https://help.aliyun.com/zh/model-studio/qwen-asr-api-reference)、[临时文件上传](https://help.aliyun.com/zh/model-studio/get-temporary-file-url)。

**TextToSpeech：阿里云非实时语音合成** 沿用 Alibaba / Alibaba (China) 供应商的 API Key、Workspace ID 和 Region。在 **设置 → 默认模型 → 默认语音合成模型** 中选择模型，也可以在 TextToSpeech 的工具配置中覆盖。工具等待合成完成并保存 WAV 文件，返回本地路径；`save_path` 支持工作区相对路径。

| 系列 | 已接入模型 | 默认音色 |
|------|-----------|----------|
| Qwen Audio 3.0 | `qwen-audio-3.0-tts-plus`、`qwen-audio-3.0-tts-flash` | `longanhuan_v3.6` |
| CosyVoice | `cosyvoice-v3-plus`、`cosyvoice-v3-flash`、`cosyvoice-v2` | V3 为 `longanyang`，V2 为 `longxiaochun_v2` |
| CosyVoice 3.5 | `cosyvoice-v3.5-plus`、`cosyvoice-v3.5-flash` | 必须传已有定制音色 ID |
| Qwen3 TTS | `qwen3-tts-flash`、`qwen3-tts-instruct-flash` | `Cherry` |
| Qwen3 定制音色 | `qwen3-tts-vd-2026-01-26`、`qwen3-tts-vc-2026-01-22` | 必须传已有定制音色 ID |
| 百炼 MiniMax | `MiniMax/speech-2.8-hd`、`MiniMax/speech-2.8-turbo`、`MiniMax/speech-02-hd`、`MiniMax/speech-02-turbo` | `male-qn-qingse` |

模型按非实时 HTTP 接口的地域支持筛选：北京提供以上全部模型，新加坡提供上述 Qwen3 TTS 模型。Qwen TTS 自动使用地域对应的 DashScope 地址，其他系列使用 Workspace 地址。不同地域应使用对应地域的 API Key。

`voice` 可以指定该模型支持的系统音色或已创建的定制音色 ID。此工具不负责在阿里云创建、设计或复刻音色，因此阿里云模型不接受 `ref_audio` / `ref_text`；`ListVoices` 仍只列出本地保存的参考音色。`instruct` 用于所选模型支持的语音表现控制：Qwen3 仅 Instruct Flash 支持，CosyVoice V2 和百炼 MiniMax 不支持，CosyVoice V3 系统音色需遵循各音色规定的指令格式。Qwen3 单次文本最多 600 字符，百炼 MiniMax 少于 10000 字符。

例如，选择 **Qwen3 TTS Instruct Flash** 后：

```json
{
  "text": "欢迎收听今天的节目。",
  "language": "Chinese",
  "voice": "Cherry",
  "instruct": "语气温暖自然，语速稍慢。",
  "save_path": "welcome.wav"
}
```

接口与音色参数参见[阿里云非实时语音合成文档](https://help.aliyun.com/zh/model-studio/non-realtime-tts-user-guide)和[CosyVoice 音色列表](https://help.aliyun.com/zh/model-studio/cosyvoice-voice-list)。

**MusicGeneration** 已注册在音频工具集中。在该工具配置的模型选择器中选择 MiniMax **Music 3.0** 或 **Music 2.6**（旧配置 `music-2.5` 需要重新选择）。用 `prompt` 描述音乐，可通过 `lyrics` 提供歌词，或用 `is_instrumental=true` 生成纯音乐；未提供歌词的歌曲会自动生成歌词。`format` 支持 `mp3`（默认）和 `wav`，`save_path` 可指定绝对路径或工作区相对路径。工具等待生成完成后下载音频并返回本地文件，不依赖有效期为 24 小时的临时 URL。当前工具接入文本生成音乐，未接入翻唱模型。

MiniMax 官方公告：自 2026 年 8 月 20 日起，音乐付费 API 不再向新用户开放，历史付费用户可继续使用；免费音乐接口已停止服务。实际可用性取决于账号权限。

接口依据：[MiniMax 语音识别](https://platform.minimax.cn/docs/api-reference/speech-to-text)、[MiniMax 音乐生成及服务公告](https://platform.minimax.cn/docs/api-reference/music-generation)。

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
