---
sidebar_position: 3
---

# 浏览器实例

浏览器实例用于启动或连接一个可被 Agent 自动化控制的 Chromium 内核浏览器。AIME Chat 可以检测 Google Chrome、Microsoft Edge 和 Chromium，并为实例选择独立或已有的用户数据目录。

## 支持的浏览器

- Google Chrome
- Microsoft Edge
- Chromium

应用会按 Chrome → Edge → Chromium 的顺序选择第一个已安装的浏览器作为内置实例默认值。浏览器必须真实安装在系统中；Playwright 下载缓存不会自动作为系统浏览器显示。

## 配置实例

进入 **设置 → 实例管理**：

1. 在 **浏览器用户数据目录** 中选择配置
2. 使用内置配置时，在 **浏览器可执行文件** 中选择已安装的浏览器
3. 按需修改远程调试端口，默认端口为 `9222`
4. 选择是否启用无头模式
5. 点击 **运行**；使用结束后点击 **停止**

### 用户数据目录

- **Default (Built-in)**：AIME Chat 在自己的用户资料目录中维护独立浏览器数据，不复用日常浏览器配置
- **系统检测配置**：仅当对应浏览器可执行文件和用户数据目录都存在时显示，可复用该浏览器已有配置
- **自定义目录**：手动指定其他用户数据目录

:::warning 登录状态与并发占用
复用系统浏览器目录可能包含登录 Cookie、历史记录和扩展。只在你信任的 Agent 与任务中使用；同一用户数据目录被另一个浏览器进程占用时，实例也可能无法启动。需要隔离时优先使用内置目录。
:::

### 可执行文件与配置目录是两项设置

浏览器可执行文件决定启动 Chrome、Edge 还是 Chromium；用户数据目录决定加载哪套浏览器配置。使用内置目录时可以切换已安装的浏览器，而无需迁移项目或聊天数据。

## 平台检测位置

AIME Chat 会使用各平台的常见安装路径，并在 Linux 上从 `PATH` 解析 `chromium` 或 `chromium-browser` 等命令。系统配置目录通常位于：

| 平台 | Chrome | Edge | Chromium |
|------|--------|------|----------|
| Windows | `%LOCALAPPDATA%\Google\Chrome\User Data` | `%LOCALAPPDATA%\Microsoft\Edge\User Data` | `%LOCALAPPDATA%\Chromium\User Data` |
| macOS | `~/Library/Application Support/Google/Chrome` | `~/Library/Application Support/Microsoft Edge` | `~/Library/Application Support/Chromium` |
| Linux | `~/.config/google-chrome` | `~/.config/microsoft-edge` | `~/.config/chromium` |

Linux 会尊重 `XDG_CONFIG_HOME`；Chrome/Chromium 还会优先使用 `CHROME_CONFIG_HOME`。

## 常见问题

### 浏览器显示“未安装”

1. 确认浏览器已经完成安装，而不只是下载了安装包
2. 完全重启 AIME Chat，让主进程重新检测可执行文件
3. Linux 用户确认浏览器命令可从应用进程的 `PATH` 找到
4. 如果使用便携版浏览器，可考虑选择自定义用户数据目录；当前页面仍只列出系统检测到的可执行文件

### 实例启动失败

1. 检查调试端口是否被其他进程占用
2. 停止正在使用同一用户数据目录的浏览器进程
3. 改用内置用户数据目录排除配置锁或扩展冲突
4. 在 **关于** 页面打开应用日志查看启动错误

### 何时使用无头模式

无头模式适合不需要人工观察的后台任务；登录、验证码、授权或需要检查页面状态时，使用可见窗口更容易排查问题。
