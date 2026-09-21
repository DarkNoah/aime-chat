import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconCopy,
  IconFilePlus,
  IconFolderPlus,
  IconPencil,
  IconTrash,
} from '@tabler/icons-react';
import type { WorkspaceEntryAction } from '@/types/workspace-entry';
import { ContextMenuItem, ContextMenuSeparator } from '../../ui/context-menu';

export type EntryTarget = { path: string; name: string; isDirectory: boolean };
export type EntryActionHandler = (
  action: WorkspaceEntryAction,
  target: EntryTarget,
) => void;
export const entryActionKeys = {
  'create-file': 'chat.file_new',
  'create-directory': 'chat.folder_new',
  rename: 'chat.file_rename',
  delete: 'chat.file_delete',
} as const;

export function EntryActions({
  target,
  onAction,
}: {
  target: EntryTarget;
  onAction: EntryActionHandler;
}) {
  const { t } = useTranslation();
  return (
    <>
      <ContextMenuSeparator />
      {target.isDirectory && (
        <>
          <ContextMenuItem onSelect={() => onAction('create-file', target)}>
            <IconFilePlus className="mr-2 size-4" />
            {t(entryActionKeys['create-file'])}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => onAction('create-directory', target)}
          >
            <IconFolderPlus className="mr-2 size-4" />
            {t(entryActionKeys['create-directory'])}
          </ContextMenuItem>
        </>
      )}
      <ContextMenuItem onSelect={() => onAction('rename', target)}>
        <IconPencil className="mr-2 size-4" />
        {t(entryActionKeys.rename)}
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() => {
          navigator.clipboard.writeText(target.path).catch(() =>
            window.electron.app.toast(t('chat.file_copy_error'), {
              type: 'error',
            }),
          );
        }}
      >
        <IconCopy className="mr-2 size-4" />
        {t('chat.file_copy_path')}
      </ContextMenuItem>
      <ContextMenuItem
        className="text-destructive focus:text-destructive"
        onSelect={() => onAction('delete', target)}
      >
        <IconTrash className="mr-2 size-4" />
        {t(entryActionKeys.delete)}
      </ContextMenuItem>
    </>
  );
}
