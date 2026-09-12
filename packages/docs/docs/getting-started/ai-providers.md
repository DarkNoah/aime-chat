---
sidebar_position: 3
---

# AI 服务商配置

AIME Chat 通过 Provider 连接聊天、Embedding、重排、搜索、OCR、语音、音乐、图像、视频和 3D 等模型服务。内置 Provider 与模型目录会随版本更新，因此本页不维护容易过期的固定模型清单；以应用中的 **设置 → AI 服务商** 和模型选择器为准。

## 添加 Provider

首次设置或后续配置的基本流程相同：

1. 打开 **设置 → AI 服务商**，点击添加。
2. 选择 Provider 类型并填写自定义名称。
3. 填写 API Key；需要代理、兼容网关或私有部署时填写 API Base。
4. 保存后读取模型列表。
5. 只启用实际需要的模型，并保存模型配置。
6. 回到聊天或 Agent 详情页选择模型。

应用会从内置动态目录生成聊天 Provider 列表，并额外提供 OpenAI Responses API、Ollama，以及 Brave Search、SerpAPI、Tavily、Jina.ai、MinerU、ElevenLabs、PaddleOCR API 等专项 Provider。不同类型需要的字段和模型能力不同。

## 管理模型

Provider 保存后，可以在模型列表中：

- 启用或停用模型；
- 搜索模型 ID 或名称；
- 手动添加目录中没有的模型；
- 编辑模型 ID、名称、输入模态、上下文长度和工具调用支持。

手动填写的能力声明必须与服务端真实能力一致。例如，把不支持图片或工具调用的模型标记为支持，并不会让服务端获得该能力，反而可能导致请求失败。

:::tip 控制模型数量
只启用常用模型可以让聊天和 Agent 的模型选择器更清晰。模型目录更新频繁，不建议把某个型号长期写死在 Agent Instructions 中。
:::

## API Base 与兼容接口

API Base 适用于官方地址以外的兼容端点、企业网关或本地代理。配置时注意：

- 按 Provider 文档确认地址是否需要包含 `/v1` 等路径；
- 不要把聊天接口、Responses 接口和 OpenAI-compatible 接口混为一谈；
- 网关使用自签名证书、代理或额外 Headers 时，先在同一台机器上验证连通性；
- 模型 ID 必须使用目标服务真实接受的值。

## 阿里云与 MiniMax 媒体模型

### 阿里云 Workspace ID 与 Region

1. 在 **设置 → AI 服务商** 中添加或编辑 **Alibaba / Alibaba (China)**，配置 API Key 并启用供应商
2. 使用视频、3D、语音识别或合成时，填写对应业务空间的 **Workspace ID** 和 **Region**；Region 默认 `cn-beijing`，可以从列表选择或输入地域标识
3. 保存后，到默认模型设置或工具配置中选择所需模型

媒体接口按业务空间和地域构建，聊天仍使用该供应商的 API Base。API Key、业务空间与地域应匹配；语音模型列表会按地域筛选，Tripo 3D 当前仅在 `cn-beijing` 显示。调整 Region 后，重新进入相应模型选择器核对可用模型。

### 在哪里选择模型

| 能力 | 模型选择位置 | 当前接入示例 |
| --- | --- | --- |
| 视频生成 | **设置 → 默认模型 → 默认视频生成模型**，或 GenerateVideo 工具配置 | MiniMax H3 / H3 Max、Wan 3.0 Video / Prime |
| 语音识别 | 默认语音识别模型，或 SpeechToText 工具配置 | MiniMax ASR 1.0、阿里云 Qwen / Fun ASR / Paraformer |
| 语音合成 | 默认语音合成模型，或 TextToSpeech 工具配置 | 阿里云 Qwen、CosyVoice、百炼 MiniMax |
| 3D 生成 | Generate3D 工具配置 | 阿里云 Tripo H3.1 / P1.0 |
| 音乐生成 | MusicGeneration 工具配置 | MiniMax Music 3.0 / 2.6 |

工具中单独指定的模型优先于全局默认模型。3D 和音乐工具没有对应的全局默认项，使用前需要在工具中选模；旧的 `music-2.5` 配置需要重新选择 Music 3.0 或 Music 2.6。模型出现在列表中不代表当前账号已获服务权限。

需要字幕时，选择能返回时间戳的识别模型；Qwen3 ASR Flash 仅返回文本。阿里云定制音色模型需要已有音色 ID，TextToSpeech 不负责在阿里云创建或复刻音色。各工具的输入、地域、音色及任务停止行为见 [工具系统](../features/tools)。

## 本地模型

### Ollama

1. 安装并启动 Ollama。
2. 在终端确认 `ollama list` 能看到已下载模型。
3. 在 AIME Chat 添加 Ollama Provider；远程运行时填写相应 API Base。
4. 获取模型列表，启用需要的模型。

默认本地地址通常是 `http://127.0.0.1:11434`，但应以你的 Ollama 配置为准。

### LM Studio 与其他兼容服务

先在服务端启用本地 API，再使用相应 Provider 类型或兼容端点配置 API Base。应用与模型服务运行在不同机器、容器或虚拟机时，`127.0.0.1` 指向各自环境，需改成客户端可访问的地址。

## 为不同能力选择 Provider

模型名称不能替代能力验证。配置前先确认目标用途：

| 用途 | 需要确认的能力 |
| --- | --- |
| 普通聊天 | 文本输入输出、上下文长度 |
| Agent 工具 | 模型和 Provider 都支持 tool calling |
| 图片理解 | 输入模态包含图片，并使用兼容消息格式 |
| 知识库向量 | Embedding 模型与稳定的向量维度 |
| 知识库重排 | Reranker 接口与模型类型 |
| 图像、语音、OCR | 对应专项 Provider 与运行库已配置 |
| 视频、3D、音乐 | 对应工具已选模型，供应商账号具有权限，业务空间与地域匹配 |
| Web Search | 搜索 Provider 的 Key、区域和配额可用 |

更换知识库 Embedding 模型会触发全量向量重算；详见 [知识库管理](../features/knowledge-base#更换向量模型)。

## 密钥与本地数据

Provider 配置保存在本地应用数据库中，供主进程发起请求时使用。当前文档不把这种存储描述为静态加密保险箱，因此仍应：

- 保护操作系统账户、应用数据目录和备份；
- 使用权限最小、可轮换的 API Key；
- 不在截图、聊天、日志、仓库或 Agent 导出配置中粘贴真实密钥；
- 停用或删除不再使用的 Provider，并在服务商控制台撤销旧密钥。

## 常见问题

### 无法获取模型列表

1. 检查 API Key、API Base、网络和代理。
2. 确认账户权限、余额或配额。
3. 某些兼容服务不提供模型列表接口，可手动添加服务端支持的模型 ID。

### 模型在聊天中不可见

确认 Provider 和模型都已启用，并检查当前入口是否只筛选聊天模型。Embedding、重排、搜索或 OCR Provider 不一定会出现在普通聊天模型选择器中。

### 工具调用或多模态请求失败

核对模型编辑器中的工具调用与输入模态声明，并以服务商当前文档为准。模型 ID 相似并不表示不同端点具有相同能力。

### 本地服务连接失败

确认服务进程正在监听、端口没有被防火墙阻断，并从运行 AIME Chat 的系统测试 API Base。容器或远程主机上的 `localhost` 通常不是桌面应用所在机器。
