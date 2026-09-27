# 本地模型与知识库准备

列出、下载或删除 Aime Chat 本地模型，以及创建知识库前准备本地 embedding（嵌入）与 reranker（重排序）时使用本说明。优先运行 [scripts/local_models.py](../scripts/local_models.py)，使用 Python 3 标准库。

脚本从 `AIME_CHAT_API_BASE_URL` 获取地址，需要本机 API 服务已启用并运行。模型保存在应用配置的 `modelPath` 下，下载接口只接受应用目录中列出的模型和来源。

## 查询本地模型

```bash
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/local_models.py" list --type embedding
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/local_models.py" list --type reranker
```

省略 `--type` 返回所有受支持类型：`embedding`、`reranker`、`clip`、`ocr`、`other`、`tts`、`stt`、`diarization`。语音模型目录按当前平台提供 MLX 或 PyTorch 版本。结果按类型分组，模型包含：

- `id`：目录中的模型 ID，下载、删除使用此值。
- `repo`、`download[]`：模型仓库和可选来源，`source` 为 `modelscope` 或 `huggingface`。
- `isDownloaded`、`status`：文件是否已就绪；状态为 `not_downloaded`、`downloading`、`downloaded`、`incomplete` 或 `deleting`。
- `modelPath`：模型所在本地目录。
- `providerModelId`：embedding、reranker、CLIP、TTS、STT 模型用于默认模型设置或知识库创建的完整 ID，例如 `local/bge-m3` 或 `local/Qwen/Qwen3-Embedding-0.6B`。辅助对齐模型不提供此字段。
- `dependencies`：随当前语音模型一起下载的依赖模型 ID；`selectable=false` 表示辅助模型，不作为默认模型选择。

`isDownloaded=true` 表示存在非空配置和所需权重，且没有未完成下载标记。语音模型还会检查 safetensors 分片、分词器/音频编解码器和依赖模型；其他模型检查 ONNX 权重。这是文件检查，不是推理健康检查。不要把存在目录、请求已开始或某个 CLI 输出当成下载完成。

## 下载、确认状态与删除

先查询目录，再使用实际返回的 `id` 和类型。默认使用 ModelScope，脚本省略 `--source` 等同于 `--source modelscope`；仅在用户指定 Hugging Face 或目录没有 ModelScope 来源时显式传 `--source huggingface`。以下 ID 是目录中的示例，执行前仍需确认：

```bash
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/local_models.py" download \
  --type embedding --model-id bge-m3
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/local_models.py" download \
  --type reranker --model-id bge-reranker-base
```

