import { Agent, AgentType } from '@/types/agent';
import { Tool, ToolType } from '@/types/tool';
import {
  ALL_CHIP,
  AUTO_LOAD_CHIP,
  agentDetailPath,
  avatarInitial,
  filterAgents,
  filterSkillGroups,
  filterSkills,
  filterTools,
  getAgentTags,
  getRepoDisplayName,
  groupSkillsByRepo,
  hubTabForToolId,
  isHubTab,
  seedHue,
  skillGroupPath,
} from './hub-model';

const agent = (overrides: Partial<Agent>): Agent =>
  ({
    id: 'a',
    name: 'Agent',
    type: AgentType.CUSTOM,
    isActive: true,
    tags: [],
    ...overrides,
  }) as Agent;

const tool = (overrides: Partial<Tool>): Tool =>
  ({
    id: `${ToolType.SKILL}:x`,
    name: 'x',
    type: ToolType.SKILL,
    isActive: true,
    ...overrides,
  }) as Tool;

describe('hub-model', () => {
  it('maps tool ids to hub tabs', () => {
    expect(hubTabForToolId(`${ToolType.MCP}:github`)).toBe('connectors');
    expect(hubTabForToolId(`${ToolType.SKILL}:pdf`)).toBe('skills');
    expect(hubTabForToolId(`${ToolType.BUILD_IN}:WebFetch`)).toBe('builtin');
  });

  it('validates hub tabs', () => {
    expect(isHubTab('agents')).toBe(true);
    expect(isHubTab('connectors')).toBe(true);
    expect(isHubTab('experts')).toBe(false);
    expect(isHubTab(null)).toBe(false);
  });

  it('encodes ids in detail paths', () => {
    expect(agentDetailPath('my agent')).toBe('/tools/agents/my%20agent');
    expect(skillGroupPath('https://github.com/a/b')).toBe(
      '/tools/skill-group?repo=https%3A%2F%2Fgithub.com%2Fa%2Fb',
    );
  });

  it('shortens repository names to owner/name', () => {
    expect(getRepoDisplayName('https://github.com/anthropics/skills/')).toBe(
      'anthropics/skills',
    );
    expect(getRepoDisplayName('local')).toBe('local');
  });

  it('groups skills by repository and skips skills without one', () => {
    const groups = groupSkillsByRepo([
      tool({ id: 'skill:a', repo: 'https://github.com/o/r' }),
      tool({ id: 'skill:b', repo: 'https://github.com/o/r' }),
      tool({ id: 'skill:c' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('o/r');
    expect(groups[0].skills.map((s) => s.id)).toEqual(['skill:a', 'skill:b']);
  });

  it('filters agents by scope, tag, status and query', () => {
    const agents = [
      agent({ id: 'writer', name: 'Writer', tags: ['work'] }),
      agent({ id: 'coder', name: 'Coder', type: AgentType.BUILD_IN, isActive: false }),
      agent({ id: 'helper', name: 'Helper', description: 'Writes emails' }),
    ];
    const base = { scope: 'all' as const, tag: ALL_CHIP, status: 'all' as const, query: '' };

    expect(filterAgents(agents, { ...base, scope: 'custom' }).map((a) => a.id)).toEqual([
      'writer',
      'helper',
    ]);
    expect(filterAgents(agents, { ...base, scope: 'built_in' }).map((a) => a.id)).toEqual([
      'coder',
    ]);
    expect(filterAgents(agents, { ...base, tag: 'work' }).map((a) => a.id)).toEqual(['writer']);
    expect(filterAgents(agents, { ...base, status: 'disabled' }).map((a) => a.id)).toEqual([
      'coder',
    ]);
    expect(filterAgents(agents, { ...base, query: '  WRITE ' }).map((a) => a.id)).toEqual([
      'writer',
      'helper',
    ]);
  });

  it('collects agent tags sorted and deduplicated', () => {
    expect(
      getAgentTags([agent({ tags: ['b', 'a'] }), agent({ tags: ['a', 'c'] })]),
    ).toEqual(['a', 'b', 'c']);
  });

  it('filters skills by auto-load and category chips', () => {
    const skills = [
      tool({ id: 'skill:a', category: 'docs', autoLoad: true }),
      tool({ id: 'skill:b', category: 'code' }),
    ];
    const base = { chip: ALL_CHIP, status: 'all' as const, query: '' };
    expect(filterSkills(skills, base)).toHaveLength(2);
    expect(filterSkills(skills, { ...base, chip: AUTO_LOAD_CHIP }).map((s) => s.id)).toEqual([
      'skill:a',
    ]);
    expect(filterSkills(skills, { ...base, chip: 'code' }).map((s) => s.id)).toEqual([
      'skill:b',
    ]);
  });

  it('matches a skill group by its name or any of its skills', () => {
    const groups = groupSkillsByRepo([
      tool({ id: 'skill:pdf', name: 'pdf', repo: 'o/docs', isActive: false }),
      tool({ id: 'skill:xlsx', name: 'xlsx', repo: 'o/docs', isActive: false }),
    ]);
    expect(filterSkillGroups(groups, { status: 'all', query: 'docs' })).toHaveLength(1);
    expect(filterSkillGroups(groups, { status: 'all', query: 'xlsx' })).toHaveLength(1);
    expect(filterSkillGroups(groups, { status: 'all', query: 'zip' })).toHaveLength(0);
    expect(filterSkillGroups(groups, { status: 'enabled', query: '' })).toHaveLength(0);
  });

  it('filters tools using the translated label', () => {
    const tools = [tool({ id: 'build-in:WebFetch', name: 'WebFetch' })];
    expect(
      filterTools(tools, { status: 'all', query: '网页', getLabel: () => '网页抓取' }),
    ).toHaveLength(1);
  });

  it('separates toolkits from standalone tools and searches sub-tools', () => {
    const tools = [
      tool({ id: 'build-in:WebFetch', name: 'WebFetch', isToolkit: false }),
      tool({
        id: 'build-in:FileSystem',
        name: 'FileSystem',
        isToolkit: true,
        tools: [{ id: 'Read', name: 'Read', description: 'Read a file' }],
      }),
    ];
    const base = { status: 'all' as const, query: '' };
    expect(filterTools(tools, { ...base, scope: 'toolkits' }).map((x) => x.id)).toEqual([
      'build-in:FileSystem',
    ]);
    expect(filterTools(tools, { ...base, scope: 'tools' }).map((x) => x.id)).toEqual([
      'build-in:WebFetch',
    ]);
    expect(filterTools(tools, base)).toHaveLength(2);
    expect(
      filterTools(tools, {
        ...base,
        query: '文件读取',
        getLabel: ({ name }) => (name === 'Read' ? '文件读取' : name),
      }).map((x) => x.id),
    ).toEqual(['build-in:FileSystem']);
  });

  it('derives stable avatar values', () => {
    expect(seedHue('writer')).toBe(seedHue('writer'));
    expect(seedHue('writer')).toBeGreaterThanOrEqual(0);
    expect(seedHue('writer')).toBeLessThan(360);
    expect(avatarInitial('  écrivain')).toBe('É');
    expect(avatarInitial('')).toBe('?');
  });
});
