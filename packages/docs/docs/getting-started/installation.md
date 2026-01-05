---
sidebar_position: 1
---

# 安装指南

本指南将帮助您在本地安装和运行 AIME Chat。

## 普通用户安装

如果您只是想使用 AIME Chat，可以直接下载预编译的安装包，无需进行源码编译。

### 下载安装包

请访问 [文档主页](/)，根据您的操作系统下载对应的安装包：

- **macOS**: 下载 `.dmg` 安装包
- **Windows**: 下载 `.exe` 安装程序
- **Linux**: 下载 `.AppImage` 或 `.deb` 安装包

### 安装步骤

#### macOS

1. 下载 `.dmg` 文件
2. 双击打开，将 AIME Chat 拖拽到应用程序文件夹
3. 在应用程序中启动 AIME Chat

:::note 注意
首次启动时，如果系统提示"无法验证开发者"，请在系统偏好设置 > 安全性与隐私中点击"仍要打开"。
:::

#### Windows

1. 下载 `.exe` 安装程序
2. 双击运行安装程序
3. 按照安装向导完成安装
4. 从开始菜单启动 AIME Chat

#### Linux

**AppImage 版本**（推荐）：

```bash
# 添加执行权限
chmod +x aime-chat-x.x.x-linux.AppImage

# 运行应用
./aime-chat-x.x.x-linux.AppImage
```

**Deb 包版本**：

```bash
# 安装 deb 包
sudo dpkg -i aime-chat-x.x.x-linux.deb

# 如果遇到依赖问题，运行
sudo apt-get install -f
```

### 操作系统支持

| 操作系统 | 支持版本 |
|----------|----------|
| macOS | 10.15+ (Catalina 及以上) |
| Windows | Windows 10/11 |
| Linux | Ubuntu 20.04+, Fedora 34+ 等 |

## 开发者安装

如果您想参与 AIME Chat 的开发或从源码构建，请按照以下步骤操作。

### 系统要求

在开始之前，请确保您的系统满足以下要求：

- **Node.js** >= 14.x
- **npm** >= 7.x 或 **pnpm** >= 8.x（推荐）
- **Git**

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

- 查看 [AI 服务商配置](./ai-providers) 来配置您的 AI 服务
- 了解 [基本使用](./basic-usage) 开始您的第一次对话
















