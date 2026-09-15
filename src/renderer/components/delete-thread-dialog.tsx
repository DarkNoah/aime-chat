import { useRef, useState } from 'react';
import type { StorageThreadType } from '@mastra/core/memory';
import type { DeleteThreadOptions } from '@/types/chat';
import { IconTrashX } from '@tabler/icons-react';
import { t } from 'i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';

type DeleteThreadDialogProps = {
  thread: StorageThreadType;
  onDelete: (id: string, options: DeleteThreadOptions) => Promise<void>;
  onClose: () => void;
};

export function DeleteThreadDialog({
  thread,
  onDelete,
  onClose,
}: DeleteThreadDialogProps) {
  const [deleteWorkspace, setDeleteWorkspace] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deletingRef = useRef(false);
  const workspace =
    !thread.resourceId?.startsWith('project:') &&
    typeof thread.metadata?.workspace === 'string'
      ? thread.metadata.workspace
      : undefined;

  const handleDelete = async () => {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setIsDeleting(true);
    setError(null);
    try {
      await onDelete(thread.id, {
        deleteWorkspace: Boolean(workspace) && deleteWorkspace,
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      deletingRef.current = false;
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !deletingRef.current) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('common.delect_chat')}</AlertDialogTitle>
          <AlertDialogDescription className="break-words">
            {thread.title}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {workspace && (
          <div className="flex items-start gap-3">
            <Checkbox
              id="delete-thread-workspace"
              className="mt-0.5"
              checked={deleteWorkspace}
              disabled={isDeleting}
              onCheckedChange={(checked) =>
                setDeleteWorkspace(checked === true)
              }
              aria-describedby="delete-thread-workspace-description"
            />
            <div className="min-w-0 space-y-2">
              <Label htmlFor="delete-thread-workspace">
                {t('common.delete_chat_workspace')}
              </Label>
              <p
                id="delete-thread-workspace-description"
                className="text-sm text-muted-foreground"
              >
                {t('common.delete_chat_workspace_description')}
              </p>
              <p className="break-all text-xs text-muted-foreground">
                {workspace}
              </p>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="break-words text-sm text-destructive">
            {t('common.delete_chat_failed', { error })}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            {t('common.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90"
            disabled={isDeleting}
            onClick={async (event) => {
              event.preventDefault();
              await handleDelete();
            }}
          >
            <IconTrashX />
            {t(isDeleting ? 'common.deleting' : 'common.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
