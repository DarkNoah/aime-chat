import { Button } from '@/renderer/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/renderer/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/renderer/components/ui/alert-dialog';
import { Input } from '@/renderer/components/ui/input';
import { Label } from '@/renderer/components/ui/label';
import { Switch } from '@/renderer/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/renderer/components/ui/table';
import { useHeader } from '@/renderer/hooks/use-title';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/renderer/components/ui/badge';
import {
  IconEdit,
  IconHistory,
  IconPlayerPlay,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { isBuiltinCronId } from '@/types/ipc-channel';
import { Textarea } from '@/renderer/components/ui/textarea';
import { ScrollArea } from '@/renderer/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select';
import { Project } from '@/types/project';
import { Card, CardContent } from '@/renderer/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/renderer/components/ui/tabs';
import { Separator } from '@/renderer/components/ui/separator';
import {
  PromptInputButton,
  PromptInputTools,
} from '@/renderer/components/ai-elements/prompt-input';
import { BotIcon, WrenchIcon } from 'lucide-react';
import { ChatToolSelector } from '@/renderer/components/chat-ui/chat-tool-selector';
import { ChatAgentSelector } from '@/renderer/components/chat-ui/chat-agent-selector';
import { ChatModelSelect } from '@/renderer/components/chat-ui/chat-model-select';
import { Agent } from '@/types/agent';
import { useGlobal } from '@/renderer/hooks/use-global';
interface ChatSubmitOptions {
  model?: string;
  tools?: string[];
  subAgents?: string[];
  agentId?: string;
}
interface CronRunRecord {
  startedAt: string;
  endedAt?: string;
  chatId?: string;
  status: 'success' | 'failed' | 'running';
  error?: string;
  trigger?: 'schedule' | 'manual';
}

interface CronItem {
  id: string;
  name: string;
  prompt: string;
  cron: string;
  projectId?: string;
  description?: string;
  submitOptions: ChatSubmitOptions;
  isActive: boolean;
  lastRunAt?: string;
  lastRunEndAt?: string;
  lastRunChatId?: string;
  lastRunResult?: any;
  runHistory?: CronRunRecord[];
}

interface CronFormData {
  name: string;
  prompt: string;
  cron: string;
  description: string;
  submitOptions: ChatSubmitOptions;
  projectId: string;
  isActive: boolean;
}

type ProjectOption = Pick<Project, 'id' | 'title'>;
type CronPreset = 'minutes' | 'hourly' | 'daily' | 'weekly' | 'custom';

interface CronBuilderState {
  preset: CronPreset;
  minuteInterval: string;
  hourlyMinute: string;
  dailyHour: string;
  dailyMinute: string;
  weeklyDays: string[];
  weeklyHour: string;
  weeklyMinute: string;
  customCron: string;
}

const EMPTY_PROJECT_VALUE = '__none__';
const DEFAULT_WEEKLY_DAYS = ['1'];
const DAY_OPTIONS = [
  { label: '周一', value: '1' },
  { label: '周二', value: '2' },
  { label: '周三', value: '3' },
  { label: '周四', value: '4' },
  { label: '周五', value: '5' },
  { label: '周六', value: '6' },
  { label: '周日', value: '0' },
] as const;

const emptyForm: CronFormData = {
  name: '',
  prompt: '',
  cron: '',
  description: '',
  submitOptions: {},
  projectId: '',
  isActive: true,
};

const defaultBuilderState = (): CronBuilderState => ({
  preset: 'minutes',
  minuteInterval: '5',
  hourlyMinute: '0',
  dailyHour: '9',
  dailyMinute: '0',
  weeklyDays: [...DEFAULT_WEEKLY_DAYS],
  weeklyHour: '9',
  weeklyMinute: '0',
  customCron: '',
});

const padCronValue = (value: string) => value.trim();

const clampNumberString = (
  value: string,
  min: number,
  max: number,
  fallback: string,
) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const clamped = Math.min(max, Math.max(min, Math.floor(numeric)));
  return String(clamped);
};

