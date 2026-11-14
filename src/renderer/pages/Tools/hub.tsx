import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  IconChevronDown,
  IconDownload,
  IconFileImport,
  IconPlus,
  IconSearch,
  IconWorldSearch,
} from '@tabler/icons-react';
import { cn } from '@/renderer/lib/utils';
import { useHeader } from '@/renderer/hooks/use-title';
import { useGlobal } from '@/renderer/hooks/use-global';
import { Button } from '@/renderer/components/ui/button';
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from '@/renderer/components/ui/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/renderer/components/ui/dropdown-menu';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/renderer/components/ui/input-group';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/renderer/components/ui/toggle-group';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/renderer/components/ui/empty';
import { AgentDialog } from '@/renderer/components/agents/agent-dialog';
import { AgentImportDialog } from '@/renderer/components/agents/agent-import-dialog';
import { SkillSearch } from '@/renderer/components/skills-ui/skill-search';
import { useSkillDisplayName } from '@/renderer/components/skills-ui/skill-metadata';
import { Agent } from '@/types/agent';
import { ChatSubmitOptions } from '@/types/chat';
import { Tool, ToolType } from '@/types/tool';
import { ToolEditDialog } from './tool-edit-dialog';
import { SkillImportDialog } from './skill-import-dialog';
import {
  AgentScope,
  ALL_CHIP,
  AUTO_LOAD_CHIP,
  filterAgents,
  filterSkillGroups,
  filterSkills,
  filterTools,
  getAgentTags,
  getSkillCategories,
  groupSkillsByRepo,
  HUB_TAB_STORAGE_KEY,
  HUB_TABS,
  HubTab,
  hubTabPath,
  isCustomAgent,
  StatusFilter,
  ToolScope,
} from './hub-model';
import { TAB_META } from './hub-visuals';
import {
  AgentCard,
  BuiltinToolCard,
  ConnectorCard,
  HubCardSkeleton,
  SkillCard,
  SkillGroupCard,
} from './hub-cards';
import { useHubData } from './use-hub-data';

type HubDialog =
  | 'agent-create'
  | 'agent-import'
  | 'connector'
  | 'skill-import'
  | 'skill-search'
  | null;

type HubSection = { id: string; label?: string; items: ReactNode[] };

const STATUS_FILTERS: StatusFilter[] = ['all', 'enabled', 'disabled'];

function useAgentLabel() {
  const { t } = useTranslation();
  return useCallback(
    (agent: Agent) => t(`agent_name.${agent.id}`, agent.name || agent.id || ''),
    [t],
  );
}

function useToolLabel() {
  const { t } = useTranslation();
  return useCallback(
    (tool: Pick<Tool, 'name'>) =>
      t(`tool_name.${tool.name.toLowerCase()}`, tool.name),
    [t],
  );
}

function HubTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: HubTab[];
  active: HubTab;
  onSelect: (tab: HubTab) => void;
}) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('tools_hub.title')} className="flex items-center gap-1">
      {tabs.map((tab) => {
        const TabIcon = TAB_META[tab].icon;
        const isActive = tab === active;
        return (
          <button
            key={tab}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelect(tab)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm outline-none transition-colors duration-150',
              'focus-visible:ring-[3px] focus-visible:ring-ring/50',
              isActive
                ? 'bg-accent font-semibold text-foreground'
                : 'font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )}
          >
            <TabIcon className="size-4" aria-hidden="true" />
            {t(`tools_hub.tabs.${tab}`)}
          </button>
        );
      })}
    </nav>
  );
}

function HubSearch({
  placeholder,
  onChange,
}: {
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <InputGroup className="h-8 w-56">
      <InputGroupAddon>
        <IconSearch aria-hidden="true" />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            setValue('');
            onChange('');
          }
        }}
      />
    </InputGroup>
  );
}

