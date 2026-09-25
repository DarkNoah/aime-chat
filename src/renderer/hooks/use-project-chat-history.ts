import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_TITLE } from '@/types/chat';

type HistoryThread = { id: string; title: string };

export function useProjectChatHistory(
  resourceId: string | undefined,
  open: boolean,
) {
  const [threads, setThreads] = useState<HistoryThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const generation = useRef(0);
  const activeResource = useRef<string | undefined>(undefined);
  const pending = useRef(false);
  const nextPage = useRef(0);
  const more = useRef(true);

  const load = useCallback(
    async (refresh = false) => {
      if (!resourceId || !open || activeResource.current !== resourceId) return;
      if (!refresh && (pending.current || !more.current)) return;
      if (refresh) {
        generation.current += 1;
        nextPage.current = 0;
        more.current = true;
        setHasMore(false);
        setThreads([]);
      }
      const requestGeneration = generation.current;
      const page = nextPage.current;
      pending.current = true;
      setLoading(true);
      setError(null);
      try {
        const result = await window.electron.mastra.getThreads({
          resourceId,
          page,
          size: 20,
        });
        if (requestGeneration !== generation.current) return;
        const items = result.items.map((item) => ({
          id: item.id,
          title: item.title ?? DEFAULT_TITLE,
        }));
        setThreads((previous) => {
          const existing = new Set(previous.map((item) => item.id));
          return [
            ...previous,
            ...items.filter((item) => !existing.has(item.id)),
          ];
        });
        nextPage.current = page + 1;
        more.current = result.hasMore && items.length > 0;
        setHasMore(more.current);
      } catch (cause) {
        if (requestGeneration !== generation.current) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (requestGeneration === generation.current) {
          pending.current = false;
          setLoading(false);
        }
      }
    },
    [resourceId, open],
  );

  const refresh = useCallback(() => load(true), [load]);
  const loadMore = useCallback(() => load(), [load]);

  useEffect(() => {
    activeResource.current = open ? resourceId : undefined;
    setThreads([]);
    setError(null);
    setHasMore(false);
    setLoading(false);
    refresh();
    return () => {
      activeResource.current = undefined;
      generation.current += 1;
      pending.current = false;
    };
  }, [refresh, resourceId, open]);

  return { threads, loading, error, hasMore, refresh, loadMore };
}
