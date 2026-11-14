import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Form, { Widgets } from '@rjsf/shadcn';
import validator from '@rjsf/validator-ajv8';
import type { ToolUIPart } from 'ai';
import {
  IconAlertTriangle,
  IconBrandGithub,
  IconExternalLink,
  IconFolder,
  IconPencil,
  IconPlayerPlay,
  IconPlayerStop,
  IconRefresh,
  IconX,
} from '@tabler/icons-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/renderer/components/ui/accordion';
import { Button } from '@/renderer/components/ui/button';
import { Spinner } from '@/renderer/components/ui/spinner';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/renderer/components/ui/resizable';
import { ChatToolResultPreview } from '@/renderer/components/chat-ui/chat-preview/chat-tool-result-preview';
import { Transl } from '@/renderer/components/translations/transl';
import {
  getSkillDisplayName,
  SkillIcon,
} from '@/renderer/components/skills-ui/skill-metadata';
import { nanoid } from '@/utils/nanoid';
import { McpEvent } from '@/types/mcp';
import { Tool, ToolConfig, ToolEvent, ToolType } from '@/types/tool';
import { ToolConfigDialog } from './tool-config-dialog';
import { ToolEditDialog } from './tool-edit-dialog';
import {
  getRepoDisplayName,
  HubTab,
  hubTabForToolId,
  hubTabPath,
  skillGroupPath,
  toolDetailPath,
} from './hub-model';
import {
  mcpStatusTone,
  StatusIndicator,
  TagChip,
  TOOLKIT_ICON,
  TypeAvatar,
} from './hub-visuals';
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

type ToolDetailData = Tool & {
  error?: string | { message?: string };
  value?: Record<string, unknown>;
};

type SubTool = NonNullable<Tool['tools']>[number];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function TypeLabel({ tab, isToolkit }: { tab: HubTab; isToolkit?: boolean }) {
  const { t } = useTranslation();
  return (
    <TagChip>
      {tab === 'builtin' && isToolkit
        ? t('tools_hub.tool.type_toolkit')
        : t(`tools_hub.tool.type_${tab}`)}
    </TagChip>
  );
}