function SplitButton({
  icon,
  label,
  onClick,
  menu,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  menu: { icon: ReactNode; label: string; onSelect: () => void }[];
}) {
  const { t } = useTranslation();
  return (
    <ButtonGroup>
      <Button size="sm" onClick={onClick}>
        {icon}
        {label}
      </Button>
      <ButtonGroupSeparator className="bg-primary-foreground/25" />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            className="px-2"
            aria-label={t('tools_hub.more_actions')}
          >
            <IconChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {menu.map((item) => (
            <DropdownMenuItem key={item.label} onSelect={item.onSelect}>
              {item.icon}
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}

function HubCreateActions({
  tab,
  onOpen,
}: {
  tab: HubTab;
  onOpen: (dialog: HubDialog) => void;
}) {
  const { t } = useTranslation();

  if (tab === 'agents') {
    return (
      <SplitButton
        icon={<IconPlus />}
        label={t('tools_hub.create_agent')}
        onClick={() => onOpen('agent-create')}
        menu={[
          {
            icon: <IconFileImport />,
            label: t('tools_hub.import_agent'),
            onSelect: () => onOpen('agent-import'),
          },
        ]}
      />
    );
  }

  if (tab === 'skills') {
    return (
      <SplitButton
        icon={<IconDownload />}
        label={t('tools_hub.import_skill')}
        onClick={() => onOpen('skill-import')}
        menu={[
          {
            icon: <IconWorldSearch />,
            label: t('tools_hub.search_skills'),
            onSelect: () => onOpen('skill-search'),
          },
        ]}
      />
    );
  }

  if (tab === 'connectors') {
    return (
      <Button size="sm" onClick={() => onOpen('connector')}>
        <IconPlus />
        {t('tools_hub.add_connector')}
      </Button>
    );
  }

  return null;
}

function ScopeTabs<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; count: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex items-center gap-4">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-baseline gap-1.5 text-sm outline-none transition-colors duration-150',
              'focus-visible:underline focus-visible:underline-offset-4',
              selected
                ? 'font-semibold text-foreground'
                : 'font-medium text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
            <span className="text-xs font-normal tabular-nums text-muted-foreground">
              {option.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ScopeLabel({ label, count }: { label: string; count: number }) {
  return (
    <h2 className="inline-flex items-baseline gap-1.5 text-sm font-semibold">
      {label}
      <span className="text-xs font-normal tabular-nums text-muted-foreground">
        {count}
      </span>
    </h2>
  );
}

function SegmentedFilter<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as T);
      }}
      className="rounded-lg bg-muted p-0.5"
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className={cn(
            'h-7 rounded-md px-3 text-xs font-medium text-muted-foreground',
            'data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm',
            'dark:data-[state=on]:bg-input/50',
          )}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function ChipFilter({
  label,
  chips,
  value,
  onChange,
}: {
  label: string;
  chips: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(next) => onChange(next || ALL_CHIP)}
      className="flex-wrap gap-1.5"
    >
      {chips.map((chip) => (
        <ToggleGroupItem
          key={chip.value}
          value={chip.value}
          className={cn(
            'h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground',
            'hover:bg-accent/60 hover:text-foreground',
            'data-[state=on]:bg-accent data-[state=on]:text-foreground',
          )}
        >
          {chip.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function CardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(15.5rem,1fr))]">
      {children}
    </div>
  );
}

function HubEmpty({
  tab,
  title,
  description,
  action,
}: {
  tab: HubTab;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  const TabIcon = TAB_META[tab].icon;
  return (
    <Empty className="border border-dashed bg-muted/20 py-12">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TabIcon />
        </EmptyMedia>
        <EmptyTitle className="text-base">{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? (
        <EmptyContent className="flex-row justify-center">{action}</EmptyContent>
      ) : null}
    </Empty>
  );
}

export default function CapabilityHub({ tab }: { tab: HubTab }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setTitle, setTitleAction } = useHeader();
  const { appInfo } = useGlobal();
  const agentsDisabled = appInfo?.featureFlags?.agentsDisabled ?? false;
  const tabs = useMemo(
    () => HUB_TABS.filter((x) => !(agentsDisabled && x === 'agents')),
    [agentsDisabled],
  );
  const agentLabel = useAgentLabel();
  const toolLabel = useToolLabel();
  const skillName = useSkillDisplayName();
  const { data, loading, refresh, patchAgent, patchTool } = useHubData();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [agentScope, setAgentScope] = useState<AgentScope>('all');
  const [toolScope, setToolScope] = useState<ToolScope>('all');
  const [chip, setChip] = useState(ALL_CHIP);
  const [dialog, setDialog] = useState<HubDialog>(null);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [searchResetKey, setSearchResetKey] = useState(0);

  const selectTab = useCallback(
    (next: HubTab) => navigate(hubTabPath(next)),
    [navigate],
  );

  useEffect(() => {
    window.localStorage.setItem(HUB_TAB_STORAGE_KEY, tab);
    setQuery('');
    setChip(ALL_CHIP);
  }, [tab]);

  useEffect(() => {
    setChip(ALL_CHIP);
  }, [agentScope]);

  useEffect(() => {
    setTitle(<HubTabs tabs={tabs} active={tab} onSelect={selectTab} />);
  }, [setTitle, tabs, tab, selectTab, t]);

  useEffect(() => {
    setTitleAction(
      <div className="flex items-center gap-2">
        <HubSearch
          key={`${tab}-${searchResetKey}`}
          placeholder={t(`tools_hub.search_placeholder.${tab}`)}
          onChange={setQuery}
        />
        <HubCreateActions tab={tab} onOpen={setDialog} />
      </div>,
    );
  }, [setTitleAction, tab, t, searchResetKey]);

  useEffect(() => {
    if (agentsDisabled && tab === 'agents') {
      navigate(hubTabPath('builtin'), { replace: true });
    }
  }, [agentsDisabled, tab, navigate]);

  const withPending = useCallback(
    async (id: string, task: () => Promise<void>) => {
      setPendingIds((prev) => [...prev, id]);
      try {
        await task();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        setPendingIds((prev) => prev.filter((x) => x !== id));
        refresh();
      }
    },
    [refresh],
  );

  const toggleAgent = (agent: Agent, isActive: boolean) =>
    withPending(agent.id!, async () => {
      patchAgent(agent.id!, { isActive });
      await window.electron.agents.saveAgent({ id: agent.id, isActive });
    });

  const toggleTool = (tool: Tool, isActive: boolean) =>
    withPending(tool.id, async () => {
      const patch: Partial<Tool> = { isActive };
      if (tool.id.startsWith(`${ToolType.MCP}:`)) {
        patch.status = isActive ? 'starting' : 'stopped';
      }
      patchTool(tool.id, patch);
      await window.electron.tools.toggleToolActive(tool.id);
    });

  const startChat = (agent: Agent) => {
    const options: ChatSubmitOptions = { agentId: agent.id };
    navigate('/chat', { state: { options } });
  };

  const agentTags = useMemo(() => getAgentTags(data.agents), [data.agents]);
  const skillCategories = useMemo(
    () => getSkillCategories(data.skills),
    [data.skills],
  );
  const skillGroups = useMemo(
    () => groupSkillsByRepo(data.skills),
    [data.skills],
  );

  const statusOptions = STATUS_FILTERS.map((value) => ({
    value,
    label: t(`tools_hub.status.${value}`),
  }));

  const hasFilters = query.trim() !== '' || status !== 'all' || chip !== ALL_CHIP;
  const clearFilters = () => {
    setStatus('all');
    setChip(ALL_CHIP);
    if (query) {
      setQuery('');
      setSearchResetKey((key) => key + 1);
    }
  };

  let scope: ReactNode = null;
  let chips: { value: string; label: string }[] = [];
  let sections: HubSection[] = [];
  let totalInScope = 0;
  let emptyState: { title: string; description: string; action?: ReactNode } = {
    title: '',
    description: '',
  };

  if (tab === 'agents') {
    const customCount = data.agents.filter(isCustomAgent).length;
    scope = (
      <ScopeTabs<AgentScope>
        label={t('tools_hub.tabs.agents')}
        value={agentScope}
        onChange={setAgentScope}
        options={[
          { value: 'all', label: t('tools_hub.scope.all'), count: data.agents.length },
          {
            value: 'built_in',
            label: t('tools_hub.scope.built_in'),
            count: data.agents.length - customCount,
          },
          { value: 'custom', label: t('tools_hub.scope.custom'), count: customCount },
        ]}
      />
    );
    chips = agentTags.length
      ? [
        { value: ALL_CHIP, label: t('tools_hub.chip_all') },
        ...agentTags.map((tag) => ({ value: tag, label: tag })),
      ]
      : [];
    const scoped = filterAgents(data.agents, {
      scope: agentScope,
      tag: ALL_CHIP,
      status: 'all',
      query: '',
    });
    totalInScope = scoped.length;
    sections = [
      {
        id: 'agents',
        items: filterAgents(data.agents, {
          scope: agentScope,
          tag: chip,
          status,
          query,
          getLabel: agentLabel,
        }).map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            label={agentLabel(agent)}
            pending={pendingIds.includes(agent.id!)}
            onToggle={(checked) => toggleAgent(agent, checked)}
            onChat={() => startChat(agent)}
          />
        )),
      },
    ];
    emptyState = {
      title: t('tools_hub.empty.agents_title'),
      description: t('tools_hub.empty.agents_description'),
      action: (
        <Button size="sm" onClick={() => setDialog('agent-create')}>
          <IconPlus />
          {t('tools_hub.create_agent')}
        </Button>
      ),
    };
  } else if (tab === 'builtin') {
    const toolkitCount = data.builtin.filter((tool) => tool.isToolkit).length;
    scope = (
      <ScopeTabs<ToolScope>
        label={t('tools_hub.tabs.builtin')}
        value={toolScope}
        onChange={setToolScope}
        options={[
          {
            value: 'all',
            label: t('tools_hub.scope.all'),
            count: data.builtin.length,
          },
          {
            value: 'toolkits',
            label: t('tools_hub.scope.toolkits'),
            count: toolkitCount,
          },
          {
            value: 'tools',
            label: t('tools_hub.scope.tools'),
            count: data.builtin.length - toolkitCount,
          },
        ]}
      />
    );
    totalInScope = filterTools(data.builtin, {
      scope: toolScope,
      status: 'all',
      query: '',
    }).length;
    sections = [
      {
        id: 'builtin',
        items: filterTools(data.builtin, {
          scope: toolScope,
          status,
          query,
          getLabel: toolLabel,
        }).map((tool) => (
          <BuiltinToolCard
            key={tool.id}
            tool={tool}
            label={toolLabel(tool)}
            subToolLabels={
              tool.isToolkit ? (tool.tools ?? []).map((x) => toolLabel(x)) : []
            }
            pending={pendingIds.includes(tool.id)}
            onToggle={(checked) => toggleTool(tool, checked)}
          />
        )),
      },
    ];
    emptyState = {
      title: t('tools_hub.empty.builtin_title'),
      description: t('tools_hub.empty.builtin_description'),
    };
  } else if (tab === 'skills') {
    scope = (
      <ChipFilter
        label={t('tools_hub.chip_label')}
        chips={[
          { value: ALL_CHIP, label: t('tools_hub.chip_all') },
          { value: AUTO_LOAD_CHIP, label: t('tools_hub.chip_auto_load') },
          ...skillCategories.map((category) => ({
            value: category,
            label: category,
          })),
        ]}
        value={chip}
        onChange={setChip}
      />
    );
    totalInScope = data.skills.length;
    sections = [
      {
        id: 'groups',
        label: t('tools_hub.scope.groups'),
        items: filterSkillGroups(skillGroups, {
          chip,
          status,
          query,
          getLabel: skillName,
        }).map((group) => <SkillGroupCard key={group.id} group={group} />),
      },
      {
        id: 'skills',
        label: t('tools_hub.scope.skills'),
        items: filterSkills(data.skills, {
          chip,
          status,
          query,
          getLabel: skillName,
        }).map((skill) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            pending={pendingIds.includes(skill.id)}
            onToggle={(checked) => toggleTool(skill, checked)}
          />
        )),
      },
    ];
    emptyState = {
      title: t('tools_hub.empty.skills_title'),
      description: t('tools_hub.empty.skills_description'),
      action: (
        <>
          <Button size="sm" onClick={() => setDialog('skill-import')}>
            <IconDownload />
            {t('tools_hub.import_skill')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDialog('skill-search')}
          >
            <IconWorldSearch />
            {t('tools_hub.search_skills')}
          </Button>
        </>
      ),
    };
  } else {
    scope = (
      <ScopeLabel
        label={t('tools_hub.tabs.connectors')}
        count={data.connectors.length}
      />
    );
    totalInScope = data.connectors.length;
    sections = [
      {
        id: 'connectors',
        items: filterTools(data.connectors, { status, query }).map((tool) => (
          <ConnectorCard
            key={tool.id}
            tool={tool}
            pending={pendingIds.includes(tool.id)}
            onToggle={(checked) => toggleTool(tool, checked)}
          />
        )),
      },
    ];
    emptyState = {
      title: t('tools_hub.empty.connectors_title'),
      description: t('tools_hub.empty.connectors_description'),
      action: (
        <Button size="sm" onClick={() => setDialog('connector')}>
          <IconPlus />
          {t('tools_hub.add_connector')}
        </Button>
      ),
    };
  }

  const renderBody = () => {
    if (loading) {
      return (
        <CardGrid>
          {Array.from({ length: 8 }).map((_, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <HubCardSkeleton key={index} />
          ))}
        </CardGrid>
      );
    }
    if (totalInScope === 0) {
      return <HubEmpty tab={tab} {...emptyState} />;
    }
    const visibleSections = sections.filter(
      (section) => section.items.length > 0,
    );
    if (visibleSections.length === 0) {
      return (
        <HubEmpty
          tab={tab}
          title={t('tools_hub.empty.no_match_title')}
          description={t('tools_hub.empty.no_match_description')}
          action={
            hasFilters ? (
              <Button size="sm" variant="outline" onClick={clearFilters}>
                {t('tools_hub.empty.clear_filters')}
              </Button>
            ) : undefined
          }
        />
      );
    }
    return (
      <div className="flex flex-col gap-6">
        {visibleSections.map((section) =>
          section.label ? (
            <section key={section.id} className="flex flex-col gap-3">
              <ScopeLabel label={section.label} count={section.items.length} />
              <CardGrid>{section.items}</CardGrid>
            </section>
          ) : (
            <CardGrid key={section.id}>{section.items}</CardGrid>
          ),
        )}
      </div>
    );
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-6 px-6 py-5">
        <section
          className="flex flex-col gap-3"
          aria-label={t(`tools_hub.tabs.${tab}`)}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            {scope}
            <SegmentedFilter<StatusFilter>
              label={t('tools_hub.status_label')}
              options={statusOptions}
              value={status}
              onChange={setStatus}
            />
          </div>
          {chips.length > 1 ? (
            <ChipFilter
              label={t('tools_hub.chip_label')}
              chips={chips}
              value={chip}
              onChange={setChip}
            />
          ) : null}
          {renderBody()}
        </section>
      </div>

      <AgentDialog
        open={dialog === 'agent-create'}
        onOpenChange={(open) => setDialog(open ? 'agent-create' : null)}
      />
      <AgentImportDialog
        open={dialog === 'agent-import'}
        onOpenChange={(open) => setDialog(open ? 'agent-import' : null)}
      />
      <ToolEditDialog
        open={dialog === 'connector'}
        onOpenChange={(open) => {
          setDialog(open ? 'connector' : null);
          if (!open) refresh();
        }}
      />
      <SkillImportDialog
        open={dialog === 'skill-import'}
        onOpenChange={(open) => setDialog(open ? 'skill-import' : null)}
        onImportSkillsSuccess={() => refresh()}
      />
      <SkillSearch
        open={dialog === 'skill-search'}
        onOpenChange={(open) => setDialog(open ? 'skill-search' : null)}
        onImportSuccess={() => refresh()}
      />
    </div>
  );
}
