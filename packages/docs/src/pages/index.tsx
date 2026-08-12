import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import type { ReactElement, ReactNode } from 'react';
import {
  IconArrowRight,
  IconBolt,
  IconBook,
  IconBrandApple,
  IconBrandDebian,
  IconBrandGithub,
  IconBrandWindows,
  IconBrowser,
  IconCode,
  IconDatabase,
  IconDownload,
  IconFolder,
  IconInfoCircle,
  IconPlug,
  IconRobot,
  IconRoute,
  IconShieldLock,
  IconSparkles,
  IconTool,
} from '@tabler/icons-react';

import styles from './index.module.css';

type DocumentRoute = {
  step: string;
  title: string;
  description: string;
  to: string;
  icon: ReactElement;
};

type Capability = {
  title: string;
  description: string;
  to: string;
  meta: string;
  icon: ReactElement;
};

const documentRoutes: DocumentRoute[] = [
  {
    step: '01',
    title: '安装 AIME Chat',
    description: '选择适合你的桌面安装包，或从源码启动开发环境。',
    to: '/docs/getting-started/installation',
    icon: <IconDownload size={21} aria-hidden="true" />,
  },
  {
    step: '02',
    title: '连接模型服务',
    description: '配置云端或本地 Provider，并选择对话与工具模型。',
    to: '/docs/getting-started/ai-providers',
    icon: <IconSparkles size={21} aria-hidden="true" />,
  },
  {
    step: '03',
    title: '建立项目工作区',
    description: '把文件、聊天线程和导出结果集中在同一个项目中。',
    to: '/docs/features/project-workspace',
    icon: <IconFolder size={21} aria-hidden="true" />,
  },
  {
    step: '04',
    title: '配置 Agent 与工具',
    description: '按任务组合指令、内置工具、Skill 与 MCP 扩展。',
    to: '/docs/features/agents',
    icon: <IconRobot size={21} aria-hidden="true" />,
  },
];

const capabilities: Capability[] = [
  {
    title: '项目与文件工作区',
    description:
      '浏览、搜索和编辑项目文件，并将项目聊天导出为 Markdown、JSON、XLSX 或训练数据。',
    to: '/docs/features/project-workspace',
    meta: '文件 · 线程 · 导出',
    icon: <IconFolder size={22} aria-hidden="true" />,
  },
  {
    title: '知识库与混合检索',
    description: '组合向量与 BM25 检索，支持可选重排、图像内容与分段全文读取。',
    to: '/docs/features/knowledge-base',
    meta: 'Vector · BM25 · Rerank',
    icon: <IconDatabase size={22} aria-hidden="true" />,
  },
  {
    title: 'Agent 与工具系统',
    description:
      '让 Agent 在明确的指令和工具范围内读取文件、执行代码、搜索网页并推进任务。',
    to: '/docs/features/tools',
    meta: 'Agent · Tool · Skill',
    icon: <IconTool size={22} aria-hidden="true" />,
  },
  {
    title: '浏览器实例与 MCP',
    description:
      '选择 Chrome、Edge 或 Chromium 实例，并通过 MCP 连接更多本地与远程服务。',
    to: '/docs/features/browser-instances',
    meta: 'Browser · MCP',
    icon: <IconBrowser size={22} aria-hidden="true" />,
  },
  {
    title: '自动化与长期记忆',
    description:
      '用 Cron 绑定项目、模型和 Agent，让日常任务与聊天记忆按计划持续整理。',
    to: '/docs/features/crons',
    meta: 'Cron · Goal · Memory',
    icon: <IconBolt size={22} aria-hidden="true" />,
  },
];

const providers = [
  'OpenAI',
  'DeepSeek',
  'Google',
  '智谱 AI',
  'Ollama',
  'LM Studio',
  'ModelScope',
  'SiliconFlow',
];

function PrimaryLink({
  to,
  children,
  className,
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link className={clsx(styles.primaryLink, className)} to={to}>
      {children}
      <IconArrowRight size={18} aria-hidden="true" />
    </Link>
  );
}

