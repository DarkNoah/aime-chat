import React, {
  CSSProperties,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import '@milkdown/crepe/theme/common/style.css';
import {
  IconAlertTriangle,
  IconDeviceFloppy,
  IconFileText,
  IconMarkdown,
  IconRefresh,
  IconX,
} from '@tabler/icons-react';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Textarea } from '../../ui/textarea';
import {
  formatFileSize,
  getFilePreviewKind,
  isMarkdownFile,
  toFileUrl,
} from './file-workspace-utils';

const EDITABLE_FILE_LIMIT = 2 * 1024 * 1024;

const CodeTextEditor = lazy(() =>
  import('./code-text-editor').then((module) => ({
    default: module.CodeTextEditor,
  })),
);

type EditorMode = 'milkdown' | 'source';

type FileContent = {
  content: string;
  truncated: boolean;
  size: number;
  mimeType: string;
  isBinary: boolean;
};

type MarkdownEditorProps = {
  initialValue: string;
  onChange: (markdown: string) => void;
  onError: (error: Error) => void;
};

type CrepeListener = {
  markdownUpdated: (
    listener: (ctx: unknown, markdown: string, previous: string) => void,
  ) => void;
};

type CrepeInstance = {
  on: (configure: (listener: CrepeListener) => void) => CrepeInstance;
  create: () => Promise<unknown>;
  destroy: () => Promise<unknown>;
};

type CrepeModule = {
  Crepe: new (options: { root: Node; defaultValue: string }) => CrepeInstance;
};

const milkdownTheme = {
  '--crepe-color-background': 'var(--background)',
  '--crepe-color-on-background': 'var(--foreground)',
  '--crepe-color-surface': 'var(--muted)',
  '--crepe-color-surface-low': 'var(--secondary)',
  '--crepe-color-on-surface': 'var(--foreground)',
  '--crepe-color-on-surface-variant': 'var(--muted-foreground)',
  '--crepe-color-outline': 'var(--muted-foreground)',
  '--crepe-color-primary': 'var(--primary)',
  '--crepe-color-secondary': 'var(--secondary)',
  '--crepe-color-on-secondary': 'var(--secondary-foreground)',
  '--crepe-color-inverse': 'var(--foreground)',
  '--crepe-color-on-inverse': 'var(--background)',
  '--crepe-color-inline-code': 'var(--destructive)',
  '--crepe-color-error': 'var(--destructive)',
  '--crepe-color-hover': 'var(--accent)',
  '--crepe-color-selected': 'var(--accent)',
  '--crepe-color-inline-area': 'var(--muted)',
} as CSSProperties;

