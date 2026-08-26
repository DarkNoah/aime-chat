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
  IconFileTypeHtml,
  IconMarkdown,
  IconRefresh,
  IconX,
} from '@tabler/icons-react';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import { useTranslation } from 'react-i18next';
import {
  createChatFileSelectionReference,
  type ChatFileSelectionReference,
} from '@/renderer/lib/chat-file-selection';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Textarea } from '../../ui/textarea';
import {
  formatFileSize,
  getFilePreviewKind,
  isHtmlFile,
  isMarkdownFile,
  toFileUrl,
} from './file-workspace-utils';
import {
  createLocalImageUrl,
  renderRawHtmlImages,
  resolveMarkdownImageUrl,
} from './milkdown-image-support';
import {
  FileSelectionContextMenu,
  getDomEditorSelection,
  getPlainTextEditorSelection,
  type FileEditorSelection,
} from './file-selection-context-menu';

const EDITABLE_FILE_LIMIT = 2 * 1024 * 1024;

const CodeTextEditor = lazy(() =>
  import('./code-text-editor').then((module) => ({
    default: module.CodeTextEditor,
  })),
);

type EditorMode = 'rich' | 'source';

type FileContent = {
  content: string;
  truncated: boolean;
  size: number;
  mimeType: string;
  isBinary: boolean;
};

type MarkdownEditorProps = {
  ariaLabel: string;
  filePath: string;
  initialValue: string;
  onChange: (markdown: string) => void;
  onError: (error: Error) => void;
  onSelectionChange: (selection: FileEditorSelection | null) => void;
};

