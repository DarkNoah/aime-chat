import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import type { UIMessage } from 'ai';
import type { BashSessionCompletion } from '@/main/tools/file-system/bash';
import type { BackgroundAgentCompletion } from '@/main/tools/common/background-agent';
import en from '@/i18n/locales/en-us.json';
import zh from '@/i18n/locales/zh-cn.json';
import { formatBashCompletionMessage } from '@/main/mastra/background-bash-completion';
import { formatCronMessage } from '@/main/app/cron-message';
import { formatAgentCompletionMessage } from '@/main/mastra/background-agent-completion';
import { StructuredMessageResponse } from './structured-message-response';

jest.mock('./streamdown', () => ({
  Streamdown: ({ children }: { children: ReactNode }) => (
    <div data-testid="markdown">{children}</div>
  ),
}));

const i18n = createInstance();
i18n.init({
  lng: 'zh-CN',
  fallbackLng: 'en-US',
  resources: { 'zh-CN': { translation: zh }, 'en-US': { translation: en } },
  initImmediate: false,
});

function renderBody(text: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <StructuredMessageResponse messageRole="user">
        {text}
      </StructuredMessageResponse>
    </I18nextProvider>,
  );
}

const completion = (
  patch: Partial<BashSessionCompletion> = {},
): BashSessionCompletion => ({
  bashId: 'bash-1',
  command: 'cat < input && echo "done"',
  directory: '/tmp/中文',
  exitCode: 0,
  timedOut: false,
  startTime: '2026-09-15T01:00:00Z',
  finishedAt: '2026-09-15T01:00:01Z',
  ...patch,
});

const cronMessage = formatCronMessage({
  id: 'cron-1',
  name: '项目日报',
  prompt: '检查 <报告> & 汇总项目进展。',
  trigger: 'schedule',
  startedAt: new Date('2026-09-15T01:00:00Z'),
});

const agentCompletion = (
  patch: Partial<BackgroundAgentCompletion> = {},
): BackgroundAgentCompletion => ({
  sessionId: 'agent-1',
  subagentThreadId: 'subagent:agent-1',
  description: '检查项目结构',
  prompt: 'Inspect the project',
  subagentType: 'Explore',
  status: 'completed',
  result: '检查完成。\n包含 3 个模块。',
  startTime: '2026-09-17T01:00:00Z',
  finishedAt: '2026-09-17T01:00:10Z',
  ...patch,
});
const legacyAgentMessage =
  'Background agent finished.\n\n1. Agent ID: old-agent\n\n   Description: 检查旧任务\n\n   Agent type: Explore\n\n   Status: completed\n\n   Result: 历史结果\n\n   Error: None';

