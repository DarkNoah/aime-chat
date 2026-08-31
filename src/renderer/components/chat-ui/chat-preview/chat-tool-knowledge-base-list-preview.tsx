import type { ToolUIPart } from 'ai';
import {
  IconColumns3,
  IconDatabase,
  IconFiles,
  IconLoader2,
} from '@tabler/icons-react';
import { Badge } from '../../ui/badge';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemMedia,
  ItemTitle,
} from '../../ui/item';

interface KnowledgeBaseListItem {
  id?: string;
  name?: string;
  description?: string;
  itemCount?: number;
  extendColumns?: {
    name?: string;
    columnType?: string;
  }[];
}

function parseOutput(output: unknown): KnowledgeBaseListItem[] | null {
  if (Array.isArray(output)) return output as KnowledgeBaseListItem[];
  if (typeof output !== 'string') return null;

  try {
    const parsed = JSON.parse(output);
    return Array.isArray(parsed) ? (parsed as KnowledgeBaseListItem[]) : null;
  } catch {
    return null;
  }
}

export function ChatToolKnowledgeBaseListPreview({
  part,
}: {
  part?: ToolUIPart;
}) {
  const isToolFailure = Boolean(
    part?.output &&
      typeof part.output === 'object' &&
      'code' in part.output &&
      part.output.code === 'TOOL_EXECUTION_FAILED',
  );
  const knowledgeBases = isToolFailure ? null : parseOutput(part?.output);
  const isLoading =
    !part?.output &&
    (part?.state === 'input-streaming' || part?.state === 'input-available');
  const totalItems = knowledgeBases?.reduce(
    (total, knowledgeBase) => total + (knowledgeBase.itemCount ?? 0),
    0,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconDatabase className="size-5 text-muted-foreground" />
          <span className="text-sm font-medium">Knowledge bases</span>
        </div>
        {knowledgeBases ? (
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary">
              {knowledgeBases.length} knowledge bases
            </Badge>
            <Badge variant="outline">
              <IconFiles className="size-3" />
              {totalItems} items
            </Badge>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <IconLoader2 className="size-4 animate-spin" />
          Loading knowledge bases...
        </div>
      ) : null}

      {knowledgeBases?.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          No knowledge bases found.
        </p>
      ) : null}

      {knowledgeBases?.map((knowledgeBase, index) => (
        <Item
          className="items-start bg-background"
          key={knowledgeBase.id ?? index}
          size="sm"
          variant="outline"
        >
          <ItemMedia variant="icon">
            <IconDatabase />
          </ItemMedia>
          <ItemContent className="min-w-0 gap-2">
            <ItemHeader>
              <ItemTitle className="min-w-0">
                <span className="truncate">
                  {knowledgeBase.name || 'Untitled knowledge base'}
                </span>
              </ItemTitle>
              <Badge className="shrink-0" variant="secondary">
                <IconFiles className="size-3" />
                {knowledgeBase.itemCount ?? 0} items
              </Badge>
            </ItemHeader>

            {knowledgeBase.id ? (
              <code className="truncate text-[11px] text-muted-foreground">
                {knowledgeBase.id}
              </code>
            ) : null}

            {knowledgeBase.description ? (
              <ItemDescription className="line-clamp-none whitespace-pre-wrap">
                {knowledgeBase.description}
              </ItemDescription>
            ) : null}

            {knowledgeBase.extendColumns?.length ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <IconColumns3 className="size-3.5 text-muted-foreground" />
                {knowledgeBase.extendColumns.map((column, columnIndex) => (
                  <Badge
                    key={`${column.name ?? 'column'}-${columnIndex}`}
                    variant="outline"
                  >
                    {column.name || 'Unnamed column'}
                    {column.columnType ? (
                      <span className="text-muted-foreground">
                        {column.columnType}
                      </span>
                    ) : null}
                  </Badge>
                ))}
              </div>
            ) : null}
          </ItemContent>
        </Item>
      ))}

      {part?.output && !knowledgeBases && !isToolFailure ? (
        <pre className="whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">
          {String(part.output)}
        </pre>
      ) : null}
    </div>
  );
}
