import { Agent, AgentType } from '@/types/agent';
import { Tool, ToolType } from '@/types/tool';

export type HubTab = 'agents' | 'builtin' | 'skills' | 'connectors';

export const HUB_TABS: HubTab[] = ['agents', 'builtin', 'skills', 'connectors'];

export const HUB_TAB_STORAGE_KEY = 'tools-hub:last-tab';

export type StatusFilter = 'all' | 'enabled' | 'disabled';

export const ALL_CHIP = 'all';

export type SkillGroup = {
  id: string;
  name: string;
  skills: Tool[];
};

export type HubData = {
  agents: Agent[];
  builtin: Tool[];
  skills: Tool[];
  connectors: Tool[];
};

export const EMPTY_HUB_DATA: HubData = {
  agents: [],
  builtin: [],
  skills: [],
  connectors: [],
};

export function isHubTab(value: unknown): value is HubTab {
  return HUB_TABS.includes(value as HubTab);
}

export function hubTabPath(tab: HubTab) {
  return `/tools/${tab}`;
}

export function hubTabForToolId(id: string): HubTab {
  if (id.startsWith(`${ToolType.MCP}:`)) return 'connectors';
  if (id.startsWith(`${ToolType.SKILL}:`)) return 'skills';
  return 'builtin';
}

export function toolDetailPath(id: string) {
  return `/tools/${id}`;
}

export function agentDetailPath(id: string) {
  return `/tools/agents/${encodeURIComponent(id)}`;
}

export function skillGroupPath(repo: string) {
  return `/tools/skill-group?repo=${encodeURIComponent(repo)}`;
}

export function getRepoDisplayName(repo: string) {
  const parts = repo.replace(/\/+$/, '').split('/').filter(Boolean);
  return parts.length > 1
    ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
    : repo;
}

export function groupSkillsByRepo(skills: Tool[]): SkillGroup[] {
  const groups = new Map<string, SkillGroup>();
  for (const skill of skills) {
    if (!skill.repo) continue;
    const group = groups.get(skill.repo);
    if (group) {
      group.skills.push(skill);
    } else {
      groups.set(skill.repo, {
        id: skill.repo,
        name: getRepoDisplayName(skill.repo),
        skills: [skill],
      });
    }
  }
  return Array.from(groups.values());
}

export function matchesQuery(
  fields: Array<string | undefined | null>,
  query: string,
) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => field?.toLowerCase().includes(needle));
}

export function matchesStatus(isActive: boolean | undefined, status: StatusFilter) {
  if (status === 'all') return true;
  return status === 'enabled' ? Boolean(isActive) : !isActive;
}

export function isCustomAgent(agent: Agent) {
  return agent.type === AgentType.CUSTOM;
}

export function getAgentTags(agents: Agent[]) {
  const tags = new Set<string>();
  for (const agent of agents) {
    for (const tag of agent.tags ?? []) tags.add(tag);
  }
  return Array.from(tags).sort((a, b) => a.localeCompare(b));
}

export function getSkillCategories(skills: Tool[]) {
  const categories = new Set<string>();
  for (const skill of skills) {
    if (skill.category) categories.add(skill.category);
  }
  return Array.from(categories).sort((a, b) => a.localeCompare(b));
}

export type AgentScope = 'all' | 'built_in' | 'custom';

export function filterAgents(
  agents: Agent[],
  {
    scope,
    tag,
    status,
    query,
    getLabel,
  }: {
    scope: AgentScope;
    tag: string;
    status: StatusFilter;
    query: string;
    getLabel?: (agent: Agent) => string;
  },
) {
  return agents.filter((agent) => {
    if (scope === 'custom' && !isCustomAgent(agent)) return false;
    if (scope === 'built_in' && isCustomAgent(agent)) return false;
    if (tag !== ALL_CHIP && !(agent.tags ?? []).includes(tag)) return false;
    if (!matchesStatus(agent.isActive, status)) return false;
    return matchesQuery(
      [
        agent.name,
        getLabel?.(agent),
        agent.id,
        agent.description,
        ...(agent.tags ?? []),
      ],
      query,
    );
  });
}

export const AUTO_LOAD_CHIP = 'auto_load';

function matchesSkillChip(skill: Tool, chip: string) {
  if (chip === ALL_CHIP) return true;
  if (chip === AUTO_LOAD_CHIP) return Boolean(skill.autoLoad);
  return skill.category === chip;
}

export function filterSkills(
  skills: Tool[],
  {
    chip,
    status,
    query,
    getLabel,
  }: {
    chip: string;
    status: StatusFilter;
    query: string;
    getLabel?: (skill: Tool) => string;
  },
) {
  return skills.filter((skill) => {
    if (!matchesSkillChip(skill, chip)) return false;
    if (!matchesStatus(skill.isActive, status)) return false;
    return matchesQuery(
      [
        getLabel?.(skill),
        skill.name,
        skill.title,
        skill.displayName,
        skill.description,
        skill.category,
        skill.repo,
        ...(skill.tags ?? []),
      ],
      query,
    );
  });
}

export function filterSkillGroups(
  groups: SkillGroup[],
  {
    chip,
    status,
    query,
    getLabel,
    getGroupLabel,
  }: {
    chip: string;
    status: StatusFilter;
    query: string;
    getLabel?: (skill: Tool) => string;
    getGroupLabel?: (group: SkillGroup) => string;
  },
) {
  return groups.filter((group) => {
    if (!group.skills.some((skill) => matchesSkillChip(skill, chip)))
      return false;
    const anyActive = group.skills.some((skill) => skill.isActive);
    if (!matchesStatus(anyActive, status)) return false;
    return (
      matchesQuery([getGroupLabel?.(group), group.name, group.id], query) ||
      group.skills.some((skill) =>
        matchesQuery(
          [
            getLabel?.(skill),
            skill.name,
            skill.title,
            skill.displayName,
            skill.description,
          ],
          query,
        ),
      )
    );
  });
}

export type ToolScope = 'all' | 'toolkits' | 'tools';

export function filterTools(
  tools: Tool[],
  {
    scope = 'all',
    status,
    query,
    getLabel,
  }: {
    scope?: ToolScope;
    status: StatusFilter;
    query: string;
    getLabel?: (tool: Pick<Tool, 'name'>) => string;
  },
) {
  return tools.filter((tool) => {
    if (scope === 'toolkits' && !tool.isToolkit) return false;
    if (scope === 'tools' && tool.isToolkit) return false;
    if (!matchesStatus(tool.isActive, status)) return false;
    const subTools = tool.isToolkit ? (tool.tools ?? []) : [];
    return matchesQuery(
      [
        tool.name,
        getLabel?.(tool),
        tool.description,
        tool.id,
        ...subTools.flatMap((subTool) => [subTool.name, getLabel?.(subTool)]),
      ],
      query,
    );
  });
}

export function seedHue(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 3600;
  }
  return (hash % 360 + 360) % 360;
}

export function avatarInitial(name: string | undefined, fallback = '?') {
  const trimmed = name?.trim();
  if (!trimmed) return fallback;
  return Array.from(trimmed)[0].toUpperCase();
}

export function getToolIdLabel(id: string) {
  return id.split(':').slice(1).join(':');
}
