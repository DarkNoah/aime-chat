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

export type ChatPreviewProps = {
  part?: ToolUIPart;
};

export interface ChatPreviewRef {}

export enum PreviewType {
  WEB_PREVIEW = 'webPreview',
  CANVAS = 'canvas',
  TOOL_RESULT = 'tool-result',
}

// type PreviewType = 'webPreview' | 'canvas' | 'tool-result';

export const ChatPreview = React.forwardRef<ChatPreviewRef, ChatPreviewProps>(
  (props: ChatPreviewProps, ref: ForwardedRef<ChatPreviewRef>) => {
    const { part } = props;
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
            aria-label="Toggle star"
            className="data-[state=off]:bg-transparent bg-secondary "
          >
            Web Preview
          </ToggleGroupItem>
          <ToggleGroupItem
            value={PreviewType.CANVAS}
            aria-label="Toggle heart"
            className="data-[state=off]:bg-transparent bg-secondary "
          >
            Canvas
          </ToggleGroupItem>
          <ToggleGroupItem
            value={PreviewType.TOOL_RESULT}
            aria-label="Toggle bookmark"
            className="data-[state=off]:bg-transparent bg-secondary "
          >
            Tool Result
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="flex-1 h-full">
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
            className={`h-full ${previewType === PreviewType.TOOL_RESULT ? '' : 'hidden'}`}
          >
            <ChatToolResultPreview result={part?.output} title="Tool Result" />
          </div>
        </div>
      </div>
    );
  },
);
