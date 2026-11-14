import { Agent, AgentType } from '@/types/agent';
import { Tool, ToolType } from '@/types/tool';
import {
  ALL_CHIP,
  agentDetailPath,
  avatarInitial,
  filterAgents,
  filterSkillGroups,
  filterSkills,
  filterSkillsInGroups,
  filterTools,
  getAgentTags,
  getRepoDisplayName,
  getStandaloneSkills,
  groupSkillsByRepo,
  hubTabForToolId,
  isHubTab,
  isSkillView,
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

  it('validates skill views', () => {
    expect(isSkillView('grouped')).toBe(true);
    expect(isSkillView('flat')).toBe(true);
    expect(isSkillView('list')).toBe(false);
    expect(isSkillView(null)).toBe(false);
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

  it('collects skills without a repository as standalone', () => {
    const standalone = getStandaloneSkills([
      tool({ id: 'skill:a', repo: 'https://github.com/o/r' }),
      tool({ id: 'skill:c' }),
    ]);
    expect(standalone.map((s) => s.id)).toEqual(['skill:c']);
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

  it('filters skills by category chips', () => {
    const skills = [
      tool({ id: 'skill:a', category: 'docs', autoLoad: true }),
      tool({ id: 'skill:b', category: 'code' }),
    ];
    const base = { chip: ALL_CHIP, status: 'all' as const, query: '' };
    expect(filterSkills(skills, base)).toHaveLength(2);
    expect(filterSkills(skills, { ...base, chip: 'code' }).map((s) => s.id)).toEqual([
      'skill:b',
    ]);
  });

  it('matches a skill group by its name or any of its skills', () => {
    const groups = groupSkillsByRepo([
      tool({ id: 'skill:pdf', name: 'pdf', repo: 'o/docs', isActive: false }),
      tool({ id: 'skill:xlsx', name: 'xlsx', repo: 'o/docs', isActive: false }),
    ]);
    const base = { chip: ALL_CHIP, status: 'all' as const, query: '' };
    expect(filterSkillGroups(groups, { ...base, query: 'docs' })).toHaveLength(1);
    expect(filterSkillGroups(groups, { ...base, query: 'xlsx' })).toHaveLength(1);
    expect(filterSkillGroups(groups, { ...base, query: 'zip' })).toHaveLength(0);
    expect(filterSkillGroups(groups, { ...base, status: 'enabled' })).toHaveLength(0);
  });

  it('keeps skill groups that contain a skill matching the chip', () => {
    const groups = groupSkillsByRepo([
      tool({ id: 'skill:pdf', repo: 'o/docs', category: 'docs', autoLoad: true }),
      tool({ id: 'skill:lint', repo: 'o/code', category: 'code' }),
    ]);
    const base = { chip: ALL_CHIP, status: 'all' as const, query: '' };
    expect(filterSkillGroups(groups, base)).toHaveLength(2);
    expect(
      filterSkillGroups(groups, { ...base, chip: 'code' }).map((g) => g.id),
    ).toEqual(['o/code']);
  });

  it('filters skills inside each group and drops empty groups', () => {
    const groups = groupSkillsByRepo([
      tool({ id: 'skill:pdf', name: 'pdf', repo: 'o/docs' }),
      tool({ id: 'skill:xlsx', name: 'xlsx', repo: 'o/docs', isActive: false }),
      tool({ id: 'skill:lint', name: 'lint', repo: 'o/code', isActive: false }),
    ]);
    const base = { chip: ALL_CHIP, status: 'all' as const, query: '' };
    const ids = (entries: ReturnType<typeof filterSkillsInGroups>) =>
      entries.map((entry) => [entry.group.id, entry.skills.map((s) => s.id)]);

    expect(ids(filterSkillsInGroups(groups, base))).toEqual([
      ['o/docs', ['skill:pdf', 'skill:xlsx']],
      ['o/code', ['skill:lint']],
    ]);
    expect(
      ids(filterSkillsInGroups(groups, { ...base, status: 'enabled' })),
    ).toEqual([['o/docs', ['skill:pdf']]]);
    expect(
      ids(filterSkillsInGroups(groups, { ...base, query: 'xlsx' })),
    ).toEqual([['o/docs', ['skill:xlsx']]]);
  });

  it('keeps every skill of a group whose name matches the query', () => {
    const groups = groupSkillsByRepo([
      tool({ id: 'skill:pdf', name: 'pdf', repo: 'o/docs' }),
      tool({ id: 'skill:xlsx', name: 'xlsx', repo: 'o/docs', isActive: false }),
    ]);
    const base = { chip: ALL_CHIP, status: 'all' as const, query: '' };
    expect(
      filterSkillsInGroups(groups, {
        ...base,
        query: '文档',
        getGroupLabel: () => '文档技能',
      })[0].skills,
    ).toHaveLength(2);
    expect(
      filterSkillsInGroups(groups, {
        ...base,
        query: '文档',
        status: 'disabled',
        getGroupLabel: () => '文档技能',
      })[0].skills.map((s) => s.id),
    ).toEqual(['skill:xlsx']);
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
