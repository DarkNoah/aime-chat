import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';
import {
  IconRocket,
  IconStar,
  IconBrandApple,
  IconBrandWindows,
  IconBrandUbuntu,
  IconRobot,
  IconTool,
  IconBolt,
  IconCode,
  IconFolder,
  IconWorld,
  IconPhoto,
  IconDatabase,
  IconPlug,
  IconSparkles,
  IconBook,
  IconPackage,
} from '@tabler/icons-react';

import styles from './index.module.css';

const providers = [
  { name: 'OpenAI', icon: <IconRobot size={28} />, color: '#10a37f' },
  { name: 'DeepSeek', icon: <IconSparkles size={28} />, color: '#6366f1' },
  { name: 'Google', icon: <IconWorld size={28} />, color: '#4285f4' },
  { name: '智谱 AI', icon: <IconRobot size={28} />, color: '#ff6b35' },
  { name: 'Ollama', icon: <IconSparkles size={28} />, color: '#1d1d1f' },
  { name: 'LMStudio', icon: <IconCode size={28} />, color: '#8b5cf6' },
  { name: 'ModelScope', icon: <IconSparkles size={28} />, color: '#ff4d4f' },
  { name: 'SiliconFlow', icon: <IconBolt size={28} />, color: '#00d4aa' },
];

const tools = [
  { name: '代码执行', icon: <IconCode size={24} />, desc: 'Python / Node.js' },
  { name: '文件操作', icon: <IconFolder size={24} />, desc: '读写 / 搜索 / 编辑' },
  { name: '网络请求', icon: <IconWorld size={24} />, desc: '抓取 / 搜索' },
  { name: '图像处理', icon: <IconPhoto size={24} />, desc: '分析 / 背景移除' },
  { name: '数据库', icon: <IconDatabase size={24} />, desc: 'LibSQL 操作' },
  { name: 'MCP 扩展', icon: <IconPlug size={24} />, desc: '无限可能' },
];

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={styles.heroBanner}>
      {/* 背景装饰 */}
      <div className={styles.heroBackground}>
        <div className={clsx(styles.heroOrb, styles.heroOrb1)} />
        <div className={clsx(styles.heroOrb, styles.heroOrb2)} />
        <div className={clsx(styles.heroOrb, styles.heroOrb3)} />
        <div className={styles.gridPattern} />
      </div>

      <div className="container">
        {/* 徽章 */}
        <div className={styles.heroBadge}>
          <span className={styles.badgeIcon}><IconSparkles size={16} /></span>
          <span>开源免费 · 本地优先 · 隐私安全</span>
        </div>

        <Heading as="h1" className={styles.heroTitle}>
          <span className={styles.titleGradient}>AIME Chat</span>
        </Heading>
        <p className={styles.heroSubtitle}>你的智能 AI 桌面助手</p>
        <p className={styles.heroDescription}>
          基于 Electron 构建的跨平台 AI 聊天应用
          <br />
          集成多种 AI 服务商，支持智能对话、知识库管理、工具调用
        </p>
        <div className={styles.buttons}>
          <Link
            className={clsx(styles.heroButton, styles.heroButtonPrimary)}
            to="/docs/intro"
          >
            <IconRocket size={20} /> 快速开始
          </Link>
          <Link
            className={clsx(styles.heroButton, styles.heroButtonSecondary)}
            href="https://github.com/DarkNoah/aime-chat"
          >
            <IconStar size={20} /> Star on GitHub
          </Link>
        </div>

        {/* 统计数据 */}
        <div className={styles.stats}>
          <div className={styles.statItem}>
            <div className={styles.statNumber}>10+</div>
            <div className={styles.statLabel}>AI 服务商</div>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statItem}>
            <div className={styles.statNumber}>20+</div>
            <div className={styles.statLabel}>内置工具</div>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statItem}>
            <div className={styles.statNumber}>3</div>
            <div className={styles.statLabel}>平台支持</div>
          </div>
        </div>

        {/* 平台图标 */}
        <div className={styles.platforms}>
          <span className={styles.platformIcon} title="macOS">
            <IconBrandApple size={24} />
          </span>
          <span className={styles.platformIcon} title="Windows">
            <IconBrandWindows size={24} />
          </span>
          <span className={styles.platformIcon} title="Linux">
            <IconBrandUbuntu size={24} />
          </span>
        </div>
      </div>
    </header>
  );
}

