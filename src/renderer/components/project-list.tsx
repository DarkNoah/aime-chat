/* eslint-disable react/no-unstable-nested-components */
import { Skeleton } from '@/renderer/components/ui/skeleton';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { StorageThreadType } from '@mastra/core/memory';
import { Button } from '@/renderer/components/ui/button';
import {
  IconBriefcase,
  IconCode,
  IconDots,
  IconEdit,
  IconShare,
  IconTrashX,
} from '@tabler/icons-react';
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

import {
  SidebarMenuButton,
  useSidebar,
} from '@/renderer/components/ui/sidebar';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/renderer/lib/utils';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from './ui/item';
import { ScrollArea } from './ui/scroll-area';
import { ChatChangedType, ChatEvent } from '@/types/chat';
import ShinyText from './react-bits/ShinyText';
import { Shimmer } from './ai-elements/shimmer';
import { Label } from './ui/label';
import { Project, ProjectEvent } from '@/types/project';
import { ChatProjectDialog } from './chat-project/chat-project-dialog';

export type ProjectsListProps = {
  className?: string;
};

export default function ProjectsList({ className }: ProjectsListProps) {
  const [items, setItems] = useState<
    (Project & { status?: 'idle' | 'streaming'; runningThreads?: string[] })[]
  >([]);
  const {
    state,
    open,
    setOpen,
    openMobile,
    setOpenMobile,
    isMobile,
    toggleSidebar,
  } = useSidebar();
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(false);
  const pageRef = useRef(0);
  const initialLoadRef = useRef(false);
  const [openProjectDialog, setOpenProjectDialog] = useState(false);
  // const [currentId, setCurrentId] = useState<string | null>(null);

  // const [isPending, startTransition] = useTransition();
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavigation = (url: string) => {
    navigate(url);
  };

  const [projectPending, setProjectPending] = useState<Project | null>(null);
  const [projectPendingDeletion, setProjectPendingDeletion] =
    useState<Project | null>(null);

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
      const data = await window.electron.projects.getList({
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

  const onDeleteProject = async (id: string) => {
    await window.electron.projects.deleteProject(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
    const currentIdFromPath = location.pathname.split('/')[2];
    if (currentIdFromPath === id) handleNavigation('/home');
    return true;
  };

  useEffect(() => {
    const handleProjectCreated = (_data: StorageThreadType) => {
      loadMore(true);
    };
    window.electron.ipcRenderer.on(
      ProjectEvent.ProjectCreated,
      handleProjectCreated,
    );
    const handleProjectUpdated = (_data: Project) => {
      setItems((prev) =>
        prev.map((item) => (item.id === _data.id ? _data : item)),
      );
    };
    window.electron.ipcRenderer.on(
      ProjectEvent.ProjectUpdated,
      handleProjectUpdated,
    );
    if (!initialLoadRef.current) {
      initialLoadRef.current = true;
      loadMore(true);
    }

    const handleChatChanged = (event) => {
      if (event.data.type === ChatChangedType.Start) {
        setItems((prev) => {
          const index = prev.findIndex(
            (item) => item.id === event.data.resourceId.split(':')[1],
          );

          if (index === -1) {
            return prev;
          }
          const next = [...prev];

          const runningThreads = next[index].runningThreads ?? [];
          runningThreads.push(event.data.chatId);
          next[index] = {
            ...next[index],
            status: 'streaming',
            runningThreads: [...runningThreads],
          };
          return next;
        });
      } else if (event.data.type === ChatChangedType.Finish) {
        setItems((prev) => {
          const index = prev.findIndex(
            (item) => item.id === event.data.resourceId.split(':')[1],
          );
          if (index === -1) {
            return prev;
          }
          const next = [...prev];
          let runningThreads = next[index].runningThreads ?? [];
          runningThreads = runningThreads.filter(
            (thread) => thread !== event.data.chatId,
          );
          next[index] = {
            ...next[index],
            status: runningThreads.length > 0 ? 'streaming' : 'idle',
            runningThreads: [...runningThreads],
          };
          return next;
        });
      } else if (event.data.type === ChatChangedType.TitleUpdated) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === event.data.chatId
              ? { ...item, title: event.data.title }
              : item,
          ),
        );
      }
    };

    window.electron.ipcRenderer.on(ChatEvent.ChatChanged, handleChatChanged);

    return () => {
      window.electron.ipcRenderer.removeListener(
        ProjectEvent.ProjectCreated,
        handleProjectCreated,
      );
      window.electron.ipcRenderer.removeListener(
        ProjectEvent.ProjectUpdated,
        handleProjectUpdated,
      );
      window.electron.ipcRenderer.removeListener(
        ChatEvent.ChatChanged,
        handleChatChanged,
      );
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

  const handleEditProject = (item: Project) => {
    setProjectPending(item);
    setOpenProjectDialog(true);
  };

  const row = (item: Project & { status?: 'idle' | 'streaming' }) => {
    const isActive = location.pathname.startsWith(`/projects/${item.id}`);
    return (
      <div key={item.id} className="group/item mb-1 cursor-pointer">
        <SidebarMenuButton
          asChild
          isActive={isActive}
          className="truncate w-full flex flex-row justify-between h-full"
        >
          <Item
            className="truncate w-full flex flex-row justify-between items-center  flex-nowrap"
            onClick={() => handleNavigation(`/projects/${item.id}`)}
          >
            <div
              className={cn(
                'w-1 h-[20px] rounded-full',
                isActive ? 'bg-blue-500' : 'bg-transparent',
                'transition-all duration-300 ease-in-out',
              )}
            ></div>
            <ItemContent className="min-w-0">
              <ItemTitle className="line-clamp-1 w-auto flex flex-row items-center gap-1">
                {item.tag && (
                  <div>
                    {item.tag === 'code' && <IconCode size={16} />}
                    {item.tag === 'work' && <IconBriefcase size={16} />}
                  </div>
                )}

                {item?.status === 'streaming' && (
                  <Shimmer>{item.title}</Shimmer>
                )}
                {item?.status !== 'streaming' && item.title}
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
                      onSelect={() => {
                        handleEditProject(item);
                      }}
                    >
                      <IconEdit /> {t('common.edit')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => {
                        setProjectPendingDeletion(item);
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
      <ScrollArea className="flex-1 h-full pr-1 min-h-0">
        <div
          className="flex flex-col gap-1 p-2"
          style={{
            width: `calc(var(--sidebar-width) - var(--spacing) * ${isMobile ? '3' : '6'})`,
          }}
        >
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
      <ChatProjectDialog
        open={openProjectDialog}
        onOpenChange={setOpenProjectDialog}
        value={projectPending}
      ></ChatProjectDialog>
      <AlertDialog
        open={projectPendingDeletion !== null}
        onOpenChange={(_open) => {
          if (!_open) {
            setProjectPendingDeletion(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.delect_project')}</AlertDialogTitle>
            <AlertDialogDescription>
              {projectPendingDeletion?.title}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              color="red"
              className="bg-destructive"
              onClick={async (event) => {
                event.preventDefault();
                const item = projectPendingDeletion;
                if (!item) {
                  return;
                }
                const success = await onDeleteProject(item.id);
                if (success) {
                  setProjectPendingDeletion(null);
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
