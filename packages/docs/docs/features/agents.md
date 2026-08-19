---
sidebar_position: 4
---

# Agent 管理

Agent 把模型、系统指令、工具和可选子 Agent 组合成可复用的助手。AIME Chat 提供内置 Agent，也支持创建、启停、导入和导出本地自定义 Agent。

## 内置 Agent

### Default Agent

Default Agent 是通用对话入口。当前内置配置不预装工具；需要联网、读写文件或使用知识库时，请在 Agent 详情或聊天工具选择器中明确启用相应工具。

### Code Agent

Code Agent 面向软件工程任务，当前内置的主要能力包括：

- 文件读取、写入、精确编辑、文件匹配与内容搜索；
- Bash 命令、后台 Bash 输出与终止；
- 代码执行、网页获取与搜索；
- TaskCreate、TaskGet、TaskList、TaskUpdate；
- Memory、知识库、浏览器、图像和目标管理工具；
- Skill，以及用于探索和规划的子 Agent。

工具能否执行仍取决于本机依赖、Agent 配置、聊天审批开关和目标资源权限。详见 [Code Agent](../agents/code-agent) 与 [工具系统](./tools)。

## 创建自定义 Agent

1. 打开 **Agent** 页面，选择 **添加 Agent**。
2. 填写唯一 ID、名称和描述。
3. 进入详情页配置：
   - **默认模型**：可留空，聊天时再选择；
   - **Instructions**：定义角色、工作方法和边界；
   - **Tools**：选择内置工具、MCP 工具或 Skill；
   - **Sub Agents**：选择可委派的 Agent；
   - **Suggestions / Greeting**：设置建议问题和欢迎语；
   - **Tags**：用于分类。
4. 回到列表页启用 Agent，然后点击 **聊天**。

:::tip 最小权限
只给 Agent 配置完成任务所需的工具。Bash、文件写入、浏览器和第三方 MCP 都可能改变本机或远程数据。
:::

## 编写 Instructions

一份可维护的指令通常包含角色、目标、允许的工具、执行边界和输出要求。例如：

```markdown
# 角色
你是本项目的文档维护助手。

## 工作方式
- 先读取相关源码和现有文档。
- 保留用户已有改动。
- 修改后运行文档构建与链接检查。

## 边界
- 不发布 Release，不推送远程仓库。
- 无法验证的运行时行为必须明确说明。
```

工具名称和参数会随应用更新，Instructions 更适合描述任务目标与约束，不要把一长串易过期的工具参数复制进去。

## 工具与子 Agent

Agent 详情页按来源显示工具：

- **BUILD_IN**：应用内置工具；
- **MCP**：已添加并启用的 MCP 服务器工具；
- **SKILL**：本地或导入的 Skill。

子 Agent 适合把探索、规划或独立任务交给另一个 Agent。配置子 Agent 只代表它可被选择，不保证模型一定会委派；实际行为还取决于 Instructions、模型能力和当前任务。

## 启用、切换与删除

- Agent 列表中的开关控制它是否出现在可用列表中。
- 可以从 Agent 卡片直接开始聊天，也可以在聊天界面切换 Agent。
- 只有自定义 Agent 可以删除；内置 Agent 由应用维护。

## 导入与导出

自定义 Agent 详情页可以导出 TOML 配置，也可以复制配置文本。Agent 列表页的 **导入 Agent** 接收 TOML 文本。

导出内容可包含基本信息、Instructions、工具、子 Agent、建议问题、标签、欢迎语，以及相关 MCP 配置或 Skill 来源。导入前请检查：

- Agent ID 是否与现有 Agent 冲突；
- MCP 命令、URL 和环境配置是否可信；
- Skill 来源是否可信且当前网络可访问；
- 配置中是否意外包含密钥或内部地址。

:::warning 配置安全
导出的 Agent 配置可能携带 MCP 连接信息。分享前删除令牌、API Key、私有路径和内部服务地址。
:::

## 常见问题

### Agent 看不到某个工具

确认工具本身已启用，并在 Agent 的 **Tools** 中选中。MCP 工具还需要对应服务器正常连接。

### 工具调用失败

先查看具体工具错误，再检查本机依赖、文件权限、网络、密钥以及聊天中的工具审批设置。AIME Chat 的工具选择和审批不是操作系统级沙箱。

### 导入失败

确认粘贴的是有效 TOML，Agent ID 未占用，并且引用的 Skill 或 MCP 配置可以安装。为避免覆盖，当前导入会拒绝已存在的 Agent ID。
