import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  IconAdjustmentsHorizontal,
  IconCheck,
  IconCopy,
  IconFileExport,
  IconLoader2,
  IconMessageCircle,
  IconPlus,
  IconX,
} from '@tabler/icons-react';
import { Button } from '@/renderer/components/ui/button';
import { Input } from '@/renderer/components/ui/input';
import { Textarea } from '@/renderer/components/ui/textarea';
import { Kbd } from '@/renderer/components/ui/kbd';
import { ScrollArea } from '@/renderer/components/ui/scroll-area';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/renderer/components/ui/field';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/renderer/components/ui/toggle-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/renderer/components/ui/dialog';
import { ChatModelSelect } from '@/renderer/components/chat-ui/chat-model-select';
import { ChatToolSelector } from '@/renderer/components/chat-ui/chat-tool-selector';
import { ChatAgentSelector } from '@/renderer/components/chat-ui/chat-agent-selector';
import { useSkillDisplayName } from '@/renderer/components/skills-ui/skill-metadata';
import { cn } from '@/renderer/lib/utils';
import { Agent, AgentTags } from '@/types/agent';
import { ChatSubmitOptions } from '@/types/chat';
import { Tool, ToolType } from '@/types/tool';
import {
  agentDetailPath,
  getToolIdLabel,
  hubTabPath,
  isCustomAgent,
  toolDetailPath,
} from './hub-model';
import { AgentAvatar, StatusIndicator, TagChip } from './hub-visuals';
import {
  ConfirmDeleteButton,
  DetailHeader,
  DetailLoading,
  DetailNotFound,
  DetailPage,
  DetailSection,
  LabeledSwitch,
  useDetailBreadcrumb,
} from './detail-layout';

type AgentDraft = {
  name: string;
  description: string;
  instructions: string;
  defaultModelId: string;
  tags: string[];
  greeting: string;
  suggestions: string[];
  tools: string[];
  subAgents: string[];
};

type DraftKey = keyof AgentDraft;

const DRAFT_KEYS: DraftKey[] = [
  'name',
  'description',
  'instructions',
  'defaultModelId',
  'tags',
  'greeting',
  'suggestions',
  'tools',
  'subAgents',
];

const BUILT_IN_READONLY: DraftKey[] = ['name', 'description', 'instructions'];

function toDraft(agent: Agent): AgentDraft {
  return {
    name: agent.name ?? '',
    description: agent.description ?? '',
    instructions: agent.instructions ?? '',
    defaultModelId: agent.defaultModelId ?? '',
    tags: agent.tags ?? [],
    greeting: agent.greeting ?? '',
    suggestions: agent.suggestions ?? [],
    tools: agent.tools ?? [],
    subAgents: agent.subAgents ?? [],
  };
}

function normalizeDraft(draft: AgentDraft): AgentDraft {
  return {
    ...draft,
    suggestions: draft.suggestions.map((x) => x.trim()).filter(Boolean),
  };
}

function changedKeys(saved: AgentDraft, draft: AgentDraft): DraftKey[] {
  const a = normalizeDraft(saved);
  const b = normalizeDraft(draft);
  return DRAFT_KEYS.filter(
    (key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]),
  );
}

const TOOL_GROUPS: { type: ToolType; labelKey: string }[] = [
  { type: ToolType.BUILD_IN, labelKey: 'tools_hub.tabs.builtin' },
  { type: ToolType.MCP, labelKey: 'tools_hub.tabs.connectors' },
  { type: ToolType.SKILL, labelKey: 'tools_hub.tabs.skills' },
];

function RemovableChip({
  label,
  to,
  removeLabel,
  onRemove,
}: {
  label: string;
  to?: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex h-7 max-w-full items-center gap-0.5 rounded-md border bg-background pr-0.5 pl-2 text-xs dark:bg-input/30">
      {to ? (
        <Link
          to={to}
          className="truncate outline-none hover:underline focus-visible:underline"
        >
          {label}
        </Link>
      ) : (
        <span className="truncate">{label}</span>
      )}
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <IconX className="size-3" />
      </button>
    </span>
  );
}

