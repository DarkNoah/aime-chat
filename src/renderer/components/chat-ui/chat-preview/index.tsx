/* eslint-disable no-nested-ternary */
import React, { ForwardedRef, useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { ChatCanvas } from '../chat-canvas';
import {
  WebPreview,
  WebPreviewBody,
  WebPreviewNavigation,
  WebPreviewUrl,
} from '../../ai-elements/web-preview';
import { Loader } from '../../ai-elements/loader';
import { ToggleGroup, ToggleGroupItem } from '../../ui/toggle-group';
import { ChatToolResultPreview } from './chat-tool-result-preview';
import { ToolUIPart } from 'ai';
import { Streamdown } from '../../ai-elements/streamdown';
import { ChatTodoList } from './chat-todo-list';
import { Button } from '../../ui/button';
import { ChatPreviewType, ChatPreviewData } from '@/types/chat';
import { IconCheckbox, IconListCheck, IconWorldWww } from '@tabler/icons-react';

export type ChatPreviewProps = {
  part?: ToolUIPart;
  messages?: any;
  previewData?: ChatPreviewData;
  onPreviewDataChange?: (previewData: ChatPreviewData) => void;
};

export interface ChatPreviewRef {}

// type PreviewType = 'webPreview' | 'canvas' | 'tool-result';

export const ChatPreview = React.forwardRef<ChatPreviewRef, ChatPreviewProps>(
  (props: ChatPreviewProps, ref: ForwardedRef<ChatPreviewRef>) => {
    const { part, messages, previewData, onPreviewDataChange } = props;
    const [isGenerating, setIsGenerating] = useState(false);
    // const [previewUrl, setPreviewUrl] = useState<string | null>(
    //   previewData?.webPreviewUrl ?? 'about:blank',
    // );
    const [urlInputValue, setUrlInputValue] = useState<string | null>(
      'about:blank',
    );

    useEffect(() => {
      // setPreviewUrl(previewData?.webPreviewUrl ?? 'about:blank');
      setUrlInputValue(previewData?.webPreviewUrl ?? 'about:blank');
    }, [previewData?.webPreviewUrl]);

    // const [previewType, setPreviewType] = useState<ChatPreviewType>(
    //   ChatPreviewType.TOOL_RESULT,
    // );
    return (
      <div className="h-full w-full flex flex-col gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={2}
          size="sm"
          value={previewData?.previewPanel}
          onValueChange={(value) =>
            onPreviewDataChange?.((prev) => {
              return {
                ...prev,
                previewPanel: value as ChatPreviewType,
              };
            })
          }
        >
          <ToggleGroupItem
            value={ChatPreviewType.TODO}
            size="sm"
            className="data-[state=off]:bg-transparent bg-secondary "
          >
            <IconListCheck />
            Todo List
          </ToggleGroupItem>
          <ToggleGroupItem
            value={ChatPreviewType.WEB_PREVIEW}
            size="sm"
            className="data-[state=off]:bg-transparent bg-secondary "
          >
            <IconWorldWww />
            Web Preview
          </ToggleGroupItem>
          <ToggleGroupItem
            value={ChatPreviewType.CANVAS}
            className="data-[state=off]:bg-transparent bg-secondary "
          >
            Canvas
          </ToggleGroupItem>
          <ToggleGroupItem
            value={ChatPreviewType.TOOL_RESULT}
            className="data-[state=off]:bg-transparent bg-secondary "
          >
            Tool Result
          </ToggleGroupItem>
          <ToggleGroupItem
            value={ChatPreviewType.MESSAGES}
            className="data-[state=off]:bg-transparent bg-secondary "
          >
            Messages
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="flex-1 h-full min-h-0">
          <div
            className={`h-full ${previewData.previewPanel === ChatPreviewType.WEB_PREVIEW ? '' : 'hidden'}`}
          >
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center h-full">
                <Loader />
                <p className="mt-4 text-muted-foreground">
                  Generating app, this may take a few seconds...
                </p>
              </div>
            ) : previewData?.webPreviewUrl ? (
              <WebPreview defaultUrl={previewData?.webPreviewUrl}>
                <WebPreviewNavigation>
                  <WebPreviewUrl
                    value={urlInputValue}
                    onChange={(e) => setUrlInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        // setPreviewUrl(urlInputValue);
                        onPreviewDataChange?.((prev) => {
                          return {
                            ...prev,
                            webPreviewUrl: urlInputValue,
                          };
                        });
                      }
                    }}
                  />
                </WebPreviewNavigation>
                <WebPreviewBody src={previewData?.webPreviewUrl} />
              </WebPreview>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Your generated app will appear here
              </div>
            )}
          </div>

          <div
            className={`h-full ${previewData.previewPanel === ChatPreviewType.CANVAS ? '' : 'hidden'}`}
          >
            <ChatCanvas></ChatCanvas>
          </div>

          <div
            className={`h-full ${previewData.previewPanel === ChatPreviewType.TODO ? '' : 'hidden'}`}
          >
            <ChatTodoList todos={previewData?.todos}></ChatTodoList>
          </div>

          <div
            className={`h-full overflow-y-auto ${previewData.previewPanel === ChatPreviewType.TOOL_RESULT ? '' : 'hidden'}`}
          >
            <ChatToolResultPreview
              part={part}
              title={part?.type?.split('-').slice(1).join('-')}
            />
          </div>
          <div
            className={`h-full ${previewData.previewPanel === ChatPreviewType.MESSAGES ? '' : 'hidden'}`}
          >
            <pre className="text-wrap">
              {JSON.stringify(previewData, null, 2)}
            </pre>
            {messages && (
              <pre className="whitespace-pre-wrap break-all p-4 bg-secondary rounded-2xl h-full overflow-y-auto text-xs">
                {JSON.stringify(messages, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </div>
    );
  },
);
