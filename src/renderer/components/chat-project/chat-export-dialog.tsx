import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconBrain,
  IconDownload,
  IconFileSpreadsheet,
  IconJson,
  IconMarkdown,
} from '@tabler/icons-react';
import type { ProjectChatExportFormat } from '@/types/project';
import { Button } from '@/renderer/components/ui/button';
import { Checkbox } from '@/renderer/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/renderer/components/ui/dialog';
import { Label } from '@/renderer/components/ui/label';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/renderer/components/ui/radio-group';
import { ScrollArea } from '@/renderer/components/ui/scroll-area';
import { Skeleton } from '@/renderer/components/ui/skeleton';
import { Spinner } from '@/renderer/components/ui/spinner';
import { cn } from '@/renderer/lib/utils';
import toast from 'react-hot-toast';

type ProjectChatExportDialogProps = {
  projectId: string;
  projectTitle?: string;
  currentThreadId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ExportThread = {
  id: string;
  title?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

const FORMAT_OPTIONS = [
  { id: 'markdown', icon: IconMarkdown, extension: 'md' },
  { id: 'json', icon: IconJson, extension: 'json' },
  { id: 'xlsx', icon: IconFileSpreadsheet, extension: 'xlsx' },
  { id: 'unsloth', icon: IconBrain, extension: 'jsonl' },
] as const;

const getSafeFilename = (value: string): string => {
  const filename = value
    .trim()
    .replace(/[<>:"/\\|?*]/g, '_')
    .split('')
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  return filename || 'project';
};

export function ProjectChatExportDialog({
  projectId,
  projectTitle,
  currentThreadId,
  open,
  onOpenChange,
}: ProjectChatExportDialogProps) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<ProjectChatExportFormat>('markdown');
  const [threads, setThreads] = useState<ExportThread[]>([]);
  const [selectedThreadIds, setSelectedThreadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    const loadThreads = async () => {
      setLoading(true);
      setError(null);
      try {
        const firstPage = await window.electron.mastra.getThreads({
          page: 0,
          size: 100,
          resourceId: `project:${projectId}`,
        });
        const remainingPageCount = Math.max(
          0,
          Math.ceil(firstPage.total / 100) - 1,
        );
        const remainingPages = await Promise.all(
          Array.from({ length: remainingPageCount }, (_, index) =>
            window.electron.mastra.getThreads({
              page: index + 1,
              size: 100,
              resourceId: `project:${projectId}`,
            }),
          ),
        );
        const items = [firstPage, ...remainingPages].flatMap(
          (result) => result.items || [],
        );
        if (!active) return;
        setThreads(items);
        setSelectedThreadIds(new Set(items.map((thread) => thread.id)));
      } catch (loadError) {
        if (!active) return;
        setThreads([]);
        setSelectedThreadIds(new Set());
        setError(
          loadError instanceof Error ? loadError.message : String(loadError),
        );
      } finally {
        if (active) setLoading(false);
      }
    };
    loadThreads();
    return () => {
      active = false;
    };
  }, [open, projectId]);

  const selectedCount = selectedThreadIds.size;
  const allSelected =
    threads.length > 0 && selectedThreadIds.size === threads.length;
  const selectedFormat = useMemo(
    () => FORMAT_OPTIONS.find((option) => option.id === format)!,
    [format],
  );
  let selectAllState: boolean | 'indeterminate' = false;
  if (allSelected) selectAllState = true;
  else if (selectedCount > 0) selectAllState = 'indeterminate';

  const toggleThread = (threadId: string, checked: boolean) => {
    setSelectedThreadIds((current) => {
      const next = new Set(current);
      if (checked) next.add(threadId);
      else next.delete(threadId);
      return next;
    });
  };

  const handleExport = async () => {
    if (selectedCount === 0 || exporting) return;
    const date = new Date().toISOString().slice(0, 10);
    const defaultFilename = `${getSafeFilename(
      projectTitle || projectId,
    )}_chat_history_${date}.${selectedFormat.extension}`;
    const saveResult = await window.electron.app.showSaveDialog({
      title: t('project.export_messages'),
      defaultPath: defaultFilename,
      filters: [
        {
          name: t(`project.export_format_${format}`),
          extensions: [selectedFormat.extension],
        },
      ],
    });
    if (saveResult.canceled || !saveResult.filePath) return;

    setExporting(true);
    try {
      const result = await window.electron.projects.exportMessages({
        projectId,
        threadIds: threads
          .filter((thread) => selectedThreadIds.has(thread.id))
          .map((thread) => thread.id),
        format,
        targetPath: saveResult.filePath,
      });
      toast.success(
        t('project.export_success', {
          threads: result.threadCount,
          messages: result.messageCount,
        }),
      );
      onOpenChange(false);
    } catch (exportError) {
      toast.error(
        t('project.export_failed', {
          error:
            exportError instanceof Error
              ? exportError.message
              : String(exportError),
        }),
      );
    } finally {
      setExporting(false);
    }
  };

  let threadListContent;
  if (loading) {
    threadListContent = (
      <div className="space-y-3 p-3" aria-label={t('common.loading')}>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-5 w-2/3" />
      </div>
    );
  } else if (error) {
    threadListContent = (
      <div className="p-4 text-sm text-destructive" role="alert">
        {error}
      </div>
    );
  } else if (threads.length === 0) {
    threadListContent = (
      <div className="p-6 text-center text-sm text-muted-foreground">
        {t('project.export_no_threads')}
      </div>
    );
  } else {
    threadListContent = (
      <ScrollArea className="h-52 w-full min-w-0 max-w-full overflow-hidden">
        <div className="w-full min-w-0 max-w-full divide-y overflow-hidden">
          {threads.map((thread) => (
            <Label
              key={thread.id}
              htmlFor={`export-thread-${thread.id}`}
              className="grid min-h-11 w-full min-w-0 max-w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] overflow-hidden px-3 py-2 hover:bg-accent/50"
            >
              <Checkbox
                id={`export-thread-${thread.id}`}
                className="shrink-0"
                checked={selectedThreadIds.has(thread.id)}
                onCheckedChange={(checked) =>
                  toggleThread(thread.id, checked === true)
                }
              />
              <span
                className="block min-w-0 truncate font-normal"
                title={thread.title || t('project.export_untitled_thread')}
              >
                {thread.title || t('project.export_untitled_thread')}
              </span>
              {thread.id === currentThreadId ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t('project.export_current_thread')}
                </span>
              ) : null}
            </Label>
          ))}
        </div>
      </ScrollArea>
    );
  }

  return (
    <Dialog open={open} onOpenChange={exporting ? undefined : onOpenChange}>
      <DialogContent className="min-w-0 overflow-x-hidden sm:max-w-2xl">
        <DialogHeader className="min-w-0">
          <DialogTitle>{t('project.export_messages')}</DialogTitle>
          <DialogDescription>
            {t('project.export_messages_description')}
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-5 overflow-x-hidden">
          <fieldset className="min-w-0 space-y-2">
            <legend className="text-sm font-medium">
              {t('project.export_format')}
            </legend>
            <RadioGroup
              value={format}
              onValueChange={(value) =>
                setFormat(value as ProjectChatExportFormat)
              }
              className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2"
            >
              {FORMAT_OPTIONS.map((option) => {
                const Icon = option.icon;
                const selected = format === option.id;
                return (
                  <Label
                    key={option.id}
                    htmlFor={`export-format-${option.id}`}
                    className={cn(
                      'min-w-0 cursor-pointer items-start rounded-lg border p-3 transition-colors hover:bg-accent/60',
                      selected && 'border-foreground/50 bg-accent',
                    )}
                  >
                    <RadioGroupItem
                      id={`export-format-${option.id}`}
                      value={option.id}
                      className="mt-0.5"
                    />
                    <Icon className="mt-0.5 size-4 shrink-0" />
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block font-medium leading-none">
                        {t(`project.export_format_${option.id}`)}
                      </span>
                      <span className="block text-xs font-normal leading-4 text-muted-foreground">
                        {t(`project.export_format_${option.id}_description`)}
                      </span>
                    </span>
                  </Label>
                );
              })}
            </RadioGroup>
          </fieldset>

          <fieldset className="min-w-0 space-y-2">
            <legend className="flex w-full items-center justify-between gap-3 text-sm font-medium">
              <span>{t('project.export_threads')}</span>
              <span className="text-xs text-muted-foreground">
                {t('project.export_selected_count', {
                  selected: selectedCount,
                  total: threads.length,
                })}
              </span>
            </legend>
            <div className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border">
              <Label
                htmlFor="export-select-all-threads"
                className="h-10 border-b px-3"
              >
                <Checkbox
                  id="export-select-all-threads"
                  checked={selectAllState}
                  disabled={loading || threads.length === 0}
                  onCheckedChange={(checked) =>
                    setSelectedThreadIds(
                      checked === true
                        ? new Set(threads.map((thread) => thread.id))
                        : new Set(),
                    )
                  }
                />
                {t('project.export_select_all')}
              </Label>

              {threadListContent}
            </div>
          </fieldset>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={exporting}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleExport}
            disabled={loading || !!error || selectedCount === 0 || exporting}
          >
            {exporting ? <Spinner /> : <IconDownload />}
            {exporting
              ? t('project.export_exporting')
              : t('project.export_action')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
