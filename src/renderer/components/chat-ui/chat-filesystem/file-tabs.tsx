import React, { useCallback } from 'react';
import { IconX } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/renderer/lib/utils';
import { FileWorkspace, type FileWorkspaceProps } from './file-workspace';

export type OpenFile = { path: string; dirty: boolean };

export function FileTabPanel({
  onDirtyChange,
  ...props
}: Omit<FileWorkspaceProps, 'onDirtyChange'> & {
  onDirtyChange: (path: string, dirty: boolean) => void;
}) {
  const handleDirtyChange = useCallback(
    (dirty: boolean) => onDirtyChange(props.filePath, dirty),
    [onDirtyChange, props.filePath],
  );
  return <FileWorkspace {...props} onDirtyChange={handleDirtyChange} />;
}

export function FileTabs({
  idPrefix,
  files,
  selected,
  onSelect,
  onClose,
}: {
  idPrefix: string;
  files: OpenFile[];
  selected: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="tablist"
      aria-label={t('chat.file_tabs')}
      className="flex shrink-0 overflow-x-auto border-b bg-muted/30"
    >
      {files.map((file, index) => (
        <div
          key={file.path}
          className={cn(
            'group flex min-w-0 shrink-0 items-center border-r',
            selected === file.path && 'bg-background',
          )}
        >
          <button
            type="button"
            role="tab"
            aria-selected={selected === file.path}
            aria-controls={`${idPrefix}-panel-${index}`}
            id={`${idPrefix}-tab-${index}`}
            tabIndex={selected === file.path ? 0 : -1}
            title={file.path}
            ref={(element) => {
              if (selected === file.path)
                element?.scrollIntoView?.({
                  block: 'nearest',
                  inline: 'nearest',
                });
            }}
            className="flex h-9 max-w-52 items-center gap-2 px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            onClick={() => onSelect(file.path)}
            onKeyDown={(event) => {
              let next = index;
              if (event.key === 'ArrowRight') next = (index + 1) % files.length;
              else if (event.key === 'ArrowLeft')
                next = (index + files.length - 1) % files.length;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = files.length - 1;
              else return;
              event.preventDefault();
              onSelect(files[next].path);
              document.getElementById(`${idPrefix}-tab-${next}`)?.focus();
            }}
          >
            <span className="truncate">{file.path.split(/[/\\]/).pop()}</span>
            {file.dirty && (
              <span
                aria-label={t('chat.file_unsaved')}
                className="size-1.5 shrink-0 rounded-full bg-current"
              />
            )}
          </button>
          <button
            type="button"
            aria-label={t('chat.file_close_tab', {
              name: file.path.split(/[/\\]/).pop(),
            })}
            className="mr-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onClose(file.path)}
          >
            <IconX className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
