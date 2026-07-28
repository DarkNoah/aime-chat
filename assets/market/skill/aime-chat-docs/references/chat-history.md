# 聊天历史(列出 / 读取 / 搜索)

接口(三个能力共用同一个执行入口):

```http
POST $AIME_CHAT_API_BASE_URL/api/tools/execute-tool
Content-Type: application/json

{
  "id": "build-in:ChatHistoryToolkit",
  "toolName": "ChatHistoryList | ChatHistoryRead | ChatHistorySearch",
  "input": { ... }
}
```

API 地址从环境变量 `AIME_CHAT_API_BASE_URL` 读取,需要先启用并启动 Aime Chat 的本机 API 服务。返回值为纯文本(JSON 编码的字符串)。

默认排除定时任务(cron)创建的线程,避免把自动运行的会话再次摄入。

## 优先运行脚本

技能目录可以用环境变量 `AIME_CHAT_SKILL_PATH` 定位。

### 列出最近线程

```bash
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/chat_history_list.py" --since 2026-07-20 --limit 20
```

参数均可选:

- `--since` / `--until`:ISO 日期或 `YYYY-MM-DD`,按线程更新时间过滤
- `--limit`:返回线程数上限(默认 20)
- `--include-cron`:包含 cron 创建的线程(默认排除)

输出分为 Normal threads 和 Project threads 两部分,同一项目的线程会归到一起,每行是 `- <thread_id> | <title> | updated=<time>`。

### 读取单个线程

```bash
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/chat_history_read.py" --thread-id <thread-id>
```

- `--thread-id`:线程 id,必填(来自 chat_history_list.py 的输出)
- `--limit`:消息数上限,取最近 N 条(默认 80)
- `--since`:只返回该时间之后创建的消息(增量读取)
- `--include-tools`:输出中包含工具调用摘要

输出先是 `## CHAT THREAD META`(project、title、threadId、model、createdAt),然后是 `## CHAT MESSAGES` 的逐条消息文本。

### 关键词搜索

```bash
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/chat_history_search.py" --query "关键词"
```

- `--query`:关键词,必填,不区分大小写;多个关键词用空格分隔做模糊匹配(所有关键词都出现即命中,顺序不限)
- `--since`:只搜索该时间之后更新的线程
- `--limit`:返回摘录条数上限(默认 20)
- `--thread-limit`:扫描线程数上限(默认 50)

搜索范围覆盖普通线程和项目线程,匹配对象包括消息内容、线程标题和项目名称(标题或项目名命中时,摘录中会出现 `[matched thread title]` / `[matched project name]` 标记)。命中的摘录按线程分组合并,每个线程一个块:

````text
Project Id: <project_id>        (仅项目线程有这两行)
Project Name: <project name>
Thread Id: <thread_id>
Thread Title: <thread_title>
```
[user] @ 2026-07-20T12:00:00.000Z …命中的消息上下文…

[assistant] @ 2026-07-20T12:01:00.000Z …同一线程的其他命中合并在一起…
```
````

多个线程之间用 `---` 分隔。

如果不能执行代码、`AIME_CHAT_API_BASE_URL` 未设置或请求失败,说明失败原因即可。
