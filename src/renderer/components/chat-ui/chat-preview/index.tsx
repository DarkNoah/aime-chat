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

export type ChatPreviewProps = {};

export interface ChatPreviewRef {}

export const ChatPreview = React.forwardRef<ChatPreviewRef, ChatPreviewProps>(
  (props: ChatPreviewProps, ref: ForwardedRef<ChatPreviewRef>) => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(
      'https://www.baidu.com',
    );
    return (
      <div className="h-full w-full">
        <Tabs defaultValue="account">
          <TabsList>
            <TabsTrigger value="webPreview">Web Preview</TabsTrigger>
            <TabsTrigger value="canvas">Canvas</TabsTrigger>
          </TabsList>
          <TabsContent value="webPreview">
            <div className="flex-1 mb-4 h-[600px]">
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
          </TabsContent>
          <TabsContent value="canvas" className="h-[600px]">
            <div>
              <ChatCanvas className="h-[600px] w-full"></ChatCanvas>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    );
  },
);
