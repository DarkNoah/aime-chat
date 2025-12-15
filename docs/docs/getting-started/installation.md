---
sidebar_position: 1
---

# 安装指南

本指南将帮助您在本地安装和运行 AIME Chat。

## 系统要求

在开始之前，请确保您的系统满足以下要求：

- **Node.js** >= 14.x
- **npm** >= 7.x 或 **pnpm** >= 8.x（推荐）
- **Git**

### 操作系统支持

| 操作系统 | 支持版本 |
|----------|----------|
| macOS | 10.15+ (Catalina 及以上) |
| Windows | Windows 10/11 |
| Linux | Ubuntu 20.04+, Fedora 34+ 等 |

## 安装步骤

### 1. 克隆项目

```bash
git clone https://github.com/aime-chat/aime-chat.git
cd aime-chat
```

### 2. 安装依赖

推荐使用 pnpm：

```bash
pnpm install
```

或使用 npm：

```bash
npm install
```

:::tip 提示
首次安装可能需要较长时间，因为需要下载 Electron 和编译原生模块。
:::

### 3. 启动开发模式

```bash
pnpm start
```

应用程序将以开发模式启动，支持热重载。

## 构建生产版本

### 构建应用

```bash
pnpm build
```

### 打包桌面应用

```bash
pnpm package
```

打包完成后，安装包会生成在 `release/build` 目录下。

## 数据存储位置

应用数据默认存储在系统用户目录：

| 操作系统 | 路径 |
|----------|------|
| macOS | `~/Library/Application Support/aime-chat` |
| Windows | `%APPDATA%/aime-chat` |
| Linux | `~/.config/aime-chat` |

## 常见问题

### 依赖安装失败

如果原生模块编译失败，请尝试：

```bash
# 重建原生模块
pnpm rebuild
```

### 端口占用

如果启动时提示端口被占用：

```bash
# 终止占用端口的进程
pnpm kill-port
```

### Electron 下载失败

如果 Electron 下载速度很慢，可以设置镜像：

```bash
# 设置 Electron 镜像
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
```

## 下一步

安装完成后，您可以：

- 查看 [AI 服务商配置](../features/ai-providers) 来配置您的 AI 服务
- 了解 [基本使用](./basic-usage) 开始您的第一次对话




