/* eslint-disable react/require-default-props */
import {
  BotIcon,
  BrainIcon,
  CameraIcon,
  CheckIcon,
  GlobeIcon,
  ImageIcon,
  MicIcon,
  SirenIcon,
  SquareIcon,
  WrenchIcon,
  ShieldUserIcon,
  ShieldCheck,
} from 'lucide-react';
import { ChatSlashCommand, SlashCommandDefinition } from './chat-slash-command';
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputMessage,
  // PromptInputModelSelect,
  // PromptInputModelSelectContent,
  // PromptInputModelSelectItem,
  // PromptInputModelSelectTrigger,
  // PromptInputModelSelectValue,
  PromptInputProps,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputController,
} from '../ai-elements/prompt-input';
import React, {
  ForwardedRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChatStatus } from 'ai';
import { cn } from '@/renderer/lib/utils';
import {
  ChatInputAttachment,
  ChatInputAttachmentRef,
} from '@/renderer/components/chat-ui/chat-input-attachment';

import { ChatModelSelect } from './chat-model-select';
import {
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextTrigger,
} from '../ai-elements/context';
import { Suggestion, Suggestions } from '../ai-elements/suggestion';
import { ChatToolSelector } from './chat-tool-selector';
import { IconAlertCircle, IconTrash } from '@tabler/icons-react';
import { Separator } from '../ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../ui/alert-dialog';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { ChatAgentSelector } from './chat-agent-selector';
import {
  ModelSelectorLogo,
  ModelSelectorName,
} from '../ai-elements/model-selector';
import { ChatSlashCommandConfig, GoalConfig } from '@/types/chat';
import { ChatGoal } from './chat-goal';
import { getChatInputSubmitState } from './chat-input-submit-state';
import { ToolType } from '@/types/tool';

const DRAFT_STORAGE_KEY = 'chat-input-drafts';

function getDraftMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveDraft(tid: string, value: string) {
  const drafts = getDraftMap();
  drafts[tid] = value;
  for (const key of Object.keys(drafts)) {
    if (!drafts[key]?.trim()) {
      delete drafts[key];
    }
  }
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
}

function removeDraft(tid: string) {
  const drafts = getDraftMap();
  delete drafts[tid];
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
}

export type ChatInputProps = Omit<PromptInputProps, 'onSubmit'> & {
  onSubmit?: (
    e: PromptInputMessage,
    options?: {
      model?: string;
      webSearch?: boolean;
      think?: boolean;
      tools?: string[];
      subAgents?: string[];
      requireToolApproval?: boolean;
      agentId?: string;
    },
  ) => void;
  threadId?: string;
  status?: ChatStatus;
  className?: string;
  onAbort?: () => void;
  showMic?: boolean;
  showWebSearch?: boolean;
  showThink?: boolean;
  showModelSelect?: boolean;
  showToolSelector?: boolean;
  showAgentSelector?: boolean;
  showGoal?: boolean;
  model?: string;
  onModelChange?: (model: string) => void;
  onGoalChange?: (goal: GoalConfig) => void;
  requireToolApproval?: boolean;
  onRequireToolApprovalChange?: (requireToolApproval: boolean) => void;
  prompts?: string[];
  onClearMessages?: () => void;
};

export interface ChatInputRef {
  attachmentsClear: () => void;
  clearInput: () => void;
  setInput: (input: string) => void;
  setModel: (model: string) => void;
  setTools: (toolNames: string[]) => void;
  setSubAgents: (subAgentIds: string[]) => void;
  setThink: (think: boolean) => void;
  setGoal: (goal: GoalConfig) => void;
  getTools: () => string[];
}

type ChatInputInnerProps = ChatInputProps & {
  innerRef: ForwardedRef<ChatInputRef>;
};

