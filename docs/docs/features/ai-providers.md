---
sidebar_position: 1
---

# AI 服务商配置

AIME Chat 支持多种 AI 服务商，您可以根据需求配置和使用不同的模型。

## 支持的服务商

### 云端服务商

| 服务商 | 模型系列 | 特点 |
|--------|----------|------|
| **OpenAI** | GPT-4、GPT-4o、GPT-3.5 | 功能全面，支持多模态 |
| **DeepSeek** | DeepSeek-V3、DeepSeek-Coder | 性价比高，代码能力强 |
| **Google** | Gemini Pro、Gemini Ultra | 多模态能力出色 |
| **智谱 AI** | GLM-4、GLM-3 | 国产优选，中文优化 |
| **ModelScope** | 多种开源模型 | 魔搭社区模型 |
| **OpenRouter** | 多种模型聚合 | 一个 Key 访问多个模型 |
| **SiliconFlow** | 多种模型 | 国内访问友好 |

### 本地服务商

| 服务商 | 描述 |
|--------|------|
| **Ollama** | 本地运行开源模型，隐私安全 |
| **LMStudio** | 图形化本地模型管理工具 |

## 配置步骤

### 1. 进入设置页面

点击应用右上角的设置图标，或使用快捷键 `Ctrl/Cmd + ,`。

### 2. 选择服务商

在 **AI 服务商** 选项卡中，找到您想配置的服务商。

### 3. 填写配置信息

对于云端服务商，您需要填写：

- **API Key** - 从服务商获取的密钥
- **API Endpoint**（可选）- 自定义 API 端点

对于本地服务商，您需要确保：

- Ollama 或 LMStudio 已在本地运行
- 正确配置了端口（默认 Ollama: 11434, LMStudio: 1234）

### 4. 启用服务商

配置完成后，打开启用开关，服务商的模型就可以在模型选择器中使用了。

## 获取 API Key

### OpenAI

1. 访问 [OpenAI Platform](https://platform.openai.com/)
2. 登录后进入 API Keys 页面
3. 点击 "Create new secret key"

### DeepSeek

1. 访问 [DeepSeek 开放平台](https://platform.deepseek.com/)
2. 注册并登录
3. 在 API Keys 页面创建密钥

### Google (Gemini)

1. 访问 [Google AI Studio](https://aistudio.google.com/)
2. 登录 Google 账号
3. 创建 API Key

### 智谱 AI

1. 访问 [智谱 AI 开放平台](https://open.bigmodel.cn/)
2. 注册并完成认证
3. 在控制台创建 API Key

## 本地模型配置

### Ollama

1. 安装 Ollama：
```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh
```

2. 启动 Ollama 服务：
```bash
ollama serve
```

3. 下载模型：
```bash
ollama pull llama3.3
ollama pull qwen2.5:14b
```

4. 在 AIME Chat 中启用 Ollama 服务商

### LMStudio

1. 从 [LMStudio 官网](https://lmstudio.ai/) 下载安装
2. 在 LMStudio 中下载模型
3. 启动本地服务器（Local Server）
4. 在 AIME Chat 中配置 LMStudio 端点

## 模型选择建议

| 场景 | 推荐模型 |
|------|----------|
| 日常对话 | GPT-4o-mini、GLM-4-Flash |
| 复杂推理 | GPT-4o、DeepSeek-V3、Claude-3.5 |
| 代码开发 | DeepSeek-Coder、GPT-4o |
| 中文写作 | GLM-4、Qwen-2.5 |
| 隐私优先 | Ollama + 本地模型 |

## 常见问题

### API 调用失败

1. 检查 API Key 是否正确
2. 确认账户余额是否充足
3. 检查网络连接（国内可能需要代理）

### 本地模型无法连接

1. 确认 Ollama/LMStudio 服务正在运行
2. 检查端口配置是否正确
3. 确认防火墙设置

### 模型响应慢

1. 尝试切换到更快的模型
2. 检查网络延迟
3. 本地模型可能受硬件限制















