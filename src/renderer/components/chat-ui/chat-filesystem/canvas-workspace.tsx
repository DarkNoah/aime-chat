import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Tldraw, serializeTldrawJson, type Editor, type TLStore } from 'tldraw';
import 'tldraw/tldraw.css';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';
import { IconDeviceFloppy, IconPhotoPlus, IconX } from '@tabler/icons-react';
import {
  createInlineChatImage,
  INLINE_IMAGE_MAX_BYTES,
} from '@/renderer/lib/inline-chat-image';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import type { FileWorkspaceProps } from './file-workspace';
import { deferCanvasViewportUpdates } from './canvas-viewport';
import {
  assertEmbeddedCanvasAssets,
  CANVAS_FILE_LIMIT,
  parseCanvasDocument,
} from './tldraw-document';

export function CanvasWorkspace({
  filePath,
  workspace,
  active = true,
  onClose,
  onDirtyChange,
  onAddImageToChat,
}: FileWorkspaceProps) {
  const { t, i18n } = useTranslation();
  const { resolvedTheme } = useTheme();
  const [store, setStore] = useState<TLStore>();
  const [editor, setEditor] = useState<Editor>();
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const revision = useRef(0);
  const savingRef = useRef(false);
  const exportingRef = useRef(false);
  const alive = useRef(true);
  const dirtyCallback = useRef(onDirtyChange);
  dirtyCallback.current = onDirtyChange;
  const handleMount = useCallback((mountedEditor: Editor) => {
    setEditor(mountedEditor);
    return deferCanvasViewportUpdates(mountedEditor);
  }, []);
  const fileName = filePath.split(/[/\\]/).pop() || filePath;

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    window.electron.app
      .readFileContent(filePath, { limit: CANVAS_FILE_LIMIT })
      .then((file) => {
        if (cancelled) return undefined;
        if (file.truncated || file.size > CANVAS_FILE_LIMIT)
          throw new Error('chat.canvas_too_large');
        if (file.isBinary || !file.content)
          throw new Error('chat.canvas_invalid');
        try {
          setStore(parseCanvasDocument(file.content));
        } catch {
          throw new Error('chat.canvas_invalid');
        }
        return undefined;
      })
      .catch((reason) => {
        if (!cancelled)
          setLoadError(
            reason instanceof Error ? reason.message : 'chat.file_read_error',
          );
      });
    return () => {
      cancelled = true;
      alive.current = false;
      dirtyCallback.current(false);
    };
  }, [filePath]);

  useEffect(() => {
    if (!editor) return undefined;
    if (!active) {
      editor.blur({ blurContainer: false });
      return undefined;
    }
    // autoFocus=false avoids stealing focus from chat, but tldraw 3 also needs
    // explicit focus ownership for keyboard shortcuts and pointer movement.
    const syncFocus = (event: Event) => {
      if (
        event.target instanceof Node &&
        editor.getContainer().contains(event.target)
      ) {
        editor.focus({ focusContainer: false });
      } else {
        editor.blur({ blurContainer: false });
      }
    };
    document.addEventListener('pointerdown', syncFocus, true);
    document.addEventListener('focusin', syncFocus, true);
    return () => {
      document.removeEventListener('pointerdown', syncFocus, true);
      document.removeEventListener('focusin', syncFocus, true);
      editor.blur({ blurContainer: false });
    };
  }, [editor, active]);

  useEffect(() => {
    if (!editor) return undefined;
    // Observe document changes only: selection, camera and pointer changes are not edits.
    return editor.store.listen(
      () => {
        revision.current += 1;
        setDirty(true);
        dirtyCallback.current(true);
      },
      { scope: 'document' },
    );
  }, [editor]);

  useEffect(() => {
    if (!editor) return undefined;
    const update = () =>
      setHasSelection(editor.getSelectedShapeIds().length > 0);
    update();
    return editor.store.listen(update, { scope: 'session' });
  }, [editor]);

  useEffect(() => {
    editor?.user.updateUserPreferences({
      colorScheme: resolvedTheme === 'dark' ? 'dark' : 'light',
      locale: i18n.language.toLowerCase().startsWith('zh') ? 'zh-cn' : 'en',
    });
  }, [editor, resolvedTheme, i18n.language]);

  const save = useCallback(async () => {
    if (!editor || !dirty || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    const savedRevision = revision.current;
    try {
      const content = await serializeTldrawJson(editor);
      assertEmbeddedCanvasAssets(content);
      if (new Blob([content]).size > CANVAS_FILE_LIMIT)
        throw new Error('chat.canvas_too_large');
      await window.electron.app.writeFileContent(filePath, content, workspace);
      if (!alive.current) return;
      if (revision.current === savedRevision) {
        setDirty(false);
        dirtyCallback.current(false);
      }
    } catch (reason) {
      if (alive.current)
        setError(
          reason instanceof Error ? reason.message : 'chat.file_save_error',
        );
    } finally {
      savingRef.current = false;
      if (alive.current) setSaving(false);
    }
  }, [editor, dirty, filePath, workspace]);

  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        event.stopPropagation();
        save().catch(() => undefined);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [active, save]);

  const addSelection = async () => {
    if (!editor || !onAddImageToChat || exportingRef.current) return;
    const ids = editor.getSelectedShapeIds();
    if (!ids.length) return;
    exportingRef.current = true;
    setExporting(true);
    setError('');
    try {
      const { blob } = await editor.toImage(ids, {
        format: 'png',
        background: true,
        pixelRatio: 2,
      });
      if (blob.size > INLINE_IMAGE_MAX_BYTES)
        throw new Error('chat.canvas_image_too_large');
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('chat.canvas_export_error'));
        reader.readAsDataURL(blob);
      });
      if (!alive.current) return;
      onAddImageToChat(
        createInlineChatImage(
          url,
          `${fileName.replace(/\.tldr$/i, '')}-selection.png`,
        ),
      );
    } catch (reason) {
      if (alive.current)
        setError(
          reason instanceof Error ? reason.message : 'chat.canvas_export_error',
        );
    } finally {
      exportingRef.current = false;
      if (alive.current) setExporting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-background">
      <div className="flex min-h-11 flex-wrap items-center gap-2 border-b px-2 py-1">
        <div className="min-w-0 flex-1" title={filePath}>
          <span className="block truncate text-sm font-medium">{fileName}</span>
        </div>
        {dirty && <Badge variant="outline">{t('chat.file_unsaved')}</Badge>}
        <Button
          size="sm"
          variant="outline"
          disabled={!editor || !hasSelection || exporting || !onAddImageToChat}
          title={t('chat.canvas_select_hint')}
          onClick={addSelection}
        >
          <IconPhotoPlus className="size-4" />
          {t(exporting ? 'chat.canvas_exporting' : 'chat.canvas_add_selection')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!dirty || saving || !editor}
          onClick={save}
        >
          <IconDeviceFloppy className="size-4" />
          {t(saving ? 'chat.canvas_saving' : 'common.save')}
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t('chat.file_close_tab', { name: fileName })}
          onClick={() => {
            // eslint-disable-next-line no-alert
            if (!dirty || window.confirm(t('chat.file_discard_changes')))
              onClose();
          }}
        >
          <IconX className="size-4" />
        </Button>
      </div>
      {error && (
        <p role="alert" className="border-b px-3 py-2 text-sm text-destructive">
          {t(error)}
        </p>
      )}
      {loadError && (
        <p role="alert" className="p-6 text-sm text-destructive">
          {t(loadError)}
        </p>
      )}
      {!loadError && store && (
        <div
          className="relative min-h-0 flex-1"
          // Keep tldraw's portaled menus in a real local containing block.
          // Older Floating UI versions otherwise subtract the outer @container
          // offset even though Chromium positions fixed elements in the viewport.
          style={{ contain: 'layout' }}
          inert={!active}
        >
          <Tldraw store={store} onMount={handleMount} autoFocus={false} />
        </div>
      )}
      {!loadError && !store && (
        <div
          role="status"
          className="flex-1 animate-pulse bg-muted/20"
          aria-label={t('common.loading')}
        />
      )}
    </div>
  );
}