function ExportConfigDialog({
  open,
  onOpenChange,
  name,
  config,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  config: string;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) setCopied(false);
  }, [open]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(config);
    setCopied(true);
    toast.success(t('common.copied'));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([config], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${name || 'agent'}.toml`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast.success(t('common.downloaded'));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconFileExport className="size-5" />
            {t('tools_hub.agent.export')}
          </DialogTitle>
          <DialogDescription>
            {t('tools_hub.agent.export_description', { name })}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[50vh] rounded-md border bg-muted/50">
          <pre className="p-4 font-mono text-xs break-all whitespace-pre-wrap">
            {config}
          </pre>
        </ScrollArea>
        <DialogFooter className="flex flex-row gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCopy}>
              {copied ? <IconCheck /> : <IconCopy />}
              {copied ? t('common.copied') : t('common.copy')}
            </Button>
            <Button variant="outline" onClick={handleDownload}>
              <IconFileExport />
              {t('common.download')}
            </Button>
          </div>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AgentEditor() {
  const { t } = useTranslation();
  const skillName = useSkillDisplayName();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [draft, setDraft] = useState<AgentDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  const [toolCatalog, setToolCatalog] = useState<Record<ToolType, Tool[]>>({
    [ToolType.BUILD_IN]: [],
    [ToolType.MCP]: [],
    [ToolType.SKILL]: [],
  });
  const [agentCatalog, setAgentCatalog] = useState<Agent[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportConfig, setExportConfig] = useState('');

  const load = useCallback(async () => {
    try {
      const data: Agent = await window.electron.agents.getAgent(id);
      setAgent(data);
      setDraft(toDraft(data));
      setNotFound(false);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load();
    window.electron.tools
      .getList()
      .then((data: Record<ToolType, Tool[]>) => setToolCatalog(data))
      .catch(() => {});
    window.electron.agents
      .getList()
      .then(setAgentCatalog)
      .catch(() => {});
  }, [load]);

  useDetailBreadcrumb('agents', agent?.name || agent?.id, agentDetailPath(id));

  const savedDraft = useMemo(() => (agent ? toDraft(agent) : null), [agent]);
  const isCustom = agent ? isCustomAgent(agent) : false;
  const readonlyKeys = isCustom ? [] : BUILT_IN_READONLY;
  const dirtyKeys = useMemo(
    () =>
      savedDraft && draft
        ? changedKeys(savedDraft, draft).filter(
            (key) => !readonlyKeys.includes(key),
          )
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [savedDraft, draft, isCustom],
  );
  const dirty = dirtyKeys.length > 0;
  const nameMissing = isCustom && draft?.name.trim() === '';

  const update = <K extends DraftKey>(key: K, value: AgentDraft[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = useCallback(async () => {
    if (!agent || !draft || !dirty || saving || nameMissing) return;
    const normalized = normalizeDraft(draft);
    const patch: Agent = { id: agent.id };
    for (const key of dirtyKeys) {
      (patch as Record<string, unknown>)[key] =
        key === 'name' ? normalized.name.trim() : normalized[key];
    }
    setSaving(true);
    try {
      await window.electron.agents.saveAgent(patch);
      await load();
      toast.success(t('tools_hub.agent.saved'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, [agent, draft, dirty, dirtyKeys, saving, nameMissing, load, t]);

  const handleDiscard = () => {
    if (savedDraft) setDraft(savedDraft);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSave]);

  const handleToggleActive = async (isActive: boolean) => {
    if (!agent) return;
    setTogglingActive(true);
    setAgent({ ...agent, isActive });
    try {
      await window.electron.agents.saveAgent({ id: agent.id, isActive });
    } catch (error) {
      setAgent({ ...agent });
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setTogglingActive(false);
    }
  };

  const handleExport = async () => {
    try {
      const config = await window.electron.agents.getAgentConfig(id);
      setExportConfig(config);
      setExportOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleDelete = async () => {
    try {
      await window.electron.agents.deleteAgent(id);
      navigate(hubTabPath('agents'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const startChat = () => {
    const options: ChatSubmitOptions = { agentId: id };
    navigate('/chat', { state: { options } });
  };

  const resolveTool = (toolId: string): { label: string; to?: string } => {
    const rawLabel = getToolIdLabel(toolId);
    if (toolId.startsWith(`${ToolType.SKILL}:`)) {
      const skill = toolCatalog[ToolType.SKILL]?.find((x) => x.id === toolId);
      return {
        label: skill ? skillName(skill) : rawLabel,
        to: toolDetailPath(toolId),
      };
    }
    if (toolId.startsWith(`${ToolType.MCP}:`)) {
      const server = toolCatalog[ToolType.MCP]?.find((x) =>
        toolId.startsWith(`${ToolType.MCP}:${x.name}_`),
      );
      return {
        label: server ? rawLabel.slice(server.name.length + 1) : rawLabel,
        to: server ? toolDetailPath(server.id) : undefined,
      };
    }
    return {
      label: t(`tool_name.${rawLabel.toLowerCase()}`, rawLabel),
      to: toolDetailPath(toolId),
    };
  };

  const resolveMcpServerLabel = (toolId: string) =>
    toolCatalog[ToolType.MCP]?.find((x) =>
      toolId.startsWith(`${ToolType.MCP}:${x.name}_`),
    )?.name;

  if (loading) return <DetailLoading />;
  if (notFound || !agent || !draft) {
    return (
      <DetailNotFound tab="agents" message={t('tools_hub.agent.not_found')} />
    );
  }

  const displayName = draft.name || agent.name || agent.id || '';
  const availableTags = Array.from(
    new Set([...Object.values(AgentTags), ...draft.tags]),
  );
  const shortcutLabel =
    window.electron?.platform === 'darwin' ? '⌘S' : 'Ctrl+S';

  return (
    <DetailPage
      footer={
        dirty ? (
          <div className="border-t bg-background motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-150">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-6 py-3">
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-amber-500"
                />
                {t('tools_hub.agent.unsaved', { count: dirtyKeys.length })}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={handleDiscard}
                >
                  {t('tools_hub.agent.discard')}
                </Button>
                <Button
                  size="sm"
                  disabled={saving || nameMissing}
                  onClick={handleSave}
                >
                  {saving ? <IconLoader2 className="animate-spin" /> : null}
                  {t('tools_hub.agent.save')}
                  <Kbd className="bg-primary-foreground/15 text-primary-foreground">
                    {shortcutLabel}
                  </Kbd>
                </Button>
              </div>
            </div>
          </div>
        ) : null
      }
    >
      <DetailHeader
        media={<AgentAvatar id={agent.id} name={displayName} size="lg" />}
        title={displayName}
        meta={
          <>
            <TagChip>
              {isCustom
                ? t('tools_hub.scope.custom')
                : t('tools_hub.built_in_badge')}
            </TagChip>
            <code className="font-mono">{agent.id}</code>
            <StatusIndicator
              tone={agent.isActive ? 'positive' : 'neutral'}
              label={
                agent.isActive ? t('tools_hub.enabled') : t('tools_hub.disabled')
              }
            />
          </>
        }
        actions={
          <>
            <LabeledSwitch
              label={t('tools_hub.active')}
              checked={Boolean(agent.isActive)}
              disabled={togglingActive}
              onCheckedChange={handleToggleActive}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!agent.isActive}
              onClick={startChat}
            >
              <IconMessageCircle />
              {t('tools_hub.start_chat')}
            </Button>
            {isCustom ? (
              <>
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <IconFileExport />
                  {t('tools_hub.agent.export')}
                </Button>
                <ConfirmDeleteButton
                  iconOnly
                  label={t('tools_hub.agent.delete')}
                  title={t('tools_hub.agent.delete_title', {
                    name: displayName,
                  })}
                  description={t('tools_hub.agent.delete_description')}
                  onConfirm={handleDelete}
                />
              </>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <DetailSection
            title={t('tools_hub.agent.basic')}
            description={
              isCustom ? undefined : t('tools_hub.agent.readonly_hint')
            }
          >
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel htmlFor="agent-name">
                  {t('tools_hub.agent.name')}
                </FieldLabel>
                <Input
                  id="agent-name"
                  value={draft.name}
                  readOnly={!isCustom}
                  aria-invalid={nameMissing || undefined}
                  onChange={(event) => update('name', event.target.value)}
                />
                {nameMissing ? (
                  <FieldDescription className="text-destructive dark:text-destructive-foreground">
                    {t('common.required')}
                  </FieldDescription>
                ) : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="agent-description">
                  {t('tools_hub.agent.description')}
                </FieldLabel>
                <Textarea
                  id="agent-description"
                  rows={2}
                  value={draft.description}
                  readOnly={!isCustom}
                  placeholder={t('tools_hub.agent.description_placeholder')}
                  onChange={(event) =>
                    update('description', event.target.value)
                  }
                />
              </Field>
              <Field>
                <FieldLabel>{t('tools_hub.agent.default_model')}</FieldLabel>
                <ChatModelSelect
                  clearable
                  value={draft.defaultModelId || undefined}
                  onChange={(model) => update('defaultModelId', model ?? '')}
                />
                <FieldDescription className="text-xs">
                  {t('tools_hub.agent.default_model_hint')}
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel>{t('tools_hub.agent.tags')}</FieldLabel>
                <ToggleGroup
                  type="multiple"
                  value={draft.tags}
                  onValueChange={(tags) => update('tags', tags)}
                  className="flex-wrap gap-1.5"
                >
                  {availableTags.map((tag) => (
                    <ToggleGroupItem
                      key={tag}
                      value={tag}
                      className={cn(
                        'h-7 rounded-md border px-2.5 text-xs font-medium text-muted-foreground',
                        'data-[state=on]:border-foreground/30 data-[state=on]:bg-accent data-[state=on]:text-foreground',
                      )}
                    >
                      {tag}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
            </FieldGroup>
          </DetailSection>

          <DetailSection
            title={t('tools_hub.agent.instructions')}
            description={
              isCustom ? undefined : t('tools_hub.agent.instructions_readonly')
            }
            bodyClassName="p-0"
          >
            <Textarea
              aria-label={t('tools_hub.agent.instructions')}
              value={draft.instructions}
              readOnly={!isCustom}
              placeholder={t('tools_hub.agent.instructions_placeholder')}
              onChange={(event) => update('instructions', event.target.value)}
              className={cn(
                'min-h-80 resize-y rounded-xl border-0 p-4 text-sm leading-relaxed shadow-none focus-visible:ring-0',
                !isCustom && 'bg-muted/30 text-muted-foreground',
              )}
            />
            <div className="flex justify-end border-t px-4 py-2 text-xs tabular-nums text-muted-foreground">
              {t('tools_hub.agent.chars', {
                count: draft.instructions.length,
              })}
            </div>
          </DetailSection>

          <DetailSection title={t('tools_hub.agent.conversation')}>
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel htmlFor="agent-greeting">
                  {t('tools_hub.agent.greeting')}
                </FieldLabel>
                <Textarea
                  id="agent-greeting"
                  rows={2}
                  value={draft.greeting}
                  placeholder={t('tools_hub.agent.greeting_placeholder')}
                  onChange={(event) => update('greeting', event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>{t('tools_hub.agent.suggestions')}</FieldLabel>
                <FieldDescription className="text-xs">
                  {t('tools_hub.agent.suggestions_hint')}
                </FieldDescription>
                <div className="flex flex-col gap-2">
                  {draft.suggestions.map((suggestion, index) => (
                    <div
                      // eslint-disable-next-line react/no-array-index-key
                      key={index}
                      className="flex items-center gap-2"
                    >
                      <Input
                        aria-label={`${t('tools_hub.agent.suggestions')} ${index + 1}`}
                        value={suggestion}
                        placeholder={t('tools_hub.agent.suggestion_placeholder')}
                        onChange={(event) => {
                          const next = [...draft.suggestions];
                          next[index] = event.target.value;
                          update('suggestions', next);
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('tools_hub.agent.remove_suggestion')}
                        onClick={() =>
                          update(
                            'suggestions',
                            draft.suggestions.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <IconX />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={() =>
                      update('suggestions', [...draft.suggestions, ''])
                    }
                  >
                    <IconPlus />
                    {t('tools_hub.agent.add_suggestion')}
                  </Button>
                </div>
              </Field>
            </FieldGroup>
          </DetailSection>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <DetailSection
            title={t('tools_hub.agent.tools')}
            count={draft.tools.length}
            actions={
              <ChatToolSelector
                value={draft.tools}
                onChange={(tools) => update('tools', tools)}
              >
                <Button variant="outline" size="sm">
                  <IconAdjustmentsHorizontal />
                  {t('tools_hub.agent.configure')}
                </Button>
              </ChatToolSelector>
            }
          >
            {draft.tools.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('tools_hub.agent.tools_empty')}
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {TOOL_GROUPS.map(({ type, labelKey }) => {
                  const ids = draft.tools.filter((toolId) =>
                    toolId.startsWith(`${type}:`),
                  );
                  if (ids.length === 0) return null;
                  return (
                    <div key={type} className="flex flex-col gap-2">
                      <h3 className="text-xs font-medium text-muted-foreground">
                        {t(labelKey)}
                        <span className="ml-1.5 tabular-nums">{ids.length}</span>
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {ids.map((toolId) => {
                          const { label, to } = resolveTool(toolId);
                          const server =
                            type === ToolType.MCP
                              ? resolveMcpServerLabel(toolId)
                              : undefined;
                          return (
                            <RemovableChip
                              key={toolId}
                              label={server ? `${server} · ${label}` : label}
                              to={to}
                              removeLabel={t('tools_hub.agent.remove_item', {
                                name: label,
                              })}
                              onRemove={() =>
                                update(
                                  'tools',
                                  draft.tools.filter((x) => x !== toolId),
                                )
                              }
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </DetailSection>

          <DetailSection
            title={t('tools_hub.agent.sub_agents')}
            count={draft.subAgents.length}
            actions={
              <ChatAgentSelector
                mode="multiple"
                value={draft.subAgents}
                onChange={(subAgents) => update('subAgents', subAgents ?? [])}
              >
                <Button variant="outline" size="sm">
                  <IconAdjustmentsHorizontal />
                  {t('tools_hub.agent.configure')}
                </Button>
              </ChatAgentSelector>
            }
            bodyClassName={draft.subAgents.length ? 'p-1.5' : undefined}
          >
            {draft.subAgents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('tools_hub.agent.sub_agents_empty')}
              </p>
            ) : (
              <ul className="flex flex-col">
                {draft.subAgents.map((subAgentId) => {
                  const subAgent = agentCatalog.find((x) => x.id === subAgentId);
                  const label = subAgent?.name || subAgentId;
                  return (
                    <li
                      key={subAgentId}
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-accent/50"
                    >
                      <AgentAvatar id={subAgentId} name={label} size="sm" />
                      <Link
                        to={agentDetailPath(subAgentId)}
                        className="min-w-0 flex-1 truncate text-sm outline-none hover:underline focus-visible:underline"
                      >
                        {label}
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-7"
                        aria-label={t('tools_hub.agent.remove_item', {
                          name: label,
                        })}
                        onClick={() =>
                          update(
                            'subAgents',
                            draft.subAgents.filter((x) => x !== subAgentId),
                          )
                        }
                      >
                        <IconX />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </DetailSection>
        </aside>
      </div>

      <ExportConfigDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        name={displayName}
        config={exportConfig}
      />
    </DetailPage>
  );
}
