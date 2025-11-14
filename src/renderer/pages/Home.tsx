/* eslint-disable react/no-array-index-key */
import { Fragment, useRef, useState } from 'react';
import { AppSidebar } from '../components/app-sidebar';
import { ChatModelSelect } from '../components/chat-ui/chat-model-select';
import { Button } from '../components/ui/button';
import { SidebarInset, SidebarProvider } from '../components/ui/sidebar';
import { CircleStop, HomeIcon, MessageSquareIcon } from 'lucide-react';
import { Suggestion, Suggestions } from '../components/ai-elements/suggestion';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { ChatInput, ChatInputRef } from '../components/chat-ui/chat-input';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '../components/ai-elements/conversation';
import { Loader } from '../components/ai-elements/loader';
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '../components/ai-elements/sources';
import {
  Message,
  MessageAttachment,
  MessageAttachments,
  MessageContent,
  MessageResponse,
} from '../components/ai-elements/message';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '../components/ai-elements/reasoning';

import { Response } from '../components/ai-elements/response';
import { useChat } from '@ai-sdk/react';
import { ChatOnErrorCallback, DefaultChatTransport } from 'ai';
import { toast } from 'sonner';
import { PromptInputMessage } from '../components/ai-elements/prompt-input';
import { Streamdown } from '../components/ai-elements/streamdown';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '../components/ui/resizable';
import { useNavigate } from 'react-router-dom';

