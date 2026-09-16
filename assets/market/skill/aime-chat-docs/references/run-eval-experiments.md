# 运行测评实验和读取结果

使用 [scripts/evals.py](../scripts/evals.py)，需要环境变量 `AIME_CHAT_API_BASE_URL` 和已启动的本机 API 服务。以下命令相对于技能目录，也可使用 `"${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/evals.py"`。

## 准备并启动

1. 按 [manage-eval-datasets.md](manage-eval-datasets.md) 创建数据集并确认有样本。
2. 运行 `scripts/get_available_agents.py --json`、`scripts/get_available_models.py --json` 和 `scripts/evals.py list-scorers`，获取真实 Agent、完整模型和评分器 ID。需要自定义指标时阅读 [create-eval-scorers.md](create-eval-scorers.md)。
3. 将以下 JSON 保存为 `experiment.json`，替换占位 ID，再运行实验。一次请求运行一个 Agent、一个模型、多个评分器；比较不同模型或 Agent 时分别创建实验。

```json
{
  "datasetId": "DATASET_ID",
  "name": "客服回归-第一轮",
  "description": "运行已准备的退款问答测试用例",
  "agentId": "AGENT_ID",
  "modelId": "PROVIDER_ID/MODEL_ID",
  "scorerIds": ["SCORER_ID"],
  "maxConcurrency": 3
}
```

```bash
python scripts/evals.py start-experiment --file experiment.json --wait --wait-timeout 600
```

工作目录 `workspace` 是启动 API 的必填字段，必须为运行 Aime Chat 那台机器上的绝对路径。运行窗口默认填入 `<用户数据目录>/evals/<数据集ID>`，可手动修改或选择目录。脚本在 JSON 未提供 `workspace` 时先查询 `get-dataset` 的 `defaultWorkspace`，填入后再提交；显式传入空白路径会报错。

上面的 JSON 示例使用脚本自动填充默认目录。指定其他目录时，可在 JSON 中增加 `"workspace": "/absolute/path/to/eval-workspace"`，或用命令行覆盖：

```bash
python scripts/evals.py start-experiment --file experiment.json --workspace "/absolute/path/to/eval-workspace" --wait
```

直接调用 HTTP API 时，先 `GET /api/evals/get-dataset?id=DATASET_ID` 读取 `defaultWorkspace`，再把它作为 `workspace` 放进启动请求。服务端会在启动前创建并检查目录，将路径写入实验 `metadata.workspace`，并传给每条样本的 Agent 和工具。所有样本共用所选目录；默认情况下，同一数据集的多次实验也共用目录，产物在结束后保留。需要避免相互覆盖时，为实验指定不同目录，或在测试中使用不同文件名。

实验使用 Agent 当前配置的工具和子 Agent，会实际调用模型，也可能执行工具。样本应符合本次测试目标；如果只想验证评分器，使用 `test-scorer`。并发默认 3，运行端限制在 1–8；HTTP 请求超时默认 60 秒，可用 `--request-timeout` 调整。

不加 `--wait` 时立即返回 `{experimentId, status: "pending", totalItems}`。这是已启动回执，不能视为测试成功。保存 `datasetId` 和 `experimentId`，之后查询：

```bash
python scripts/evals.py list-experiments --dataset-id DATASET_ID
python scripts/evals.py get-experiment --dataset-id DATASET_ID --experiment-id EXPERIMENT_ID
python scripts/evals.py get-experiment --dataset-id DATASET_ID --experiment-id EXPERIMENT_ID --wait
```

`--wait` 默认每 2 秒查询，最多等 600 秒，终态为 `completed` 或 `failed`。可用 `--poll-interval`、`--wait-timeout` 调整。等待超时退出码为 2，不会取消实验；脚本会在 stderr 输出 ID 和继续查询命令。HTTP 失败时不会自动重试启动请求，避免重复运行；启动请求结果不确定时先用 `list-experiments` 核实。

## 读取和解释结果

`get-experiment` 返回：

```json
{
  "experiment": {"id": "EXPERIMENT_ID", "status": "completed", "totalItems": 2, "succeededCount": 2, "failedCount": 0},
  "results": [],
  "scoreSummary": {"SCORER_ID": {"total": 1.5, "count": 2, "average": 0.75}}
}
```

这是字段示意；真实 `results` 包含各样本结果和附加的 `scores` 数组。输出报告时记录数据集/实验/Agent/模型/评分器 ID、实验状态、成功与失败样本数、各项均分、得分样本数和失败原因。

`completed` 只代表实验结束，不代表所有样本都成功或评分达标。检查 `failedCount`、逐条结果/评分错误及 `scoreSummary[*].count` 是否覆盖预期样本；没有分数不能当成 0 分或通过。脚本在状态为 `failed` 或 `failedCount > 0` 时返回退出码 1，但用户定义的质量门槛仍需单独判断。平均分基于已返回的评分，不能忽略缺失项或把不同评分器直接混成总分。

单次详情最多返回 10000 条结果，`scoreSummary` 基于评分存储中的整轮分数；超大实验的逐条结果可能不完整。

## 对比实验

使用相同测试用例和指标对比，记录数据集版本是否一致。将以下内容保存为 `compare.json`：

```json
{"experimentIds": ["BASELINE_EXPERIMENT_ID", "NEW_EXPERIMENT_ID"], "baselineId": "BASELINE_EXPERIMENT_ID"}
```

```bash
python scripts/evals.py compare-experiments --file compare.json
```

至少两个实验 ID；`baselineId` 可省略，默认第一个。响应包含 `baselineId` 和逐条 `items`，每条 `results` 按实验 ID 索引；缺失结果可能为 `null`。按评分器的 `scoreDirection` 判断改善方向。

## 给已有对话评分

无需运行数据集时，可对某个对话已存在的助手文本评分。`thread-score.json`：

```json
{"threadId": "THREAD_ID", "scorerIds": ["SCORER_ID"], "judgeModelId": "PROVIDER_ID/MODEL_ID"}
```

```bash
python scripts/evals.py score-thread --file thread-score.json
python scripts/evals.py list-thread-scores --thread-id THREAD_ID --page 0 --per-page 100
```

可选 `messageIds` 用于限定助手消息；省略或空数组会评分所有非空助手文本。输入取该助手消息之前最近的用户文本。内置 LLM 评分器需要 `judgeModelId`，自定义 judge 使用自身配置。返回数组包含 `assistantMessageId` 及 `scores`，逐项检查 `error`；当前链路只传文本，不包含工具轨迹或每条消息的参考答案。

## HTTP 接口

路径前缀为 `/api/evals/`，GET 参数为 query，POST 参数为 JSON body。

| 方法 | 路径后缀 | 参数 |
| --- | --- | --- |
| POST | `start-experiment` | 上述实验配置及必填的绝对路径 `workspace`；`description`、`maxConcurrency` 可选 |
| GET | `list-experiments` | `datasetId`, `page?`, `perPage?`；默认 0、20，返回 `{experiments, pagination}` |
| GET | `get-experiment` | `datasetId`, `experimentId` |
| POST | `compare-experiments` | `experimentIds`, `baselineId?` |
| POST | `score-thread` | `threadId`, `scorerIds`, `messageIds?`, `judgeModelId?` |
| GET | `list-thread-scores` | `threadId`, `page?`, `perPage?`；默认 0、100 |

服务端错误通常返回非 2xx 及 `{success: false, message}`。脚本把诊断输出到 stderr、正常 JSON 输出到 stdout，保留两者以便复核。