function Hero() {
  const screenshotUrl = useBaseUrl('img/ScreenShot_2026-01-24_171537_284.png');
  const iconUrl = useBaseUrl('img/home-icon.png');

  return (
    <header className={styles.hero}>
      <div className={clsx('container', styles.heroLayout)}>
        <div className={styles.heroCopy}>
          <div className={styles.brandLine}>
            <img src={iconUrl} alt="" width="36" height="36" />
            <span>AIME Chat 文档</span>
          </div>

          <Heading as="h1" className={styles.heroTitle}>
            <span className={styles.heroTitleLine}>把模型、工具</span>
            <span className={styles.heroTitleLine}>和本地项目，</span>
            <span className={styles.heroTitleLine}>放进同一个</span>
            <span className={styles.heroTitleLine}>桌面工作台。</span>
          </Heading>

          <p className={styles.heroDescription}>
            AIME Chat 是一个开源 AI 桌面应用。连接你选择的模型，让 Agent
            在项目上下文中读取文件、检索知识、调用工具，并把结果留在自己的工作区。
          </p>

          <div className={styles.heroActions}>
            <PrimaryLink to="/docs/getting-started/installation">
              安装并开始
            </PrimaryLink>
            <Link className={styles.secondaryLink} to="/docs/intro">
              <IconBook size={18} aria-hidden="true" />
              浏览文档
            </Link>
          </div>

          <ul className={styles.heroFacts} aria-label="项目特点">
            <li>
              <IconBrandGithub size={17} aria-hidden="true" /> MIT 开源
            </li>
            <li>
              <IconShieldLock size={17} aria-hidden="true" /> 本地优先
            </li>
            <li>macOS · Windows · Linux</li>
          </ul>
        </div>

        <figure className={styles.productFrame}>
          <div className={styles.screenshotShell}>
            <img
              className={styles.heroScreenshot}
              src={screenshotUrl}
              alt="AIME Chat 项目工作区：左侧管理项目文件，中间与 Agent 对话，右侧查看任务用量"
              width="1307"
              height="877"
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
          </div>
          <figcaption>
            <span>真实应用界面</span>
            <span>项目、聊天和执行结果保持在同一上下文</span>
          </figcaption>
        </figure>
      </div>
    </header>
  );
}

function DocumentRoutes() {
  return (
    <section className={styles.routesSection} aria-labelledby="routes-title">
      <div className={clsx('container', styles.routesLayout)}>
        <div className={styles.sectionCopy}>
          <p className={styles.sectionLabel}>从这里开始</p>
          <Heading as="h2" id="routes-title" className={styles.sectionTitle}>
            按任务找到下一步，少走弯路。
          </Heading>
          <p className={styles.sectionDescription}>
            第一次使用可以按顺序完成四步；已有环境时，直接进入你需要的部分。
          </p>
          <Link className={styles.textLink} to="/docs/intro">
            查看文档总览 <IconArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>

        <nav className={styles.routeList} aria-label="快速开始文档">
          {documentRoutes.map((route) => (
            <Link key={route.step} className={styles.routeItem} to={route.to}>
              <span className={styles.routeStep}>{route.step}</span>
              <span className={styles.routeIcon}>{route.icon}</span>
              <span className={styles.routeContent}>
                <strong>{route.title}</strong>
                <span>{route.description}</span>
              </span>
              <IconArrowRight
                className={styles.routeArrow}
                size={19}
                aria-hidden="true"
              />
            </Link>
          ))}
        </nav>
      </div>
    </section>
  );
}

