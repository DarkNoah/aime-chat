# 获取可用模型

使用代码查询 Aime Chat 可用模型时，API 地址从环境变量读取。`AIME_CHAT_API_BASE_URL` 由代码运行环境提供，例如：

```text
http://localhost:4133
```

下面所有请求都基于 `$AIME_CHAT_API_BASE_URL`。

```http
GET $AIME_CHAT_API_BASE_URL/api/providers/available-models
```

需要先启用并启动 Aime Chat 的本机 API 服务。

## 优先使用代码请求

需要查询可用模型时，优先执行代码发起 HTTP 请求。不要手写猜测模型列表，也不要只根据记忆回答。

请求前先检查环境变量是否存在：

```py
import os

base = os.environ.get('AIME_CHAT_API_BASE_URL')
if not base:
    print('AIME_CHAT_API_BASE_URL is not set')
```

基础请求，并按文档输出样式提取完整模型 ID 和名称：

```py
import os, json, urllib.request

base = os.environ.get('AIME_CHAT_API_BASE_URL')
if not base:
    print('AIME_CHAT_API_BASE_URL is not set')
else:
    with urllib.request.urlopen(base.rstrip('/') + '/api/providers/available-models') as r:
        data = json.load(r)
    for provider in data:
        print(provider.get('name') or provider.get('id') or '')
        for model in provider.get('models') or []:
            print(f"- [{model.get('id')}]: {model.get('name') or ''}")
        print()
```

查询 embedding 模型：

```py
import os, json, urllib.request

base = os.environ.get('AIME_CHAT_API_BASE_URL')
if not base:
    print('AIME_CHAT_API_BASE_URL is not set')
else:
    with urllib.request.urlopen(base.rstrip('/') + '/api/providers/available-models?type=embedding') as r:
        data = json.load(r)
    for provider in data:
        print(provider.get('name') or provider.get('id') or '')
        for model in provider.get('models') or []:
            print(f"- [{model.get('id')}]: {model.get('name') or ''}")
        print()
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