function SubToolList({
  tool,
  executing,
  onRun,
  onStop,
}: {
  tool: ToolDetailData;
  executing: Record<string, boolean>;
  onRun: (toolName: string, input: unknown) => void;
  onStop: (toolName: string) => void;
}) {
  const { t } = useTranslation();
  const subTools = tool.tools ?? [];
  const isConnector = tool.type === ToolType.MCP;

  if (subTools.length === 0) {
    return (
      <DetailSection title={t('tools_hub.tool.included_tools')} count={0}>
        <p className="text-sm text-muted-foreground">
          {isConnector && !tool.isActive
            ? t('tools_hub.tool.included_tools_inactive')
            : t('tools_hub.tool.included_tools_empty')}
        </p>
      </DetailSection>
    );
  }

  const renderForm = (subTool: SubTool) => (
    <Form
      schema={subTool.inputSchema}
      validator={validator}
      widgets={{ TextWidget: Widgets.TextareaWidget }}
      onSubmit={(event) => onRun(subTool.name, event.formData)}
    >
      <div className="mt-3 flex items-center gap-2">
        {executing[subTool.name] ? (
          <Button type="button" size="sm" onClick={() => onStop(subTool.name)}>
            <IconPlayerStop />
            {t('tools_hub.tool.stop')}
          </Button>
        ) : (
          <Button type="submit" size="sm" variant="outline">
            <IconPlayerPlay />
            {t('tools_hub.tool.run')}
          </Button>
        )}
        {executing[subTool.name] ? <Spinner className="size-4" /> : null}
      </div>
    </Form>
  );

  return (
    <DetailSection
      title={t('tools_hub.tool.included_tools')}
      count={subTools.length}
      description={t('tools_hub.tool.included_tools_hint')}
      bodyClassName="p-0"
    >
      <Accordion
        type="multiple"
        defaultValue={subTools.length === 1 ? [subTools[0].id] : []}
      >
        {subTools.map((subTool) => {
          const label = t(
            `tool_name.${subTool.name.toLowerCase()}`,
            subTool.name,
          );
          const hasConfig =
            ToolConfig[subTool.name as keyof typeof ToolConfig]?.configSchema &&
            !subTool.id.startsWith(`${ToolType.BUILD_IN}:`);
          return (
            <AccordionItem
              key={subTool.id}
              value={subTool.id}
              className="px-4 last:border-b-0"
            >
              <AccordionTrigger className="gap-4 py-3 hover:no-underline">
                <span className="flex min-w-0 flex-col gap-0.5 text-left">
                  <span className="text-sm font-medium">{label}</span>
                  {label !== subTool.name ? (
                    <code className="font-mono text-xs font-normal text-muted-foreground">
                      {subTool.name}
                    </code>
                  ) : null}
                </span>
              </AccordionTrigger>
              <AccordionContent className="flex flex-col gap-4 pb-4">
                {hasConfig ? (
                  <div>
                    <ToolConfigDialog
                      toolId={`${ToolType.BUILD_IN}:${subTool.id}`}
                      configSchema={
                        ToolConfig[subTool.name as keyof typeof ToolConfig]
                          .configSchema
                      }
                      uiSchema={
                        ToolConfig[subTool.name as keyof typeof ToolConfig]
                          .uiSchema
                      }
                    />
                  </div>
                ) : null}
                {subTool.description ? (
                  <Transl className="rounded-lg bg-muted/50 p-3 text-sm">
                    {subTool.description}
                  </Transl>
                ) : null}
                {subTool.inputSchema?.type === 'object' ? (
                  <div className="flex flex-col gap-1">
                    <h4 className="text-xs font-medium text-muted-foreground">
                      {t('tools_hub.tool.try_run')}
                    </h4>
                    {renderForm(subTool)}
                  </div>
                ) : null}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </DetailSection>
  );
}

function ToolkitDetail({
  tool,
  tab,
  reload,
  onDeleted,
}: {
  tool: ToolDetailData;
  tab: HubTab;
  reload: () => Promise<void>;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const isConnector = tab === 'connectors';
  const label = isConnector
    ? tool.name
    : t(`tool_name.${tool.name.toLowerCase()}`, tool.name);
  const [toggling, setToggling] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [executing, setExecuting] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<{
    title: string;
    part: ToolUIPart;
  } | null>(null);
  const configEntry = ToolConfig[tool.name as keyof typeof ToolConfig];
  const status = tool.status ?? (tool.isActive ? 'running' : 'stopped');
  const connectorError =
    typeof tool.error === 'string' ? tool.error : tool.error?.message;

  const handleToggle = async () => {
    setToggling(true);
    try {
      await window.electron.tools.toggleToolActive(tool.id);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setToggling(false);
      await reload();
    }
  };

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      await window.electron.tools.reconnectMCP(tool.id);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setReconnecting(false);
      await reload();
    }
  };

  const handleDelete = async () => {
    try {
      await window.electron.tools.deleteTool(tool.id);
      onDeleted();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const handleRun = async (toolName: string, input: unknown) => {
    setExecuting((prev) => ({ ...prev, [toolName]: true }));
    try {
      const output = await window.electron.tools.executeTool(
        tool.id,
        toolName,
        input,
      );
      setResult({
        title: toolName,
        part: {
          type: `tool-${toolName}`,
          input,
          output,
          toolCallId: nanoid(),
          state: 'output-available',
        } as ToolUIPart,
      });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setExecuting((prev) => ({ ...prev, [toolName]: false }));
    }
  };

  const handleStop = async (toolName: string) => {
    if (!executing[toolName]) return;
    try {
      await window.electron.tools.abortTool(tool.id, toolName);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const main = (
    <DetailPage>
      <DetailHeader
        media={
          <TypeAvatar
            tab={tab}
            icon={!isConnector && tool.isToolkit ? TOOLKIT_ICON : undefined}
            size="lg"
          />
        }
        title={
          <span className="inline-flex flex-wrap items-baseline gap-2">
            {label}
            {tool.version ? (
              <span className="text-sm font-normal text-muted-foreground">
                v{tool.version}
              </span>
            ) : null}
          </span>
        }
        meta={
          <>
            <TypeLabel tab={tab} isToolkit={tool.isToolkit} />
            {isConnector ? (
              <StatusIndicator
                tone={mcpStatusTone(tool.status, tool.isActive)}
                label={t(`tools_hub.mcp_status.${status}`)}
              />
            ) : (
              <StatusIndicator
                tone={tool.isActive ? 'positive' : 'neutral'}
                label={
                  tool.isActive ? t('tools_hub.enabled') : t('tools_hub.disabled')
                }
              />
            )}
            {label !== tool.name ? (
              <code className="font-mono">{tool.name}</code>
            ) : null}
          </>
        }
        actions={
          <>
            {configEntry?.configSchema ? (
              <ToolConfigDialog
                toolId={tool.id}
                configSchema={configEntry.configSchema}
                uiSchema={configEntry.uiSchema}
              />
            ) : null}
            <LabeledSwitch
              label={t('tools_hub.active')}
              checked={Boolean(tool.isActive)}
              disabled={toggling || tool.status === 'starting'}
              onCheckedChange={handleToggle}
            />
            {isConnector ? (
              <>
                {tool.isActive && tool.status === 'running' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={reconnecting}
                    onClick={handleReconnect}
                  >
                    <IconRefresh className={reconnecting ? 'animate-spin' : ''} />
                    {t('tools_hub.tool.reconnect')}
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditOpen(true)}
                >
                  <IconPencil />
                  {t('common.edit')}
                </Button>
                <ConfirmDeleteButton
                  iconOnly
                  label={t('tools_hub.tool.delete_connector')}
                  title={t('tools_hub.tool.delete_connector_title', {
                    name: tool.name,
                  })}
                  description={t('tools_hub.tool.delete_connector_description')}
                  onConfirm={handleDelete}
                />
              </>
            ) : null}
          </>
        }
      >
        {tool.isToolkit && tool.description ? (
          <Transl className="max-w-[75ch] text-sm leading-relaxed text-muted-foreground">
            {tool.description}
          </Transl>
        ) : null}
        {isConnector && status === 'error' && connectorError ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
          >
            <IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive dark:text-destructive-foreground" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">
                {t('tools_hub.tool.connector_error')}
              </span>
              <span className="break-words text-muted-foreground">
                {connectorError}
              </span>
            </div>
          </div>
        ) : null}
      </DetailHeader>

      <SubToolList
        tool={tool}
        executing={executing}
        onRun={handleRun}
        onStop={handleStop}
      />

      {isConnector ? (
        <ToolEditDialog
          toolId={tool.id}
          open={editOpen}
          onOpenChange={(open) => {
            setEditOpen(open);
            if (!open) reload();
          }}
        />
      ) : null}
    </DetailPage>
  );

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full w-full">
      <ResizablePanel id="tool-detail-main" order={1} minSize={35}>
        {main}
      </ResizablePanel>
      {result ? (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel
            id="tool-result-preview"
            order={2}
            defaultSize={40}
            minSize={25}
            maxSize={65}
          >
            <section
              aria-label={t('tools_hub.tool.result')}
              className="flex h-full flex-col"
            >
              <div className="flex h-11 shrink-0 items-center justify-between border-b px-4">
                <h2 className="truncate text-sm font-semibold">
                  {t('tools_hub.tool.result')}
                  <code className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                    {result.title}
                  </code>
                </h2>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-7"
                  aria-label={t('tools_hub.tool.close_result')}
                  onClick={() => setResult(null)}
                >
                  <IconX />
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                <ChatToolResultPreview title={result.title} part={result.part} />
              </div>
            </section>
          </ResizablePanel>
        </>
      ) : null}
    </ResizablePanelGroup>
  );
}

function SkillDetail({
  skill,
  reload,
  onDeleted,
}: {
  skill: ToolDetailData;
  reload: () => Promise<void>;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<'toggle' | 'auto' | 'update' | null>(null);
  const displayName = getSkillDisplayName(skill);
  const tags = [
    ...(skill.category ? [skill.category] : []),
    ...(skill.tags ?? []).filter((tag) => tag !== skill.category),
  ];

  const run = async (kind: typeof busy, task: () => Promise<unknown>) => {
    setBusy(kind);
    try {
      await task();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
      await reload();
    }
  };

  const handleUpdate = () =>
    run('update', async () => {
      await window.electron.tools.importSkills({ repo_or_url: skill.source });
      toast.success(t('common.import_success'));
    });

  const handleDelete = async () => {
    try {
      await window.electron.tools.deleteTool(skill.id);
      onDeleted();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const infoRows: { label: string; value: ReactNode }[] = [];
  if (skill.path) {
    infoRows.push({
      label: t('tools_hub.tool.location'),
      value: (
        <button
          type="button"
          onClick={() => window.electron.app.openPath(skill.path!)}
          className="inline-flex max-w-full items-center gap-1.5 text-left font-mono text-xs outline-none hover:underline focus-visible:underline"
        >
          <IconFolder className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="break-all">{skill.path}</span>
        </button>
      ),
    });
  }
  if (skill.source) {
    infoRows.push({
      label: t('tools_hub.tool.source'),
      value: (
        <a
          href={skill.source}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full items-center gap-1.5 text-xs outline-none hover:underline focus-visible:underline"
        >
          <span className="break-all">{skill.source}</span>
          <IconExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
        </a>
      ),
    });
  }
  if (skill.repo) {
    infoRows.push({
      label: t('tools_hub.tool.group'),
      value: (
        <Link
          to={skillGroupPath(skill.repo)}
          className="inline-flex items-center gap-1.5 text-xs outline-none hover:underline focus-visible:underline"
        >
          <IconBrandGithub className="size-3.5" aria-hidden="true" />
          {getRepoDisplayName(skill.repo)}
        </Link>
      ),
    });
  }

  return (
    <DetailPage>
      <DetailHeader
        media={<SkillIcon skill={skill} className="size-12 rounded-xl" />}
        title={
          <span className="inline-flex flex-wrap items-baseline gap-2">
            {displayName}
            {skill.version ? (
              <span className="text-sm font-normal text-muted-foreground">
                v{skill.version}
              </span>
            ) : null}
          </span>
        }
        meta={
          <>
            <TypeLabel tab="skills" />
            <StatusIndicator
              tone={skill.isActive ? 'positive' : 'neutral'}
              label={
                skill.isActive ? t('tools_hub.enabled') : t('tools_hub.disabled')
              }
            />
            {displayName !== skill.name ? (
              <code className="font-mono">{skill.name}</code>
            ) : null}
            {tags.slice(0, 4).map((tag) => (
              <TagChip key={tag}>{tag}</TagChip>
            ))}
          </>
        }
        actions={
          <>
            <LabeledSwitch
              label={t('tools_hub.active')}
              checked={Boolean(skill.isActive)}
              disabled={busy !== null}
              onCheckedChange={() =>
                run('toggle', () => window.electron.tools.toggleToolActive(skill.id))
              }
            />
            <LabeledSwitch
              label={t('tools.auto_load')}
              checked={Boolean(skill.autoLoad)}
              disabled={busy !== null}
              onCheckedChange={(autoLoad) =>
                run('auto', () =>
                  window.electron.tools.setSkillAutoLoad({
                    ids: [skill.id],
                    autoLoad,
                  }),
                )
              }
            />
            {skill.source ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={handleUpdate}
              >
                {busy === 'update' ? (
                  <Spinner className="size-4" />
                ) : (
                  <IconRefresh />
                )}
                {t('tools_hub.tool.update_skill')}
              </Button>
            ) : null}
            <ConfirmDeleteButton
              iconOnly
              disabled={busy !== null}
              label={t('tools_hub.tool.delete_skill')}
              title={t('tools_hub.tool.delete_skill_title', {
                name: displayName,
              })}
              description={t('tools_hub.tool.delete_skill_description')}
              onConfirm={handleDelete}
            />
          </>
        }
      >
        {skill.description ? (
          <Transl className="max-w-[75ch] text-sm leading-relaxed text-muted-foreground">
            {skill.description}
          </Transl>
        ) : null}
        <p className="text-xs text-muted-foreground">{t('tools.auto_load_hint')}</p>
      </DetailHeader>

      {infoRows.length > 0 ? (
        <dl className="grid gap-x-6 gap-y-2.5 rounded-xl border bg-card p-4 sm:grid-cols-[6rem_minmax(0,1fr)]">
          {infoRows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-xs text-muted-foreground">{row.label}</dt>
              <dd className="min-w-0">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {skill.entrypoints && Object.keys(skill.entrypoints).length > 0 ? (
        <DetailSection
          title={t('tools.skill_entrypoints')}
          count={Object.keys(skill.entrypoints).length}
          bodyClassName="p-0"
        >
          <dl className="divide-y">
            {Object.entries(skill.entrypoints).map(([name, command]) => (
              <div
                key={name}
                className="grid gap-1 px-4 py-2.5 sm:grid-cols-[8rem_minmax(0,1fr)]"
              >
                <dt className="text-xs font-medium">{name}</dt>
                <dd>
                  <code className="font-mono text-xs break-all text-muted-foreground">
                    {command}
                  </code>
                </dd>
              </div>
            ))}
          </dl>
        </DetailSection>
      ) : null}

      {skill.content ? (
        <DetailSection title="SKILL.md">
          <Transl useMarkdown className="text-sm">
            {skill.content}
          </Transl>
        </DetailSection>
      ) : null}
    </DetailPage>
  );
}

export default function ToolDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const tab = hubTabForToolId(id);
  const [tool, setTool] = useState<ToolDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    try {
      const data: ToolDetailData = await window.electron.tools.getTool(id);
      if (!data) throw new Error('not found');
      setTool(data);
      setNotFound(false);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    setTool(null);
    load();
  }, [load]);

  useEffect(() => {
    const offMcp = window.electron.ipcRenderer.on(
      McpEvent.McpClientUpdated,
      (payload) => {
        if ((payload as { id?: string })?.id === id) load();
      },
    );
    const offList = window.electron.ipcRenderer.on(
      ToolEvent.ToolListUpdated,
      (payload) => {
        const event = payload as { id?: string; status?: string };
        if (event?.id === id && event.status !== 'deleted') load();
      },
    );
    return () => {
      offMcp();
      offList();
    };
  }, [id, load]);

  let label: string | undefined;
  if (tool) {
    if (tab === 'skills') label = getSkillDisplayName(tool);
    else if (tab === 'connectors') label = tool.name;
    else label = t(`tool_name.${tool.name.toLowerCase()}`, tool.name);
  }
  useDetailBreadcrumb(tab, label, toolDetailPath(id));

  const handleDeleted = () => navigate(hubTabPath(tab));

  if (loading) return <DetailLoading />;
  if (notFound || !tool) {
    return (
      <DetailNotFound tab={tab} message={t('tools_hub.tool.not_found')} />
    );
  }

  if (tab === 'skills') {
    return <SkillDetail skill={tool} reload={load} onDeleted={handleDeleted} />;
  }

  return (
    <ToolkitDetail
      tool={tool}
      tab={tab}
      reload={load}
      onDeleted={handleDeleted}
    />
  );
}
