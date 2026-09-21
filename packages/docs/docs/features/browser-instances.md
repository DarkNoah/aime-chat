---
sidebar_position: 3
---

# 浏览器实例

AIME Chat 统一使用 **Electron Chromium**。AgentBrowser 在聊天预览中显示并操作网页，WebFetch 的浏览器回退也复用同一会话，无需安装或启动独立 Edge、Chrome。

## 实例管理

进入 **设置 → 实例管理**，可以查看 Chromium 版本、打开的标签页和聊天数量，以及共享数据目录。

- **打开数据目录**：在系统文件管理器中查看浏览器数据。
- **关闭所有浏览器标签页**：关闭所有聊天的页面，取消正在执行和排队的浏览器操作，保留 Cookie 和登录状态。后续使用会重新创建页面。

浏览器按需工作，不再提供浏览器品牌、可执行文件、调试端口、无头模式或系统 Profile 选择。

## 数据目录与迁移

共享浏览器数据固定保存在：

```text
<应用用户数据目录>/instances/default_browser
```

macOS 默认位置：

```text
~/Library/Application Support/aime-chat/instances/default_browser
```

首次使用新版时，应用会在创建浏览器会话前执行一次迁移：

1. 将此前内置浏览器 `Partitions/aime-browser` 的数据迁入上述目录，保留当前内置浏览器的 Cookie、登录状态和站点存储。
2. 清理该目录原有的外部浏览器资料。旧 Edge／Chrome 实例中的登录状态不迁入。
3. 将实例配置统一为 Electron Chromium，移除旧的外部浏览器配置。系统浏览器及原先指定的其他自定义目录不会被删除。

迁移使用阶段记录和完成标记，失败后可重试，完成后不会在每次启动时清空数据。执行迁移前应退出仍使用旧默认目录的浏览器。

## 聊天与标签页

- 所有聊天共享 Cookie、登录状态和 localStorage。一个聊天退出登录或切换账号，会影响其他聊天。
- 每个聊天拥有自己的多个 Tab，支持新建、切换、关闭、地址栏、前进、后退和刷新。
- Agent 的操作 Tab 与用户正在查看的 Tab 分开维护，查看其他页面不会改变动作目标。
- 不同聊天可并行操作；同一聊天的工具动作依次执行，页面元素引用按 Tab 保存。
- 页面弹窗归属于来源聊天；停止操作、关闭单个 Tab 或删除聊天只释放对应资源。
- WebFetch 的临时页面共享登录状态，读取结束后关闭，不切换聊天当前页面。
- 单独关闭操作目标后，后续命令会明确报错，需要新建或选择 Tab。
- 应用重启后登录数据保留，打开的 Tab 需要重新建立。

```text
AgentBrowser(command="tab new https://example.com")
AgentBrowser(command="tab list")
AgentBrowser(command="snapshot -i", tabId="t1")
AgentBrowser(command="click @e2", tabId="t1")
AgentBrowser(command="tab t2")
AgentBrowser(command="tab close t1")
```

通过 AgentBrowser 工具执行命令，不要指定 `--session`、`--cdp`、`--config` 或 `--profile`。需要手动登录时，打开聊天预览中的对应 Tab 即可。

## Playwright 接入测试

内置 `PlaywrightTest` 工具在执行代码中直接调用 Playwright，通过受限 CDP 连接到当前 Electron 浏览器。它会新建本地测试页，填写文字、点击确认按钮，再读取并校验结果。

```text
PlaywrightTest(text="你好，Playwright！")
```

在聊天中调用时，结果页面保留在该聊天的浏览器预览中；也可以在工具详情的测试面板执行，测试结束后会关闭临时页面。测试复用共享数据目录，不会启动独立 Chromium，也不覆盖已有网页。

这是基础动作接入验证，不代表完整 Playwright API 均已兼容。普通脚本中的 `chromium.launch()` 仍会启动独立浏览器。
