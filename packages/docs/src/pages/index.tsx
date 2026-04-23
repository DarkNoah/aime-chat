import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import useBaseUrl from '@docusaurus/useBaseUrl';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import {
  IconArrowRight,
  IconBolt,
  IconBook,
  IconBrandApple,
  IconClock,
  IconBrandGithub,
  IconBrandWindows,
  IconCode,
  IconDatabase,
  IconFolder,
  IconPhoto,
  IconPlug,
  IconRobot,
  IconRocket,
  IconShieldLock,
  IconSparkles,
  IconTool,
  IconWorld,
} from '@tabler/icons-react';

import HomepageFeatures from '@site/src/components/HomepageFeatures';
import styles from './index.module.css';

type Provider = {
  name: string;
  icon: ReactElement;
  color: string;
};

type ToolItem = {
  name: string;
  icon: ReactElement;
  desc: string;
};

type WorkflowStep = {
  title: string;
  description: string;
};

type ChannelItem = {
  name: string;
  description: string;
  features: string[];
  link: string;
};

type AutomationItem = {
  title: string;
  description: string;
  details: string[];
};

const providers: Provider[] = [
  { name: 'OpenAI', icon: <IconRobot size={24} />, color: '#10a37f' },
  { name: 'DeepSeek', icon: <IconSparkles size={24} />, color: '#6366f1' },
  { name: 'Google', icon: <IconWorld size={24} />, color: '#4285f4' },
  { name: '智谱 AI', icon: <IconRobot size={24} />, color: '#ff6b35' },
  { name: 'Ollama', icon: <IconSparkles size={24} />, color: '#1d1d1f' },
  { name: 'LM Studio', icon: <IconCode size={24} />, color: '#8b5cf6' },
  { name: 'ModelScope', icon: <IconSparkles size={24} />, color: '#ff4d4f' },
  { name: 'SiliconFlow', icon: <IconBolt size={24} />, color: '#00d4aa' },
];

const tools: ToolItem[] = [
  { name: '代码执行', icon: <IconCode size={22} />, desc: 'Python / Node.js 任务执行' },
  { name: '文件操作', icon: <IconFolder size={22} />, desc: '搜索、编辑、读写项目文件' },
  { name: '网络请求', icon: <IconWorld size={22} />, desc: '网页抓取与在线搜索' },
  { name: '图像处理', icon: <IconPhoto size={22} />, desc: '识别、编辑、去背景' },
  { name: '数据库', icon: <IconDatabase size={22} />, desc: 'LibSQL / SQLite 数据处理' },
  { name: 'MCP 扩展', icon: <IconPlug size={22} />, desc: '接入更多外部能力' },
];

const workflowSteps: WorkflowStep[] = [
  {
    title: '连接模型',
    description: '配置 OpenAI、DeepSeek、Google、Ollama 等模型服务，统一在一个桌面应用中使用。',
  },
  {
    title: '选择能力',
    description: '从对话、知识库、工具调用到 Agent 模式，按任务切换最合适的工作方式。',
  },
  {
    title: '立即执行',
    description: '让 AI 直接处理文档、代码、网页、图片和本地数据，而不只是生成一段文本。',
  },
];

const trustItems = ['开源免费', '本地优先', '隐私安全', '跨平台桌面应用'];

const channels: ChannelItem[] = [
  {
    name: 'Telegram',
    description: '将 AIME Chat 接入 Telegram，把 AI 能力延伸到移动端和远程消息场景。',
    features: ['远程对话', '多端触达', '消息驱动工作流'],
    link: '/docs/features/channels/telegram',
  },
  {
    name: '微信',
    description: '连接微信频道后，可以在更贴近日常沟通的场景中使用 AI 助手与自动化能力。',
    features: ['国内常用场景', '便捷接入', '持续在线交互'],
    link: '/docs/features/channels/wechat',
  },
];

