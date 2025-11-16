/* eslint-disable react/require-default-props */
import { BrainIcon, GlobeIcon, MicIcon, WrenchIcon } from 'lucide-react';
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
import {
  ChatToolSelector,
  ChatToolSelectorTrigger,
} from './chat-tool-selector';

export type ChatInputProps = Omit<PromptInputProps, 'onSubmit'> & {
  onSubmit?: (
    e: PromptInputMessage,
    model?: string,
    options?: { webSearch?: boolean },
  ) => void;
  status?: ChatStatus;
  className?: string;
  input?: string;
  setInput?: (input: string) => void;
  onAbort?: () => void;
  showMic?: boolean;
  showWebSearch?: boolean;
  showThink?: boolean;
  showModelSelect?: boolean;
  showToolSelector?: boolean;
  model?: string;
  onModelChange?: (model: string) => void;
  prompts?: string[];
};

export interface ChatInputRef {
  attachmentsClear: () => void;
  setModel: (model: string) => void;
}

export const ChatInput = React.forwardRef<ChatInputRef, ChatInputProps>(
  (props: ChatInputProps, ref: ForwardedRef<ChatInputRef>) => {
    const {
      onSubmit,
      status,
      className,
      input,
      setInput,
      onAbort,
      showMic = false,
      showWebSearch = false,
      showModelSelect = false,
      showToolSelector = false,
      showThink = false,
      model,
      onModelChange,
      prompts,
    } = props;
    const attachmentRef = useRef<ChatInputAttachmentRef>(null);

    // const [modelState, setModelState] = useState<string | undefined>(model);
    const [webSearch, setWebSearch] = useState(false);
    const [useMicrophone, setUseMicrophone] = useState<boolean>(false);
    const [think, setThink] = useState(false);
    const [tools, setTools] = useState<string[]>([]);
    // useEffect(() => {
    //   setModelState(model);
    // }, [model]);

    useImperativeHandle(ref, () => ({
      attachmentsClear: () => {
        attachmentRef.current?.clear();
      },
      setModel: (_model: string) => {
        onModelChange?.(_model);
      },
    }));

    const handleSubmit = () => {
      if (status === 'streaming') {
        onAbort?.();
      }
    };

    return (
      <PromptInputProvider>
        <PromptInput
          onSubmit={(e) => onSubmit(e, model, { webSearch })}
          className={cn('flex flex-col relative', className)}
          globalDrop
          multiple
        >
          <ChatInputAttachment ref={attachmentRef} />
          <PromptInputBody className="flex-1 h-full">
            <PromptInputTextarea
              rows={4}
              onChange={(e) => setInput?.(e.target.value)}
              value={input}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger />
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments />
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
              {showMic && (
                <PromptInputButton
                  onClick={() => setUseMicrophone(!useMicrophone)}
                  variant={useMicrophone ? 'default' : 'ghost'}
                >
                  <MicIcon size={16} />
                  <span className="sr-only">Microphone</span>
                </PromptInputButton>
              )}
              {showThink && (
                <PromptInputButton
                  variant={think ? 'default' : 'ghost'}
                  onClick={() => setThink(!think)}
                >
                  <BrainIcon size={16} />
                </PromptInputButton>
              )}
              {showWebSearch && (
                <PromptInputButton
                  variant={webSearch ? 'default' : 'ghost'}
                  onClick={() => setWebSearch(!webSearch)}
                >
                  <GlobeIcon size={16} />
                </PromptInputButton>
              )}
              {showToolSelector && (
                <ChatToolSelector value={tools} onChange={setTools}>
                  <ChatToolSelectorTrigger>
                    <PromptInputButton
                      variant={tools.length > 0 ? 'default' : 'ghost'}
                    >
                      <WrenchIcon size={16} />
                    </PromptInputButton>
                  </ChatToolSelectorTrigger>
                </ChatToolSelector>
              )}
              {showModelSelect && (
                <ChatModelSelect
                  value={model}
                  onChange={onModelChange}
                  className="max-w-[200px]"
                ></ChatModelSelect>
              )}
            </PromptInputTools>

            <PromptInputSubmit
              disabled={!input && !status}
              status={status === 'error' ? 'ready' : status}
              onClick={handleSubmit}
            />
          </PromptInputFooter>
        </PromptInput>
        {/* <div className="flex flex-wrap gap-2 w-full ">
          <Suggestions>
            {prompts?.map((prompt) => (
              <Suggestion
                key={prompt}
                suggestion={prompt}
                onClick={() => {
                  controller.textInput.setInput(prompt);
                  // setInput(prompt);
                }}
              />
            ))}
          </Suggestions>
        </div> */}
      </PromptInputProvider>
    );
  },
);

ChatInput.displayName = 'ChatInput';
