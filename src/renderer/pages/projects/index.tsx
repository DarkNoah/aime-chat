import { ThreadBrowserChannel } from '@/types/thread-browser';
import { getChatPreviewEventUpdate } from '@/renderer/lib/chat-preview-event';
import {
  ChatPanel,
  ChatPanelRef,
} from '@/renderer/components/chat-ui/chat-panel';
import { Button } from '@/renderer/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/renderer/components/ui/dropdown-menu';
import { useGlobal } from '@/renderer/hooks/use-global';
import { useHeader } from '@/renderer/hooks/use-title';
import { Project, ProjectEvent } from '@/types/project';
import {
  IconArrowBarLeft,
  IconArrowBarRight,
  IconDownload,
  IconFolderOpen,
  IconImageInPicture,
  IconPlus,
  IconSvg,
  IconTimeline,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PromptInputMessage } from '@/renderer/components/ai-elements/prompt-input';
import { useChat } from '@/renderer/hooks/use-chat';
import { ChatPreview } from '@/renderer/components/chat-ui/chat-preview';
import { ChatBrowserToggle } from '@/renderer/components/chat-ui/chat-browser-toggle';
import {
  ChatPreviewVisibility,
  useIsCompactWindow,
} from '@/renderer/components/chat-ui/chat-preview-visibility';
import { ToolUIPart } from 'ai';
import {
  ChatPreviewData,
  ChatPreviewType,
  ChatSubmitOptions,
  ChatTask,
  ChatTodo,
  ThreadState,
} from '@/types/chat';
import { eventBus } from '@/renderer/lib/event-bus';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/renderer/components/ui/resizable';
import domtoimage from 'dom-to-image';
import toast from 'react-hot-toast';
import { MoreHorizontalIcon } from 'lucide-react';
import { ProjectChatExportDialog } from '@/renderer/components/chat-project/chat-export-dialog';
import { ProjectChatHistory } from '@/renderer/components/chat-project/project-chat-history';
import type { ChatFileSelectionReference } from '@/renderer/lib/chat-file-selection';

