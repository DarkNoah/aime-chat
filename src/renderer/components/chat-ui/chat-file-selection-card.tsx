import { useId, useMemo, useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon, FileTextIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChatFileSelectionReference } from '@/renderer/lib/chat-file-selection';
import { cn } from '@/renderer/lib/utils';
import { Button } from '../ui/button';

const COLLAPSED_LINE_COUNT = 6;

const getFileName = (filePath: string) =>
  filePath
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .pop() || filePath;

const splitLines = (text: string) => text.split(/\r\n|\r|\n/);

export type ChatFileSelectionCardProps = {
  reference: ChatFileSelectionReference;
  className?: string;
};

export function ChatFileSelectionCard({
  reference,
  className,
}: ChatFileSelectionCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const fileName = getFileName(reference.sourcePath);
  const lines = useMemo(
    () => splitLines(reference.selectedText),
    [reference.selectedText],
  );
  const collapsible = lines.length > COLLAPSED_LINE_COUNT;
  const visibleText =
    collapsible && !expanded
      ? lines.slice(0, COLLAPSED_LINE_COUNT).join('\n')
      : reference.selectedText;
  const lineLabel =
    reference.startLine === undefined
      ? t('chat.file_selection_markdown')
      : t('chat.file_selection_lines', {
          start: reference.startLine,
          end: reference.endLine,
        });

  return (
    <section
      aria-label={t('chat.file_selection_region', { fileName })}
      className={cn(
        'w-full max-w-2xl overflow-hidden rounded-lg border bg-background text-foreground',
        className,
      )}
    >
      <header className="flex min-w-0 items-center gap-2 border-b px-3 py-2">
        <FileTextIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-xs font-medium leading-4"
            title={reference.sourcePath}
          >
            {fileName}
          </p>
          <p className="text-[11px] leading-4 text-muted-foreground">
            {lineLabel}
          </p>
        </div>
      </header>

      <pre
        data-testid="file-selection-content"
        id={contentId}
        className="m-0 max-w-[72ch] whitespace-pre-wrap break-words bg-muted/30 px-3 py-2 font-mono text-xs leading-5 text-foreground"
      >
        {visibleText}
      </pre>

      {collapsible ? (
        <div className="flex justify-end border-t px-2 py-1">
          <Button
            aria-controls={contentId}
            aria-expanded={expanded}
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded((current) => !current)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {expanded ? (
              <ChevronUpIcon aria-hidden="true" className="size-3.5" />
            ) : (
              <ChevronDownIcon aria-hidden="true" className="size-3.5" />
            )}
            {expanded
              ? t('chat.file_selection_collapse')
              : t('chat.file_selection_expand')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
