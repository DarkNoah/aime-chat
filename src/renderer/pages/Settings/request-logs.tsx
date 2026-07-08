import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconLoader2,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import { Button } from '@/renderer/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/renderer/components/ui/dialog';
import { ScrollArea } from '@/renderer/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/renderer/components/ui/table';
import { useHeader } from '@/renderer/hooks/use-title';
import { RequestLogItem } from '@/types/request-log';

const formatDateTime = (iso?: string) => {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
};

const formatDuration = (durationMs?: number) => {
  if (durationMs == null) return '-';
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(2)}s`;
};

const formatJson = (value?: Record<string, unknown>) => {
  if (!value) return '-';
  return JSON.stringify(value, null, 2);
};

const formatJsonText = (value?: string | Record<string, unknown>) => {
  if (!value) return '-';
  if (typeof value !== 'string') return formatJson(value);

  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};

function DetailBlock({
  title,
  children,
}: {
  title: string;
  children?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="text-sm font-medium">{title}</div>
      <pre className="max-w-full min-w-0 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-all">
        {children || '-'}
      </pre>
    </div>
  );
}

export default function RequestLogs() {
  const { t } = useTranslation();
  const { setTitle } = useHeader();
  const [items, setItems] = useState<RequestLogItem[]>([]);
  const [selected, setSelected] = useState<RequestLogItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDetailFullscreen, setIsDetailFullscreen] = useState(false);

  setTitle(t('settings.request_logs'));

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await window.electron.requestLog.getList({
        page: 0,
        size: 100,
      });
      setItems(res.items);
    } catch (err: any) {
      setError(err?.message ?? t('settings.request_logs_load_failed'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    reload();
  }, [reload]);

  const openDetail = async (id: string) => {
    const detail = await window.electron.requestLog.getDetail(id);
    setIsDetailFullscreen(false);
    setSelected(detail);
  };

  const clearLogs = async () => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(t('settings.request_logs_clear_confirm'))) return;
    await window.electron.requestLog.clear();
    setSelected(null);
    await reload();
  };

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {t('settings.request_logs_desc')}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={isLoading}
              onClick={reload}
            >
              <IconRefresh
                className={`size-4 ${isLoading ? 'animate-spin' : ''}`}
              />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={items.length === 0}
              onClick={clearLogs}
            >
              <IconTrash className="size-4" />
              {t('settings.request_logs_clear')}
            </Button>
          </div>
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}

        {isLoading && items.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <IconLoader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('settings.request_logs_time')}</TableHead>
                  <TableHead>{t('settings.request_logs_thread_id')}</TableHead>
                  <TableHead>{t('settings.request_logs_method')}</TableHead>
                  <TableHead>{t('settings.request_logs_status')}</TableHead>
                  <TableHead>{t('settings.request_logs_duration')}</TableHead>
                  <TableHead>{t('settings.request_logs_url')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      {t('settings.request_logs_empty')}
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow
                      key={item.id}
                      className="cursor-pointer"
                      onClick={() => openDetail(item.id)}
                    >
                      <TableCell>{formatDateTime(item.start_time)}</TableCell>
                      <TableCell className="max-w-48 truncate">
                        {item.thread_id}
                      </TableCell>
                      <TableCell>{item.method}</TableCell>
                      <TableCell>{item.status_code ?? '-'}</TableCell>
                      <TableCell>{formatDuration(item.duration_ms)}</TableCell>
                      <TableCell className="max-w-[420px] truncate">
                        {item.url}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setIsDetailFullscreen(false);
          }
        }}
      >
        <DialogContent
          className={`grid grid-rows-[auto_minmax(0,1fr)] overflow-hidden ${
            isDetailFullscreen
              ? 'top-2! left-2! h-[calc(100vh-1rem)]! w-[calc(100vw-1rem)]! max-w-none! translate-x-0! translate-y-0!'
              : 'h-[90vh] w-[calc(100vw-2rem)] max-w-6xl'
          }`}
        >
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="absolute top-3 right-12 size-8"
            title={
              isDetailFullscreen
                ? t('settings.request_logs_exit_fullscreen')
                : t('settings.request_logs_fullscreen')
            }
            onClick={() => setIsDetailFullscreen((value) => !value)}
          >
            {isDetailFullscreen ? (
              <IconArrowsMinimize className="size-4" />
            ) : (
              <IconArrowsMaximize className="size-4" />
            )}
          </Button>
          <DialogHeader>
            <DialogTitle>{t('settings.request_logs_detail')}</DialogTitle>
            <DialogDescription className="break-all">
              {selected?.method} {selected?.url}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="min-h-0 pr-4">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div>
                  <div className="text-muted-foreground">
                    {t('settings.request_logs_time')}
                  </div>
                  <div>{formatDateTime(selected?.start_time)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">
                    {t('settings.request_logs_thread_id')}
                  </div>
                  <div className="break-all">{selected?.thread_id}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">
                    {t('settings.request_logs_status')}
                  </div>
                  <div>{selected?.status_code ?? '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">
                    {t('settings.request_logs_duration')}
                  </div>
                  <div>{formatDuration(selected?.duration_ms)}</div>
                </div>
              </div>

              {selected?.error && (
                <DetailBlock title={t('settings.request_logs_error')}>
                  {selected.error}
                </DetailBlock>
              )}
              <DetailBlock title={t('settings.request_logs_request_headers')}>
                {formatJsonText(selected?.request_headers)}
              </DetailBlock>
              <DetailBlock title={t('settings.request_logs_request_body')}>
                {formatJsonText(selected?.request_body)}
              </DetailBlock>
              <DetailBlock title={t('settings.request_logs_response_body')}>
                {formatJsonText(selected?.response_body)}
              </DetailBlock>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}
