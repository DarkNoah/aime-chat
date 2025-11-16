/* eslint-disable react/no-unstable-nested-components */
import { Skeleton } from '@/renderer/components/ui/skeleton';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { StorageThreadType } from '@mastra/core/memory';
import { Button } from '@/renderer/components/ui/button';
import { IconDots, IconShare, IconTrashX } from '@tabler/icons-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/renderer/components/ui/dropdown-menu';
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
import { t } from 'i18next';

import { SidebarMenuButton } from '@/renderer/components/ui/sidebar';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/renderer/lib/utils';
import { Item, ItemActions, ItemContent, ItemTitle } from './ui/item';
import { ScrollArea } from './ui/scroll-area';

export type ThreadsListProps = {
  className?: string;
};

export default function ThreadsList({ className }: ThreadsListProps) {
  const [items, setItems] = useState<StorageThreadType[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(false);
  const pageRef = useRef(0);
  const initialLoadRef = useRef(false);
  // const [currentId, setCurrentId] = useState<string | null>(null);

  // const [isPending, startTransition] = useTransition();
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavigation = (url: string) => {
    navigate(url);
  };

  const [threadPendingDeletion, setThreadPendingDeletion] =
    useState<StorageThreadType | null>(null);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  const loadMore = useCallback(async (refresh: boolean = false) => {
    if (loadingRef.current && !refresh) {
      return;
    }
    if (!refresh && !hasMoreRef.current && pageRef.current !== 0) {
      return;
    }

    const currentPage = refresh ? 0 : pageRef.current;

    if (refresh) {
      pageRef.current = 0;
      setItems([]);
      setTotal(0);
      setHasMore(false);
    }

    setLoading(true);
    loadingRef.current = true;

    try {
      const data = await window.electron.mastra.getThreads({
        page: currentPage,
        size: 20,
      });
      pageRef.current = currentPage + 1;
      setTotal(data.total);
      setItems((prev) => (refresh ? data.items : [...prev, ...data.items]));
      setHasMore(data.hasMore);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  const onDeleteThread = async (id: string) => {
    await window.electron.mastra.deleteThread(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
    const currentIdFromPath = location.pathname.split('/')[2];
    if (currentIdFromPath === id) handleNavigation('/chat');
    return true;
  };

  useEffect(() => {
    const handleThreadCreated = (_data: StorageThreadType) => {
      loadMore(true);
    };
    window.electron.ipcRenderer.on(
      'mastra:thread-created',
      handleThreadCreated,
    );
    const handleThreadUpdated = (data: StorageThreadType) => {
      setItems((prev) =>
        prev.map((item) => (item.id === data.id ? data : item)),
      );
    };

    window.electron.ipcRenderer.on(
      'mastra:thread-updated',
      handleThreadUpdated,
    );
    if (!initialLoadRef.current) {
      initialLoadRef.current = true;
      loadMore(true);
    }
    return () => {
      window.electron.ipcRenderer.removeListener(
        'mastra:thread-created',
        handleThreadCreated,
      );
      window.electron.ipcRenderer.removeListener(
        'mastra:thread-updated',
        handleThreadUpdated,
      );
      // emitter.off('threads:created', handleThreadCreated);
    };
  }, [loadMore]);

  useEffect(() => {
    if (!hasMore) {
      return;
    }
    const container = containerRef.current;
    const sentinel = sentinelRef.current;
    if (!container || !sentinel) {
      return;
    }
    const viewport = container.querySelector<HTMLDivElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (!viewport) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) {
          return;
        }
        if (!hasMoreRef.current) {
          return;
        }
        if (loadingRef.current) {
          return;
        }
        loadMore();
      },
      {
        root: viewport,
        rootMargin: '0px 0px 120px 0px',
      },
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [hasMore, loadMore]);

  const loader = () => {
    return (
      <div className="px-2 py-1">
        <div className="p-2 flex flex-col gap-2">
          <Skeleton className="h-4 w-[80%]" />
          <Skeleton className="h-4 w-[60%]" />
        </div>
      </div>
    );
  };

  const row = (item: StorageThreadType) => {
    return (
      <div key={item.id} className="group/item mb-1 cursor-pointer">
        <SidebarMenuButton
          asChild
          isActive={location.pathname.startsWith(`/chat/${item.id}`)}
          className="truncate w-full flex flex-row justify-between h-full"
        >
          <Item
            className="truncate w-full flex flex-row justify-between  flex-nowrap"
            onClick={() => handleNavigation(`/chat/${item.id}`)}
          >
            <ItemContent className="min-w-0">
              <ItemTitle className="line-clamp-1 w-auto">
                {item.title}
              </ItemTitle>
            </ItemContent>
            <ItemActions>
              <div className="opacity-0 group-hover/item:opacity-100 transition-opacity duration-200">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-6 cursor-pointer border"
                    >
                      <IconDots></IconDots>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="bottom"
                    align="end"
                    sideOffset={8}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      <IconShare /> {t('common.share')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => {
                        setThreadPendingDeletion(item);
                      }}
                    >
                      <IconTrashX /> {t('common.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </ItemActions>
          </Item>
        </SidebarMenuButton>
      </div>
    );
  };

  const isEmpty = !loading && items.length === 0;

  return (
    <div
      ref={containerRef}
      className={cn('flex flex-col min-h-0 h-full', className)}
    >
      <ScrollArea className="flex-1 h-full pr-1 ">
        <div className="flex flex-col gap-1 p-2 w-[calc(var(--sidebar-width)-var(--spacing)*4)]">
          {items.map((item) => row(item))}
          {loading && loader()}
          {isEmpty && (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              {t('common.no_data')}
            </div>
          )}
          <div ref={sentinelRef} className="h-1 w-full" />
        </div>
      </ScrollArea>
      <AlertDialog
        open={threadPendingDeletion !== null}
        onOpenChange={(open) => {
          if (!open) {
            setThreadPendingDeletion(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.delect_chat')}</AlertDialogTitle>
            <AlertDialogDescription>
              {threadPendingDeletion?.title}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              color="red"
              className="bg-destructive"
              onClick={async (event) => {
                event.preventDefault();
                const item = threadPendingDeletion;
                if (!item) {
                  return;
                }
                const success = await onDeleteThread(item.id);
                if (success) {
                  setThreadPendingDeletion(null);
                }
              }}
            >
              <IconTrashX /> {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