const normalizeCron = (cron: string) => cron.trim().replace(/\s+/g, ' ');

const getCronFromBuilder = (builder: CronBuilderState) => {
  switch (builder.preset) {
    case 'minutes': {
      const interval = clampNumberString(builder.minuteInterval, 1, 59, '5');
      return `*/${interval} * * * *`;
    }
    case 'hourly': {
      const minute = clampNumberString(builder.hourlyMinute, 0, 59, '0');
      return `${minute} * * * *`;
    }
    case 'daily': {
      const hour = clampNumberString(builder.dailyHour, 0, 23, '9');
      const minute = clampNumberString(builder.dailyMinute, 0, 59, '0');
      return `${minute} ${hour} * * *`;
    }
    case 'weekly': {
      const hour = clampNumberString(builder.weeklyHour, 0, 23, '9');
      const minute = clampNumberString(builder.weeklyMinute, 0, 59, '0');
      const days = [...builder.weeklyDays].sort(
        (a, b) => Number(a) - Number(b),
      );
      const normalizedDays =
        days.length > 0 ? days.join(',') : DEFAULT_WEEKLY_DAYS.join(',');
      return `${minute} ${hour} * * ${normalizedDays}`;
    }
    case 'custom':
    default:
      return normalizeCron(builder.customCron);
  }
};

const describeDays = (days: string[]) => {
  const labels = DAY_OPTIONS.filter((item) => days.includes(item.value)).map(
    (item) => item.label,
  );
  return labels.length > 0 ? labels.join('、') : '周一';
};

const getCronDescription = (builder: CronBuilderState) => {
  switch (builder.preset) {
    case 'minutes':
      return `每 ${clampNumberString(builder.minuteInterval, 1, 59, '5')} 分钟执行一次`;
    case 'hourly':
      return `每小时的第 ${clampNumberString(builder.hourlyMinute, 0, 59, '0')} 分钟执行`;
    case 'daily':
      return `每天 ${clampNumberString(builder.dailyHour, 0, 23, '9').padStart(2, '0')}:${clampNumberString(builder.dailyMinute, 0, 59, '0').padStart(2, '0')} 执行`;
    case 'weekly':
      return `每周 ${describeDays(builder.weeklyDays)} ${clampNumberString(builder.weeklyHour, 0, 23, '9').padStart(2, '0')}:${clampNumberString(builder.weeklyMinute, 0, 59, '0').padStart(2, '0')} 执行`;
    case 'custom':
    default:
      return '自定义 cron 表达式';
  }
};

