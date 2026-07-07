# 获取可用模型

接口：

```http
GET $AIME_CHAT_API_BASE_URL/api/providers/available-models
```

API 地址从环境变量 `AIME_CHAT_API_BASE_URL` 读取（例如 `http://localhost:4133`），由代码运行环境提供。需要先启用并启动 Aime Chat 的本机 API 服务。

## 优先运行脚本

需要查询可用模型时，优先运行 [scripts/get_available_models.py](../scripts/get_available_models.py)。不要手写猜测模型列表，也不要只根据记忆回答。

```bash
python scripts/get_available_models.py                  # 默认 llm
python scripts/get_available_models.py --type embedding # 指定类型
python scripts/get_available_models.py --json           # 输出原始 JSON
```

如果不能执行代码、`AIME_CHAT_API_BASE_URL` 未设置，或请求失败，再说明失败原因，并改用已有上下文中的信息回答。

## 查询参数

- `type`: 可选，模型类型；不传时默认返回 `llm`。

支持的 `type` 值：

```text
llm
embedding
reranker
image_generation
transcription
speech
ocr
music
```

## 返回结构

接口返回 provider 数组。每个 provider 包含该 provider 下当前可用的模型：

```json
[
  {
    "id": "openai",
    "name": "OpenAI",
    "icon": "...",
    "type": "openai",
    "models": [
      {
        "id": "openai/gpt-4.1",
        "name": "gpt-4.1",
        "providerType": "openai",
        "isActive": true
      }
    ]
  }
]
```

注意：

- `models[].id` 是完整模型 ID，格式通常是 `<provider-id>/<model-id>`，调用聊天、嵌入、语音等能力时优先使用这个完整 ID。
- `llm` 类型只返回已启用 provider 中已启用的聊天模型。
- `embedding`、`reranker`、`transcription`、`speech`、`ocr` 等类型会按 provider 能力查询，并可能包含本地 provider 的模型。
- 没有可用模型时返回空数组 `[]`。
