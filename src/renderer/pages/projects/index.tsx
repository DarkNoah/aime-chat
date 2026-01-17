import {
  ChatPanel,
  ChatPanelRef,
  ChatPanelSubmitOptions,
} from '@/renderer/components/chat-ui/chat-panel';
import { Button } from '@/renderer/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/renderer/components/ui/dropdown-menu';
import { Skeleton } from '@/renderer/components/ui/skeleton';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/renderer/components/ui/command';
import { useGlobal } from '@/renderer/hooks/use-global';
import { useHeader } from '@/renderer/hooks/use-title';
import { ProjectEvent } from '@/types/project';
import {
  IconClockHour3,
  IconFolder,
  IconMessage,
  IconPlus,
  IconTimeline,
  IconTrash,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ButtonGroup } from '@/renderer/components/ui/button-group';
import { PromptInputMessage } from '@/renderer/components/ai-elements/prompt-input';
import { useChat } from '@/renderer/hooks/use-chat';
import { ChatPreview } from '@/renderer/components/chat-ui/chat-preview';
import { ToolUIPart } from 'ai';
import {
  ChatPreviewData,
  ChatPreviewType,
  ChatTodo,
  ThreadState,
} from '@/types/chat';
import { eventBus } from '@/renderer/lib/event-bus';

