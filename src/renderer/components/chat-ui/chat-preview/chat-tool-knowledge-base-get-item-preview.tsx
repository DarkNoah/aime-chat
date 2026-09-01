import type { ToolUIPart } from 'ai';
import {
  IconBraces,
  IconFileText,
  IconHash,
  IconLoader2,
  IconRegex,
} from '@tabler/icons-react';
import { Streamdown } from '../../ai-elements/streamdown';
import { Badge } from '../../ui/badge';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '../../ui/item';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';

interface KnowledgeBaseGetItemInput {
  item_id?: string;
  format?: 'text' | 'json';
  pattern?: string;
  offset?: number;
  limit?: number;
}

interface KnowledgeBaseItemOutput {
  id?: string;
  title?: string;
  content?: string;
  extendData?: Record<string, unknown>;
}

function parseJsonOutput(output: unknown): KnowledgeBaseItemOutput | null {
  if (output && typeof output === 'object') {
    return output as KnowledgeBaseItemOutput;
  }
  if (typeof output !== 'string') return null;

  try {
    const parsed = JSON.parse(output);
    return parsed && typeof parsed === 'object'
      ? (parsed as KnowledgeBaseItemOutput)
      : null;
  } catch {
    return null;
  }
}

function formatMetadataValue(value: unknown) {
  if (typeof value === 'string') return value;
  return JSON.stringify(value) ?? String(value ?? '');
}

function Metadata({ values }: { values?: Record<string, unknown> }) {
  if (!values || Object.keys(values).length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-md border bg-muted/30 p-3">
      <span className="text-xs font-medium">Metadata</span>
      <div className="grid gap-1.5 text-xs">
        {Object.entries(values).map(([key, value]) => (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2" key={key}>
            <span className="truncate text-muted-foreground">{key}</span>
            <span className="break-all">{formatMetadataValue(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChatToolKnowledgeBaseGetItemPreview({
  part,
}: {
  part?: ToolUIPart;
}) {
  const input = (part?.input ?? {}) as KnowledgeBaseGetItemInput;
  const isToolFailure = Boolean(
    part?.output &&
      typeof part.output === 'object' &&
      'code' in part.output &&
      part.output.code === 'TOOL_EXECUTION_FAILED',
  );
  const jsonOutput = isToolFailure ? null : parseJsonOutput(part?.output);
  const content = jsonOutput?.content ??
    (typeof part?.output === 'string' ? part.output : '');
  const isLoading =
    !part?.output &&
    (part?.state === 'input-streaming' || part?.state === 'input-available');

  return (
    <div className="flex flex-col gap-3">
      <Item className="bg-secondary/60" size="sm" variant="outline">
        <IconFileText className="size-5 shrink-0 text-muted-foreground" />
        <ItemContent className="min-w-0">
          <ItemTitle className="w-full min-w-0">
            <span className="truncate">
              {jsonOutput?.title || 'Knowledge base item'}
            </span>
          </ItemTitle>
          <ItemDescription className="flex flex-wrap items-center gap-1.5 line-clamp-none">
            <Badge className="max-w-full" variant="secondary">
              <IconHash className="size-3" />
              <span className="truncate">
                {jsonOutput?.id || input.item_id || 'Unknown item'}
              </span>
            </Badge>
            <Badge variant="outline">
              <IconBraces className="size-3" />
              {input.format || 'text'}
            </Badge>
            {typeof input.offset === 'number' ? (
              <Badge variant="outline">Offset {input.offset}</Badge>
            ) : null}
            {typeof input.limit === 'number' ? (
              <Badge variant="outline">Limit {input.limit}</Badge>
            ) : null}
          </ItemDescription>
        </ItemContent>
      </Item>

      {input.pattern ? (
        <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
          <IconRegex className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <code className="min-w-0 break-all">{input.pattern}</code>
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <IconLoader2 className="size-4 animate-spin" />
          Loading knowledge base item...
        </div>
      ) : null}

      {jsonOutput ? <Metadata values={jsonOutput.extendData} /> : null}

      {content ? (
        <Tabs defaultValue="document">
          <TabsList>
            <TabsTrigger value="document">Document</TabsTrigger>
            <TabsTrigger value="text">Text</TabsTrigger>
          </TabsList>
          <TabsContent value="document">
            <Streamdown className="max-h-[65vh] overflow-y-auto whitespace-normal break-words rounded-md border bg-background p-4">
              {content}
            </Streamdown>
          </TabsContent>
          <TabsContent value="text">
            <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/50 p-4 text-xs">
              {content}
            </pre>
          </TabsContent>
        </Tabs>
      ) : null}

      {part?.output && !content && !isToolFailure ? (
        <pre className="whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(part.output, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