function ProjectsPage() {
  const { id } = useParams();
  const { setTitle, setTitleAction } = useHeader();
  const { t } = useTranslation();
  const isCompactWindow = useIsCompactWindow();
  const [showPreview, setShowPreview] = useState(true);
  const [project, setProject] = useState<Project | undefined>();
  const [threadId, setThreadId] = useState<any | undefined>();
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const chatPanelRef = useRef<ChatPanelRef>(null);
  const handleAddSelectionToChat = useCallback(
    (reference: ChatFileSelectionReference) => {
      chatPanelRef.current?.insertFileSelections([reference]);
    },
    [],
  );
  const { ensureThread } = useChat();
  const getProject = useCallback(async () => {
    const data = await window.electron.projects.getProject(id);
    console.log(data);
    setProject(data);
    setTitle(data?.title || '');
    const res = await window.electron.mastra.getThreads({
      page: 0,
      size: 1,
      resourceId: `project:${id}`,
    });
    if (res.items.length > 0) {
      setThreadId(res.items[0].id);
    } else {
      setThreadId(undefined);
    }
  }, [id, setTitle]);

  useEffect(() => {
    getProject();
  }, [getProject]);

  useEffect(() => {
    // getProjects();
    // setThreadId(undefined);
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
  const { appInfo } = useGlobal();
  const [threadState, setThreadState] = useState<ThreadState | undefined>();
  const [previewToolPart, setPreviewToolPart] = useState<
    ToolUIPart | undefined
  >();
  const [previewData, setPreviewData] = useState<ChatPreviewData>({
    previewPanel: ChatPreviewType.FILE_SYSTEM,
  });

  const handleCreateThread = async (options = {}) => {
    let thread;
    const _options: any = { ...options };
    if (threadId) {
      try {
        thread = await window.electron.mastra.getThread(threadId);
      } catch {}
    }
    _options.tools ??= thread?.metadata?.tools;
    _options.subAgents ??= thread?.metadata?.subAgents;
    _options.modedId ??= thread?.metadata?.model;
    _options.agentId ??= thread?.metadata?.agentId;

    thread = await window.electron.mastra.createThread({
      ..._options,
      resourceId: projectResourceId,
    });
    console.log(thread);
    setThreadId(thread.id);
    return thread;
  };

  const handleDeleteThread = async (_threadId: string) => {
    await window.electron.mastra.deleteThread(_threadId);
    if (_threadId === threadId) {
      setThreadId(undefined);
    }
  };

  const handleSubmit = async (
    message: PromptInputMessage,
    options?: ChatSubmitOptions,
  ) => {
    if (!options?.threadId) {
      const thread = await handleCreateThread(options);
      options.threadId = thread.id;
      await ensureThread(thread.id);
    }
    chatPanelRef?.current?.sendMessage(message, options);
  };
  const handleThreadChanged = (thread: ThreadState) => {
    setThreadState(thread);
    setPreviewData((data) => {
      return {
        ...data,
        todos: thread.metadata?.todos as ChatTodo[],
        tasks: thread.metadata?.tasks as ChatTask[],
      };
    });
  };

  useEffect(() => {
    if (threadId) {
      let browserCancelled = false;
      const showBrowser = () => {
        setShowPreview(true);
        setPreviewData((data) => ({
          ...data,
          previewPanel: ChatPreviewType.WEB_PREVIEW,
        }));
      };
      const unsubscribeBrowser = window.electron.ipcRenderer.on(
        ThreadBrowserChannel.Requested,
        (event) => {
          if ((event as { threadId: string }).threadId === threadId)
            showBrowser();
        },
      );
      window.electron.browser
        ?.state(threadId)
        .then((browser) => {
          if (!browserCancelled && browser.tabs.length) showBrowser();
          return undefined;
        })
        .catch(() => undefined);
      eventBus.on(`chat:onEvent:${threadId}`, (event: any) => {
        const update = getChatPreviewEventUpdate(event, threadId);
        if (!update) return;

        setShowPreview(true);
        setPreviewData((data) => ({ ...data, ...update }));
      });
      return () => {
        browserCancelled = true;
        unsubscribeBrowser();
        eventBus.off(`chat:onEvent:${threadId}`);
      };
    }
    return () => {};
  }, [threadId]);

  useEffect(() => {
    const handleExportConversation = async (mode: 'jpg' | 'svg') => {
      try {
        const bgcolor = appInfo.shouldUseDarkColors ? '#000000' : '#ffffff';
        let dataUrl = '';
        let blob;
        if (mode === 'jpg') {
          dataUrl = await domtoimage.toJpeg(
            document.querySelector('#chat-conversation'),
            {
              bgcolor,
            },
          );
          const byteCharacters = atob(
            dataUrl.substring(dataUrl.indexOf(',') + 1),
          ); // 解码 base64
          const byteNumbers = Array.from(byteCharacters).map((ch) =>
            ch.charCodeAt(0),
          );
          const byteArray = new Uint8Array(byteNumbers);
          const mimeType = 'image/jpeg';
          blob = new Blob([byteArray], { type: mimeType });
        } else if (mode === 'svg') {
          dataUrl = await domtoimage.toSvg(
            document.querySelector('#chat-conversation'),
            {
              bgcolor,
            },
          );
          blob = new Blob([dataUrl.substring(dataUrl.indexOf(',') + 1)], {
            type: 'image/svg+xml',
          });
        }

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${threadState?.title.replaceAll(' ', '_')}_${new Date().getTime()}.${mode}`;
        link.click();
        URL.revokeObjectURL(link.href); // 释放 URL
      } catch (err) {
        toast.error('Export image failed');
        console.error(err);
      }
    };

    setTitleAction(
      <div className="flex flex-row gap-2">
        {threadId && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="More Options"
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() => {
                    if (threadState?.metadata?.workspace) {
                      window.electron.app.openPath(
                        threadState?.metadata?.workspace as string,
                      );
                    }
                  }}
                >
                  <IconFolderOpen />
                  Open Dictionary
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator></DropdownMenuSeparator>
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => setExportDialogOpen(true)}>
                  <IconDownload />
                  {t('project.export_messages')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleExportConversation('jpg')}
                >
                  <IconImageInPicture />
                  Export Jpg
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleExportConversation('svg')}
                >
                  <IconSvg />
                  Export Svg
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {!isCompactWindow && (
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t(
              showPreview
                ? 'chat.hide_preview_sidebar'
                : 'chat.show_preview_sidebar',
            )}
            onClick={() => setShowPreview((visible) => !visible)}
          >
            {showPreview ? <IconArrowBarRight /> : <IconArrowBarLeft />}
          </Button>
        )}
      </div>,
    );
  }, [
    setTitleAction,
    threadId,
    appInfo.shouldUseDarkColors,
    threadState?.title,
    threadState?.metadata?.workspace,
    isCompactWindow,
    showPreview,
    t,
  ]);

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="h-full w-full @container"
    >
      <ResizablePanel
        id="projects-chat"
        order={1}
        className="h-full  w-full justify-between min-w-[450px]"
      >
        {id && (
          <ProjectChatExportDialog
            projectId={id}
            projectTitle={project?.title}
            currentThreadId={threadId}
            open={exportDialogOpen}
            onOpenChange={setExportDialogOpen}
          />
        )}
        <div className="absolute top-12 left-0 p-2 z-10 flex flex-row gap-1 ">
          <Button
            variant="ghost"
            size="sm"
            className="cursor-pointer h-6 gap-1 px-2 text-xs bg-muted-foreground/20 backdrop-blur"
            onClick={() => handleCreateThread({})}
          >
            <IconPlus></IconPlus>
            {t('project.new_chat')}
          </Button>
          <ProjectChatHistory
            resourceId={projectResourceId}
            threadId={threadId}
            onSelect={setThreadId}
            onDelete={handleDeleteThread}
          />
        </div>
        <ChatPanel
          ref={chatPanelRef}
          onSubmit={handleSubmit}
          projectId={id}
          threadId={threadId}
          className="h-full w-full"
          inputActions={
            !isCompactWindow && (
              <ChatBrowserToggle
                key={threadId}
                threadId={threadId}
                open={showPreview}
                onToggle={() => {
                  setPreviewData((data) => ({
                    ...data,
                    previewPanel: ChatPreviewType.WEB_PREVIEW,
                  }));
                  setShowPreview((visible) => !visible);
                }}
              />
            )
          }
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
      </ResizablePanel>
      <ChatPreviewVisibility visible={showPreview}>
        <>
          <ResizableHandle withHandle />
          <ResizablePanel
            id="projects-preview"
            order={2}
            className="h-full flex-1"
          >
            <div className="min-w-0 p-2 flex-1 h-full">
              <ChatPreview
                threadId={threadId}
                resourceId={projectResourceId}
                workspace={project?.path}
                part={previewToolPart}
                onAddToChat={handleAddSelectionToChat}
                onThreadSelect={(selectedThreadId) => {
                  setThreadId(selectedThreadId);
                }}
                previewData={previewData}
                project={project}
                onProjectChanged={() => {
                  console.log('onProjectChanged');
                  getProject();
                }}
                onPreviewDataChange={(value) => {
                  setPreviewData(value);
                }}
              />
            </div>
          </ResizablePanel>
        </>
      </ChatPreviewVisibility>
    </ResizablePanelGroup>
  );
}

export default ProjectsPage;
