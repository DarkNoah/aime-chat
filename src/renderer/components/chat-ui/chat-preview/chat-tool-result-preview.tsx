/* eslint-disable camelcase */
import React, { ForwardedRef, useCallback, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { isArray, isObject, isString } from '@/utils/is';
import { Streamdown } from '../../ai-elements/streamdown';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { cn } from '@/renderer/lib/utils';
import { Alert, AlertTitle } from '../../ui/alert';
import { AlertCircleIcon } from 'lucide-react';
import { ToolUIPart } from 'ai';
import { Label } from '../../ui/label';
import { CodeBlock } from '../../ai-elements/code-block';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { IconFile } from '@tabler/icons-react';
import { Source, Sources, SourcesContent } from '../../ai-elements/sources';
import { Item, ItemContent, ItemDescription, ItemTitle } from '../../ui/item';
import ReactDiffViewer from 'react-diff-viewer';
import { useTheme } from 'next-themes';
import {
  ChatMessageAttachment,
  ChatMessageAttachments,
} from '../chat-message-attachment';
import { ChatToolGenerateImagePreview } from './chat-tool-generate-image-preview';
import { ChatToolBashPreview } from './chat-tool-bash-preview';

export type ChatToolResultPreviewProps = {
  title?: string;
  part?: ToolUIPart;
  className?: string;
};

export interface ChatToolResultPreviewRef {}

export const ChatToolResultPreview = React.forwardRef<
  ChatToolResultPreviewRef,
  ChatToolResultPreviewProps
>(
  (
    { part, title, className }: ChatToolResultPreviewProps,
    ref: ForwardedRef<ChatToolResultPreviewRef>,
  ) => {
    const toolName = part?.type?.split('-').slice(1).join('-');
    const { theme } = useTheme();
    const renderResult = () => {
      if (!part?.output) return null;
      if (toolName === 'WebSearch') {
        return (
          <div className="flex flex-col gap-2">
            {part.output?.map((source: any, index: number) => (
              <Item
                variant="outline"
                key={`${source.href}-${index}`}
                className="cursor-pointer"
              >
                <ItemContent
                  onClick={() => {
                    if (source.href) window.open(source.href, '_blank');
                  }}
                >
                  <ItemTitle>{source.title}</ItemTitle>
                  <ItemDescription>{source.snippet}</ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </div>
        );
      }
      if (toolName === 'Bash') {
        return null;
      }
      if (
        isObject(part?.output) &&
        'content' in part.output &&
        isArray(part.output.content)
      ) {
        return (
          <Tabs defaultValue="code">
            <TabsList>
              <TabsTrigger value="code">Code</TabsTrigger>
              <TabsTrigger value="text">Text</TabsTrigger>
            </TabsList>
            <TabsContent value="code">
              {part.output.content
                .filter((item: any) => item.type === 'text')
                .map((item: any, index: number) => {
                  return (
                    <pre className="text-sm break-all text-wrap bg-secondary p-4 rounded-2xl">
                      {item.text}
                    </pre>
                  );
                })}
              <ChatMessageAttachments className="mt-2 ml-0">
                {part.output.content
                  .filter((item: any) => item.type === 'image')
                  .map((p, i) => {
                    return (
                      <ChatMessageAttachment
                        data={p}
                        key={`${part.toolCallId}-image-${i}`}
                      />
                    );
                  })}
              </ChatMessageAttachments>
            </TabsContent>
            <TabsContent value="text">
              {part.output.content
                .filter((item: any) => item.type === 'text')
                .map((item: any, index: number) => {
                  return (
                    <Streamdown
                      key={index}
                      className="bg-secondary p-4 rounded-2xl"
                    >
                      {item.text}
                    </Streamdown>
                  );
                })}
            </TabsContent>
          </Tabs>
        );
      } else if (isString(part.output)) {
        return (
          <Tabs defaultValue="code">
            <TabsList>
              <TabsTrigger value="code">Code</TabsTrigger>
              <TabsTrigger value="text">Text</TabsTrigger>
            </TabsList>
            <TabsContent value="text">
              <Streamdown className="bg-secondary p-4 rounded-2xl  text-wrap break-all">
                {part.output}
              </Streamdown>
            </TabsContent>
            <TabsContent value="code">
              <pre className="text-sm break-all text-wrap bg-secondary p-4 rounded-2xl">
                {part.output}
              </pre>
            </TabsContent>
          </Tabs>
        );
      } else if (
        isObject(part.output) &&
        'code' in part.output &&
        part.output.code === 'TOOL_EXECUTION_FAILED'
      ) {
        return (
          <Alert variant="destructive" className="bg-muted">
            <AlertCircleIcon />
            <AlertTitle>{part.output.message}</AlertTitle>
          </Alert>
        );
      }
      return (
        <>
          <Label>Output</Label>
          <pre className="text-sm break-all text-wrap bg-secondary p-4 rounded-2xl">
            {JSON.stringify(part.output, null, 2)}
          </pre>
        </>
      );
    };

    const renderInput = useCallback(() => {
      if (!part?.input) return null;
      switch (toolName) {
        case 'PythonExecute':
        case 'CodeExecution':
          return (
            <>
              {part?.input?.packages && (
                <div className="flex flex-row gap-2 flex-wrap">
                  {part?.input?.packages?.map((p) => {
                    return <Badge variant="secondary">{p}</Badge>;
                  })}
                </div>
              )}

              {part?.input.code && (
                <Streamdown>
                  {`\`\`\`python\n${part?.input.code}\n\`\`\``}
                </Streamdown>
              )}
            </>
          );
        case 'WebSearch':
          return <Badge variant="secondary">{part?.input?.query}</Badge>;
        case 'Read':
        case 'Write':
          return (
            <div className="overflow-hidden">
              <Button
                variant="link"
                className="bg-muted w-full justify-start"
                onClick={() => {
                  window.electron.app.openPath(part?.input?.file_path);
                }}
              >
                <IconFile></IconFile>
                {part?.input?.file_path}
              </Button>
              {part?.input?.content && (
                <Streamdown>
                  {`\`\`\`text\n${part?.input.content}\n\`\`\``}
                </Streamdown>
              )}
            </div>
          );
        case 'Task': {
          const { description, prompt, subagent_type } = part?.input as {
            description: string;
            prompt?: string;
            subagent_type: string;
          };
          return (
            <div className="flex flex-col gap-2">
              <Badge>@{subagent_type}</Badge>
              <small className="text-wrap text-muted-foreground">
                {description}
              </small>
              <pre className="text-wrap text-sm break-all bg-secondary p-4 rounded-2xl">
                {prompt}
              </pre>
            </div>
          );
        }
        case 'Edit': {
          const { file_path, old_string, new_string, replace_all } =
            part?.input as {
              file_path: string;
              old_string: string;
              new_string: string;
              replace_all?: boolean;
            };
          return (
            <div className="overflow-hidden flex flex-col gap-2">
              <Button
                variant="link"
                className="bg-muted w-full justify-start"
                onClick={() => {
                  window.electron.app.openPath(file_path);
                }}
              >
                <IconFile></IconFile>
                {file_path}
              </Button>
              <div className="rounded-md overflow-hidden">
                <ReactDiffViewer
                  oldValue={old_string}
                  newValue={new_string}
                  splitView={false}
                  disableWordDiff
                  hideLineNumbers
                  useDarkTheme={theme === 'dark'}
                  styles={{
                    variables: {},
                    line: {
                      padding: '10px 2px',
                      fontSize: 'var(--text-sm)',
                    },
                  }}
                  // renderContent={this.highlightSyntax}
                />
              </div>

              {/* <pre className="text-wrap text-sm break-all bg-secondary rounded-md p-2">
                {old_string}
              </pre>
              <pre className="text-wrap text-sm break-all bg-secondary rounded-md p-2">
                {new_string}
              </pre> */}
            </div>
          );
        }
        case 'GenerateImage':
        case 'EditImage': {
          return <ChatToolGenerateImagePreview part={part} />;
        }
        case 'Bash':
          return <ChatToolBashPreview part={part} />;

        default:
          return (
            <>
              <Label>Input</Label>
              <pre className="text-sm break-all text-wrap bg-secondary p-4 rounded-2xl">
                {JSON.stringify(part?.input)}
              </pre>
            </>
          );
      }
    }, [part?.input, toolName]);
    return (
      <Card className={cn('h-full w-full', className)}>
        <CardHeader>
          <CardTitle>
            {toolName}{' '}
            <small className="text-xs text-muted-foreground">
              {part?.toolCallId}
            </small>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            {part?.input && <>{renderInput()}</>}
            {part?.output && <>{renderResult()}</>}
          </div>
        </CardContent>
      </Card>
    );
  },
);