下载需要 UV / uvx。若接口返回缺少 UV，按 [runtime 环境说明](runtime.md) 检查并安装或修复 UV，再下载。下载使用 ModelScope CLI 或 [Hugging Face 的 `hf download`](https://huggingface.co/docs/huggingface_hub/main/en/guides/cli)，不会安装到任意用户传入的目录。

请求等待下载及文件检查完成后返回该模型状态。脚本所有子命令默认不设置 HTTP 超时；正常执行时省略 `--timeout`，也不要额外给下载命令设置执行超时。只有用户明确要求限时等待时才传入 `--timeout 秒数`。断连或显式设置的超时不会取消后台下载，先执行 `list --type ...` 查看状态；`downloading` 时不要重复提交或创建依赖它的知识库。失败或中断会保留下载文件及未完成标记，确认没有活动下载后可重试；`incomplete` 不可作为可用模型。

下载完成后，再运行列表确认 `isDownloaded=true`，并通过 [可用模型查询](get-available-models.md) 核对 provider ID：

```bash
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/get_available_models.py" --type embedding --json
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/get_available_models.py" --type reranker --json
```

删除示例：

```bash
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/local_models.py" delete \
  --type embedding --model-id bge-m3
```

删除移除该模型的磁盘文件，不删除知识库，也不自动清空默认模型设置。使用该模型的知识库之后可能无法导入或向量检索。同一模型正在下载、删除或已加载到内存时返回 409；停止使用并等待空闲释放后再试。只按用户要求删除模型。

## 本地语音模型

设置页的「本地模型」也提供 TTS / STT 下载和删除。语音推理只从配置的模型目录加载，不再自动下载权重；旧 Hugging Face / ModelScope 缓存不会自动迁移或删除。使用前先准备 QwenAudio 运行环境，再下载所需模型。

`SpeechToText` 工具支持可选参数 `diarize`（默认 `false`）。设为 `true` 时需要 `pyannote/speaker-diarization-community-1`。缺少模型时，参照本说明运行下载脚本，通过本地模型模块下载模型实体，然后查询并确认 `isDownloaded=true` 后重试转录；不要静默关闭 `diarize`：

```bash
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/local_models.py" download --type diarization --model-id pyannote/speaker-diarization-community-1
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/local_models.py" list --type diarization
```

脚本默认 ModelScope，省略 `--timeout`。本地 STT 模型缺失时也使用此脚本，将类型设为 `stt`，模型 ID 使用错误提示或目录中的实际 ID（去掉 `local/` 供应商前缀）。也可在「设置 → 本地模型」中下载。

`output_type` 支持 `text`、`json`、`srt`、`ass`，四种格式均支持 `save_path`，共用同一套字幕级分段（含说话人切换边界），JSON 不再直接返回词级对齐片段。text 直接返回字符串，不返回内部 JSON 对象。文本与字幕的输出把时长、文件路径放在 `<system-reminder>` 内，内容放在 `<transcription-text>` 内。启用 `diarize` 时，text/SRT 的内容带 `[SPEAKER_00]` 标签；ASS 将说话人写入事件的 `Name` 字段，`Text` 不拼接标签。保存的文件只包含各格式原生内容，不含外层提醒标签。

JSON 返回并保存同一个完整对象：可选 `savePath`、`diarize`、`duration` 和 `segments`；每段为 `start`、`end`、`text`，仅启用分离时带 `speaker`。时间单位为秒，`duration` 保留原始精度（未知为 `null`），未启用分离且无时间戳时 `segments=[]`。不返回额外的顶层 `format`、`text` 或 `language`。`save_path` 未提供、为 `null` 或空字符串时，text/JSON 不保存文件，也不返回文件路径；SRT/ASS 保留自动命名保存行为。返回的文本/字幕预览限制为 1000 行，保存的文件及 JSON 对象不截断。工具描述中提供各格式与 `diarize` 样例。

该模型包含分段、说话人嵌入和 PLDA 实体文件，支持 ModelScope / Hugging Face 下载；Hugging Face 源需要先在模型页面接受使用条件，并配置有访问权限的本地 Hugging Face 登录凭据。下载缺失、不完整或只有 Git LFS 指针时，工具会提示先下载，不会在转录时补下载权重。分离模型不是默认 STT 模型，不能设为默认模型。

字幕分段综合标点、停顿、说话人、显示长度和时长：同一说话人的逗号、顿号等弱标点后优先续接，间隔不超过 0.8 秒且合并后不超过约 30 个汉字宽度、8 秒时合并；句号、问号、感叹号、换人和长停顿保留分界。超长片段优先在内部标点处拆分，其次按对齐词边界拆分；只有整句时间戳的单个 token 无法可靠细分。先依据原始标点完成分段，再统一移除每段末尾的所有标点和符号（含中英文问号、感叹号、逗号、引号等），保留段内标点；四种格式及保存文件保持一致。

说话人分离需要 UV；首次运行由 UV 准备独立的 pyannote Python 依赖环境，不修改 QwenAudio 环境。模型推理使用本地文件并禁用 Hub 下载。text/SRT 使用 `[SPEAKER_00]` 等匿名标签，ASS 使用 `Name` 字段，JSON 使用 `speaker` 字段；无重叠语音依据的片段使用 `UNKNOWN`。需选择提供时间戳的转录模型（如本地 Qwen3 ASR）；本地 MLX 使用词级对齐先确定说话人，再统一合成字幕级片段。其他模型按其提供的时间戳分配标签后同样进行字幕分段。仅返回纯文本的模型会明确提示不支持说话人分离，不能据此推测说话人身份。

当前语音模型（包括 macOS 的 MLX 版本）均提供 `huggingface` 和 `modelscope` 来源，两者对应同一模型格式和量化版本。Windows/Linux 使用原版 PyTorch 仓库，macOS 使用 `mlx-community` 仓库；ModelScope 来源同样遵循该平台区分。

```bash
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/local_models.py" list --type tts
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/local_models.py" list --type stt
```

TTS 包含 Qwen3 TTS、VoxCPM2、Breeze TTS 2。Qwen 按 CustomVoice（预设音色/普通朗读）、VoiceDesign（声音描述）、Base（参考音频克隆）分别下载；默认模型选择器按参数规模合并显示，调用时检查实际用途需要的变体。STT 的 Qwen3 ASR 会一并下载 ForcedAligner；删除对齐模型后，依赖它的 ASR 会显示未就绪。语音推理期间删除返回 409，空闲时删除会先释放语音运行时。

使用列表返回的具体 `id` 和 `download[].source` 下载，确认 `isDownloaded=true` 后，用 `get_available_models.py --type speech --json` 或 `--type transcription --json` 获取可用于默认模型配置的 ID。下载 ID 使用 `tts` / `stt` 类型，供应商可用模型查询使用 `speech` / `transcription` 类型。

## 创建知识库前的流程

1. 查询 [默认模型](default-models.md)，确认用户准备使用本地还是已配置的远程模型；保留用户选定的模型方案。
2. 使用本地方案时，分别列出 `embedding` 和 `reranker`。已有可用模型时直接复用；缺哪类就向用户说明并列出该类可下载模型。用户已要求下载或准备指定本地模型时直接执行，否则让用户选择缺失模型后再下载；来源默认 ModelScope，不必再次询问来源，用户指定其他来源时遵循其选择。
3. 按上面的下载流程等待完成并复查两类模型。部分成功时只处理失败项，不重复下载已完成的模型，也不提前创建依赖缺失模型的知识库。
4. 调用已有的 `KnowledgeBaseCreate` 工具，显式传入选定模型的 `providerModelId`：

```json
{
  "name": "项目资料",
  "description": "项目文档检索",
  "embeddingModel": "local/bge-m3",
  "rerankerModel": "local/bge-reranker-base"
}
```

工具返回 `success=true` 后再使用返回的 `knowledgeBaseId` 导入文档。未指定 embedding 且没有全局默认时返回 `needsModelSetup=true`，先引导选模与下载；若返回 `missingModels`，先下载对应模型并复查，再重试创建。若文件已就绪但推理失败，报告具体错误，不把文件检查当成推理成功。

仅为本次知识库指定模型时不必修改全局默认值。用户希望后续知识库也复用时，再通过 `default_models.py set --embedding-model ... --reranker-model ...` 设置默认值；省略创建工具的对应字段会使用全局默认模型。显式传 `rerankerModel: ""` 可为该知识库关闭重排序。

已有可用远程 embedding/reranker 时不强制下载本地模型。重排序是可选能力，用户选择不使用时可继续；用户明确要求纯关键词检索时，传 `embeddingModel: ""`（通常同时传 `rerankerModel: ""`），不要因缺少模型自动降级。现有知识库使用其自身配置，缺少对应本地模型应补齐原模型，不要为解决下载问题重建知识库或直接换掉已有向量索引的 embedding 模型。

## API 约定

```http
GET  /api/local-models/list?type=embedding
POST /api/local-models/download
POST /api/local-models/delete
```

下载请求体：`{"type":"embedding","modelId":"bge-m3","source":"modelscope"}`。

可选布尔参数 `setAsDefault`（默认 `false`）表示下载和完整性校验成功后，设为对应类型的默认模型：

```json
{"type":"embedding","modelId":"bge-m3","source":"modelscope","setAsDefault":true}
```

CLI 对应选项为 `download --set-as-default`。仅在用户要求设置默认模型时使用此选项。

| 下载类型 | 默认模型字段 |
| --- | --- |
| `embedding`、`clip` | `embeddingModel` |
| `reranker` | `rerankerModel` |
| `tts` | `speechModel` |
| `stt` | `transcriptionModel` |

保存的值使用返回的 `providerModelId`（包含 `local/` 前缀；Qwen TTS 使用可选择的语音模型族 ID）。只更新对应字段，保留其他默认值及已有知识库配置。BGE 和 CLIP 共用嵌入默认值，批量请求时只对其中一个启用此选项。依赖模型不会继承该选项；OCR 下载目录中的模型、`other` 类型和不可选择的对齐模型不支持设为默认，传 `true` 会返回 400。

下载失败或文件校验不通过时不修改默认值。文件已下载但默认设置保存失败时返回 500，并保留已下载文件；可重试同一请求完成设置，不会重复下载已校验的文件。

删除请求体：`{"type":"embedding","modelId":"bge-m3"}`。

`modelId` 不含额外的 `local/` provider 前缀，例如 Qwen 模型应传 `Qwen/Qwen3-Embedding-0.6B`。不支持的类型、模型或来源返回 HTTP 400；缺少 UV 或操作冲突返回 409；下载、文件验证或删除失败返回 500。错误体沿用 `{ "success": false, "message": "..." }`，脚本以非零状态退出。