const parseCronToBuilder = (cron: string): CronBuilderState => {
  const normalized = normalizeCron(cron);
  if (!normalized) {
    return defaultBuilderState();
  }

  const parts = normalized.split(' ');
  if (parts.length !== 5) {
    return {
      ...defaultBuilderState(),
      preset: 'custom',
      customCron: normalized,
    };
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  if (
    minute.startsWith('*/') &&
    hour === '*' &&
    dayOfMonth === '*' &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    const interval = minute.slice(2);
    return {
      ...defaultBuilderState(),
      preset: 'minutes',
      minuteInterval: clampNumberString(interval, 1, 59, '5'),
      customCron: normalized,
    };
  }

  if (
    /^\d+$/.test(minute) &&
    hour === '*' &&
    dayOfMonth === '*' &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    return {
      ...defaultBuilderState(),
      preset: 'hourly',
      hourlyMinute: clampNumberString(minute, 0, 59, '0'),
      customCron: normalized,
    };
  }

  if (
    /^\d+$/.test(minute) &&
    /^\d+$/.test(hour) &&
    dayOfMonth === '*' &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    return {
      ...defaultBuilderState(),
      preset: 'daily',
      dailyHour: clampNumberString(hour, 0, 23, '9'),
      dailyMinute: clampNumberString(minute, 0, 59, '0'),
      customCron: normalized,
    };
  }

  if (
    /^\d+$/.test(minute) &&
    /^\d+$/.test(hour) &&
    dayOfMonth === '*' &&
    month === '*' &&
    /^\d+(,\d+)*$/.test(dayOfWeek)
  ) {
    const weeklyDays = dayOfWeek
      .split(',')
      .filter((value) => DAY_OPTIONS.some((item) => item.value === value));

    return {
      ...defaultBuilderState(),
      preset: 'weekly',
      weeklyHour: clampNumberString(hour, 0, 23, '9'),
      weeklyMinute: clampNumberString(minute, 0, 59, '0'),
      weeklyDays: weeklyDays.length > 0 ? weeklyDays : [...DEFAULT_WEEKLY_DAYS],
      customCron: normalized,
    };
  }

  return {
    ...defaultBuilderState(),
    preset: 'custom',
    customCron: normalized,
  };
};

function CronsPage() {
  const { t } = useTranslation();
  const { setTitle } = useHeader();

  useEffect(() => {
    setTitle(t('crons.title'));
  }, [setTitle, t]);

  const [crons, setCrons] = useState<CronItem[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState<CronFormData>(emptyForm);
  const [builder, setBuilder] = useState<CronBuilderState>(defaultBuilderState);
  const [tools, setTools] = useState<string[]>([]);
  const [subAgents, setSubAgents] = useState<string[]>([]);
  const [runsDialogOpen, setRunsDialogOpen] = useState(false);
  const [viewingCron, setViewingCron] = useState<CronItem | null>(null);
  const [runningIds, setRunningIds] = useState<Set<string>>(() => new Set());
  const { appInfo } = useGlobal();
  const navigate = useNavigate();

  const loadCrons = useCallback(async () => {
    const list = await window.electron.crons.getList();
    console.log(list);
    setCrons(list);
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const data = await window.electron.projects.getList({
        page: 0,
        size: 100,
      });
      setProjects(data.items);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadCrons();
    loadProjects();
  }, [loadCrons, loadProjects]);

  useEffect(() => {
    if (!viewingCron) return;
    const fresh = crons.find((item) => item.id === viewingCron.id);
    if (fresh && fresh !== viewingCron) {
      setViewingCron(fresh);
    }
  }, [crons, viewingCron]);

  const syncFormCron = useCallback((nextBuilder: CronBuilderState) => {
    const nextCron = getCronFromBuilder(nextBuilder);
    setBuilder(nextBuilder);
    setForm((current) => ({ ...current, cron: nextCron }));
  }, []);

  const openCreateDialog = async () => {
    setEditingId(null);
    let agent: Agent | undefined;
    if (appInfo.defaultAgent)
      agent = await window.electron.agents.getAgent(appInfo.defaultAgent);
    const model = agent?.defaultModelId || appInfo.defaultModel?.model;
    setForm({
      name: '',
      prompt: '',
      cron: '',
      description: '',
      submitOptions: {
        agentId: appInfo.defaultAgent,
        model,
        tools: agent?.tools ?? [],
        subAgents: agent?.subAgents ?? [],
      },
      projectId: '',
      isActive: true,
    });
    setBuilder(defaultBuilderState());
    setDialogOpen(true);
  };

  const openEditDialog = (item: CronItem) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      prompt: item.prompt,
      cron: item.cron,
      description: item.description || '',
      submitOptions: {
        agentId: item.submitOptions?.agentId,
        tools: item.submitOptions?.tools ?? [],
        subAgents: item.submitOptions?.subAgents ?? [],
        model: item.submitOptions?.model,
      },
      projectId: item.projectId || '',
      isActive: item.isActive,
    });
    setBuilder(parseCronToBuilder(item.cron));
    setDialogOpen(true);
  };

  const openDeleteDialog = (id: string) => {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.prompt.trim() || !form.cron.trim()) return;

    const payload = {
      name: form.name.trim(),
      prompt: form.prompt.trim(),
      cron: form.cron.trim(),
      description: form.description.trim() || undefined,
      submitOptions: form.submitOptions,
      projectId: form.projectId || undefined,
      isActive: form.isActive,
    };

    if (editingId) {
      await window.electron.crons.update(editingId, payload);
    } else {
      await window.electron.crons.create(payload);
    }
    setDialogOpen(false);
    await loadCrons();
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await window.electron.crons.delete(deletingId);
      setDeleteDialogOpen(false);
      setDeletingId(null);
      await loadCrons();
    } catch (err: any) {
      toast.error(err?.message || String(err));
    }
  };

  const handleToggleActive = async (item: CronItem) => {
    await window.electron.crons.update(item.id, { isActive: !item.isActive });
    await loadCrons();
  };

  const handleRunNow = async (item: CronItem) => {
    setRunningIds((prev) => {
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });
    try {
      const res = await window.electron.crons.runNow(item.id);
      if (res.alreadyRunning) {
        toast.error(t('crons.run_now_already_running'));
      } else {
        toast.success(t('crons.run_now_started'));
      }
      await loadCrons();
    } catch (err: any) {
      toast.error(err?.message || String(err));
    } finally {
      setRunningIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const handleOpenRuns = (item: CronItem) => {
    setViewingCron(item);
    setRunsDialogOpen(true);
  };

  const handleOpenRunChat = (chatId?: string) => {
    if (!chatId) return;
    setRunsDialogOpen(false);
    navigate(`/chat/${chatId}`);
  };

  const formatDuration = (start?: string, end?: string) => {
    if (!start) return '-';
    const startMs = new Date(start).getTime();
    const endMs = end ? new Date(end).getTime() : Date.now();
    const diff = Math.max(0, endMs - startMs);
    if (diff < 1000) return `${diff}ms`;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainSeconds}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  const renderRunStatus = (status: CronRunRecord['status']) => {
    if (status === 'success') {
      return (
        <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600">
          {t('crons.runs_status_success')}
        </Badge>
      );
    }
    if (status === 'failed') {
      return (
        <Badge variant="destructive">{t('crons.runs_status_failed')}</Badge>
      );
    }
    return <Badge variant="outline">{t('crons.runs_status_running')}</Badge>;
  };

  const projectNameMap = new Map(
    projects.map((p) => [p.id || '', p.title || p.id || '']),
  );

  const cronSummary = useMemo(() => getCronDescription(builder), [builder]);

  const formatLastRun = (lastRunAt?: string) => {
    if (!lastRunAt) return t('crons.never');
    return new Date(lastRunAt).toLocaleString();
  };

  const renderNumberSelect = (
    value: string,
    onChange: (value: string) => void,
    max: number,
  ) => (
    <Select value={padCronValue(value)} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Array.from({ length: max + 1 }, (_, index) => (
          <SelectItem key={index} value={String(index)}>
            {String(index).padStart(2, '0')}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const handleAgentChanged = (agent: Agent) => {
    const agentTools = [...(agent?.tools || [])];
    const agentSubAgents = [...(agent?.subAgents || [])];
    agentTools.push(...(form?.submitOptions?.tools || []));
    agentSubAgents.push(...(form?.submitOptions?.subAgents || []));

    setForm({
      ...form,
      submitOptions: {
        ...form.submitOptions,
        tools: [...new Set(agentTools)],
        model:
          form.submitOptions?.model ||
          agent?.defaultModelId ||
          appInfo.defaultModel?.model,
        subAgents: [...new Set(agentSubAgents)],
        agentId: agent?.id,
      },
    });
  };

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium">{t('crons.title')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('crons.description')}
            </p>
          </div>
          <Button size="sm" onClick={openCreateDialog}>
            <IconPlus size={16} />
            {t('crons.add')}
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('crons.name')}</TableHead>
              <TableHead>{t('crons.cron_expression')}</TableHead>
              <TableHead>{t('crons.prompt')}</TableHead>
              <TableHead>{t('common.project')}</TableHead>
              <TableHead>{t('crons.active')}</TableHead>
              <TableHead>{t('crons.last_run_at')}</TableHead>
              <TableHead className="text-right">
                {t('common.actions', 'Actions')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {crons.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-muted-foreground"
                >
                  {t('crons.empty')}
                </TableCell>
              </TableRow>
            )}
            {crons.map((item) => {
              const builtin = isBuiltinCronId(item.id);
              const running = runningIds.has(item.id);
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{item.name}</span>
                      {builtin && (
                        <Badge variant="outline" className="text-[10px]">
                          {t('crons.builtin_tag')}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono">
                      {item.cron}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[250px] truncate text-muted-foreground">
                    {item.prompt}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.projectId
                      ? projectNameMap.get(item.projectId) || item.projectId
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={item.isActive}
                      onCheckedChange={() => handleToggleActive(item)}
                    />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatLastRun(item.lastRunAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title={t('crons.run_now')}
                        disabled={running}
                        onClick={() => handleRunNow(item)}
                      >
                        <IconPlayerPlay size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title={t('crons.view_runs')}
                        onClick={() => handleOpenRuns(item)}
                      >
                        <IconHistory size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title={t('crons.edit')}
                        onClick={() => openEditDialog(item)}
                      >
                        <IconEdit size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive disabled:text-muted-foreground"
                        disabled={builtin}
                        title={
                          builtin
                            ? t('crons.builtin_cannot_delete')
                            : t('common.delete')
                        }
                        onClick={() => openDeleteDialog(item.id)}
                      >
                        <IconTrash size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                {editingId ? t('crons.edit') : t('crons.add')}
              </DialogTitle>
            </DialogHeader>
            <div className="grid max-h-[75vh] gap-4 overflow-y-auto py-2 pr-1">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label>{t('crons.name')}</Label>
                  <Input
                    placeholder={t('crons.name')}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>{t('common.project')}</Label>
                  <Select
                    value={form.projectId || EMPTY_PROJECT_VALUE}
                    onValueChange={(value) =>
                      setForm({
                        ...form,
                        projectId: value === EMPTY_PROJECT_VALUE ? '' : value,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t('crons.agent_placeholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY_PROJECT_VALUE}>
                        {t('common.unselected_project', 'Unselected Project')}
                      </SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id || ''}>
                          {project.title || project.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Card className="gap-4 py-4">
                <CardContent className="px-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <Label className="text-sm font-medium">Cron</Label>
                    </div>
                    <Badge variant="outline" className="font-mono">
                      {form.cron || '-'}
                    </Badge>
                  </div>

                  <Tabs
                    value={builder.preset}
                    onValueChange={(value) =>
                      syncFormCron({
                        ...builder,
                        preset: value as CronPreset,
                        customCron:
                          value === 'custom' ? form.cron : builder.customCron,
                      })
                    }
                    className="gap-4"
                  >
                    <TabsList className="grid w-full grid-cols-5">
                      <TabsTrigger value="minutes">每隔分钟</TabsTrigger>
                      <TabsTrigger value="hourly">每小时</TabsTrigger>
                      <TabsTrigger value="daily">每天</TabsTrigger>
                      <TabsTrigger value="weekly">每周</TabsTrigger>
                      <TabsTrigger value="custom">自定义</TabsTrigger>
                    </TabsList>

                    <TabsContent value="minutes" className="space-y-3">
                      <div className="grid gap-2 md:w-56">
                        <Label>间隔分钟</Label>
                        <Select
                          value={builder.minuteInterval}
                          onValueChange={(value) =>
                            syncFormCron({ ...builder, minuteInterval: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 59 }, (_, index) => {
                              const value = String(index + 1);
                              return (
                                <SelectItem key={value} value={value}>
                                  每 {value} 分钟
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    </TabsContent>

                    <TabsContent value="hourly" className="space-y-3">
                      <div className="grid gap-2 md:w-56">
                        <Label>分钟</Label>
                        {renderNumberSelect(
                          builder.hourlyMinute,
                          (value) =>
                            syncFormCron({ ...builder, hourlyMinute: value }),
                          59,
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="daily" className="space-y-3">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="grid gap-2">
                          <Label>小时</Label>
                          {renderNumberSelect(
                            builder.dailyHour,
                            (value) =>
                              syncFormCron({ ...builder, dailyHour: value }),
                            23,
                          )}
                        </div>
                        <div className="grid gap-2">
                          <Label>分钟</Label>
                          {renderNumberSelect(
                            builder.dailyMinute,
                            (value) =>
                              syncFormCron({ ...builder, dailyMinute: value }),
                            59,
                          )}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="weekly" className="space-y-4">
                      <div className="grid gap-2">
                        <Label>执行日期</Label>
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                          {DAY_OPTIONS.map((day) => {
                            const checked = builder.weeklyDays.includes(
                              day.value,
                            );
                            return (
                              <Button
                                key={day.value}
                                type="button"
                                variant={checked ? 'default' : 'outline'}
                                className="justify-start"
                                onClick={() => {
                                  const nextDays = checked
                                    ? builder.weeklyDays.filter(
                                        (value) => value !== day.value,
                                      )
                                    : [...builder.weeklyDays, day.value];
                                  syncFormCron({
                                    ...builder,
                                    weeklyDays:
                                      nextDays.length > 0
                                        ? nextDays
                                        : [...DEFAULT_WEEKLY_DAYS],
                                  });
                                }}
                              >
                                {day.label}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="grid gap-2">
                          <Label>小时</Label>
                          {renderNumberSelect(
                            builder.weeklyHour,
                            (value) =>
                              syncFormCron({ ...builder, weeklyHour: value }),
                            23,
                          )}
                        </div>
                        <div className="grid gap-2">
                          <Label>分钟</Label>
                          {renderNumberSelect(
                            builder.weeklyMinute,
                            (value) =>
                              syncFormCron({ ...builder, weeklyMinute: value }),
                            59,
                          )}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="custom" className="space-y-3">
                      <div className="grid gap-2">
                        <Label>{t('crons.cron_expression')}</Label>
                        <Input
                          placeholder={t('crons.cron_expression_placeholder')}
                          value={builder.customCron}
                          className="font-mono"
                          onChange={(e) => {
                            const customCron = e.target.value;
                            setBuilder((current) => ({
                              ...current,
                              customCron,
                            }));
                            setForm((current) => ({
                              ...current,
                              cron: customCron,
                            }));
                          }}
                        />
                        <p className="text-xs text-muted-foreground">
                          格式示例：`*/5 * * * *`、`30 9 * * 1,3,5`
                        </p>
                      </div>
                    </TabsContent>
                  </Tabs>

                  <Separator className="my-4" />

                  <div className="gap-2 flex flex-col">
                    <div className="grid gap-2">
                      <Label>{t('crons.cron_expression')}</Label>
                      <Input
                        placeholder={t('crons.cron_expression_placeholder')}
                        value={form.cron}
                        className="font-mono"
                        onChange={(e) => {
                          const cron = e.target.value;
                          setForm((current) => ({ ...current, cron }));
                          setBuilder(parseCronToBuilder(cron));
                        }}
                      />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {cronSummary}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-col gap-2">
                <Label>{t('crons.prompt')}</Label>
                <Textarea
                  placeholder={t('crons.prompt')}
                  value={form.prompt}
                  rows={4}
                  onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                />
                <PromptInputTools className="h-[24px]">
                  <ChatAgentSelector
                    className="h-full"
                    value={form.submitOptions.agentId}
                    mode="single"
                    onSelectedAgent={(agent) => handleAgentChanged(agent)}
                  ></ChatAgentSelector>
                  <ChatToolSelector
                    value={form.submitOptions.tools}
                    onChange={(_tools) =>
                      setForm({
                        ...form,
                        submitOptions: {
                          ...form.submitOptions,
                          tools: _tools ?? [],
                        },
                      })
                    }
                  >
                    <div className="relative">
                      <PromptInputButton
                        size="icon-xs"
                        variant={
                          form.submitOptions?.tools?.length > 0
                            ? 'default'
                            : 'ghost'
                        }
                      >
                        <WrenchIcon size={16} />
                      </PromptInputButton>
                      <div className="absolute top-3 right-0.5 text-[9px] ">
                        {form.submitOptions?.tools?.length}
                      </div>
                    </div>
                  </ChatToolSelector>
                  <ChatAgentSelector
                    value={form.submitOptions.subAgents ?? []}
                    onChange={(_subAgents) =>
                      setForm({
                        ...form,
                        submitOptions: {
                          ...form.submitOptions,
                          subAgents: _subAgents ?? [],
                        },
                      })
                    }
                    mode="multiple"
                  >
                    <div className="relative">
                      <PromptInputButton
                        size="icon-xs"
                        variant={
                          form.submitOptions?.subAgents?.length > 0
                            ? 'default'
                            : 'ghost'
                        }
                      >
                        <BotIcon size={16} />
                      </PromptInputButton>
                      <div className="absolute top-3 right-0.5 text-[9px] text-foreground">
                        {form.submitOptions?.subAgents?.length}
                      </div>
                    </div>
                  </ChatAgentSelector>
                  <ChatModelSelect
                    className="h-full"
                    value={form.submitOptions.model}
                    onChange={(_model) =>
                      setForm({
                        ...form,
                        submitOptions: {
                          ...form.submitOptions,
                          model: _model,
                        },
                      })
                    }
                    className="max-w-[300px] truncate"
                  ></ChatModelSelect>
                </PromptInputTools>
              </div>
              <div className="flex flex-col gap-2">
                <Label>{t('crons.description_field')}</Label>
                <Input
                  placeholder={t('crons.description_placeholder')}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, isActive: checked })
                  }
                />
                <Label>{t('crons.active')}</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleSave}
                disabled={
                  !form.name.trim() || !form.prompt.trim() || !form.cron.trim()
                }
              >
                {t('common.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={runsDialogOpen} onOpenChange={setRunsDialogOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                {t('crons.runs_dialog_title')}
                {viewingCron ? ` — ${viewingCron.name}` : ''}
              </DialogTitle>
            </DialogHeader>
            <div className="max-h-[70vh] overflow-y-auto pr-1">
              {!viewingCron ||
              !viewingCron.runHistory ||
              viewingCron.runHistory.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {t('crons.runs_empty')}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {[...viewingCron.runHistory]
                    .reverse()
                    .map((record, index) => (
                      <Card
                        key={`${record.startedAt}-${index}`}
                        className="border bg-muted/20"
                      >
                        <CardContent className="flex flex-col gap-2 px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {renderRunStatus(record.status)}
                            <Badge variant="outline" className="text-xs">
                              {record.trigger === 'manual'
                                ? t('crons.runs_trigger_manual')
                                : t('crons.runs_trigger_schedule')}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {t('crons.runs_duration')}：
                              {formatDuration(
                                record.startedAt,
                                record.endedAt,
                              )}
                            </span>
                          </div>
                          <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                            <div>
                              {t('crons.runs_started_at')}：
                              {new Date(record.startedAt).toLocaleString()}
                            </div>
                            <div>
                              {t('crons.runs_ended_at')}：
                              {record.endedAt
                                ? new Date(record.endedAt).toLocaleString()
                                : '-'}
                            </div>
                          </div>
                          {record.chatId && (
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-muted-foreground">
                                {t('crons.runs_chat')}：
                              </span>
                              <Button
                                variant="link"
                                size="sm"
                                className="h-auto px-0 py-0 text-xs"
                                onClick={() => handleOpenRunChat(record.chatId)}
                              >
                                {t('crons.runs_open_chat')}
                              </Button>
                              <span className="font-mono text-muted-foreground">
                                {record.chatId.slice(0, 8)}
                              </span>
                            </div>
                          )}
                          {record.error && (
                            <div className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
                              <span className="font-medium">
                                {t('crons.runs_error')}：
                              </span>
                              {record.error}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRunsDialogOpen(false)}
              >
                {t('common.close', 'Close')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('crons.delete_title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('crons.delete_confirm')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ScrollArea>
  );
}

export default CronsPage;
