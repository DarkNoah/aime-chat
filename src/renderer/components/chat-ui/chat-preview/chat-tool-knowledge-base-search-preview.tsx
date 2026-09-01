import type { ToolUIPart } from 'ai';
import {
  IconDatabaseSearch,
  IconFileSearch,
  IconFilter,
  IconLoader2,
  IconPhoto,
} from '@tabler/icons-react';
import { Badge } from '../../ui/badge';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemTitle,
} from '../../ui/item';
import { Streamdown } from '../../ai-elements/streamdown';

interface KnowledgeBaseSearchInput {
  query?: string;
  query_type?: 'text' | 'image';
  kb_source?: string[];
  where?: string | null;
  top_k?: number;
  return_full_content?: boolean;
}

interface KnowledgeBaseSearchResult {
  id?: string;
  name?: string;
  score?: number;
  content?: string;
  extendValues?: Record<string, unknown>;
}

type KnowledgeBaseSearchOutput = Record<
  string,
  KnowledgeBaseSearchResult[]
>;

function parseOutput(output: unknown): KnowledgeBaseSearchOutput | null {
  if (typeof output === 'string') {
    try {
      const parsed = JSON.parse(output);
      return parsed && typeof parsed === 'object'
        ? (parsed as KnowledgeBaseSearchOutput)
        : null;
    } catch {
      return null;
    }
  }

  return output && typeof output === 'object'
    ? (output as KnowledgeBaseSearchOutput)
    : null;
}

function formatScore(score?: number) {
  if (typeof score !== 'number') return null;
  return score.toFixed(3);
}

function formatMetadataValue(value: unknown) {
  if (typeof value === 'string') return value;
  return JSON.stringify(value) ?? String(value ?? '');
}

function Metadata({ values }: { values?: Record<string, unknown> }) {
  if (!values || Object.keys(values).length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(values).map(([key, value]) => (
        <Badge className="max-w-full font-normal" key={key} variant="outline">
          <span className="text-muted-foreground">{key}</span>
          <span className="truncate">{formatMetadataValue(value)}</span>
        </Badge>
      ))}
    </div>
  );
}

export function ChatToolKnowledgeBaseSearchPreview({
  part,
}: {
  part?: ToolUIPart;
}) {
  const input = (part?.input ?? {}) as KnowledgeBaseSearchInput;
  const isToolFailure = Boolean(
    part?.output &&
      typeof part.output === 'object' &&
      'code' in part.output &&
      part.output.code === 'TOOL_EXECUTION_FAILED',
  );
  const output = isToolFailure ? null : parseOutput(part?.output);
  const sources = output ? Object.entries(output) : [];
  const isLoading =
    !part?.output &&
    (part?.state === 'input-streaming' || part?.state === 'input-available');

  return (
    <div className="flex flex-col gap-3">
      <Item className="bg-secondary/60" size="sm" variant="outline">
        <IconDatabaseSearch className="size-5 shrink-0 text-muted-foreground" />
        <ItemContent className="min-w-0">
          <ItemTitle className="w-full min-w-0">
            {input.query_type === 'image' ? (
              <IconPhoto className="size-4 shrink-0" />
            ) : (
              <IconFileSearch className="size-4 shrink-0" />
            )}
            <span className="truncate">{input.query || 'Knowledge base search'}</span>
          </ItemTitle>
          <ItemDescription className="flex flex-wrap items-center gap-1.5 line-clamp-none">
            {input.kb_source?.map((source) => (
              <Badge key={source} variant="secondary">
                {source}
              </Badge>
            ))}
            {input.top_k ? (
              <Badge variant="outline">Top {input.top_k}</Badge>
            ) : null}
            {input.return_full_content ? (
              <Badge variant="outline">Full content</Badge>
            ) : null}
          </ItemDescription>
        </ItemContent>
      </Item>

      {input.where ? (
        <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
          <IconFilter className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <code className="min-w-0 break-all">{input.where}</code>
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <IconLoader2 className="size-4 animate-spin" />
          Searching knowledge bases...
        </div>
      ) : null}

      {output && sources.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">No results found.</p>
      ) : null}

      {sources.map(([source, results]) => (
        <section className="flex flex-col gap-2" key={source}>
          <div className="flex items-center justify-between gap-2">
            <h4 className="truncate text-sm font-medium">{source}</h4>
            <Badge variant="secondary">
              {Array.isArray(results) ? results.length : 0} results
            </Badge>
          </div>

          {Array.isArray(results) && results.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
              No matches in this knowledge base.
            </p>
          ) : null}

          {Array.isArray(results)
            ? results.map((result, index) => (
                <Item
                  className="items-start bg-background"
                  key={`${source}-${result.id ?? index}`}
                  size="sm"
                  variant="outline"
                >
                  <ItemContent className="min-w-0 gap-2">
                    <ItemHeader>
                      <ItemTitle className="min-w-0">
                        <span className="truncate">
                          {result.name || 'Untitled item'}
                        </span>
                      </ItemTitle>
                      {formatScore(result.score) ? (
                        <Badge className="shrink-0" variant="secondary">
                          {formatScore(result.score)}
                        </Badge>
                      ) : null}
                    </ItemHeader>
                    {result.id ? (
                      <code className="truncate text-[11px] text-muted-foreground">
                        {result.id}
                      </code>
                    ) : null}
                    {result.content ? (
                      <Streamdown className="max-h-72 overflow-y-auto whitespace-normal break-words rounded-md bg-muted/50 p-3 text-sm">
                        {result.content}
                      </Streamdown>
                    ) : null}
                    <Metadata values={result.extendValues} />
                  </ItemContent>
                </Item>
              ))
            : null}
        </section>
      ))}

      {part?.output && !output && !isToolFailure ? (
        <pre className="whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">
          {String(part.output)}
        </pre>
      ) : null}
    </div>
  );
}
