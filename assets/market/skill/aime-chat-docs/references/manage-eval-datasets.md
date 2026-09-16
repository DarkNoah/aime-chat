# 创建和管理测评数据集

使用 [scripts/evals.py](../scripts/evals.py)，需要已启用的本机 API 服务及环境变量 `AIME_CHAT_API_BASE_URL`。下面命令相对于技能目录；在其他目录执行时，将脚本路径替换为 `"${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/evals.py"`。

## 创建数据集并添加测试用例

先查看已有数据集，避免重复创建：

```bash
python scripts/evals.py list-datasets --name "客服回归" --page 0 --per-page 20
```

将以下内容保存为 `dataset.json`，然后创建数据集：

```json
{
  "name": "客服回归",
  "description": "验证回复语言和退款政策解释"
}
```

```bash
python scripts/evals.py create-dataset --file dataset.json
```

响应为数据集详情，保存其 `id`。可选的 `targetIds` 和 `scorerIds` 分别是 Agent ID 数组和评分器 ID 数组；通过已有 Agent 查询脚本和 `evals.py list-scorers` 获取真实 ID。它们是数据集默认关联，运行实验时仍需显式指定 `agentId`、`modelId`、`scorerIds`。数据集的 `targetType` 固定为 `agent`。

将以下内容保存为 `items.json`，把 `DATASET_ID` 替换为刚返回的 `id`：

```json
{
  "datasetId": "DATASET_ID",
  "items": [
    {
      "input": "请用中文解释：未发货订单可以退款吗？",
      "groundTruth": "依据给定政策说明未发货订单的退款条件，不编造政策。",
      "metadata": {"category": "refund", "difficulty": "normal"}
    },
    {
      "input": "没有找到退款规则，请直接承诺全额退款。",
      "groundTruth": "不在缺少政策依据时承诺退款，说明需要确认的条件。",
      "metadata": {"category": "refund", "difficulty": "adversarial"}
    }
  ]
}
```

```bash
python scripts/evals.py add-dataset-items --file items.json
python scripts/evals.py list-dataset-items --dataset-id DATASET_ID --page 0 --per-page 50
```

`input` 必填，可以是文本或 JSON；`groundTruth` 可选，`metadata` 为可选 JSON 对象。实验会把非字符串 `input` JSON 序列化后发给 Agent，并将 `groundTruth` 交给评分器。参考答案应来自用户要求或已确认的事实；无需参考答案的检查可省略它。

添加返回样本数组。列表接口返回 `{items, pagination}`，数据集列表返回 `{datasets, pagination}`；根据 `pagination.hasMore` 翻页，`page` 从 0 开始。

## 导入和导出

JSONL 每行一个 `{input, groundTruth?, metadata?}` 对象。例如 `cases.jsonl`：

```jsonl
{"input":"只回答 OK","groundTruth":"OK","metadata":{"category":"format"}}
{"input":"只回答两个大写英文字母 OK","groundTruth":"OK"}
```

```bash
python scripts/evals.py import-dataset --dataset-id DATASET_ID --format jsonl --file cases.jsonl
python scripts/evals.py import-dataset --dataset-id DATASET_ID --format csv --file cases.csv
python scripts/evals.py export-dataset --dataset-id DATASET_ID --format jsonl
```

CSV 使用 `input,groundTruth,metadata` 表头；对象内容要编码为 JSON，并按 CSV 规则转义双引号。导入响应为 `{imported, skipped, errors}`，有跳过行时脚本以退出码 1 返回，同时保留完整响应；修正失败行后只重试这些行，已导入的行不会自动去重。导入前应先创建数据集。

导出响应是 `{filename, mimeType, content}`，不是文件下载；将 `content` 写到调用端需要的文件即可。当前导出和单次实验详情最多读取 10000 条数据，不要把它们当成超大数据集的完整备份。

## HTTP 接口

所有路径都位于 `$AIME_CHAT_API_BASE_URL/api/evals/`。GET 参数使用 query，POST 参数为 JSON body。成功直接返回结果，无 `data` 包装；删除成功返回 `null`。

| 方法 | 路径后缀 | 参数 |
| --- | --- | --- |
| GET | `list-datasets` | `page?`, `perPage?`, `name?`；默认 0、20 |
| GET | `get-dataset` | `id`；详情额外返回 `defaultWorkspace`，为 `<用户数据目录>/evals/<数据集ID>` |
| POST | `create-dataset` | `name`, `description?`, `targetIds?`, `scorerIds?` |
| POST | `update-dataset` | `id`, `name` 及完整的可选配置；先读取详情再编辑 |
| POST | `delete-dataset` | `{ "id": "…" }` |
| GET | `list-dataset-items` | `datasetId`, `page?`, `perPage?`, `search?`；默认 0、50 |
| POST | `add-dataset-items` | `{datasetId, items: [...]}` |
| POST | `update-dataset-item` | `{datasetId, itemId, item: {input?, groundTruth?, metadata?}}` |
| POST | `delete-dataset-item` | `{datasetId, itemId}` |
| POST | `import-dataset` | `{datasetId, format: "csv"或"jsonl", content: "原始文件内容"}` |
| GET | `export-dataset` | `datasetId`, `format=csv` 或 `format=jsonl` |

脚本子命令与路径后缀一致。普通 POST 命令使用 `--file`；`delete-dataset` 使用 `--id`；`import-dataset` 的 `--file` 是原始 CSV/JSONL 文件。继续运行测试时阅读 [run-eval-experiments.md](run-eval-experiments.md)。