const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  initialValue,
  onChange,
  onError,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const initialValueRef = useRef(initialValue);
  const onChangeRef = useRef(onChange);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onChangeRef.current = onChange;
    onErrorRef.current = onError;
  }, [onChange, onError]);

  useEffect(() => {
    if (!rootRef.current) return undefined;

    let disposed = false;
    let crepe: CrepeInstance | null = null;
    const root = rootRef.current;

    import('@milkdown/crepe')
      .then((module) => {
        if (disposed) return undefined;
        const { Crepe } = module as unknown as CrepeModule;
        crepe = new Crepe({
          root,
          defaultValue: initialValueRef.current,
        });
        crepe.on((listener) => {
          listener.markdownUpdated((_ctx, markdown) => {
            onChangeRef.current(markdown);
          });
        });
        return crepe.create();
      })
      .catch((error) => {
        if (disposed) return undefined;
        onErrorRef.current(
          error instanceof Error ? error : new Error('Failed to load Milkdown'),
        );
        return undefined;
      });

    return () => {
      disposed = true;
      if (crepe) crepe.destroy().catch(() => undefined);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      style={milkdownTheme}
      className="h-full overflow-y-auto bg-background [&_.milkdown]:min-h-full [&_.ProseMirror]:min-h-full [&_.ProseMirror]:py-4!
       [&_.ProseMirror]:text-sm! [&_.ProseMirror_h1]:mt-0! [&_.ProseMirror_h2]:mt-0! [&_.ProseMirror_h3]:mt-0! [&_.ProseMirror_h4]:mt-0! [&_.ProseMirror_h5]:mt-0! [&_.ProseMirror_h6]:mt-0!"
    />
  );
};

export type FileWorkspaceProps = {
  filePath: string;
  workspace: string;
  active?: boolean;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
};

export const FileWorkspace: React.FC<FileWorkspaceProps> = ({
  filePath,
  workspace,
  active = true,
  onClose,
  onDirtyChange,
}) => {
  const { t } = useTranslation();
  const [file, setFile] = useState<FileContent | null>(null);
  const [draft, setDraft] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>('milkdown');
  const tRef = useRef(t);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const fileName = useMemo(
    () => filePath.replaceAll('\\', '/').split('/').pop() || filePath,
    [filePath],
  );
  const markdown = isMarkdownFile(filePath);
  const dirty = draft !== savedContent;
  const previewKind = file
    ? getFilePreviewKind(file.mimeType, file.isBinary)
    : 'unsupported';
  const editable = previewKind === 'text' && !file?.truncated;
  const fileUrl = useMemo(() => toFileUrl(filePath), [filePath]);

  useEffect(() => {
    let reading = true;
    setLoading(true);
    setError(null);
    setFile(null);

    window.electron.app
      .readFileContent(filePath, { limit: EDITABLE_FILE_LIMIT })
      .then((result) => {
        if (!reading) return undefined;
        const content = result.isBinary ? '' : result.content || '';
        setFile({
          ...result,
          content,
          mimeType: result.mimeType || 'application/octet-stream',
        });
        setDraft(content);
        setSavedContent(content);
        return undefined;
      })
      .catch((readError) => {
        if (!reading) return undefined;
        setError(
          readError instanceof Error
            ? readError.message
            : tRef.current('chat.file_read_error'),
        );
        return undefined;
      })
      .finally(() => {
        if (reading) setLoading(false);
      })
      .catch(() => undefined);

    return () => {
      reading = false;
    };
  }, [filePath]);

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  const handleSave = useCallback(async () => {
    if (!editable || !dirty || saving) return;

    setSaving(true);
    try {
      const result = await window.electron.app.writeFileContent(
        filePath,
        draft,
        workspace,
      );
      setSavedContent(draft);
      setFile((current) =>
        current ? { ...current, size: result.size, truncated: false } : current,
      );
      await window.electron.app.toast(t('chat.file_saved'), {
        type: 'success',
      });
    } catch (saveError) {
      await window.electron.app.toast(
        saveError instanceof Error
          ? saveError.message
          : t('chat.file_save_error'),
        { type: 'error' },
      );
    } finally {
      setSaving(false);
    }
  }, [draft, dirty, editable, filePath, saving, t, workspace]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        if (!active || !editable || !dirty) return;
        event.preventDefault();
        handleSave().catch(() => undefined);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, dirty, editable, handleSave]);

  const handleClose = () => {
    // eslint-disable-next-line no-alert
    if (dirty && !window.confirm(t('chat.file_discard_changes'))) return;
    onClose();
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <IconRefresh className="mr-2 size-5 animate-spin" />
          <span className="text-sm">{t('common.loading')}</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-destructive">
          <IconAlertTriangle className="size-6" />
          <p className="text-sm">{error}</p>
        </div>
      );
    }

    if (!file) return null;

    if (previewKind === 'image') {
      return (
        <PhotoProvider>
          <div className="flex h-full items-center justify-center overflow-auto bg-muted/20 p-4">
            <PhotoView src={fileUrl}>
              <img
                src={fileUrl}
                alt={fileName}
                className="max-h-full max-w-full cursor-zoom-in rounded-md object-contain shadow-sm"
              />
            </PhotoView>
          </div>
        </PhotoProvider>
      );
    }

    if (previewKind === 'audio') {
      return (
        <div className="flex h-full items-center justify-center bg-muted/20 p-6">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={fileUrl} controls className="w-full max-w-xl" />
        </div>
      );
    }

    if (previewKind === 'video') {
      return (
        <div className="flex h-full items-center justify-center overflow-auto bg-black/90 p-2">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={fileUrl}
            controls
            className="max-h-full max-w-full rounded-md"
          />
        </div>
      );
    }

    if (previewKind === 'pdf') {
      return (
        <iframe
          src={fileUrl}
          title={fileName}
          className="h-full w-full border-0 bg-background"
        />
      );
    }

    if (previewKind === 'text') {
      if (file.truncated) {
        return (
          <div className="flex h-full flex-col overflow-hidden">
            <div className="border-b bg-yellow-500/10 px-4 py-2 text-xs text-yellow-700 dark:text-yellow-300">
              {t('chat.file_too_large_readonly', {
                size: formatFileSize(file.size),
              })}
            </div>
            <pre className="flex-1 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs">
              {draft || t('common.no_data')}
            </pre>
          </div>
        );
      }

      if (markdown && editorMode === 'milkdown') {
        return (
          <MarkdownEditor
            initialValue={draft}
            onChange={setDraft}
            onError={(milkdownError) => {
              window.electron.app
                .toast(milkdownError.message, { type: 'error' })
                .catch(() => undefined);
              setEditorMode('source');
            }}
          />
        );
      }

      return (
        <Suspense
          fallback={
            <Textarea
              aria-label={t('chat.file_source_editor')}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              spellCheck={false}
              className="h-full min-h-0 resize-none rounded-none border-0 px-4 py-3 font-mono text-xs shadow-none focus-visible:border-0 focus-visible:ring-0 field-sizing-fixed"
            />
          }
        >
          <CodeTextEditor
            fileName={fileName}
            value={draft}
            ariaLabel={t('chat.file_source_editor')}
            onChange={setDraft}
          />
        </Suspense>
      );
    }

    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
        <IconFileText className="size-8" />
        <p className="text-sm">{t('chat.file_preview_unsupported')}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.electron.app.openPath(filePath)}
        >
          {t('chat.open_in_explorer')}
        </Button>
      </div>
    );
  };

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <div className="flex min-h-11 items-center gap-2 border-b px-2">
        {markdown ? (
          <IconMarkdown className="size-4 shrink-0 text-blue-500" />
        ) : (
          <IconFileText className="size-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1" title={filePath}>
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{fileName}</span>
            {dirty && (
              <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                {t('chat.file_unsaved')}
              </Badge>
            )}
          </div>
          <p className="truncate text-[10px] text-muted-foreground">
            {filePath}
          </p>
        </div>

        {markdown && editable && (
          <div className="flex rounded-md border bg-muted/30 p-0.5">
            <Button
              variant={editorMode === 'milkdown' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-6 px-2 text-xs shadow-none"
              onClick={() => setEditorMode('milkdown')}
            >
              {t('chat.file_markdown_editor')}
            </Button>
            <Button
              variant={editorMode === 'source' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-6 px-2 text-xs shadow-none"
              onClick={() => setEditorMode('source')}
            >
              {t('chat.file_source_editor')}
            </Button>
          </div>
        )}

        {editable && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
            disabled={!dirty || saving}
            onClick={handleSave}
            title={`${t('common.save')} (Ctrl+S)`}
          >
            {saving ? (
              <IconRefresh className="size-3.5 animate-spin" />
            ) : (
              <IconDeviceFloppy className="size-3.5" />
            )}
            <span className="hidden text-xs @2xl:inline">
              {t('common.save')}
            </span>
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-7"
          onClick={handleClose}
          title={t('common.close')}
        >
          <IconX className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1">{renderContent()}</div>
    </div>
  );
};
