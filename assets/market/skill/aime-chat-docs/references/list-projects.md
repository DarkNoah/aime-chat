# 列出项目

接口：

```http
GET $AIME_CHAT_API_BASE_URL/api/projects/list?page=0&size=20&filter=<text>
```

API 地址从环境变量 `AIME_CHAT_API_BASE_URL` 读取，需要先启用并启动 Aime Chat 的本机 API 服务。

## 优先运行脚本

需要查看项目列表或按标题查找项目时，优先运行 [scripts/list_projects.py](../scripts/list_projects.py)。技能目录可以用环境变量 `AIME_CHAT_SKILL_PATH` 定位。

```bash
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/list_projects.py"
python "${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/list_projects.py" --filter my --size 50
```

参数均可选：

- `--filter`：按标题模糊过滤
- `--page`：页码，从 0 开始（默认 0）
- `--size`：每页数量（默认 20）
- `--json`：输出原始 JSON

输出示例：

```text
PROJECTS (total: 2):
 - [aime-chat-workspace] workspace: C:/Users/xxx/AppData/Roaming/aime-chat/workspaces/aime-chat-workspace
 - [Ab12Cd34E] my-project: D:/MyGit/my-project
```

## 返回结构

分页返回项目列表：

```json
{
  "items": [
    { "id": "Ab12Cd34E", "title": "my-project", "path": "D:/MyGit/my-project", "tag": "work" }
  ],
  "total": 2,
  "page": 0,
  "size": 20,
  "hasMore": false
}
```

`id` 是项目 ID，创建会话时可以作为 `--project-id` 使用。

如果不能执行代码、`AIME_CHAT_API_BASE_URL` 未设置或请求失败，说明失败原因即可。
