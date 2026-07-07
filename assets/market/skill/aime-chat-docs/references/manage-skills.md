# 管理 Aime Chat Skills

添加 skill 前，先询问用户这次是在全局中使用，还是只针对本项目，也就是当前工作目录使用。

接口：

```http
POST $AIME_CHAT_API_BASE_URL/api/tools/import-skills
POST $AIME_CHAT_API_BASE_URL/api/tools/preview-git-skill
```

API 地址从环境变量 `AIME_CHAT_API_BASE_URL` 读取（例如 `http://localhost:41100`），由代码运行环境提供。需要先启用并启动 Aime Chat 的本机 API 服务。

## 使用范围

全局 skill 安装在 Aime Chat 用户数据目录中。可通过环境变量 `AIME_CHAT_SKILL_PATH` 获得 Aime Chat skill 的放置目录。

项目 skill 安装在当前工作目录的 `.aime-chat/skills` 目录下。通过 API 导入项目 skill 时，传入 `--path "$PWD"`，Aime Chat 会自动复制 skill 文件夹并添加或修改 `.aime-chat/skills/skills.json`。

## 优先运行脚本

添加或预览 skill 时，优先运行 `scripts/` 下的脚本：

- [scripts/preview_git_skill.py](../scripts/preview_git_skill.py)：预览 git 仓库中的可用 skill。
- [scripts/import_skills.py](../scripts/import_skills.py)：导入 skill（全局或项目）。

请求前先确认环境变量 `AIME_CHAT_API_BASE_URL` 已设置。

## 检查 git 中的可用 skill 列表

通过以下方式可以列出该 git 下的所有可用 skill，如果用户指定了 skill 则不需要：

```bash
python scripts/preview_git_skill.py https://github.com/resciencelab/opc-skills
```

## 添加全局 Skill

确认用户要添加到全局后，运行 `import_skills.py`，并且不要传 `--path`。

指定某个 skill 时，`--repo-or-url` 可以直接使用具体到 skill 目录或 `SKILL.md` 的 GitHub 地址。若传仓库目录地址，必须同时传 `--skill`，值为仓库内 skill 文件夹相对路径（可重复传多个）：

```bash
python scripts/import_skills.py \
  --repo-or-url https://github.com/resciencelab/opc-skills \
  --skill skills/reddit
```

也可以直接传到 `SKILL.md` 的完整地址。单个 `SKILL.md` 地址会自动导入该 skill：

```bash
python scripts/import_skills.py \
  --repo-or-url https://github.com/resciencelab/opc-skills/blob/main/skills/reddit/SKILL.md
```

## 添加项目 Skill

确认用户要添加到本项目后，运行 `import_skills.py` 并传入当前工作目录：

```bash
python scripts/import_skills.py \
  --repo-or-url https://github.com/resciencelab/opc-skills \
  --skill skills/reddit \
  --path "$PWD"
```

## 只给仓库地址时

如果用户只给了仓库地址，先运行 `preview_git_skill.py` 列出仓库里的 skill 路径，然后询问用户是全部安装，还是只安装某一个 skill。

用户选择后，把选中的路径通过 `--skill` 传入（每个路径一个 `--skill`）。如果用户确认全部安装，就把列出的所有路径都通过 `--skill` 传入。

## 导入 skill 打包文件

当用户给了一个 `<file>.skill` 或 `<file>.zip` 时，同样使用 `import_skills.py` 导入。全局不需要传 `--path`：

```bash
python scripts/import_skills.py \
  --file /path/to/file.zip \
  --path "$PWD"
```

## 创建 Skill

请先执行 Skill 工具 `skill:local:skill-creator` 读取如何创建一个 skill，然后再根据流程创建一个 skill 打包文件。
根据项目和全局，创建完成后按照上面的方式用 `import_skills.py` 导入 `<file_to_path>.skill` 或 `<file_to_path>.zip` 的 skill 打包文件。