type CrepeInstance = import('@milkdown/crepe').Crepe;

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
  ariaLabel,
  filePath,
  initialValue,
  onChange,
  onError,
  onSelectionChange,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const filePathRef = useRef(filePath);
  const initialValueRef = useRef(initialValue);
  const onChangeRef = useRef(onChange);
  const onErrorRef = useRef(onError);
  const onSelectionChangeRef = useRef(onSelectionChange);

  useEffect(() => {
    onChangeRef.current = onChange;
    onErrorRef.current = onError;
    onSelectionChangeRef.current = onSelectionChange;
  }, [onChange, onError, onSelectionChange]);

  useEffect(() => {
    const syncSelection = () => {
      onSelectionChangeRef.current(getDomEditorSelection(rootRef.current));
    };
    document.addEventListener('selectionchange', syncSelection);
    return () => {
      document.removeEventListener('selectionchange', syncSelection);
      onSelectionChangeRef.current(null);
    };
  }, []);

  useEffect(() => {
    if (!rootRef.current) return undefined;

    let disposed = false;
    let crepe: CrepeInstance | null = null;
    const root = rootRef.current;

    Promise.all([
      import('@milkdown/crepe'),
      import('@milkdown/kit/preset/commonmark'),
      import('@milkdown/kit/utils'),
    ])
      .then(([crepeModule, commonmarkModule, utilsModule]) => {
        if (disposed) return undefined;
        const { Crepe, CrepeFeature } = crepeModule;
        const { htmlSchema } = commonmarkModule;
        const { $view } = utilsModule;
        const resolveImageUrl = (source: string) =>
          resolveMarkdownImageUrl(source, filePathRef.current);

        crepe = new Crepe({
          root,
          defaultValue: initialValueRef.current,
          featureConfigs: {
            [CrepeFeature.ImageBlock]: {
              proxyDomURL: resolveImageUrl,
              onUpload: (file) =>
                createLocalImageUrl(file, window.electron.app.getPathForFile),
            },
          },
        });
        const htmlImageView = $view(htmlSchema.node, () => (initialNode) => {
          const dom = document.createElement('span');
          const render = (value: unknown) =>
            renderRawHtmlImages(dom, value, resolveImageUrl);
          render(initialNode.attrs.value);

          return {
            dom,
            update: (updatedNode) => {
              if (updatedNode.type !== initialNode.type) return false;
              render(updatedNode.attrs.value);
              return true;
            },
            ignoreMutation: () => true,
          };
        });
        crepe.editor.use(htmlImageView);
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
      aria-label={ariaLabel}
      role="group"
      style={milkdownTheme}
      className="h-full overflow-y-auto bg-background [&_.milkdown]:min-h-full [&_.ProseMirror]:min-h-full [&_.ProseMirror]:py-4!
       [&_.ProseMirror]:text-sm! [&_.ProseMirror_h1]:mt-0! [&_.ProseMirror_h2]:mt-0! [&_.ProseMirror_h3]:mt-0! [&_.ProseMirror_h4]:mt-0! [&_.ProseMirror_h5]:mt-0! [&_.ProseMirror_h6]:mt-0!"
    />
  );
};

type HtmlPreviewProps = {
  fileUrl: string;
  title: string;
  reloadKey: number;
  stale: boolean;
};

const HtmlPreview: React.FC<HtmlPreviewProps> = ({
  fileUrl,
  title,
  reloadKey,
  stale,
}) => {
  const { t } = useTranslation();
  const [manualReload, setManualReload] = useState(0);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {stale && (
        <div className="border-b bg-yellow-500/10 px-4 py-2 text-xs text-yellow-700 dark:text-yellow-300">
          {t('chat.file_html_preview_stale')}
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <iframe
          key={`${reloadKey}:${manualReload}`}
          src={fileUrl}
          title={title}
          sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
          className="h-full w-full border-0 bg-white"
        />
        <Button
          variant="outline"
          size="icon-sm"
          className="absolute right-3 top-3 size-7 opacity-60 hover:opacity-100"
          onClick={() => setManualReload((count) => count + 1)}
          title={t('chat.refresh')}
        >
          <IconRefresh className="size-3.5" />
        </Button>
      </div>
    </div>
  );
};

export type FileWorkspaceProps = {
  filePath: string;
  workspace: string;
  active?: boolean;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onAddToChat?: (reference: ChatFileSelectionReference) => void;
};

export const FileWorkspace: React.FC<FileWorkspaceProps> = ({
  filePath,
  workspace,
  active = true,
  onClose,
  onDirtyChange,
  onAddToChat,
}) => {
  const { t } = useTranslation();
  const [file, setFile] = useState<FileContent | null>(null);
  const [draft, setDraft] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>('rich');
  const [editorSelection, setEditorSelection] =
    useState<FileEditorSelection | null>(null);
  const [savedVersion, setSavedVersion] = useState(0);
  const tRef = useRef(t);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const fileName = useMemo(
    () => filePath.replaceAll('\\', '/').split('/').pop() || filePath,
    [filePath],
  );
  const markdown = isMarkdownFile(filePath);
  const htmlFile = isHtmlFile(filePath);
  const dirty = draft !== savedContent;
  const previewKind = file
    ? getFilePreviewKind(file.mimeType, file.isBinary)
    : 'unsupported';
  const editable = previewKind === 'text' && !file?.truncated;
  // 网页预览直接从磁盘加载，内容被截断或被判为二进制时同样能完整渲染。
  const htmlPreviewable =
    htmlFile && (previewKind === 'text' || previewKind === 'unsupported');
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

  useEffect(() => {
    setEditorSelection(null);
  }, [editorMode, filePath]);

  const handleEditorModeChange = useCallback((mode: EditorMode) => {
    setEditorSelection(null);
    setEditorMode(mode);
  }, []);

  const handleAddSelectionToChat = useCallback(
    (selection: FileEditorSelection) => {
      if (!onAddToChat) return;

      try {
        onAddToChat(
          createChatFileSelectionReference({
            selectedText: selection.text,
            sourcePath: filePath,
            startLine: selection.startLine,
            endLine: selection.endLine,
          }),
        );
      } catch (selectionError) {
        const message =
          selectionError instanceof RangeError
            ? t('chat.file_selection_too_large')
            : t('chat.file_selection_invalid');
        window.electron.app
          .toast(message, { type: 'error' })
          .catch(() => undefined);
      }
    },
    [filePath, onAddToChat, t],
  );

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
      setSavedVersion((version) => version + 1);
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

    if (htmlPreviewable && editorMode === 'rich') {
      return (
        <HtmlPreview
          fileUrl={fileUrl}
          title={fileName}
          reloadKey={savedVersion}
          stale={dirty}
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

      if (markdown && editorMode === 'rich') {
        return (
          <FileSelectionContextMenu
            selection={editorSelection}
            onAddToChat={handleAddSelectionToChat}
          >
            <div className="h-full min-h-0">
              <MarkdownEditor
                ariaLabel={t('chat.file_markdown_editor')}
                filePath={filePath}
                initialValue={draft}
                onChange={setDraft}
                onSelectionChange={setEditorSelection}
                onError={(milkdownError) => {
                  window.electron.app
                    .toast(milkdownError.message, { type: 'error' })
                    .catch(() => undefined);
                  handleEditorModeChange('source');
                }}
              />
            </div>
          </FileSelectionContextMenu>
        );
      }

      return (
        <FileSelectionContextMenu
          selection={editorSelection}
          onAddToChat={handleAddSelectionToChat}
        >
          <div className="h-full min-h-0">
            <Suspense
              fallback={
                <Textarea
                  aria-label={t('chat.file_source_editor')}
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setEditorSelection(null);
                  }}
                  onSelect={(event) => {
                    const { selectionStart, selectionEnd, value } =
                      event.currentTarget;
                    setEditorSelection(
                      getPlainTextEditorSelection(
                        value,
                        selectionStart,
                        selectionEnd,
                      ),
                    );
                  }}
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
                onSelectionChange={setEditorSelection}
              />
            </Suspense>
          </div>
        </FileSelectionContextMenu>
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
        {(() => {
          if (markdown)
            return <IconMarkdown className="size-4 shrink-0 text-blue-500" />;
          if (htmlFile)
            return (
              <IconFileTypeHtml className="size-4 shrink-0 text-orange-500" />
            );
          return (
            <IconFileText className="size-4 shrink-0 text-muted-foreground" />
          );
        })()}
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

        {((markdown && editable) || htmlPreviewable) && (
          <div className="flex rounded-md border bg-muted/30 p-0.5">
            <Button
              variant={editorMode === 'rich' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-6 px-2 text-xs shadow-none"
              onClick={() => handleEditorModeChange('rich')}
            >
              {markdown
                ? t('chat.file_markdown_editor')
                : t('chat.file_html_preview')}
            </Button>
            <Button
              variant={editorMode === 'source' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-6 px-2 text-xs shadow-none"
              onClick={() => handleEditorModeChange('source')}
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
