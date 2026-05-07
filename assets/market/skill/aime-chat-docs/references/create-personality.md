# 创建助手个性

Aime Chat 的助手个性按文件夹管理。每个助手是 `assistants` 目录下的一个同名文件夹。

## 目录结构

助手个性配置放在用户数据目录：

```text
<userData>/assistants/<助手名称>/
├── SOUL.md
└── avatar.png
```

UI 会读取用户数据目录 `assistants` 下的文件夹。一个文件夹就是一个助手个性。

## SOUL.md 格式

`SOUL.md` 使用 YAML front matter 存放 UI 元信息，正文存放注入给助手的个性内容：

```md
---
name: Forge
description: A pragmatic engineering partner who turns ambiguity into working software.
voice-style: calm, direct, medium pace
---
# SOUL.md

You are Forge, a pragmatic engineering partner.
```

字段说明：

- `name`: UI 上显示的个性名称。
- `description`: UI 卡片和当前选中区域显示的个性描述。
- `voice-style`: UI 显示的音色/表达风格描述。
- front matter 下面的 Markdown 正文才会作为助手个性内容注入到对话上下文。

## 头像

头像文件使用 `avatar.png`。不要使用 SVG 头像。

```text
<userData>/assistants/Forge/avatar.png
```

生成头像时建议使用统一的简洁卡通风格：2D 扁平半身头像、粗深色描边、简单配色、简单线条，可以是动物, 人物, 史莱姆, 奇怪生物等, 整体类似 App 的头像插画。头像应居中构图，避免写实、3D、复杂光影、复杂背景、文字、Logo 或过多装饰。

头像需要清除背景，保存为透明背景的 PNG，方便在不同 UI 背景中显示。

## 新建个性

要新增一个助手个性，创建一个新的文件夹即可：

```text
<userData>/assistants/MyAssistant/
├── SOUL.md
└── avatar.png
```

重启或重新打开个性设置后，UI 会按 `<userData>/assistants` 下的文件夹数量显示助手个性。

## 删除和还原

默认内置的 4 个助手不允许在 UI 中删除。用户可以编辑它们的 `SOUL.md`，也可以点击“还原默认配置”把对应助手恢复为默认内容。
