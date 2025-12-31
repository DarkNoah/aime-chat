import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  icon: string;
  gradient: string;
  description: JSX.Element;
  tags: string[];
};

const FeatureList: FeatureItem[] = [
  {
    title: '多模型支持',
    icon: '🤖',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    description: (
      <>
        集成 OpenAI、DeepSeek、Google、智谱 AI、Ollama
        等主流服务商，一个应用满足所有 AI 对话需求。
      </>
    ),
    tags: ['GPT-4', 'Gemini', 'GLM', 'Llama'],
  },
  {
    title: '强大的工具系统',
    icon: '🛠️',
    gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    description: (
      <>
        内置文件操作、代码执行、网络请求等丰富工具，支持 MCP 协议扩展，让 AI
        能够执行实际操作。
      </>
    ),
    tags: ['MCP', '代码执行', '文件操作'],
  },
  {
    title: '知识库管理',
    icon: '📚',
    gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    description: (
      <>
        内置向量数据库，支持文档上传和智能检索，基于您的专属知识库进行精准问答。
      </>
    ),
    tags: ['RAG', '向量检索', '文档解析'],
  },
  {
    title: '本地优先',
    icon: '🔒',
    gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    description: (
      <>
        数据存储在本地，支持 Ollama
        等本地模型，保护您的隐私安全，完全掌控自己的数据。
      </>
    ),
    tags: ['隐私保护', '离线可用', '本地模型'],
  },
  {
    title: 'Agent 系统',
    icon: '🎯',
    gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    description: (
      <>
        基于 Mastra 框架构建的 Agent 系统，支持自定义指令和工具配置，打造专属 AI
        助手。
      </>
    ),
    tags: ['自定义 Agent', 'Mastra', '工具调用'],
  },
  {
    title: '跨平台支持',
    icon: '💻',
    gradient: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    description: (
      <>
        基于 Electron 构建，完美支持 macOS、Windows 和
        Linux，享受原生应用的流畅体验。
      </>
    ),
    tags: ['macOS', 'Windows', 'Linux'],
  },
];

function Feature({ title, icon, gradient, description, tags }: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className={styles.featureCard}>
        <div className={styles.featureIcon} style={{ background: gradient }}>
          {icon}
        </div>
        <Heading as="h3" className={styles.featureTitle}>
          {title}
        </Heading>
        <p className={styles.featureDescription}>{description}</p>
        <div className={styles.featureTags}>
          {tags.map((tag, idx) => (
            <span key={idx} className={styles.featureTag}>
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): JSX.Element {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionIcon}>✨</span>
          <h2 className={styles.sectionTitle}>核心特性</h2>
          <p className={styles.sectionSubtitle}>
            强大、灵活、安全的 AI 对话体验
          </p>
        </div>
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
