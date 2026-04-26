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
import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
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

interface CronItem {
  id: string;
  name: string;
  prompt: string;
  cron: string;
  projectId?: string;
  description?: string;
  submitOptions: {
    agentId?: string;
    tools?: string[];
    subAgents?: string[];
  };
  isActive: boolean;
  lastRunAt?: string;
}
interface ChatSubmitOptions {
  model?: string;
  tools?: string[];
  subAgents?: string[];
  agentId?: string;
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

  const syncFormCron = useCallback((nextBuilder: CronBuilderState) => {
    const nextCron = getCronFromBuilder(nextBuilder);
    setBuilder(nextBuilder);
    setForm((current) => ({ ...current, cron: nextCron }));
  }, []);

  const openCreateDialog = () => {
    setEditingId(null);
    setForm(emptyForm);
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
        subAgents: form.submitOptions?.subAgents ?? [],
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
      submitOptions: {
        agentId: form.submitOptions?.agentId.trim(),
        tools: form.submitOptions?.tools ?? [],
        subAgents: form.submitOptions?.subAgents ?? [],
      },
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
    await window.electron.crons.delete(deletingId);
    setDeleteDialogOpen(false);
    setDeletingId(null);
    await loadCrons();
  };

  const handleToggleActive = async (item: CronItem) => {
    await window.electron.crons.update(item.id, { isActive: !item.isActive });
    await loadCrons();
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
            {crons.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
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
                      onClick={() => openEditDialog(item)}
                    >
                      <IconEdit size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => openDeleteDialog(item.id)}
                    >
                      <IconTrash size={14} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
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
                    onSelectedAgent={(agent) =>
                      setForm({
                        ...form,
                        submitOptions: {
                          ...form.submitOptions,
                          agentId: agent?.id,
                        },
                      })
                    }
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
