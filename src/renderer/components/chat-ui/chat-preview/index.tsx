/* eslint-disable no-nested-ternary */
import React, { ForwardedRef, useState } from 'react';
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

export type ChatPreviewProps = {
  part?: ToolUIPart;
  messages?: any;
};

export interface ChatPreviewRef {}

export enum PreviewType {
  WEB_PREVIEW = 'webPreview',
  CANVAS = 'canvas',
  TOOL_RESULT = 'tool-result',
  MESSAGES = 'messages',
}

// type PreviewType = 'webPreview' | 'canvas' | 'tool-result';

export const ChatPreview = React.forwardRef<ChatPreviewRef, ChatPreviewProps>(
  (props: ChatPreviewProps, ref: ForwardedRef<ChatPreviewRef>) => {
    const { part, messages } = props;
    const [isGenerating, setIsGenerating] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(
      'https://www.baidu.com',
    );
    const [previewType, setPreviewType] = useState<PreviewType>(
      PreviewType.TOOL_RESULT,
    );
    return (
      <div className="h-full w-full flex flex-col gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={2}
          size="sm"
          value={previewType}
          onValueChange={(value) => setPreviewType(value as PreviewType)}
        >
          <ToggleGroupItem
            value={PreviewType.WEB_PREVIEW}
            className="data-[state=off]:bg-transparent bg-secondary "
          >
            Web Preview
          </ToggleGroupItem>
          <ToggleGroupItem
            value={PreviewType.CANVAS}
            className="data-[state=off]:bg-transparent bg-secondary "
          >
            Canvas
          </ToggleGroupItem>
          <ToggleGroupItem
            value={PreviewType.TOOL_RESULT}
            className="data-[state=off]:bg-transparent bg-secondary "
          >
            Tool Result
          </ToggleGroupItem>
          <ToggleGroupItem
            value={PreviewType.MESSAGES}
            className="data-[state=off]:bg-transparent bg-secondary "
          >
            Messages
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="flex-1 h-full min-h-0">
          <div
            className={`h-full ${previewType === PreviewType.WEB_PREVIEW ? '' : 'hidden'}`}
          >
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center h-full">
                <Loader />
                <p className="mt-4 text-muted-foreground">
                  Generating app, this may take a few seconds...
                </p>
              </div>
            ) : previewUrl ? (
              <WebPreview defaultUrl={previewUrl}>
                <WebPreviewNavigation>
                  <WebPreviewUrl />
                </WebPreviewNavigation>
                <WebPreviewBody src={previewUrl} />
              </WebPreview>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Your generated app will appear here
              </div>
            )}
          </div>

          <div
            className={`h-full ${previewType === PreviewType.CANVAS ? '' : 'hidden'}`}
          >
            <ChatCanvas></ChatCanvas>
          </div>

          <div
            className={`h-full overflow-y-auto ${previewType === PreviewType.TOOL_RESULT ? '' : 'hidden'}`}
          >
            <ChatToolResultPreview
              part={part}
              title={part?.type?.split('-').slice(1).join('-')}
            />
          </div>
          <div
            className={`h-full ${previewType === PreviewType.MESSAGES ? '' : 'hidden'}`}
          >
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
