import { parseStructuredMessage } from './structured-message-parser';
import { formatCronMessage } from '@/main/app/cron-message';

const task =
  '<task><bash-id>1</bash-id><command>ls</command><timed-out>false</timed-out></task>';
const xml = (body: string, version = '1') =>
  `<background-bash-completion version="${version}">${body}</background-bash-completion>`;
const agent =
  '<agent><agent-id>agent-1</agent-id><description>Inspect files</description><agent-type>Explore</agent-type><status>completed</status><result>Done</result><error></error></agent>';
const agentXml = (body = agent, version = '1') =>
  `<background-agent-completion version="${version}">${body}</background-agent-completion>`;
const legacyAgent = (index: number, status = 'completed', result = 'Done') =>
  [
    `${index}. Agent ID: agent-${index}`,
    '',
    '   Description: 检查项目',
    '',
    '   Agent type: Explore',
    '',
    `   Status: ${status}`,
    '',
    `   Result: ${result}`,
    '',
    '   Error: None',
  ].join('\n');

describe('parseStructuredMessage', () => {
  it.each(['completed', 'failed', 'aborted'])(
    'parses agent completion status %s',
    (status) => {
      const parsed = parseStructuredMessage(
        agentXml(
          agent.replace(
            '<status>completed</status>',
            `<status>${status}</status>`,
          ),
        ),
      );
      expect(parsed).toMatchObject({
        type: 'background-agent-completion',
        agents: [{ sessionId: 'agent-1', status, result: 'Done' }],
      });
    },
  );

  it('recognizes single and batched historical agent notifications', () => {
    const single = `Background agent finished.\n\n${legacyAgent(1, 'aborted', 'None')}`;
    expect(parseStructuredMessage(single)).toMatchObject({
      type: 'background-agent-completion',
      agents: [{ status: 'aborted', result: undefined }],
    });
    const batch = `Background agents finished (2 agents).\n\n${legacyAgent(1, 'completed', 'Line 1\n\nLine 2')}\n\n${legacyAgent(2, 'failed')}`;
    expect(parseStructuredMessage(batch.replace(/\n/g, '\r\n'))).toMatchObject({
      type: 'background-agent-completion',
      agents: [
        {
          sessionId: 'agent-1',
          status: 'completed',
          result: 'Line 1\n\nLine 2',
        },
        { sessionId: 'agent-2', status: 'failed' },
      ],
    });
  });

  it.each([
    agentXml('', '1'),
    agentXml(agent, '2'),
    agentXml(agent.replace('<agent-id>agent-1</agent-id>', '')),
    agentXml(agent.replace('<agent-type>Explore</agent-type>', '')),
    agentXml(
      agent.replace('<status>completed</status>', '<status>running</status>'),
    ),
    agentXml(
      agent.replace(
        '<result>Done</result>',
        '<result><img src="x" /></result>',
      ),
    ),
    agentXml(
      agent.replace(
        '<result>Done</result>',
        '<result>A</result><result>B</result>',
      ),
    ),
    agentXml(agent.replace('Done', '&unknown;')),
    agentXml(agent.replace('Done', '<?instruction text?>')),
    '<background-agent-completion version="1"><agent>',
    `Example: ${agentXml()}`,
    `\`\`\`xml\n${agentXml()}\n\`\`\``,
    'Background agent finished.',
    `Background agents finished (2 agents).\n\n${legacyAgent(1)}`,
    `Background agent finished.\n\n${legacyAgent(1, 'running')}`,
    `Background agent finished.\n\n${legacyAgent(1, 'completed', 'Output\n\n   Error: ambiguous result')}`,
    `Example: Background agent finished.\n\n${legacyAgent(1)}`,
    `\`\`\`text\nBackground agent finished.\n\n${legacyAgent(1)}\n\`\`\``,
  ])(
    'leaves malformed or ambiguous agent notifications and examples as ordinary text',
    (text) => {
      expect(parseStructuredMessage(text)).toBeNull();
    },
  );

  const cron = formatCronMessage({
    id: 'cron-1',
    name: '日报 & <检查>',
    prompt: '\n检查文件\r\n<!DOCTYPE html>\n',
    trigger: 'manual',
    startedAt: new Date('2026-09-15T01:00:00Z'),
  });

  it('parses the cron context without changing the task prompt', () => {
    expect(parseStructuredMessage(cron)).toEqual({
      type: 'cron',
      cron: {
        id: 'cron-1',
        name: '日报 & <检查>',
        trigger: 'manual',
        startedAt: '2026-09-15T01:00:00.000Z',
        previousRunAt: undefined,
        ingestSince: '2026-09-14T01:00:00.000Z',
        prompt: '\n检查文件\r\n<!DOCTYPE html>\n',
      },
    });
  });

  it('recognizes historical cron messages without guessing their trigger type', () => {
    const legacy = [
      '<cron-context>',
      'cron_id: cron-old',
      'cron_name: A & B',
      'started_at: 2026-09-15T01:00:00.000Z',
      'previous_run_at: 2026-09-14T01:00:00.000Z',
      'ingest_since: 2026-09-14T01:00:00.000Z',
      '',
      'Notes:',
      '- Internal instructions.',
      '</cron-context>',
      '执行日报\r\n保持原文',
    ].join('\r\n');
    expect(parseStructuredMessage(legacy)).toEqual({
      type: 'cron',
      cron: {
        id: 'cron-old',
        name: 'A & B',
        trigger: undefined,
        startedAt: '2026-09-15T01:00:00.000Z',
        previousRunAt: '2026-09-14T01:00:00.000Z',
        ingestSince: '2026-09-14T01:00:00.000Z',
        prompt: '执行日报\r\n保持原文',
      },
    });
  });

  it.each([
    cron.replace('version="1"', 'version="2"'),
    cron.replace('<cron_id>cron-1</cron_id>', ''),
    cron.replace(
      '<cron_id>cron-1</cron_id>',
      '<cron_id>1</cron_id><cron_id>2</cron_id>',
    ),
    cron.replace('<trigger>manual</trigger>', '<trigger>unknown</trigger>'),
    cron.replace('<cron_name>', '<cron_name><img />'),
    cron.replace('</cron-context>', ''),
    '<cron-context>ordinary text</cron-context>',
    `Example: ${cron}`,
    `\`\`\`xml\n${cron}\n\`\`\``,
  ])('rejects malformed cron contexts and quoted examples', (text) => {
    expect(parseStructuredMessage(text)).toBeNull();
  });

  it.each([
    [
      '/skill:pdf\n\n先检查  再总结\n',
      'skill:pdf',
      'pdf',
      '\n\n先检查  再总结\n',
    ],
    ['/skill:local:pdf', 'skill:local:pdf', 'pdf', undefined],
    [
      '/skill:anthropic-agent-skills:xlsx report.xlsx',
      'skill:anthropic-agent-skills:xlsx',
      'xlsx',
      ' report.xlsx',
    ],
    [
      '/skill:pdf 检查中文文件.pdf\n参数 & <tag> "quotes"',
      'skill:pdf',
      'pdf',
      ' 检查中文文件.pdf\n参数 & <tag> "quotes"',
    ],
  ])('parses a user skill slash command: %s', (text, id, name, args) => {
    expect(parseStructuredMessage(text)).toEqual({
      type: 'skill',
      skill: { id, name, args },
    });
  });

  it.each([
    'plain Markdown **text**',
    '```text\n/skill:local:pdf\n```',
    'Please run /skill:local:pdf',
    '/skill:',
    '/skill:local:',
    '/skill::pdf',
    '/skills:local:pdf',
    '/compact',
    '<system-reminder>Available skills: pdf</system-reminder>',
    `\`\`\`xml\n${xml(task)}\n\`\`\``,
    `Example: ${xml(task)}`,
    '<background-bash-completion version="1"><task>',
    xml(task, '2'),
    xml(''),
    xml(task.replace('<bash-id>1</bash-id>', '')),
    xml(
      task.replace(
        '<bash-id>1</bash-id>',
        '<bash-id>1</bash-id><bash-id>2</bash-id>',
      ),
    ),
    xml(task.replace('ls', '<img src="https://example.com/tracker" />')),
    xml(task.replace('ls', '&unknown;')),
    xml(task.replace('ls', '<?test value?>')),
    xml(task.replace('false', 'no')),
    xml(task.replace('</task>', '<exit-code>NaN</exit-code></task>')),
  ])('rejects examples, ordinary commands and malformed XML: %s', (text) => {
    expect(parseStructuredMessage(text)).toBeNull();
  });
});
