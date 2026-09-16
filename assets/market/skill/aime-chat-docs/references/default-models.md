# 列出和设置默认模型

查询或修改 Aime Chat 全局默认模型时，优先使用 [scripts/default_models.py](../scripts/default_models.py)。脚本使用 Python 3 标准库，并从 `AIME_CHAT_API_BASE_URL` 读取本机 API 地址；服务需已启用并运行，不要猜测端口。

## 列出当前默认模型

```bash
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/default_models.py" list
```

返回各用途当前生效的模型 ID，与 `/api/app/info` 的 `defaultModel` 相同。已保存的设置覆盖对应环境变量默认值；未配置的字段在 JSON 中可能缺失，空字符串表示显式清空。不要把缺失或清空解释成已选中了某个模型。

默认模型配置与可用模型目录是两个不同查询。选择新模型前，读取 [获取可用模型](get-available-models.md)，查询对应类型并使用返回的准确 `models[].id`，不要根据显示名称拼接 ID。

| 配置字段 | 脚本参数 | 用途 | 可用模型查询类型 |
| --- | --- | --- | --- |
| `model` | `--model` | 默认聊天模型 | `llm` |
| `fastModel` | `--fast-model` | 快速任务模型 | `llm` |
| `visionModel` | `--vision-model` | 视觉模型 | `llm`，需确认支持图片输入 |
| `embeddingModel` | `--embedding-model` | 嵌入模型 | `embedding` |
| `rerankerModel` | `--reranker-model` | 重排序模型 | `reranker` |
| `ocrModel` | `--ocr-model` | OCR 模型 | `ocr` |
| `transcriptionModel` | `--transcription-model` | 语音转文字 | `transcription` |
| `speechModel` | `--speech-model` | 文字转语音 | `speech` |
| `generateImageModel` | `--generate-image-model` | 图片生成 | `image_generation` |
| `generateVideoModel` | `--generate-video-model` | 视频生成 | `video_generation` |

模型 ID 通常为 `<provider-id>/<model-id>`，内置模型可能使用其他格式，以接口返回值为准。

## 设置一个或多个用途

以下示例中的模型 ID 是占位符，执行前替换为实际查询到的 ID：

```bash
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/get_available_models.py" --type llm --json
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/default_models.py" set \
  --model "<provider-id>/<chat-model-id>" \
  --fast-model "<provider-id>/<fast-model-id>"
```

仅传用户要求修改的用途。设置按字段合并，未传字段保持原状，不要把查询结果中的环境变量默认值全部回写为固定配置。返回值为保存后生效的完整默认模型配置。

清空某个用途时传空字符串：

```bash
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/default_models.py" set --vision-model ""
```

空字符串会覆盖环境变量默认值，不等于恢复环境变量回退。此接口不接受 `null`，也不提供删除已保存覆盖值的操作。

这是应用全局设置，不会改写已有会话或 Agent 的显式模型配置。设置接口校验字段和值的类型，但不调用模型，也不验证模型在线可用性；保存成功应描述为配置已保存。已有界面在重新获取应用信息后显示外部修改。

## API 约定

```http
GET  /api/app/default-models
POST /api/app/default-models
Content-Type: application/json

{"fastModel":"<provider-id>/<model-id>","visionModel":""}
```

POST 直接传字段对象，不包裹 `defaultModel`、`id` 或 `value`。至少传一个受支持字段，值必须为字符串，首尾空白会被去除。未知字段、空对象、数组或非字符串值返回 HTTP 400；存储失败返回 HTTP 500。错误体为 `{ "success": false, "message": "..." }`，脚本以非零状态退出。请求超时或断连后先执行 `list` 确认实际状态。
