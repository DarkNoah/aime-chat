# 本地模型与知识库准备

列出、下载或删除 Aime Chat 本地模型，以及创建知识库前准备本地 embedding（嵌入）与 reranker（重排序）时使用本说明。优先运行 [scripts/local_models.py](../scripts/local_models.py)，使用 Python 3 标准库。

脚本从 `AIME_CHAT_API_BASE_URL` 获取地址，需要本机 API 服务已启用并运行。模型保存在应用配置的 `modelPath` 下，下载接口只接受应用目录中列出的模型和来源。

## 查询本地模型

```bash
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/local_models.py" list --type embedding
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/local_models.py" list --type reranker
```

省略 `--type` 返回所有受支持类型：`embedding`、`reranker`、`clip`、`ocr`、`other`。结果按类型分组，模型包含：

- `id`：目录中的模型 ID，下载、删除使用此值。
- `repo`、`download[]`：模型仓库和可选来源，`source` 为 `modelscope` 或 `huggingface`。
- `isDownloaded`、`status`：文件是否已就绪；状态为 `not_downloaded`、`downloading`、`downloaded`、`incomplete` 或 `deleting`。
- `modelPath`：模型所在本地目录。
- `providerModelId`：embedding、reranker、CLIP 模型用于默认模型设置、知识库创建的完整 ID，例如 `local/bge-m3` 或 `local/Qwen/Qwen3-Embedding-0.6B`。

`isDownloaded=true` 表示存在非空配置和 ONNX 权重，且没有未完成下载标记；这是文件检查，不是推理健康检查。不要把存在目录、请求已开始或某个 CLI 输出当成下载完成。

## 下载、确认状态与删除

先查询目录，再使用实际返回的 `id`、类型和下载来源。以下 ID 是目录中的示例，执行前仍需确认：

```bash
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/local_models.py" download \
  --type embedding --model-id bge-m3 --source modelscope
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/local_models.py" download \
  --type reranker --model-id bge-reranker-base --source modelscope
```

下载需要 UV / uvx。若接口返回缺少 UV，按 [runtime 环境说明](runtime.md) 检查并安装或修复 UV，再下载。下载使用 ModelScope CLI 或 [Hugging Face 的 `hf download`](https://huggingface.co/docs/huggingface_hub/main/en/guides/cli)，不会安装到任意用户传入的目录。

请求等待下载及文件检查完成后返回该模型状态。默认 HTTP 超时为 3600 秒，可用 `--timeout 7200` 延长。超时或断连不会取消后台下载，先执行 `list --type ...` 查看状态；`downloading` 时不要重复提交或创建依赖它的知识库。失败或中断会保留下载文件及未完成标记，确认没有活动下载后可重试；`incomplete` 不可作为可用模型。

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

## 创建知识库前的流程

1. 查询 [默认模型](default-models.md)，确认用户准备使用本地还是已配置的远程模型；保留用户选定的模型方案。
2. 使用本地方案时，分别列出 `embedding` 和 `reranker`。已有可用模型时直接复用；缺哪类就向用户说明并列出该类可下载模型和来源。用户已要求下载或准备指定本地模型时直接执行，否则让用户选择缺失模型与来源后再下载。
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

删除请求体：`{"type":"embedding","modelId":"bge-m3"}`。

`modelId` 不含额外的 `local/` provider 前缀，例如 Qwen 模型应传 `Qwen/Qwen3-Embedding-0.6B`。不支持的类型、模型或来源返回 HTTP 400；缺少 UV 或操作冲突返回 409；下载、文件验证或删除失败返回 500。错误体沿用 `{ "success": false, "message": "..." }`，脚本以非零状态退出。
