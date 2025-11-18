import React, { ForwardedRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { isArray, isObject, isString } from '@/utils/is';
import { Streamdown } from '../../ai-elements/streamdown';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { cn } from '@/renderer/lib/utils';

export type ChatToolResultPreviewProps = {
  title?: string;
  result?: any;
  className?: string;
};

export interface ChatToolResultPreviewRef {}

export const ChatToolResultPreview = React.forwardRef<
  ChatToolResultPreviewRef,
  ChatToolResultPreviewProps
>(
  (
    { result, title, className }: ChatToolResultPreviewProps,
    ref: ForwardedRef<ChatToolResultPreviewRef>,
  ) => {
    return (
      <Card className={cn('h-full w-full', className)}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>

          {isObject(result) && 'content' in result && isArray(result.content)
            ? result.content.map((item: any, index: number) => {
                if (item.type === 'text')
                  return (
                    <Tabs defaultValue="text">
                      <TabsList>
                        <TabsTrigger value="text">Text</TabsTrigger>
                        <TabsTrigger value="code">Code</TabsTrigger>
                      </TabsList>
                      <TabsContent value="text">
                        <Streamdown
                          key={index}
                          className="bg-secondary p-4 rounded-2xl"
                        >
                          {item.text}
                        </Streamdown>
                      </TabsContent>
                      <TabsContent value="code">
                        <pre className="text-sm break-all text-wrap bg-secondary p-4 rounded-2xl">
                          {item.text}
                        </pre>
                      </TabsContent>
                    </Tabs>
                  );
                return <div key={index}>{item.content}</div>;
              })
            : <pre className='text-warp break-all'>{result}</pre>}



        </CardContent>
      </Card>
    );
  },
);
