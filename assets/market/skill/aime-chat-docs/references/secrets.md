# 密钥管理

管理「设置 → 密钥管理」中的逐条密钥记录时，使用 [scripts/secrets.py](../scripts/secrets.py)。这里保存的是环境变量名称和值；模型供应商设置中的 `apiKey` 是另一项配置。

脚本仅依赖 Python 3 标准库，从 `AIME_CHAT_API_BASE_URL` 读取本机 API 地址，服务需已开启。输出 JSON；成功退出 `0`，请求/输入失败退出非零。每个子命令可传 `--timeout`，默认 30 秒。

## 查询和定位记录

```bash
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/secrets.py" list
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/secrets.py" list --key MY_API_KEY
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/secrets.py" list --global true
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/secrets.py" get --id "<record-id>"
```

列表可同时按准确名称和 `global` 过滤。对已有密钥，先从查询结果取得 `id`，再修改或删除该条记录；不要把 `key` 名称当作记录 `id`。

默认返回元信息，不包含 `value`，也不返回值的前后缀：

```json
{
  "id": "<record-id>",
  "key": "MY_API_KEY",
  "description": "示例服务凭据",
  "global": true,
  "hasValue": true
}
```

`hasValue` 仅表示非空值已保存，不代表凭据经过服务端验证。只有任务确实需要读取某条密钥值时，显式执行 `get --id "<record-id>" --reveal`；此时 JSON 包含该条明文 `value`。普通修改无需先读取旧值，也不要将明文复制到回复或日志中。

## 创建、修改和删除

创建和修改通过 `--file request.json` 或 `--file -` 从标准输入接收 JSON，避免把真实密钥写入命令行参数。以下值均为占位符，应按用户指定的内容填写：

```bash
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/secrets.py" create --file - <<'JSON'
{"key":"MY_API_KEY","value":"<secret-value>","description":"示例服务凭据","global":true}
JSON

python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/secrets.py" update --id "<record-id>" --file - <<'JSON'
{"description":"仅手动使用","global":false}
JSON

python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/secrets.py" delete --id "<record-id>"
```

字段规则：

| 字段 | 创建 | 修改 |
| --- | --- | --- |
| `key` | 必填，名称唯一，首尾空白去除，匹配 `[A-Za-z_][A-Za-z0-9_]*` | 传入则更名，记录 ID 保持不变 |
| `value` | 必填字符串，保留空白和换行，不允许 NUL 字符 | 传入则替换；空字符串清空值 |
| `description` | 可选字符串，未设置时返回 `null` | 传入则替换；空字符串清空说明 |
| `global` | 可选布尔值，默认 `false` | 传入 `true`/`false` 切换全局环境注入 |

更新按字段合并，未传字段保持原值。至少提供一个支持的字段，不接受 `null`、未知字段或修改 `id`。例如仅传 `{"value":"<replacement>"}` 即可替换密钥，不需要重传名称和全局开关。创建/更新成功返回元信息；删除返回 `{"success":true,"id":"<record-id>"}`。

`global: true` 的密钥在后续构造 Bash、CodeExecution 环境时注入；`false` 保留记录但不自动注入。修改不会改变已运行进程的环境。应用生成的 `AIME_CHAT_API_BASE_URL`、`AIME_CHAT_SKILL_PATH` 等变量，以及当前供应商生成的 `OPENAI_API_KEY`、`OPENAI_BASE_URL` 等变量可能覆盖同名记录。界面重新加载密钥列表后可看到 API 修改。

写请求超时或断连时，先用 `list --key NAME` / `get --id ID` 检查状态，再决定是否重试。脚本不会自动重试写入，也不会回显任意 HTTP 错误体。需要核对替换后的值时，仅对目标记录显式 reveal。

## API

| 方法和路径 | 参数 | 结果 |
| --- | --- | --- |
| `GET /api/secrets` | 可选 query：`key`、`global=true\|false` | 元信息数组，按名称排序 |
| `GET /api/secrets/:id` | 可选 query：`reveal=true\|false`，默认 false | 单条元信息；显式 reveal 时附加 value |
| `POST /api/secrets` | JSON：创建字段 | HTTP 201，已创建记录的元信息 |
| `PATCH /api/secrets/:id` | JSON：需要修改的字段 | HTTP 200，更新后的元信息 |
| `DELETE /api/secrets/:id` | 路径中的记录 ID | HTTP 200，删除结果 |

写请求使用 `Content-Type: application/json`，直接传字段对象，不包裹 `data`。所有响应禁用缓存。HTTP 400 表示参数无效；404 表示记录不存在；409 表示名称已存在；500 表示存储失败。数据库错误不会向 API 返回 SQL 参数或密钥值。删除不存在的记录也返回 404，不会匹配其他记录。