const automationItems: AutomationItem[] = [
  {
    title: '定时触发 AI 任务',
    description: '基于 cron 表达式按分钟、小时、每天或每周自动执行提示词任务。',
    details: ['Cron Builder', '自定义表达式', '启用/停用切换'],
  },
  {
    title: '绑定项目与执行上下文',
    description: '自动化任务可以关联项目，并指定模型、Agent、工具和子 Agent。',
    details: ['项目上下文', '指定 Agent', '工具与子 Agent'],
  },
  {
    title: '保留最近执行信息',
    description: '系统会记录最近一次执行时间、结束时间和执行结果，便于观察自动化效果。',
    details: ['lastRunAt', 'lastRunEndAt', 'lastRunResult'],
  },
];

function SectionIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className={styles.sectionIntro}>
      <span className={styles.sectionEyebrow}>{eyebrow}</span>
      <Heading as="h2" className={styles.sectionTitle}>
        {title}
      </Heading>
      <p className={styles.sectionDescription}>{description}</p>
    </div>
  );
}

function HomepageHeader() {
  const screenshotUrl = useBaseUrl('img/ScreenShot_2026-01-24_171537_284.png');

  return (
    <header className={styles.heroBanner}>
      <div className={styles.heroBackground}>
        <div className={clsx(styles.heroOrb, styles.heroOrb1)} />
        <div className={clsx(styles.heroOrb, styles.heroOrb2)} />
        <div className={clsx(styles.heroOrb, styles.heroOrb3)} />
        <div className={styles.gridPattern} />
      </div>

      <div className={clsx('container', styles.heroContainer)}>
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>
            <IconSparkles size={16} />
            <span>Open CoWork · AI 桌面助手</span>
          </div>

          <Heading as="h1" className={styles.heroTitle}>
            一个真正能干活的
            <span className={styles.titleGradient}> AI 桌面助手</span>
          </Heading>

          <p className={styles.heroDescription}>
            AIME Chat 将多模型对话、知识库、工具调用与 Agent 能力整合到一个跨平台桌面应用中，
            让 AI 既能聊天，也能直接完成实际任务。
          </p>

          <div className={styles.heroActions}>
            <Link className={clsx(styles.heroButton, styles.heroButtonPrimary)} to="/docs/intro">
              <IconRocket size={18} /> 快速开始
            </Link>
            <Link
              className={clsx(styles.heroButton, styles.heroButtonSecondary)}
              href="https://github.com/DarkNoah/aime-chat"
            >
              <IconBrandGithub size={18} /> GitHub
            </Link>
          </div>

          <div className={styles.trustRow}>
            {trustItems.map((item) => (
              <span key={item} className={styles.trustPill}>
                <IconShieldLock size={14} /> {item}
              </span>
            ))}
          </div>

          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <strong>10+</strong>
              <span>AI 服务商</span>
            </div>
            <div className={styles.statCard}>
              <strong>20+</strong>
              <span>内置工具</span>
            </div>
            <div className={styles.statCard}>
              <strong>3</strong>
              <span>桌面平台支持</span>
            </div>
          </div>

          <div className={styles.downloadCard}>
            <div>
              <p className={styles.downloadLabel}>立即下载</p>
              <p className={styles.downloadText}>选择你的平台，几分钟内开始使用。</p>
            </div>
            <div className={styles.downloadLinks}>
              <Link
                className={styles.platformLink}
                href="https://github.com/DarkNoah/aime-chat/releases/latest/download/aime-chat-arm64-mac.dmg"
                title="macOS (Apple Silicon)"
              >
                <IconBrandApple size={20} />
                <span>macOS</span>
              </Link>
              <Link
                className={styles.platformLink}
                href="https://github.com/DarkNoah/aime-chat/releases/latest/download/aime-chat-setup-win.exe"
                title="Windows"
              >
                <IconBrandWindows size={20} />
                <span>Windows</span>
              </Link>
            </div>
          </div>
        </div>

        <div className={styles.heroVisual}>
          <div className={styles.heroPreviewCard}>
            <div className={styles.previewTopbar}>
              <span />
              <span />
              <span />
            </div>
            <img
              className={styles.heroScreenshotImage}
              src={screenshotUrl}
              alt="AIME Chat 应用截图"
              loading="eager"
            />
          </div>

          <div className={styles.heroInfoGrid}>
            <div className={styles.heroInfoCard}>
              <div className={styles.heroInfoIcon}>
                <IconTool size={18} />
              </div>
              <div>
                <strong>工具系统</strong>
                <span>文件、代码、网页、图片、数据库</span>
              </div>
            </div>

            <div className={styles.heroInfoCard}>
              <div className={styles.heroInfoIcon}>
                <IconRobot size={18} />
              </div>
              <div>
                <strong>多模型统一接入</strong>
                <span>一个界面管理常见 AI 服务商</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function WorkflowSection() {
  return (
    <section className={styles.workflowSection}>
      <div className="container">
        <SectionIntro
          eyebrow="工作流"
          title="从对话到执行，形成完整闭环"
          description="不仅能问答，还能把模型能力和本地工作环境连接起来，让 AI 真正参与到你的日常工作。"
        />

        <div className={styles.workflowGrid}>
          {workflowSteps.map((step, index) => (
            <div key={step.title} className={styles.workflowCard}>
              <div className={styles.workflowIndex}>0{index + 1}</div>
              <Heading as="h3" className={styles.workflowTitle}>
                {step.title}
              </Heading>
              <p className={styles.workflowDescription}>{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ChannelsSection() {
  return (
    <section className={styles.channelsSection}>
      <div className="container">
        <SectionIntro
          eyebrow="频道接入"
          title="把 AI 助手带到你常用的消息渠道"
          description="除了桌面端使用方式，AIME Chat 还支持将能力扩展到外部频道，让对话、通知和任务触发更加自然。"
        />

        <div className={styles.channelGrid}>
          {channels.map((channel) => (
            <div key={channel.name} className={styles.channelCard}>
              <div className={styles.channelHeader}>
                <Heading as="h3" className={styles.channelTitle}>
                  {channel.name}
                </Heading>
                <span className={styles.channelBadge}>已支持</span>
              </div>

              <p className={styles.channelDescription}>{channel.description}</p>

              <div className={styles.channelFeatures}>
                {channel.features.map((feature) => (
                  <span key={feature} className={styles.channelFeatureTag}>
                    {feature}
                  </span>
                ))}
              </div>

              <Link className={styles.inlineLink} to={channel.link}>
                查看接入说明 <IconArrowRight size={16} />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AutomationSection() {
  return (
    <section className={styles.automationSection}>
      <div className="container">
        <SectionIntro
          eyebrow="自动化"
          title="让 AI 按计划自动工作"
          description="源项目内置了自动化 Crons 页面，可以创建定时任务，绑定项目上下文，并指定执行所用的 Agent、模型、工具与子 Agent。"
        />

        <div className={styles.automationLayout}>
          <div className={styles.automationLeadCard}>
            <div className={styles.automationLeadIcon}>
              <IconClock size={28} />
            </div>
            <Heading as="h3" className={styles.automationLeadTitle}>
              内置 Cron Builder 与任务管理界面
            </Heading>
            <p className={styles.automationLeadDescription}>
              自动化页面支持按每隔分钟、每小时、每天、每周或自定义 cron 表达式来配置任务，还可以随时启用、停用、编辑和删除。
            </p>
            <Link className={styles.inlineLink} to="/docs/features/crons">
              查看自动化文档 <IconArrowRight size={16} />
            </Link>
          </div>

          <div className={styles.automationGrid}>
            {automationItems.map((item) => (
              <div key={item.title} className={styles.automationCard}>
                <Heading as="h3" className={styles.automationTitle}>
                  {item.title}
                </Heading>
                <p className={styles.automationDescription}>{item.description}</p>
                <div className={styles.automationTags}>
                  {item.details.map((detail) => (
                    <span key={detail} className={styles.automationTag}>
                      {detail}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProvidersSection() {
  return (
    <section className={styles.providersSection}>
      <div className="container">
        <SectionIntro
          eyebrow="模型生态"
          title="统一连接主流 AI 模型"
          description="无论你在使用云端模型还是本地模型，都可以在同一个桌面工作台里统一管理与调用。"
        />

        <div className={styles.providerGrid}>
          {providers.map((provider) => (
            <div
              key={provider.name}
              className={styles.providerItem}
              style={{ '--provider-color': provider.color } as CSSProperties}
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
    <section className={styles.toolsSection}>
      <div className="container">
        <SectionIntro
          eyebrow="工具能力"
          title="让 AI 不止回答问题"
          description="内置常用工程能力，并支持通过 MCP 扩展到更多业务场景，覆盖开发、文档、数据和多媒体任务。"
        />

        <div className={styles.toolGrid}>
          {tools.map((tool) => (
            <div key={tool.name} className={styles.toolItem}>
              <div className={styles.toolIcon}>{tool.icon}</div>
              <div>
                <Heading as="h3" className={styles.toolName}>
                  {tool.name}
                </Heading>
                <p className={styles.toolDesc}>{tool.desc}</p>
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
    <section className={styles.quickStartSection}>
      <div className="container">
        <div className={styles.quickStartShell}>
          <div className={styles.quickStartCopy}>
            <span className={styles.sectionEyebrow}>快速开始</span>
            <Heading as="h2" className={styles.sectionTitle}>
              几条命令，即可开始体验
            </Heading>
            <p className={styles.sectionDescription}>
              克隆仓库、安装依赖、启动应用。想继续深入，可以直接查看完整文档和功能说明。
            </p>
            <Link className={styles.inlineLink} to="/docs/getting-started/installation">
              查看安装说明 <IconArrowRight size={16} />
            </Link>
          </div>

          <div className={styles.codeWrapper}>
            <div className={styles.codeHeader}>
              <div className={styles.codeDots}>
                <span className={styles.codeDotRed} />
                <span className={styles.codeDotYellow} />
                <span className={styles.codeDotGreen} />
              </div>
              <span className={styles.codeTitle}>Terminal</span>
            </div>
            <div className={styles.codeBlock}>
              <code>
                <span className={styles.codeComment}># 克隆项目</span>
                <br />
                <span className={styles.codePrompt}>$</span>{' '}
                <span className={styles.codeCommand}>git clone</span>{' '}
                <span className={styles.codeUrl}>https://github.com/DarkNoah/aime-chat.git</span>
                <br />
                <br />
                <span className={styles.codeComment}># 安装依赖</span>
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
                <span className={styles.codeSuccess}>✨ 应用已启动</span>
              </code>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className={styles.ctaSection}>
      <div className="container">
        <div className={styles.ctaCard}>
          <div>
            <span className={styles.sectionEyebrow}>开始使用</span>
            <Heading as="h2" className={styles.ctaTitle}>
              现在就把 AI 带进你的桌面工作流
            </Heading>
            <p className={styles.ctaDescription}>
              使用统一的聊天界面连接模型、知识库、工具和 Agent，构建更顺手的 AI 工作方式。
            </p>
          </div>

          <div className={styles.ctaButtons}>
            <Link className={clsx(styles.heroButton, styles.heroButtonPrimary)} to="/docs/intro">
              <IconBook size={18} /> 阅读文档
            </Link>
            <Link
              className={clsx(styles.heroButton, styles.heroButtonSecondary)}
              href="https://github.com/DarkNoah/aime-chat/releases"
            >
              <IconBolt size={18} /> 下载应用
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();

  return (
    <Layout
      title={`${siteConfig.title} - AI 桌面助手文档`}
      description="AIME Chat 是一款支持多模型、知识库、工具调用与 Agent 的 AI 桌面应用。"
    >
      <HomepageHeader />
      <main>
        <HomepageFeatures />
        <WorkflowSection />
        <ChannelsSection />
        <AutomationSection />
        <ProvidersSection />
        <ToolsSection />
        <QuickStartSection />
        <CTASection />
      </main>
    </Layout>
  );
}