function ProjectsPage() {
  const { id } = useParams();
  const { setTitle } = useHeader();
  const { t } = useTranslation();
  const [project, setProject] = useState<string | undefined>();
  const [threadId, setThreadId] = useState<any | undefined>();
  const chatPanelRef = useRef<ChatPanelRef>(null);
  const { ensureThread } = useChat();
  const getProject = useCallback(async () => {
    const data = await window.electron.projects.getProject(id);
    console.log(data);
    setProject(data);
    setTitle(data?.title || '');
  }, [id, setTitle]);

  useEffect(() => {
    getProject();
  }, [getProject]);

  useEffect(() => {
    // getProjects();
    setThreadId(undefined);
    const handleProjectUpdated = (data) => {
      if (id === data.id) getProject();
    };
    window.electron.ipcRenderer.on(
      ProjectEvent.ProjectUpdated,
      handleProjectUpdated,
    );
    return () => {
      window.electron.ipcRenderer.removeListener(
        ProjectEvent.ProjectUpdated,
        handleProjectUpdated,
      );
    };
  }, [getProject, id]);

  const projectResourceId = useMemo(
    () => (id ? `project:${id}` : undefined),
    [id],
  );
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [threads, setThreads] = useState<Array<{ id: string; title: string }>>(
    [],
  );
  const [previewToolPart, setPreviewToolPart] = useState<
    ToolUIPart | undefined
  >();
  const [previewData, setPreviewData] = useState<ChatPreviewData>({
    previewPanel: ChatPreviewType.CANVAS,
  });

  const getProjectThreads = useCallback(async () => {
    if (!projectResourceId) return;
    setThreadsLoading(true);
    setThreadsError(null);

    try {
      const res = await window.electron.mastra.getThreads({
        page: 0,
        size: 20,
        resourceId: projectResourceId,
      });
      setThreads(
        (res.items ?? []).map((item) => ({
          id: item.id,
          title: item.title ?? 'New Thread',
        })),
      );
    } catch (e) {
      setThreadsError(e instanceof Error ? e.message : String(e));
      setThreads([]);
    } finally {
      setThreadsLoading(false);
    }
  }, [projectResourceId]);

  const handleCreateThread = async (options) => {
    const thread = await window.electron.mastra.createThread({
      ...options,
      resourceId: projectResourceId,
    });
    console.log(thread);
    setThreadId(thread.id);
    await getProjectThreads();
    return thread;
  };

  const handleDeleteThread = async (_threadId: string) => {
    await window.electron.mastra.deleteThread(_threadId);
    // await getProjectThreads();
    if (_threadId === threadId) {
      setThreadId(undefined);
    }
    setThreads((prev) => prev.filter((p) => p.id !== _threadId));
  };

  useEffect(() => {
    if (!threadsOpen) return;
    getProjectThreads();
  }, [getProjectThreads, threadsOpen]);

  const handleSubmit = async (
    message: PromptInputMessage,
    options?: ChatPanelSubmitOptions,
  ) => {
    if (!options?.threadId) {
      const thread = await handleCreateThread(options);
      options.threadId = thread.id;
      await ensureThread(thread.id);
    }
    chatPanelRef?.current?.sendMessage(message, options);
  };
  const handleThreadChanged = (thread: ThreadState) => {
    setPreviewData((data) => {
      return {
        ...data,
        todos: thread.metadata?.todos as ChatTodo[],
      };
    });
  };

  useEffect(() => {
    if (threadId) {
      eventBus.on(`chat:onEvent:${threadId}`, (event: any) => {
        console.log('chat:onEvent', event);

        setPreviewData((data) => {
          return {
            ...data,
            previewPanel: ChatPreviewType.WEB_PREVIEW,
            webPreviewUrl: event.data?.url,
          };
        });
      });
      return () => {
        eventBus.off(`chat:onEvent:${threadId}`);
      };
    }
    return () => {};
  }, [threadId]);
  return (
    <div className="h-full w-full flex flex-row @container relative">
      <div className="absolute top-0 left-0 p-2 z-10 flex flex-row gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          className="cursor-pointer size-6 bg-muted-foreground/20 backdrop-blur"
          onClick={() => handleCreateThread({})}
        >
          <IconPlus></IconPlus>
        </Button>
        <DropdownMenu open={threadsOpen} onOpenChange={setThreadsOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="cursor-pointer size-6 bg-muted-foreground/20 backdrop-blur"
              disabled={!projectResourceId}
            >
              <IconClockHour3 size={10} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="bottom"
            align="start"
            sideOffset={8}
            className="w-72"
          >
            <Command className="rounded-none">
              <CommandInput placeholder={t('common.search')} />
              {threadsLoading && (
                <div className="px-3 py-3 space-y-2">
                  <Skeleton className="h-4 w-[80%]" />
                  <Skeleton className="h-4 w-[60%]" />
                  <Skeleton className="h-4 w-[70%]" />
                </div>
              )}
              {!threadsLoading && threadsError && (
                <div className="px-3 py-3 text-xs text-destructive">
                  {threadsError}
                </div>
              )}
              {!threadsLoading && !threadsError && (
                <CommandList className="max-h-72">
                  <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">
                    {t('common.no_data')}
                  </CommandEmpty>
                  <CommandGroup>
                    {threads.map((thread) => (
                      <CommandItem
                        key={thread.id}
                        value={`${thread.id}`}
                        keywords={[thread.title]}
                        onSelect={() => {
                          setThreadsOpen(false);
                          setThreadId(thread.id);
                        }}
                      >
                        <div className="min-w-0 w-full flex flex-row items-center justify-between">
                          <div className="flex flex-1 min-w-0 flex-row items-center gap-2">
                            <IconMessage></IconMessage>
                            <div className="truncate text-sm">
                              {thread.title}{' '}
                              {thread.id === threadId && (
                                <span className="text-xs text-muted-foreground">
                                  current
                                </span>
                              )}
                            </div>
                          </div>
                          <div>
                            <ButtonGroup>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="size-6 cursor-pointer"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDeleteThread(thread.id);
                                }}
                              >
                                <IconTrash size={8}></IconTrash>
                              </Button>
                            </ButtonGroup>
                          </div>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              )}
            </Command>
          </DropdownMenuContent>
        </DropdownMenu>
        {project?.path && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open Project Folder"
            className="cursor-pointer size-6 bg-muted-foreground/20 backdrop-blur"
            onClick={() => {
              window.electron.app.openPath(project?.path);
            }}
          >
            <IconFolder></IconFolder>
          </Button>
        )}
      </div>
      <ChatPanel
        ref={chatPanelRef}
        onSubmit={handleSubmit}
        projectId={id}
        threadId={threadId}
        className="h-full w-[500px] "
        onToolMessageClick={(_part) => {
          setShowPreview(true);
          setPreviewToolPart(_part);
          setPreviewData((data) => {
            return {
              ...data,
              previewPanel: ChatPreviewType.TOOL_RESULT,
            };
          });
        }}
        onThreadChanged={handleThreadChanged}
      ></ChatPanel>
      <div className="min-w-0 p-2 flex-1">
        <ChatPreview
          resourceId={projectResourceId}
          part={previewToolPart}
          previewData={previewData}
          onPreviewDataChange={(value) => {
            setPreviewData(value);
          }}
        />
      </div>
    </div>
  );
}

export default ProjectsPage;
