# AIME Chat

<div align="center">
  <img src="assets/icon.png" alt="AIME Chat Logo" width="120" />
  
  <p>
    <strong>A Powerful AI Desktop Chat Application</strong>
  </p>

  <p>
    <img src="https://img.shields.io/badge/version-0.3.0-blue.svg" alt="Version">
    <img src="https://img.shields.io/badge/platform-macOS%20|%20Windows%20|%20Linux-lightgrey.svg" alt="Platform">
    <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
  </p>

  <p>
    <a href="README.md">中文</a> | <strong>English</strong>
  </p>
</div>

---

## ✨ Features

- 🤖 **Multiple AI Provider Support** - Integrated with mainstream AI providers including OpenAI, DeepSeek, Google, Zhipu AI, Ollama, LMStudio, ModelScope, and more
- 💬 **Intelligent Conversations** - Powerful AI Agent system based on Mastra framework, supporting streaming responses and tool calling
- 📚 **Knowledge Base Management** - Built-in vector database with support for document retrieval and knowledge Q&A
- 🛠️ **Tool Integration** - Support for MCP (Model Context Protocol) client with extensible tool capabilities
- 🎨 **Modern UI** - Built with shadcn/ui component library, supports light/dark theme switching
- 🌍 **Internationalization** - Built-in Chinese and English interfaces
- 🔒 **Local First** - Data stored locally for privacy protection
- ⚡ **High Performance** - Built on Electron for cross-platform native experience

## 🚀 Quick Start

### Prerequisites

- Node.js >= 14.x
- npm >= 7.x

### Install Dependencies

```bash
npm install
```

### Development Mode

Start the development server:

```bash
npm start
```

The application will start in development mode with hot reload support.

### Build Application

Build production version:

```bash
npm run build
```

Package desktop application:

```bash
npm run package
```

Packaged applications will be generated in the `release/build` directory.

## 📦 Project Structure

```
aime-chat/
├── assets/              # Static assets
│   ├── icon.png        # Application icon
│   ├── models.json     # AI model configurations
│   └── model-logos/    # Provider logos
├── src/
│   ├── main/           # Electron main process
│   │   ├── providers/  # AI provider implementations
│   │   ├── mastra/     # Mastra Agent and tools
│   │   ├── knowledge-base/ # Knowledge base management
│   │   ├── tools/      # Tool system
│   │   └── db/         # Database
│   ├── renderer/       # React renderer process
│   │   ├── components/ # UI components
│   │   ├── pages/      # Page components
│   │   ├── hooks/      # React Hooks
│   │   └── styles/     # Style files
│   ├── types/          # TypeScript type definitions
│   ├── entities/       # Data entities
│   └── i18n/           # Internationalization config
└── release/            # Build artifacts
```

## 🎯 Core Features

### AI Provider Configuration

Support for configuring multiple AI providers, each with independent settings:

- API Key
- API Endpoint
- Available model list
- Enable/Disable status

Supported providers include:

| Provider | Type | Description |
|----------|------|-------------|
| OpenAI | Cloud | GPT series models |
| DeepSeek | Cloud | DeepSeek series models |
| Google | Cloud | Gemini series models |
| Zhipu AI | Cloud | GLM series models |
| Ollama | Local | Run open-source models locally |
| LMStudio | Local | Local model management tool |
| ModelScope | Cloud | ModelScope community models |

### Knowledge Base Features

- 📄 Document upload and parsing
- 🔍 Vector storage and retrieval
- 💡 Intelligent Q&A based on knowledge base
- 📊 Knowledge base management interface

### Tool System

- 🔧 Built-in tools: Bash execution, web scraping, etc.
- 🔌 MCP protocol support for extensible third-party tools
- ⚙️ Tool configuration and management interface

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 19 + TypeScript
- **UI Library**: shadcn/ui (based on Radix UI)
- **Styling**: Tailwind CSS
- **Routing**: React Router
- **State Management**: React Context + Hooks
- **Internationalization**: i18next
- **Markdown**: react-markdown + remark-gfm
- **Code Highlighting**: shiki

### Backend (Main Process)
- **Runtime**: Electron
- **AI Framework**: Mastra
- **Database**: TypeORM + better-sqlite3
- **Vector Storage**: @mastra/fastembed
- **AI SDK**: Vercel AI SDK

### Build Tools
- **Bundler**: Webpack 5
- **Compiler**: TypeScript + ts-loader
- **Hot Reload**: webpack-dev-server
- **App Packaging**: electron-builder

## 📝 Available Scripts

```bash
# Development
npm start              # Start development server
npm run start:main     # Start main process only (with monitoring)
npm run start:renderer # Start renderer process only

# Build
npm run build          # Build production version
npm run build:main     # Build main process
npm run build:renderer # Build renderer process

# Package
npm run package        # Package desktop application

# Code Quality
npm run lint           # Check code
npm run lint:fix       # Fix code issues
npm test              # Run tests

# Others
npm run postinstall    # Initialize after installing dependencies
npm run rebuild        # Rebuild native modules
```

## ⚙️ Configuration

### Environment Variables

The application supports configuration through the interface without manually setting environment variables.

### Data Storage

Application data is stored by default in the system user directory:

- **macOS**: `~/Library/Application Support/aime-chat`
- **Windows**: `%APPDATA%/aime-chat`
- **Linux**: `~/.config/aime-chat`

## 🤝 Contributing

Issues and Pull Requests are welcome!

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Code Standards

- Use ESLint and Prettier to maintain consistent code style
- Run `npm run lint:fix` before committing to fix format issues
- Follow TypeScript type specifications

## 📄 License

This project is licensed under the [MIT](LICENSE) License.

## 👨‍💻 Author

**Noah**
- Email: 781172480@qq.com

## 🙏 Acknowledgments

- [Electron](https://www.electronjs.org/)
- [React](https://react.dev/)
- [Mastra](https://mastra.ai/)
- [Vercel AI SDK](https://sdk.vercel.ai/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Radix UI](https://www.radix-ui.com/)

## 🔗 Related Links

- [Issue Tracker](https://github.com/electron-react-boilerplate/electron-react-boilerplate/issues)
- [Changelog](CHANGELOG.md)
- [Documentation](docs/)

---

<div align="center">
  <sub>Built with ❤️ by Noah</sub>
</div>