function ProvidersSection() {
  return (
    <section className={styles.providers}>
      <div className="container">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionIcon}><IconRobot size={32} /></span>
          <h2 className={styles.sectionTitle}>支持多种 AI 服务商</h2>
          <p className={styles.sectionSubtitle}>
            一个应用，连接所有主流 AI 模型
          </p>
        </div>
        <div className={styles.providerGrid}>
          {providers.map((provider, idx) => (
            <div
              key={idx}
              className={styles.providerItem}
              style={
                { '--provider-color': provider.color } as React.CSSProperties
              }
            >
              <span className={styles.providerIcon}>{provider.icon}</span>
              <span className={styles.providerName}>{provider.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ToolsSection() {
  return (
    <section className={styles.tools}>
      <div className="container">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionIcon}><IconTool size={32} /></span>
          <h2 className={styles.sectionTitle}>强大的工具系统</h2>
          <p className={styles.sectionSubtitle}>
            让 AI 不只是聊天，还能执行实际操作
          </p>
        </div>
        <div className={styles.toolGrid}>
          {tools.map((tool, idx) => (
            <div key={idx} className={styles.toolItem}>
              <span className={styles.toolIcon}>{tool.icon}</span>
              <div className={styles.toolInfo}>
                <span className={styles.toolName}>{tool.name}</span>
                <span className={styles.toolDesc}>{tool.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function QuickStartSection() {
  return (
    <section className={styles.quickStart}>
      <div className={styles.quickStartContainer}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionIcon}><IconBolt size={32} /></span>
          <h2 className={styles.sectionTitle}>快速开始</h2>
          <p className={styles.sectionSubtitle}>几个简单的命令即可启动</p>
        </div>
        <div className={styles.codeWrapper}>
          <div className={styles.codeHeader}>
            <div className={styles.codeDots}>
              <span
                className={styles.codeDot}
                style={{ background: '#ff5f56' }}
              />
              <span
                className={styles.codeDot}
                style={{ background: '#ffbd2e' }}
              />
              <span
                className={styles.codeDot}
                style={{ background: '#27ca3f' }}
              />
            </div>
            <span className={styles.codeTitle}>Terminal</span>
          </div>
          <div className={styles.codeBlock}>
            <code>
              <span className={styles.codeComment}># 克隆项目</span>
              <br />
              <span className={styles.codePrompt}>$</span>{' '}
              <span className={styles.codeCommand}>git clone</span>{' '}
              <span className={styles.codeUrl}>
                https://github.com/DarkNoah/aime-chat.git
              </span>
              <br />
              <br />
              <span className={styles.codeComment}># 进入目录并安装依赖</span>
              <br />
              <span className={styles.codePrompt}>$</span>{' '}
              <span className={styles.codeCommand}>cd</span> aime-chat{' '}
              <span className={styles.codeOperator}>&&</span>{' '}
              <span className={styles.codeCommand}>pnpm install</span>
              <br />
              <br />
              <span className={styles.codeComment}># 启动应用</span>
              <br />
              <span className={styles.codePrompt}>$</span>{' '}
              <span className={styles.codeCommand}>pnpm start</span>
              <br />
              <span className={styles.codeSuccess}>✨ 应用已启动！</span>
            </code>
          </div>
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className={styles.cta}>
      <div className="container">
        <div className={styles.ctaContent}>
          <h2 className={styles.ctaTitle}>准备好开始了吗？</h2>
          <p className={styles.ctaDescription}>
            免费下载，立即体验智能 AI 助手的强大功能
          </p>
          <div className={styles.ctaButtons}>
            <Link className={styles.ctaButtonPrimary} to="/docs/intro">
              <IconBook size={20} /> 查看文档
            </Link>
            <Link
              className={styles.ctaButtonSecondary}
              href="https://github.com/DarkNoah/aime-chat/releases"
            >
              <IconPackage size={20} /> 下载应用
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} - AI 桌面聊天应用`}
      description="AIME Chat 是一款强大的 AI 桌面聊天应用，支持多种 AI 服务商，提供智能对话、知识库管理、工具调用等丰富功能。"
    >
      <HomepageHeader />
      <main>
        <HomepageFeatures />
        <ProvidersSection />
        <ToolsSection />
        <QuickStartSection />
        <CTASection />
      </main>
    </Layout>
  );
}
