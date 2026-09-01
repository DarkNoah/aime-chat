import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  ChevronRight,
  Clock3,
  ExternalLink,
  ListChecks,
  PackageOpen,
} from 'lucide-react';
import { IconTimeline } from '@tabler/icons-react';
import toast from 'react-hot-toast';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Skeleton } from '../ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import type { Project, ProjectTimelineEntry } from '@/types/project';
import { ProjectEvent } from '@/types/project';

type ProjectTimelineViewProps = {
  project: Project;
  active: boolean;
  onThreadSelect?: (threadId: string) => void;
};

const PAGE_SIZE = 30;

const formatDuration = (durationMs: number) => {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};

export function ProjectTimelineView({
  project,
  active,
  onThreadSelect,
}: ProjectTimelineViewProps) {
  const { t, i18n } = useTranslation();
  const [enabled, setEnabled] = useState(Boolean(project.timelineEnabled));
  const [savingEnabled, setSavingEnabled] = useState(false);
  const [items, setItems] = useState<ProjectTimelineEntry[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [selectedEntry, setSelectedEntry] = useState<ProjectTimelineEntry>();

  useEffect(() => {
    setEnabled(Boolean(project.timelineEnabled));
  }, [project.id, project.timelineEnabled]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [i18n.language],
  );

  const loadTimeline = useCallback(
    async (nextPage = 0) => {
      if (!project.id || !enabled) return;
      setLoading(true);
      setError(undefined);
      try {
        const result = await window.electron.projects.getTimeline({
          projectId: project.id,
          page: nextPage,
          size: PAGE_SIZE,
        });
        setItems((current) =>
          nextPage === 0 ? result.items : [...current, ...result.items],
        );
        setPage(nextPage);
        setHasMore(result.hasMore);
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : String(loadError),
        );
      } finally {
        setLoading(false);
      }
    },
    [enabled, project.id],
  );

  useEffect(() => {
    if (active && enabled) loadTimeline(0);
  }, [active, enabled, loadTimeline]);

  useEffect(() => {
    const handleTimelineUpdated = (payload: {
      projectId?: string;
      entry?: ProjectTimelineEntry;
    }) => {
      if (payload?.projectId !== project.id || !payload.entry) return;
      setItems((current) => [
        payload.entry,
        ...current.filter((entry) => entry.id !== payload.entry?.id),
      ]);
    };
    window.electron.ipcRenderer.on(
      ProjectEvent.TimelineUpdated,
      handleTimelineUpdated,
    );
    return () => {
      window.electron.ipcRenderer.removeListener(
        ProjectEvent.TimelineUpdated,
        handleTimelineUpdated,
      );
    };
  }, [project.id]);

  const handleEnabledChange = async (nextEnabled: boolean) => {
    if (!project.id) return;
    setEnabled(nextEnabled);
    setSavingEnabled(true);
    try {
      await window.electron.projects.setTimelineEnabled(
        project.id,
        nextEnabled,
      );
      if (!nextEnabled) {
        setItems([]);
        setHasMore(false);
      }
    } catch (saveError) {
      setEnabled(!nextEnabled);
      toast.error(
        saveError instanceof Error ? saveError.message : String(saveError),
      );
    } finally {
      setSavingEnabled(false);
    }
  };

  const openThread = (threadId: string) => {
    setSelectedEntry(undefined);
    onThreadSelect?.(threadId);
  };

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border bg-background">
      <div className="flex items-start justify-between gap-4 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-medium">
            <IconTimeline className="size-4 text-primary" />
            {t('timeline.title')}
          </div>
          <p className="mt-1 max-w-[65ch] text-xs leading-5 text-muted-foreground">
            {t('timeline.description')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <label
            htmlFor="project-timeline-enabled"
            className="text-xs font-medium"
          >
            {enabled ? t('timeline.enabled') : t('timeline.disabled')}
          </label>
          <Switch
            id="project-timeline-enabled"
            checked={enabled}
            disabled={savingEnabled}
            onCheckedChange={handleEnabledChange}
            aria-label={t('timeline.toggle')}
          />
        </div>
      </div>

      {!enabled ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
            <IconTimeline className="size-5 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-medium">
            {t('timeline.disabled_title')}
          </h3>
          <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
            {t('timeline.disabled_description')}
          </p>
          <Button
            size="sm"
            className="mt-4"
            disabled={savingEnabled}
            onClick={() => handleEnabledChange(true)}
          >
            {t('timeline.enable_action')}
          </Button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading && items.length === 0 && (
            <div className="space-y-3" aria-label={t('timeline.loading')}>
              {[0, 1, 2].map((item) => (
                <div key={item} className="rounded-lg border p-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="mt-3 h-3 w-1/3" />
                  <Skeleton className="mt-4 h-3 w-full" />
                </div>
              ))}
            </div>
          )}

          {!loading && error && items.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <p className="text-sm font-medium text-destructive">
                {t('timeline.load_failed')}
              </p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                {error}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => loadTimeline(0)}
              >
                {t('common.retry')}
              </Button>
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <CalendarDays className="size-8 text-muted-foreground" />
              <h3 className="mt-3 text-sm font-medium">
                {t('timeline.empty_title')}
              </h3>
              <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                {t('timeline.empty_description')}
              </p>
            </div>
          )}

          {items.length > 0 && (
            <div className="relative space-y-3 pl-5 before:absolute before:bottom-3 before:left-[5px] before:top-3 before:w-px before:bg-border">
              {items.map((entry) => (
                <article
                  key={entry.id}
                  className="group relative rounded-lg border bg-card p-4 transition-colors hover:bg-accent/30"
                >
                  <span className="absolute -left-[18px] top-5 size-2.5 rounded-full border-2 border-background bg-primary" />
                  <button
                    type="button"
                    className="absolute inset-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onClick={() => setSelectedEntry(entry)}
                    aria-label={t('timeline.view_details', {
                      summary: entry.summary,
                    })}
                  />
                  <div className="pointer-events-none relative flex w-full items-start justify-between gap-3 text-left">
                    <h3 className="min-w-0 text-sm font-semibold leading-5 text-foreground">
                      {entry.summary}
                    </h3>
                    <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>

                  {entry.deliverables.length > 0 && (
                    <div className="pointer-events-none relative mt-3">
                      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <PackageOpen className="size-3.5" />
                        {t('timeline.deliverables')}
                      </div>
                      <ul className="space-y-1 text-xs leading-5 text-foreground/85">
                        {entry.deliverables.map((deliverable) => (
                          <li key={deliverable} className="flex gap-2">
                            <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
                            <span className="break-words">{deliverable}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="pointer-events-none relative z-10 mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="size-3" />
                        {dateFormatter.format(new Date(entry.startedAt))}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock3 className="size-3" />
                        {formatDuration(entry.durationMs)}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="pointer-events-auto h-7 px-2 text-xs"
                      onClick={(event) => {
                        event.stopPropagation();
                        openThread(entry.threadId);
                      }}
                    >
                      {t('timeline.open_thread')}
                      <ExternalLink className="size-3.5" />
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => loadTimeline(page + 1)}
              >
                {loading ? t('timeline.loading') : t('timeline.load_more')}
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog
        open={Boolean(selectedEntry)}
        onOpenChange={(open) => !open && setSelectedEntry(undefined)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {selectedEntry && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8 leading-6">
                  {selectedEntry.summary}
                </DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>
                    {dateFormatter.format(new Date(selectedEntry.startedAt))}
                  </span>
                  <span>{formatDuration(selectedEntry.durationMs)}</span>
                </DialogDescription>
              </DialogHeader>

              <section>
                <h4 className="text-sm font-medium">
                  {t('timeline.detailed_summary')}
                </h4>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/90">
                  {selectedEntry.detailedSummary}
                </p>
              </section>

              {selectedEntry.deliverables.length > 0 && (
                <section>
                  <h4 className="flex items-center gap-2 text-sm font-medium">
                    <ListChecks className="size-4" />
                    {t('timeline.deliverables')}
                  </h4>
                  <ul className="mt-2 space-y-2 text-sm leading-6">
                    {selectedEntry.deliverables.map((deliverable) => (
                      <li key={deliverable} className="flex gap-2">
                        <span className="mt-2.5 size-1 shrink-0 rounded-full bg-muted-foreground" />
                        <span>{deliverable}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <DialogFooter>
                <Button onClick={() => openThread(selectedEntry.threadId)}>
                  {t('timeline.open_thread')}
                  <ExternalLink className="size-4" />
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