function ChatInputInner(props: ChatInputInnerProps) {
  const {
    innerRef,
    onSubmit,
    threadId,
    status,
    className,
    onAbort,
    showMic = false,
    showWebSearch = false,
    showModelSelect = false,
    showToolSelector = false,
    showAgentSelector = false,
    showGoal = false,
    showThink = false,
    model,
    onModelChange,
    onGoalChange,
    requireToolApproval: requireToolApprovalProp,
    onRequireToolApprovalChange,
    prompts,
    onClearMessages,
  } = props;

  const { t } = useTranslation();
  const controller = usePromptInputController();
  const attachmentRef = useRef<ChatInputAttachmentRef>(null);
  const prevThreadId = useRef(threadId);

  useEffect(() => {
    if (threadId !== prevThreadId.current) {
      const draft = threadId ? (getDraftMap()[threadId] ?? '') : '';
      controller.textInput.setInput(draft);
      prevThreadId.current = threadId;
    }
  }, [threadId, controller]);

  useEffect(() => {
    if (threadId) {
      if (controller.textInput.value) {
        saveDraft(threadId, controller.textInput.value);
      } else {
        removeDraft(threadId);
      }
    }
  }, [threadId, controller.textInput.value]);

  const [webSearch, setWebSearch] = useState(false);
  const [useMicrophone, setUseMicrophone] = useState<boolean>(false);
  const [think, setThink] = useState(false);
  const [tools, setTools] = useState<string[]>([]);
  const [subAgents, setSubAgents] = useState<string[]>([]);
  const [slashCommands, setSlashCommands] = useState<SlashCommandDefinition[]>(
    ChatSlashCommandConfig,
  );
  const [goal, setGoal] = useState<GoalConfig>({
    enable: false,
    objective: '',
    status: null,
  });
  const [requireToolApproval, setRequireToolApproval] = useState<boolean>(
    requireToolApprovalProp ?? false,
  );
  const hasPendingInput =
    Boolean(controller.textInput.value?.trim()) ||
    (controller.attachments.files?.length ?? 0) > 0;
  const submitState = getChatInputSubmitState(status, hasPendingInput);

  useEffect(() => {
    if (typeof requireToolApprovalProp === 'boolean') {
      setRequireToolApproval(requireToolApprovalProp);
    }
  }, [requireToolApprovalProp]);

  useImperativeHandle(innerRef, () => ({
    attachmentsClear: () => {
      attachmentRef.current?.clear();
    },
    clearInput: () => {
      controller.textInput.clear();
      if (threadId) {
        removeDraft(threadId);
      }
    },
    setInput: (input: string) => {
      controller.textInput.setInput(input);
    },
    setModel: (_model: string) => {
      onModelChange?.(_model);
    },
    setTools: (toolNames: string[]) => {
      setTools(toolNames ?? []);
    },
    setGoal: (_goal: GoalConfig) => {
      setGoal(_goal ?? { enable: false, objective: '', status: null });
    },
    getTools: () => {
      return tools;
    },
    setSubAgents: (subAgentIds: string[]) => {
      setSubAgents(subAgentIds ?? []);
    },
    setThink: (val: boolean) => {
      setThink(val);
    },
  }));

  const handleSubmit = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (status === 'streaming' && !hasPendingInput) {
      event.preventDefault();
      onAbort?.();
    }
  };

  const getSlashCommands = async () => {
    const commands: SlashCommandDefinition[] = [...ChatSlashCommandConfig];
    const availableTools = await window.electron.tools.getAvailableTools();

    const skills: SlashCommandDefinition[] = availableTools[ToolType.SKILL].map(
      (x) => ({
        id: x.id,
        label: x.displayName || x.name || x.id,
        description: x.description,
        group: 'skills',
      }),
    );
    commands.push(...skills);
    setSlashCommands(commands);
  };

  return (
    <>
      <ChatSlashCommand
        input=""
        onComplete={() => { }}
        onOpen={getSlashCommands}
        commands={slashCommands}
      >
        <PromptInput
          onSubmit={(e) => {
            if (status === 'streaming' && !hasPendingInput) {
              onAbort?.();
              return;
            }

            if (!hasPendingInput) {
              return;
            }

            if (
              status === 'ready' ||
              status === 'error' ||
              status === 'streaming' ||
              status === 'submitted' ||
              !status
            ) {
              onSubmit(e, {
                model,
                webSearch,
                think,
                tools,
                subAgents,
                requireToolApproval,
              });
            }
          }}
          className={cn('flex flex-col relative', className)}
          data-mcpb-drop-exclude="true"
          globalDrop
          multiple
        >
          <ChatInputAttachment ref={attachmentRef} />
          <PromptInputBody className="flex-1 h-full">
            <PromptInputTextarea rows={4} />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger />
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments
                    label={t('common.add_photos_or_files')}
                    icon={<ImageIcon className="mr-2 size-4" />}
                    onSelect={(e) => {
                      attachmentRef?.current?.openFileDialog();
                    }}
                  />
                  <PromptInputActionAddAttachments
                    label={t('common.screen_capture')}
                    icon={<CameraIcon className="mr-2 size-4" />}
                    onSelect={(e) => {
                      attachmentRef?.current?.screenCapture();
                    }}
                  />
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
              {showMic && (
                <PromptInputButton
                  size="icon-xs"
                  onClick={() => setUseMicrophone(!useMicrophone)}
                  variant={useMicrophone ? 'default' : 'ghost'}
                >
                  <MicIcon size={16} />
                  <span className="sr-only">Microphone</span>
                </PromptInputButton>
              )}
              {showThink && (
                <PromptInputButton
                  size="icon-xs"
                  variant={think ? 'default' : 'ghost'}
                  onClick={() => setThink(!think)}
                >
                  <BrainIcon size={16} />
                </PromptInputButton>
              )}
              {showWebSearch && (
                <PromptInputButton
                  size="icon-xs"
                  variant={webSearch ? 'default' : 'ghost'}
                  onClick={() => setWebSearch(!webSearch)}
                >
                  <GlobeIcon size={16} />
                </PromptInputButton>
              )}
              {showToolSelector && (
                <ChatToolSelector value={tools} onChange={setTools}>
                  <div className="relative">
                    <PromptInputButton
                      size="icon-xs"
                      variant={tools.length > 0 ? 'default' : 'ghost'}
                    >
                      <WrenchIcon size={16} />
                    </PromptInputButton>
                    <div className="absolute top-3 right-0.5 text-[9px] ">
                      {tools.length}
                    </div>
                  </div>
                </ChatToolSelector>
              )}
              {showAgentSelector && (
                <ChatAgentSelector
                  value={subAgents ?? []}
                  onChange={setSubAgents}
                  mode="multiple"
                >
                  <div className="relative">
                    <PromptInputButton
                      size="icon-xs"
                      variant={subAgents.length > 0 ? 'default' : 'ghost'}
                    >
                      <BotIcon size={16} />
                    </PromptInputButton>
                    <div className="absolute top-3 right-0.5 text-[9px] ">
                      {subAgents.length}
                    </div>
                  </div>
                </ChatAgentSelector>
              )}
              {showGoal && (
                <ChatGoal
                  value={goal}
                  onChange={(v) => {
                    setGoal(v);
                    onGoalChange?.(v);
                  }}
                >
                  <PromptInputButton
                    size="icon-xs"
                    variant={
                      goal?.enable && goal?.objective?.trim()?.length > 0
                        ? 'default'
                        : 'ghost'
                    }
                  >
                    <ShieldCheck size={16} />
                  </PromptInputButton>
                </ChatGoal>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <PromptInputButton
                    size="icon-xs"
                    variant={requireToolApproval ? 'default' : 'ghost'}
                    onClick={() => {
                      const next = !requireToolApproval;
                      setRequireToolApproval(next);
                      onRequireToolApprovalChange?.(next);
                    }}
                  >
                    <SirenIcon size={16} />
                  </PromptInputButton>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Require tool approval</p>
                </TooltipContent>
              </Tooltip>

              {showModelSelect && (
                <ChatModelSelect
                  value={model}
                  onChange={onModelChange}
                  className="max-w-[200px] @lg:w-[150px] @md:w-[100px] @sm:w-[32px] w-[32px]"
                ></ChatModelSelect>
              )}

              <Separator orientation="vertical" />
              {onClearMessages && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <PromptInputButton
                      disabled={submitState.status === 'streaming'}
                    >
                      <IconTrash size={16} />
                    </PromptInputButton>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        <div className="flex flex-row gap-2 items-center">
                          <IconAlertCircle />
                          {t('chat.clear_messages_title')}
                        </div>
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('chat.clear_messages_description')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        {t('common.cancel')}
                      </AlertDialogCancel>
                      <AlertDialogAction onClick={onClearMessages}>
                        {t('common.confirm')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </PromptInputTools>

            <PromptInputSubmit
              disabled={submitState.disabled}
              status={submitState.status}
              onClick={handleSubmit}
            />
          </PromptInputFooter>
        </PromptInput>
      </ChatSlashCommand>
      {prompts && prompts.filter((x) => x).length > 0 && (
        <div className="flex flex-wrap gap-2 w-full ">
          <Suggestions>
            {prompts
              ?.filter((x) => x)
              .map((prompt) => (
                <Suggestion key={prompt} suggestion={prompt} />
              ))}
          </Suggestions>
        </div>
      )}
    </>
  );
}

export const ChatInput = React.forwardRef<ChatInputRef, ChatInputProps>(
  (props: ChatInputProps, ref: ForwardedRef<ChatInputRef>) => {
    const initialDraft = props.threadId
      ? (getDraftMap()[props.threadId] ?? '')
      : '';

    return (
      <PromptInputProvider initialInput={initialDraft}>
        <ChatInputInner {...props} innerRef={ref} />
      </PromptInputProvider>
    );
  },
);

ChatInput.displayName = 'ChatInput';
