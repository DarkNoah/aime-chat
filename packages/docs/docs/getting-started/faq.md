---
sidebar_position: 3
---

# 常见问题

本页整理了安装和开发过程中常见的问题及解决方法。

## 依赖初始化失败
![依赖初始化失败](./images/dependencies_fail.png)
- 原因: 需要更换国内源pnpm源

> 如果在执行依赖安装或项目初始化时出现下载失败、原生模块编译失败、Electron 相关依赖拉取失败等问题，通常可以通过修改用户目录下的 `~/.npmrc` 解决。

### 配置文件位置

- **macOS**：`~/.npmrc`
- **Windows**：`C:\Users\你的用户名\.npmrc`

如果文件不存在，可以手动创建。

### 添加以下配置

将下面内容添加到 `~/.npmrc`：

```ini
better_sqlite3_binary_host_mirror=https://registry.npmmirror.com/-/binary/better-sqlite3
canvas_binary_host_mirror=https://registry.npmmirror.com/-/binary/canvas
electron_builder_binaries_mirror=https://registry.npmmirror.com/-/binary/electron-builder-binaries/
electron_mirror=https://registry.npmmirror.com/-/binary/electron/
python_mirror=https://registry.npmmirror.com/-/binary/python/
registry=https://registry.npmmirror.com/
sqlite3_binary_host_mirror=https://registry.npmmirror.com/
strict-ssl=false
```

### 保存后重新安装

保存配置后，重新执行依赖安装命令，例如：

```bash
pnpm install
```

如果之前已经安装失败过，也可以先清理后再重试。

## 端口占用

如果启动时提示端口被占用：

```bash
# 终止占用端口的进程
pnpm kill-port
```


## 运行失败或启动调试失败
![缺少VC++ 运行库](./images/loss_vc++.png)
- 原因: 未安装 Microsoft Visual C++ Redistributable

Windows 安装包会在安装过程中检查 Visual C++ Redistributable。如果检测到运行库缺失或文件不完整，会尝试安装随包附带的 VC++ 运行库。

如果仍然遇到启动失败：

1. 重新运行最新的 Windows 安装包。
2. 确认安装过程没有被系统安全软件拦截。
3. 在 AIME Chat 的关于页面中打开日志文件，查看运行库安装和启动失败的详细信息。

## 运行库安装失败

如果在设置页安装 UV、Node.js、Bun、PaddleOCR 或 Qwen Audio 等运行库失败，可以先打开关于页面中的日志文件。日志中会记录运行库安装命令、退出码、标准输出和错误输出，通常能直接定位是网络下载、权限还是依赖初始化问题。


