# 向会话发送消息

接口：

```http
POST $AIME_CHAT_API_BASE_URL/api/threads/chat
```

脚本直接调用 `src/main/mastra/index.ts` 中现有的 `chat()` 接口，不创建单独的 `sendThreadMessage` API。请求会一直等待到本轮对话结束；脚本直接读取 `chat()` 返回的最后一条消息，并输出其中的文本。

仅可向空闲会话发送消息。`chat()` 通过当前运行线程列表判断状态；目标会话正在运行时会抛出 `Thread <id> is not idle`，不会排队，也不要自动重试。

## 优先运行脚本

需要向已有会话发送文本或本地图片时，优先运行 [scripts/send_thread_message.py](../scripts/send_thread_message.py)：

```bash
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/send_thread_message.py" --thread-id <thread-id> --text "请总结当前进度"
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/send_thread_message.py" --thread-id <thread-id> --image ./screenshot.png --text "分析这张图片"
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/send_thread_message.py" --thread-id <thread-id> --image ./one.png --image ./two.jpg --json
```

参数：

- `--thread-id`：目标会话 ID，必填。
- `--text`：文本内容。未传图片时必填。
- `--image`：本机图片路径，可重复传入。脚本会转换为绝对路径；API 服务必须能读取该文件。
- `--json`：输出 `chat()` 的原始 JSON；默认只输出返回结果中最后一条消息的文本。

文本与图片至少提供一种。支持只发文本、只发图片，或在同一条消息中同时发送文本和多张图片。

## 请求与返回

```json
{
  "chatId": "Kx3fA9dQz",
  "messages": [
    {
      "id": "...",
      "role": "user",
      "parts": [
        { "type": "text", "text": "分析这些图片" },
        {
          "type": "file",
          "url": "file:///absolute/path/one.png",
          "path": "/absolute/path/one.png",
          "filename": "one.png",
          "mediaType": "image/png"
        }
      ]
    }
  ],
  "requireToolApproval": false
}
```

`chat()` 完成后会返回运行结果和消息数组。脚本只读取数组的最后一条消息，不额外搜索或聚合其他助手消息：

```json
{
  "success": true,
  "status": "success",
  "runId": "...",
  "aborted": false,
  "messages": [
    {
      "role": "assistant",
      "content": {
        "parts": [{ "type": "text", "text": "最终的助手回复" }]
      }
    }
  ]
}
```

线程不存在、图片无效、线程忙碌、模型调用失败，或最后一条消息没有文本时，脚本以非零状态退出并将错误写到标准错误。
