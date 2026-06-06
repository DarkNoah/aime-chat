# 使用 PTC（编程式工具调用）

PTC（Programmatic Tool Calling，编程式工具调用）是 `CodeExecution` 工具的一种模式。它允许在代码执行环境里用代码直接、批量地调用其它工具，而不必每次工具调用都经过一次模型往返。需要对一批数据循环调用工具、或在循环里让模型逐条处理数据时，优先使用 PTC。

## 何时使用

- 需要对一批文件、表格行、图片等循环调用同一个工具。
- 需要在循环里调用模型（`ChatCompletion`）逐条处理、转换或总结数据。
- 工具之间有依赖、需要把上一个工具的结果作为下一个工具的输入。

简单的一次性工具调用不需要 PTC，直接调用对应工具即可。

## 开启方式

`CodeExecution` 的 `ptc` 参数默认是 `true`。需要 PTC 能力时保持默认即可，不需要额外配置。PTC 依赖本机 API 服务，需要先启用并启动 Aime Chat 的本机 API 服务。

## 基本约定

- 当前上下文里所有可用工具都已作为全局异步函数注入，**不需要 import**，直接调用即可。
- 工具名、描述和参数与当前上下文中的工具一致。
- 所有工具都是 **async**，必须用 `await` 调用。
- 所有工具返回值都是 **文本**。如果某个工具的返回格式是 JSON 或 JSON 数组且需要使用，用 `json.loads(result)` 解析成对象。
- 需要把信息返回给用户时，用 `print(result)` 输出。
- 妥善处理错误（`try/except`）。
- 输入数据较多时，优先在代码里用变量动态获取，而不是把数据硬编码进去。

不要硬编码大批量数据：

```py
# bad
paths = ['xxx.py', 'yyy.py', 'zzz.py']

# good
paths = glob.glob('**/*.py', recursive=True)
```

## 调用模型：ChatCompletion

`ChatCompletion` 是一个特殊的内置工具，直接调用 Chat（LLM）接口。它**不会**出现在可用工具列表里，但在 PTC 模式下可以像其它全局函数一样随时调用。当需要让模型在代码循环里推理、转换或总结数据（例如逐行、逐格、逐文件处理）时使用它。

- 它是 async，用 `await ChatCompletion(...)` 调用。
- 返回值是模型回复的纯文本。

输入参数：

- `messages`（必填）：可以是一个字符串（当作单条 user 消息），也可以是消息对象列表，例如 `[{"role": "user" | "assistant", "content": "..."}]`。`content` 既可以是字符串，也可以是多模态分片列表（见下文图片输入）。
- `instructions`（可选）：定义助手行为/角色的 system 提示词，默认 `"You are a helpful assistant."`。
- `images`（可选）：图片来源列表，会作为图片附加到（最后一条）user 消息上。每一项可以是**本地文件路径**、**http(s) 链接**、**base64 字符串**或 **data URL**。需要模型支持图片输入（多模态）。

```py
reply = await ChatCompletion(instructions="You are a translator, translate to English.", messages="你好")
```

### 图片输入

需要让模型「看」图片时，有两种写法。

1）用 `images` 参数（最简单），图片会附加到对应的文字消息上：

```py
reply = await ChatCompletion(
    messages="这张图片里有什么？",
    images=["/path/to/photo.jpg"],
)
```

2）在 `content` 里用多模态分片，精确控制文字和图片的顺序：

```py
reply = await ChatCompletion(messages=[
    {"role": "user", "content": [
        {"type": "text", "text": "对比这两张图片的差异"},
        {"type": "image", "image": "/path/to/a.png"},
        {"type": "image", "image": "https://example.com/b.png"},
    ]},
])
```

图片 `image` 字段支持本地文件路径、http(s) 链接、base64 字符串或 data URL。本地路径会自动读取并按文件类型推断 MIME。注意：图片输入要求当前模型本身支持图片（多模态），否则会报错。

## 进度上报

长循环建议用 `Message` 工具上报进度，让用户在任务管理器里跟踪。复用同一个 `id`，让进度状态原地更新而不是不断堆叠。事件类型为 `start` / `update` / `end`。

## 示例：批量调用工具

可用工具：`[Bash, RemoveBackground, Message, ...]`

用户：「把图片背景去掉，找出 `/path/to/images` 下所有 `.jpg`，结果保存到 `/path/to/images_removed_bg`。」

```py
import asyncio
import glob
import os
import json

async def main():
    images = glob.glob('/path/to/images/**/*.jpg', recursive=True)
    total = len(images)
    # 上报进度，用户可在任务管理器跟踪这个长循环。
    await Message(event="progress", data=json.dumps({"id": "remove-bg", "type": "start", "title": "Removing background", "message": f"{total} images", "percent": 0}))
    for index, image_path in enumerate(images):
        result_text = await RemoveBackground(url_or_file_path=image_path, save_path="/path/to/images_removed_bg/" + os.path.basename(image_path).replace('.jpg', '_removed.jpg'))
        result = json.loads(result_text)
        # 复用同一个 "id"，让每次更新替换上一条进度状态。
        await Message(event="progress", data=json.dumps({"id": "remove-bg", "type": "update", "message": os.path.basename(image_path), "percent": round((index + 1) / total * 100)}))
    await Message(event="progress", data=json.dumps({"id": "remove-bg", "type": "end", "message": "All images processed", "percent": 100}))
    print('done')

asyncio.run(main())
```

## 示例：循环里调用模型

可用工具：`[Message]`

用户：「读取 `/path/to/data.xlsx`，对 A 列每个非空单元格，调用 ChatCompletion，把回复写到同一行的 B 列。」

```py
import asyncio
import json
import openpyxl

async def main():
    file_path = '/path/to/data.xlsx'
    wb = openpyxl.load_workbook(file_path)
    ws = wb.active
    # 先收集 A 列非空单元格，便于计算进度百分比。
    cells = [cell for cell in ws['A'] if cell.value is not None and str(cell.value).strip() != '']
    total = len(cells)
    await Message(event="progress", data=json.dumps({"id": "fill-column-b", "type": "start", "title": "Filling column B", "message": f"{total} rows", "percent": 0}))
    for index, cell in enumerate(cells):
        try:
            reply = await ChatCompletion(
                instructions="You are a helpful assistant.",
                messages=str(cell.value),
            )
        except Exception as e:
            reply = "ERROR: " + str(e)
        # 把回复写到同一行相邻的 B 列。
        ws.cell(row=cell.row, column=cell.column + 1, value=reply)
        await Message(event="progress", data=json.dumps({"id": "fill-column-b", "type": "update", "message": f"Row {cell.row}", "percent": round((index + 1) / total * 100)}))
    wb.save(file_path)
    await Message(event="progress", data=json.dumps({"id": "fill-column-b", "type": "end", "message": "Saved " + file_path, "percent": 100}))
    print('done, processed file: ' + file_path)

asyncio.run(main())
```

## 注意

- 第三方依赖（例如示例里的 `openpyxl`）需要通过 `CodeExecution` 的 `packages` 参数声明，运行之间不会保留。
- 如果 Python 报缺少模块，不要用 Bash 里的 pip 安装，而是把依赖加到 `packages` 参数。
- 每次运行都在新的临时目录里执行，结束后自动删除。