function Home() {
  const [input, setInput] = useState('');
  const chatInputRef = useRef<ChatInputRef>(null);
  const [showWebPreview, setShowWebPreview] = useState(false);
  const [webPreviewUrl, setWebPreviewUrl] = useState<string>('');
  const [runId, setRunId] = useState<string | undefined>();
  const navigate = useNavigate();

  const prompts = ['介绍日食,请创建课程', '讲述黑洞的形成过程,请创建课程'];
  const {
    messages,
    setMessages,
    sendMessage,
    status,
    error,
    stop,
    clearError,
  } = useChat({
    transport: new DefaultChatTransport({
      api: 'http://localhost:4133/api/chat',

      prepareSendMessagesRequest: (data) => {
        console.log(data);
        return {
          body: {
            id: data.id,
            messages: data.messages,
            ...data.body,
          },
        };
      },
    }),

    onFinish: (message) => {
      console.log(message);
      // debugger;
    },
    onData: (dataPart) => {
      console.log(dataPart);

      if (dataPart.type === 'data-workflow-step-suspended') {
        const { runId } = dataPart.data as { runId: string };
        setRunId(runId);
      }
    },
    onError: (error) => {
      console.error(error);
      toast.error(error.message);
      // clearError();
    },
  });

  const handleSubmit = async (
    message: PromptInputMessage,
    model?: string,
    options?: { webSearch?: boolean },
  ) => {
    const hasText = Boolean(message.text);
    const hasAttachments = Boolean(message.files?.length);

    if (!(hasText || hasAttachments)) {
      return;
    }
    if (!model) {
      toast.error('Please select a model');
      return;
    }
    function blobToBase64(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result); // result 是 base64 编码字符串
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
    clearError();

    for (const file of message.files || []) {
      const response = await fetch(file.url);
      const blob = await response.blob();
      file.url = (await blobToBase64(blob)) as string;
    }

    // if (chat) {
    //   navigate(`/chat/${chat.id}?mode=${mode}`, {
    //     state: { message: { text, attachments } },
    //   });
    // }

    sendMessage(
      {
        text: message.text || 'Sent with attachments',
        files: message.files,
      },
      {
        body: {
          model: model,
          webSearch: options?.webSearch,
          runId,
        },
      },
    );
    setInput('');
    chatInputRef.current?.attachmentsClear();
  };

  const handleAbort = () => {
    console.log('handleAbort');
    stop();
    setMessages([]);
    setShowWebPreview(false);
  };

  return (
    <div className="h-[calc(100vh-var(--header-height)-var(--spacing)*4)]  w-full flex flex-col justify-between">
      <Conversation className="h-full w-full flex-1 overflow-y-auto flex items-center justify-center">
        <ConversationContent className="h-full">
          {messages.length === 0 && (
            <ConversationEmptyState
              description="Messages will appear here as the conversation progresses."
              icon={<MessageSquareIcon className="size-6" />}
              title="Start a conversation"
              className="h-full"
            />
          )}

          {messages.length > 0 && (
            <div>
              {messages.map((message) => {
                return (
                  <div key={message.id} className="flex flex-col gap-2">
                    {message.role === 'assistant' &&
                      message.parts.filter((part) => part.type === 'source-url')
                        .length > 0 && (
                        <Sources key={message.id}>
                          <SourcesTrigger
                            count={
                              message.parts.filter(
                                (part) => part.type === 'source-url',
                              ).length
                            }
                          />
                          {message.parts
                            .filter((part) => part.type === 'source-url')
                            .map((part, i) => (
                              <SourcesContent key={`${message.id}-${i}`}>
                                <Source
                                  key={`${message.id}-${i}`}
                                  href={part.url}
                                  title={part.url}
                                />
                              </SourcesContent>
                            ))}
                        </Sources>
                      )}
                    {message?.parts?.map((part, i) => {
                      if (part.type === 'reasoning')
                        return (
                          <Reasoning
                            key={`${message.id}-${i}`}
                            className="w-fit"
                            isStreaming={status === 'streaming'}
                          >
                            <ReasoningTrigger />
                            <ReasoningContent className="whitespace-pre-wrap">
                              {part.text}
                            </ReasoningContent>
                          </Reasoning>
                        );
                      else if (part.type === 'text' && part.text.trim()) {
                        return (
                          <Fragment key={`${message.id}-${i}`}>
                            <Message from={message.role}>
                              <MessageContent>
                                <MessageResponse>{part.text}</MessageResponse>
                              </MessageContent>
                            </Message>
                          </Fragment>
                        );
                      }
                      return null;
                      // if (part.type === 'text' && part.text.trim()) {
                      //   // <Fragment key={`${message.id}-${i}`}>
                      //   //   <Message from={message.role}>
                      //   //     <MessageContent>
                      //   //       <MessageResponse>{part.text}</MessageResponse>
                      //   //     </MessageContent>
                      //   //   </Message>
                      //   // </Fragment>;
                      //   return part.text;
                      // } else if (part.type === 'reasoning') {
                      //   <Reasoning
                      //     key={`${message.id}-${i}`}
                      //     className="w-fit"
                      //     isStreaming={
                      //       status === 'streaming' &&
                      //       i === message.parts.length - 1 &&
                      //       message.id === messages.at(-1)?.id
                      //     }
                      //   >
                      //     <ReasoningTrigger />
                      //     <ReasoningContent className="whitespace-pre-wrap">
                      //       {part.text}
                      //     </ReasoningContent>
                      //   </Reasoning>;
                      // }
                      // return JSON.stringify(part);
                      // switch (part.type) {
                      //   case 'text':
                      //     if (part.text.trim()) {

                      //     }
                      //     return null;
                      //   case 'file':
                      //     if (part.mediaType?.startsWith('image/')) {
                      //       return (
                      //         <div
                      //           key={`${message.id}-image-${i}`}
                      //           className={`w-full flex ${
                      //             message.role === 'user'
                      //               ? 'items-end justify-end'
                      //               : ''
                      //           }`}
                      //         >
                      //           <img
                      //             src={part.url}
                      //             width={300}
                      //             height={300}
                      //             alt={`attachment-${i}`}
                      //           />
                      //         </div>
                      //       );
                      //     } else if (part.mediaType === 'application/pdf') {
                      //       return (
                      //         <iframe
                      //           key={`${message.id}-pdf-${i}`}
                      //           src={part.url}
                      //           width={500}
                      //           height={600}
                      //           title={`pdf-${i}`}
                      //           className={`w-full flex ${
                      //             message.role == 'user'
                      //               ? 'items-end justify-end'
                      //               : ''
                      //           }`}
                      //         />
                      //       );
                      //     } else return null;
                      //   case 'reasoning':
                      //     return (
                      //       <Reasoning
                      //         key={`${message.id}-${i}`}
                      //         className="w-fit"
                      //         isStreaming={
                      //           status === 'streaming' &&
                      //           i === message.parts.length - 1 &&
                      //           message.id === messages.at(-1)?.id
                      //         }
                      //       >
                      //         <ReasoningTrigger />
                      //         <ReasoningContent className="whitespace-pre-wrap">
                      //           {part.text}
                      //         </ReasoningContent>
                      //       </Reasoning>
                      //     );
                      //   default:
                      //     if (part.type.startsWith('tool-')) {
                      //       return <div></div>;
                      //     }
                      //     return <div></div>;
                      // }
                    })}
                  </div>
                );
              })}
            </div>
          )}
          {status === 'submitted' && <Loader className="animate-spin" />}
          {error && (
            <Alert variant="destructive" className="bg-red-200 w-fit">
              <AlertTitle className="font-extrabold">Error</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="w-full px-4 pb-4 flex flex-col gap-2 ">
        <ChatInput
          showModelSelect
          showWebSearch
          ref={chatInputRef}
          input={input}
          setInput={setInput}
          onSubmit={handleSubmit}
          onAbort={handleAbort}
          status={status}
          className="flex-1 h-full"
        ></ChatInput>
        {/* <div className="flex flex-wrap gap-2 w-full ">
            <Suggestions>
              {prompts.map((prompt) => (
                <Suggestion
                  key={prompt}
                  suggestion={prompt}
                  onClick={() => setInput(prompt)}
                />
              ))}
            </Suggestions>
          </div> */}
      </div>
    </div>

    // <div className="flex w-full h-full flex-col items-center justify-between pb-4 gap-2">

    // </div>
  );
}

export default Home;