function WorkspaceLoop() {
  return (
    <section className={styles.workspaceSection} aria-labelledby="loop-title">
      <div className="container">
        <div className={styles.workspaceHeader}>
          <div>
            <p className={styles.sectionLabel}>一个连续工作流</p>
            <Heading as="h2" id="loop-title" className={styles.sectionTitle}>
              上下文不散落，任务才真正闭环。
            </Heading>
          </div>
          <p className={styles.sectionDescription}>
            从准备项目资料到 Agent 执行、验证与导出，AIME Chat
            把每一步放在同一个桌面工作区里。
          </p>
        </div>

        <div className={styles.workspaceLayout}>
          <div className={styles.loopPanel} aria-label="AIME Chat 任务流程">
            <div className={styles.loopHeading}>
              <IconRoute size={23} aria-hidden="true" />
              <span>项目任务 / 执行路径</span>
            </div>
            <ol className={styles.loopList}>
              <li>
                <span>1</span>
                <div>
                  <strong>准备上下文</strong>
                  <small>文件 · 知识库 · 网页</small>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>Agent 规划</strong>
                  <small>指令 · 模型 · 目标</small>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>工具执行</strong>
                  <small>代码 · 搜索 · MCP</small>
                </div>
              </li>
              <li>
                <span>4</span>
                <div>
                  <strong>验证并沉淀</strong>
                  <small>结果 · 导出 · 记忆</small>
                </div>
              </li>
            </ol>
            <Link
              className={styles.loopLink}
              to="/docs/features/harness-engineering"
            >
              了解 Agent 的运行外壳
              <IconArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>

          <nav className={styles.capabilityList} aria-label="能力文档">
            {capabilities.map((capability) => (
              <Link
                key={capability.title}
                className={styles.capabilityItem}
                to={capability.to}
              >
                <span className={styles.capabilityIcon}>{capability.icon}</span>
                <span className={styles.capabilityContent}>
                  <span className={styles.capabilityHeading}>
                    <strong>{capability.title}</strong>
                    <small>{capability.meta}</small>
                  </span>
                  <span>{capability.description}</span>
                </span>
                <IconArrowRight
                  className={styles.capabilityArrow}
                  size={18}
                  aria-hidden="true"
                />
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </section>
  );
}

function Ecosystem() {
  return (
    <section
      className={styles.ecosystemSection}
      aria-labelledby="ecosystem-title"
    >
      <div className={clsx('container', styles.ecosystemLayout)}>
        <div className={styles.ecosystemCopy}>
          <div className={styles.ecosystemIcon}>
            <IconPlug size={22} aria-hidden="true" />
          </div>
          <div>
            <Heading as="h2" id="ecosystem-title">
              连接你已经在用的模型与工具
            </Heading>
            <p>
              内置 Provider 目录会持续更新，也可以配置兼容端点、本地模型和 MCP
              服务。
            </p>
          </div>
        </div>
        <ul className={styles.providerList} aria-label="支持的模型服务示例">
          {providers.map((provider) => (
            <li key={provider}>{provider}</li>
          ))}
        </ul>
        <p className={styles.ecosystemNote}>
          应用状态与聊天默认保存在本机；使用云端 Provider
          时，请求仍会按对应服务商策略发送。
        </p>
        <div className={styles.ecosystemLinks}>
          <Link to="/docs/getting-started/ai-providers">
            配置模型服务 <IconArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link to="/docs/features/mcp">
            连接 MCP <IconArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Downloads() {
  return (
    <section
      className={styles.downloadSection}
      aria-labelledby="download-title"
    >
      <div className="container">
        <div className={styles.downloadHeader}>
          <div>
            <p className={styles.sectionLabel}>桌面安装包</p>
            <Heading
              as="h2"
              id="download-title"
              className={styles.sectionTitle}
            >
              选择你的平台，开始工作。
            </Heading>
          </div>
          <p className={styles.sectionDescription}>
            macOS 提供 Apple Silicon 与 Intel 版本；Windows 与 Linux
            提供对应桌面安装包。
          </p>
        </div>

        <div className={styles.platformGrid}>
          <article className={styles.platformItem}>
            <div className={styles.platformHeading}>
              <IconBrandApple size={27} aria-hidden="true" />
              <div>
                <Heading as="h3">macOS</Heading>
                <p>macOS 11 或更高版本</p>
              </div>
            </div>
            <div className={styles.platformActions}>
              <Link href="https://github.com/DarkNoah/aime-chat/releases/latest/download/aime-chat-arm64-mac.dmg">
                Apple Silicon <IconDownload size={16} aria-hidden="true" />
              </Link>
              <Link href="https://github.com/DarkNoah/aime-chat/releases/latest/download/aime-chat-x64-mac.dmg">
                Intel <IconDownload size={16} aria-hidden="true" />
              </Link>
            </div>
          </article>

          <article className={styles.platformItem}>
            <div className={styles.platformHeading}>
              <IconBrandWindows size={27} aria-hidden="true" />
              <div>
                <Heading as="h3">Windows</Heading>
                <p>Windows 10 或更高版本</p>
              </div>
            </div>
            <div className={styles.platformActions}>
              <Link href="https://github.com/DarkNoah/aime-chat/releases/latest/download/aime-chat-setup-win.exe">
                下载安装程序 <IconDownload size={16} aria-hidden="true" />
              </Link>
            </div>
          </article>

          <article className={styles.platformItem}>
            <div className={styles.platformHeading}>
              <IconBrandDebian size={27} aria-hidden="true" />
              <div>
                <Heading as="h3">Linux</Heading>
                <p>Debian / Ubuntu（.deb）</p>
              </div>
            </div>
            <div className={styles.platformActions}>
              <Link href="https://github.com/DarkNoah/aime-chat/releases/latest/download/aime-chat-amd64-linux.deb">
                amd64 <IconDownload size={16} aria-hidden="true" />
              </Link>
              <Link href="https://github.com/DarkNoah/aime-chat/releases/latest/download/aime-chat-arm64-linux.deb">
                arm64 <IconDownload size={16} aria-hidden="true" />
              </Link>
            </div>
          </article>
        </div>

        <div className={styles.installNote}>
          <IconInfoCircle size={19} aria-hidden="true" />
          <p>
            macOS 版本暂不支持自动更新。首次打开遇到系统拦截时，请按
            <Link to="/docs/getting-started/installation"> 安装指南 </Link>
            处理；也可以前往
            <Link href="https://github.com/DarkNoah/aime-chat/releases">
              {' '}
              GitHub Releases{' '}
            </Link>
            查看所有版本。
          </p>
        </div>

        <div className={styles.closingRow}>
          <div>
            <IconCode size={21} aria-hidden="true" />
            <span>准备从源码运行？文档包含 pnpm 开发流程与平台依赖。</span>
          </div>
          <PrimaryLink
            className={styles.closingLink}
            to="/docs/getting-started/installation#开发者安装"
          >
            查看源码安装
          </PrimaryLink>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();

  return (
    <Layout
      title={`${siteConfig.title} 文档 | AI 桌面工作台`}
      description="AIME Chat 是一个开源 AI 桌面工作台，连接模型、Agent、知识库与工具，在本地项目上下文中完成真实任务。"
    >
      <main className={styles.homePage}>
        <Hero />
        <Downloads />
        <DocumentRoutes />
        <WorkspaceLoop />
        <Ecosystem />
      </main>
    </Layout>
  );
}
