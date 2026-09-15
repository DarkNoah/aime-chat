import Link from '@docusaurus/Link';
import { IconArrowRight } from '@tabler/icons-react';
import styles from './styles.module.css';

const steps = [
  {
    title: '安装应用',
    description: '选择平台，完成桌面安装',
    to: '/docs/getting-started/installation',
  },
  {
    title: '连接模型',
    description: '配置云端服务或本地模型',
    to: '/docs/getting-started/ai-providers',
  },
  {
    title: '开始对话',
    description: '发送消息，尝试工具调用',
    to: '/docs/getting-started/basic-usage',
  },
];

export default function QuickStart() {
  return (
    <nav className={styles.quickStart} aria-label="新用户入门路径">
      <div className={styles.introduction}>
        <strong>第一次使用？从这里开始</strong>
        <span>完成这三步，开始你的第一个 AI 任务。</span>
      </div>
      <ol className={styles.steps}>
        {steps.map((step, index) => (
          <li key={step.to}>
            <Link className={styles.step} to={step.to}>
              <span className={styles.number} aria-hidden="true">
                {index + 1}
              </span>
              <span className={styles.copy}>
                <strong>{step.title}</strong>
                <span>{step.description}</span>
              </span>
              <IconArrowRight size={18} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
