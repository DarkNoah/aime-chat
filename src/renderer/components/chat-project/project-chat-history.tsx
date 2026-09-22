import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconClockHour3, IconMessage, IconTrash } from '@tabler/icons-react';
import { useProjectChatHistory } from '@/renderer/hooks/use-project-chat-history';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { Skeleton } from '../ui/skeleton';

type ProjectChatHistoryProps = {
  resourceId?: string;
  threadId?: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
};

export function ProjectChatHistory({
  resourceId,
  threadId,
  onSelect,
  onDelete,
}: ProjectChatHistoryProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const { threads, loading, error, hasMore, refresh, loadMore } =
    useProjectChatHistory(resourceId, open);

  useEffect(() => {
    if (!open || !viewport || !sentinel || loading || error || !hasMore)
      return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) loadMore();
      },
      { root: viewport, rootMargin: '0px 0px 80px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [open, viewport, sentinel, loading, error, hasMore, loadMore, search]);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setSearch('');
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="cursor-pointer h-6 gap-1 px-2 text-xs bg-muted-foreground/20 backdrop-blur"
          disabled={!resourceId}
        >
          <IconClockHour3 size={10} />
          {t('project.chat_history')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="start"
        sideOffset={8}
        className="w-72"
      >
        <Command className="rounded-none">
          <CommandInput
            placeholder={t('common.search')}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList
            ref={setViewport}
            className="max-h-72"
            aria-busy={loading}
          >
            {!loading && !error && !hasMore && (
              <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">
                {t('common.no_data')}
              </CommandEmpty>
            )}
            <CommandGroup>
              {threads.map((thread) => (
                <CommandItem
                  key={thread.id}
                  value={thread.id}
                  keywords={[thread.title]}
                  onSelect={() => {
                    setOpen(false);
                    setSearch('');
                    onSelect(thread.id);
                  }}
                >
                  <div className="min-w-0 w-full flex flex-row items-center justify-between">
                    <div className="flex flex-1 min-w-0 flex-row items-center gap-2">
                      <IconMessage />
                      <div className="truncate text-sm">
                        {thread.title}{' '}
                        {thread.id === threadId && (
                          <span className="text-xs text-muted-foreground">
                            current
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="size-6 cursor-pointer"
                      aria-label={`${t('common.delete')} ${thread.title}`}
                      onClick={async (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        await onDelete(thread.id);
                        await refresh();
                      }}
                    >
                      <IconTrash size={8} />
                    </Button>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            {loading && (
              <div
                role="status"
                aria-label={t('common.loading')}
                className="px-3 py-3 space-y-2"
              >
                <Skeleton className="h-4 w-[80%]" />
                <Skeleton className="h-4 w-[60%]" />
                <Skeleton className="h-4 w-[70%]" />
              </div>
            )}
            {error && (
              <div role="alert" className="px-3 py-3 text-xs text-destructive">
                {error}
                <Button variant="ghost" size="sm" onClick={() => loadMore()}>
                  {t('common.retry')}
                </Button>
              </div>
            )}
            <div ref={setSentinel} className="h-px" aria-hidden="true" />
          </CommandList>
        </Command>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