describe('structured message rendering', () => {
  it('renders agent results, all terminal states and expandable execution details', () => {
    const { container } = renderBody(
      formatAgentCompletionMessage([
        agentCompletion(),
        agentCompletion({
          sessionId: 'agent-2',
          description: '执行测试',
          status: 'failed',
          result: undefined,
          errorMessage: '<img src="x" onerror="alert(1)">',
        }),
        agentCompletion({
          sessionId: 'agent-3',
          description: '已取消的任务',
          status: 'aborted',
          result: undefined,
        }),
      ]),
    );
    expect(screen.getByText('后台 Agent 执行完成 · 3 个任务')).toBeTruthy();
    ['执行成功', '执行失败', '已终止', '检查项目结构'].forEach((label) =>
      expect(screen.getByText(label)).toBeTruthy(),
    );
    expect(container.textContent).toContain('检查完成。\n包含 3 个模块。');
    expect(container.textContent).toContain('<img src="x" onerror="alert(1)">');
    expect(container.querySelector('img')).toBeNull();
    const details = container.querySelector('details')!;
    expect(details.open).toBe(false);
    fireEvent.click(details.querySelector('summary')!);
    expect(details.open).toBe(true);
    expect(details.textContent).toContain('Agent IDagent-1');
    expect(details.textContent).toContain('Agent 类型Explore');
    expect(details.textContent).toContain('2026-09-17T01:00:10Z');
  });

  it('renders historical agent notifications using the same execution card', () => {
    const { container } = renderBody(legacyAgentMessage);
    expect(
      container.querySelector(
        '[data-structured-message="background-agent-completion"]',
      ),
    ).not.toBeNull();
    expect(screen.getByText('历史结果')).toBeTruthy();
    expect(screen.queryByTestId('markdown')).toBeNull();
  });

  it('renders a compact cron badge with expandable task content, without internal notes', () => {
    const { container } = renderBody(cronMessage);
    expect(screen.getByText('定时任务 · 项目日报 · 已触发')).toBeTruthy();
    const details = container.querySelector('details')!;
    expect(details.open).toBe(false);
    fireEvent.click(details.querySelector('summary')!);
    expect(details.open).toBe(true);
    expect(screen.getByText('检查 <报告> & 汇总项目进展。')).toBeTruthy();
    expect(screen.getByText('定时触发')).toBeTruthy();
    expect(details.textContent).toContain('2026-09-15T01:00:00.000Z');
    expect(container.textContent).not.toContain('ingest_since');
    expect(container.textContent).not.toContain('Do not ingest');
    expect(container.querySelector('报告')).toBeNull();
    expect(screen.queryByTestId('markdown')).toBeNull();
  });

  it('renders batched task states, raw commands and expandable details', () => {
    const statuses: (Partial<BashSessionCompletion> & { label: string })[] = [
      { exitCode: 0, label: '执行成功' },
      { exitCode: 2, label: '执行失败' },
      {
        exitCode: null,
        timedOut: true,
        processSignal: 'SIGTERM',
        label: '执行超时',
      },
      { exitCode: null, processSignal: 'SIGKILL', label: '已终止' },
      {
        exitCode: null,
        errorMessage: '<img src="x" onerror="alert(1)">',
        label: '执行错误',
      },
      { exitCode: null, label: '已完成' },
    ];
    const { container } = renderBody(
      formatBashCompletionMessage(
        statuses.map(({ label, ...patch }, index) =>
          completion({ ...patch, bashId: `bash-${index}` }),
        ),
      ),
    );
    expect(screen.getByText('后台执行完成 · 6 个任务')).toBeTruthy();
    statuses.forEach(({ label }) =>
      expect(screen.getByText(label)).toBeTruthy(),
    );
    expect(screen.getAllByText('cat < input && echo "done"')).toHaveLength(6);
    expect(container.querySelector('img')).toBeNull();
    const details = container.querySelector('details')!;
    expect(details.open).toBe(false);
    fireEvent.click(details.querySelector('summary')!);
    expect(details.open).toBe(true);
    expect(details.textContent).toContain('/tmp/中文');
    expect(details.textContent).toContain('退出码0');
  });

  it('renders a skill badge followed by all remaining text as in the composer', () => {
    const text =
      '\n\n检查 report.pdf  并输出结果\n<img src="x" onerror="alert(1)">\n';
    const { container } = renderBody(`/skill:local:pdf${text}`);
    const badge = container.querySelector('[data-slot="skill-badge"]');
    expect(badge?.textContent).toBe('/pdf');
    expect(badge?.getAttribute('title')).toBe('/skill:local:pdf');
    expect(
      container.querySelector('[data-structured-message="skill"]')?.textContent,
    ).toBe(`/pdf${text}`);
    expect(container.textContent).not.toContain('已加载');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.queryByTestId('markdown')).toBeNull();
  });

  it.each([
    '<background-bash-completion version="1"><task><img src="x">',
    '<background-agent-completion version="1"><agent><img src="x">',
  ])(
    'preserves malformed XML visibly without creating HTML elements',
    (text) => {
      const { container } = renderBody(text);
      expect(container.querySelector('pre')?.textContent).toBe(text);
      expect(container.querySelector('img')).toBeNull();
    },
  );

  it('keeps XML code examples in the Markdown renderer', () => {
    const text = `\`\`\`xml\n${formatBashCompletionMessage([completion()])}\n\`\`\``;
    renderBody(text);
    expect(screen.getByTestId('markdown').textContent).toBe(text);
  });

  it.each(['assistant', 'system', undefined] as (
    | UIMessage['role']
    | undefined
  )[])(
    'keeps XML and skill commands in the normal renderer for role %s',
    (role) => {
      const messages = [
        '/skill:local:pdf report.pdf',
        formatBashCompletionMessage([completion()]),
        formatAgentCompletionMessage([agentCompletion()]),
        legacyAgentMessage,
        cronMessage,
      ];
      const { container } = render(
        <>
          {messages.map((text) => (
            <StructuredMessageResponse key={text} messageRole={role}>
              {text}
            </StructuredMessageResponse>
          ))}
        </>,
      );
      expect(container.querySelector('[data-structured-message]')).toBeNull();
      expect(
        screen.getAllByTestId('markdown').map((element) => element.textContent),
      ).toEqual(messages);
    },
  );

  it('updates rendering when the same text changes from user to assistant role', () => {
    const text = '/skill:local:pdf';
    const { container, rerender } = render(
      <StructuredMessageResponse messageRole="user">
        {text}
      </StructuredMessageResponse>,
      {
        wrapper: ({ children }) => (
          <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
        ),
      },
    );
    expect(
      container.querySelector('[data-structured-message="skill"]'),
    ).not.toBeNull();
    rerender(
      <StructuredMessageResponse messageRole="assistant">
        {text}
      </StructuredMessageResponse>,
    );
    expect(container.querySelector('[data-structured-message]')).toBeNull();
    expect(screen.getByTestId('markdown').textContent).toBe(text);
  });
});
