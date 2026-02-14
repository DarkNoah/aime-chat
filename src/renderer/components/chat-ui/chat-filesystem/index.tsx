import React, { ForwardedRef, useEffect, useState, useCallback } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../ui/collapsible';
import {
  IconChevronRight,
  IconChevronDown,
  IconFolder,
  IconFolderOpen,
  IconFile,
  IconRefresh,
  IconSearch,
  IconX,
  IconEye,
  IconFolderShare,
} from '@tabler/icons-react';
import { DirectoryTreeNode, SearchResult } from '@/types/common';
import { Button } from '../../ui/button';
import { cn } from '@/renderer/lib/utils';
import { ScrollArea } from '../../ui/scroll-area';
import { Input } from '../../ui/input';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../../ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { useTranslation } from 'react-i18next';
import { set } from 'core-js/core/dict';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import { Badge } from '../../ui/badge';

export type ChatFilesystemProps = {
  workspace?: string;
  className?: string;
};

export interface ChatFilesystemRef { }

type FilePreviewState = {
  open: boolean;
  path: string | null;
  content: string;
  loading: boolean;
  error: string | null;
  truncated: boolean;
  size: number;
};

// 文件预览对话框组件
const FilePreviewDialog: React.FC<{
  state: FilePreviewState;
  onClose: () => void;
}> = ({ state, onClose }) => {
  const { t } = useTranslation();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [fileSize, setFileSize] = useState(0);
  const [mimeType, setMimeType] = useState<string>('');
  const [isBinary, setIsBinary] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  useEffect(() => {
    if (state.open && state.path) {
      setLoading(true);
      setError(null);
      window.electron.app
        .readFileContent(state.path, { limit: 500000 })
        .then((result) => {
          if (!result.isBinary) {
            setContent(result.content);
          }
          setIsBinary(result.isBinary);
          setMimeType(result.mimeType);
          setTruncated(result.truncated);
          setFileSize(result.size);
          setFileName(state.path.replaceAll('\\', '/').split('/').pop());
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Failed to read file');
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setContent('');
      setError(null);
      setTruncated(false);
      setFileSize(0);
    }
  }, [state.open, state.path]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };


  return (
    <Dialog open={state.open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium truncate pr-8">
            {t('chat.file_preview')} - {fileName}
          </DialogTitle>
          <DialogDescription>
            <span className="text-xs text-muted-foreground">{state.path}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden">
          {loading && (
            <div className="flex items-center justify-center h-32">
              <IconRefresh className="size-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                {t('common.loading')}
              </span>
            </div>
          )}
          {error && (
            <div className="flex flex-col items-center justify-center h-32 text-destructive">
              <p className="text-sm">{error}</p>
            </div>
          )}
          {!loading && !error && (
            <>
              {truncated && (
                <div className="px-4 py-2 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 text-xs">
                  {t('chat.file_too_large', { size: formatSize(fileSize) })}
                </div>
              )}


              <div className="max-h-[60vh] overflow-y-auto">
                {!isBinary && (
                  <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-all">
                    {content || t('common.no_data')}
                  </pre>
                )}
                {isBinary && (
                  <div className="p-4 text-xs text-muted-foreground">
                    {mimeType.startsWith('image/') && (
                      <PhotoProvider>
                        <PhotoView src={`file://${state.path}`}>
                          <img
                            alt={fileName || 'attachment'}
                            className="size-full object-cover rounded-2xl"
                            height={100}
                            src={`file://${state.path}`}
                            width={100}
                          />
                        </PhotoView>
                      </PhotoProvider>
                    )
                    }
                    {mimeType.startsWith('audio/') &&
                      <audio src={`file://${state.path}`} controls className='w-full' />}
                    {mimeType.startsWith('video/') &&
                      <video src={`file://${state.path}`} controls />}
                    {mimeType.startsWith('application/pdf') &&
                      <iframe src={`file://${state.path}`} className="w-full h-auto" />}
                  </div>
                )}
              </div>


            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

type TreeNodeProps = {
  node: DirectoryTreeNode;
  level: number;
  defaultOpen?: boolean;
  onPreviewFile: (path: string) => void;
};

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  level,
  defaultOpen = false,
  onPreviewFile,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [children, setChildren] = useState<DirectoryTreeNode[] | undefined>(
    node.children,
  );
  const [isLoading, setIsLoading] = useState(false);
  // 如果 children 有内容或者 children 是 undefined（无子项），则认为已加载
  const [isLoaded, setIsLoaded] = useState(
    (node.children && node.children.length > 0) || node.children === undefined,
  );

  // 检查是否有子项可展开
  const hasChildren = node.children !== undefined;

  const handleFileClick = () => {
    if (!node.isDirectory) {
      // window.electron.app.openPath(node.path);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', node.path);
    e.dataTransfer.setData('application/x-file-path', node.path);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleToggle = async (open: boolean) => {
    setIsOpen(open);

    // 如果打开且未加载过子项，则加载
    if (open && !isLoaded && hasChildren) {
      setIsLoading(true);
      try {
        const loadedChildren = await window.electron.app.getDirectoryChildren(
          node.path,
        );
        setChildren(loadedChildren);
        setIsLoaded(true);
      } catch {
        setChildren([]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const paddingLeft = level * 16;

  if (node.isDirectory) {
    return (
      <Collapsible open={isOpen} onOpenChange={handleToggle}>
        <CollapsibleTrigger asChild>
          <div
            className="flex items-center gap-1 py-1 px-2 hover:bg-muted/50 cursor-pointer rounded-sm select-none"
            style={{ paddingLeft }}
            draggable
            onDragStart={handleDragStart}
          >
            {hasChildren && isOpen && (
              <IconChevronDown className="size-4 text-muted-foreground shrink-0" />
            )}
            {hasChildren && !isOpen && (
              <IconChevronRight className="size-4 text-muted-foreground shrink-0" />
            )}
            {!hasChildren && <span className="size-4 shrink-0" />}
            {isOpen ? (
              <IconFolderOpen className="size-4 text-yellow-500 shrink-0" />
            ) : (
              <IconFolder className="size-4 text-yellow-500 shrink-0" />
            )}
            <span className="text-sm truncate">{node.name}</span>
            {isLoading && (
              <IconRefresh className="size-3 animate-spin text-muted-foreground ml-1" />
            )}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {children?.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              level={level + 1}
              onPreviewFile={onPreviewFile}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          className="flex items-center gap-1 py-1 px-2 hover:bg-muted/50 cursor-grab active:cursor-grabbing rounded-sm select-none"
          style={{ paddingLeft: paddingLeft + 20 }}
          onClick={handleFileClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              handleFileClick();
            }
          }}
          draggable
          onDragStart={handleDragStart}
        >
          <IconFile className="size-4 text-muted-foreground shrink-0" />
          <span className="text-sm truncate">{node.name}</span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onPreviewFile(node.path)}>
          <IconEye className="size-4 mr-2" />
          {t('chat.preview_file')}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => window.electron.app.openPath(node.path)}>
          <IconFolderShare className="size-4 mr-2" />
          {t('chat.open_in_explorer')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

type SearchResultItemProps = {
  result: SearchResult;
  workspace: string;
  searchQuery: string;
  onPreviewFile: (path: string) => void;
};

// 高亮匹配文本的辅助函数
const highlightMatch = (text: string, query: string) => {
  if (!query) return text;

  try {
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) => {
      if (part.toLowerCase() === query.toLowerCase()) {
        return (
          <span
            key={index}
            className="bg-yellow-300 dark:bg-yellow-600 text-foreground rounded px-0.5"
          >
            {part}
          </span>
        );
      }
      return part;
    });
  } catch {
    return text;
  }
};

const SearchResultItem: React.FC<SearchResultItemProps> = ({
  result,
  workspace,
  searchQuery,
  onPreviewFile,
}) => {
  const { t } = useTranslation();
  const relativePath = result.file.replace(workspace, '').replace(/^\//, '');
  const fileName = relativePath.split('/').pop() || relativePath;
  const dirPath = relativePath.substring(
    0,
    relativePath.length - fileName.length,
  );

  const handleClick = () => {
    window.electron.app.openPath(result.file);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', result.file);
    e.dataTransfer.setData('application/x-file-path', result.file);
    e.dataTransfer.effectAllowed = 'copy';
  };

  // 根据类型选择图标
  const getIcon = () => {
    switch (result.type) {
      case 'folder':
        return <IconFolder className="size-3 shrink-0 text-yellow-500" />;
      case 'filename':
        return <IconFile className="size-3 shrink-0 text-blue-500" />;
      case 'content':
      default:
        return <IconFile className="size-3 shrink-0 text-muted-foreground" />;
    }
  };

  // 根据类型选择标签
  const getTypeLabel = () => {
    switch (result.type) {
      case 'folder':
        return (
          <span className="text-[10px] px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-600 dark:text-yellow-400">
            folder
          </span>
        );
      case 'filename':
        return (
          <span className="text-[10px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-600 dark:text-blue-400">
            file
          </span>
        );
      default:
        return null;
    }
  };

  // 文件名/文件夹名匹配时的渲染
  if (result.type === 'filename' || result.type === 'folder') {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            className="px-2 py-1.5 hover:bg-muted/50 cursor-grab active:cursor-grabbing rounded-sm border-b border-border/50 last:border-b-0"
            onClick={handleClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                handleClick();
              }
            }}
            draggable
            onDragStart={handleDragStart}
          >
            <div className="flex items-center gap-1.5 text-xs">
              {getIcon()}
              <span className="font-medium">
                {highlightMatch(result.match, searchQuery)}
              </span>
              {getTypeLabel()}
            </div>
            <div className="pl-4 text-xs text-muted-foreground truncate">
              {relativePath}
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {result.type === 'filename' && (
            <ContextMenuItem onClick={() => onPreviewFile(result.file)}>
              <IconEye className="size-4 mr-2" />
              {t('chat.preview_file')}
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={() => window.electron.app.openPath(result.file)}>
            <IconFolderShare className="size-4 mr-2" />
            {t('chat.open_in_explorer')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  // 内容匹配时的渲染
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          className="px-2 py-1.5 hover:bg-muted/50 cursor-grab active:cursor-grabbing rounded-sm border-b border-border/50 last:border-b-0"
          onClick={handleClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              handleClick();
            }
          }}
          draggable
          onDragStart={handleDragStart}
        >
          <div className="flex items-center gap-1 text-xs">
            {getIcon()}
            <span className="font-medium">{fileName}</span>
            <span className="text-muted-foreground shrink-0">:{result.line}</span>
          </div>
          <div className="pl-4 text-xs text-muted-foreground truncate">
            {dirPath}
          </div>
          <div className="pl-4 text-xs mt-0.5 font-mono truncate">
            {highlightMatch(result.context, searchQuery)}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onPreviewFile(result.file)}>
          <IconEye className="size-4 mr-2" />
          {t('chat.preview_file')}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => window.electron.app.openPath(result.file)}>
          <IconFolderShare className="size-4 mr-2" />
          {t('chat.open_in_explorer')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export const ChatFilesystem = React.forwardRef<
  ChatFilesystemRef,
  ChatFilesystemProps
>((props: ChatFilesystemProps, ref: ForwardedRef<ChatFilesystemRef>) => {
  const { t } = useTranslation();
  const { workspace, className } = props;
  const [tree, setTree] = useState<DirectoryTreeNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 搜索相关状态
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(false);

  // 文件预览状态
  const [previewState, setPreviewState] = useState<FilePreviewState>({
    open: false,
    path: null,
    content: '',
    loading: false,
    error: null,
    truncated: false,
    size: 0,
  });

  const handlePreviewFile = useCallback((path: string) => {
    setPreviewState({
      open: true,
      path,
      content: '',
      loading: true,
      error: null,
      truncated: false,
      size: 0,
    });
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewState((prev) => ({ ...prev, open: false }));
  }, []);

  const loadTree = useCallback(async () => {
    if (!workspace) {
      setTree(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await window.electron.app.getDirectoryTree(workspace);
      setTree(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  const handleSearch = useCallback(async () => {
    if (!workspace || !searchQuery.trim()) {
      setSearchResults([]);
      setIsSearchMode(false);
      return;
    }

    setSearching(true);
    setIsSearchMode(true);

    try {
      const result = await window.electron.app.searchInDirectory({
        pattern: searchQuery,
        directory: workspace,
        caseSensitive: false,
        limit: 50,
      });
      setSearchResults(result.results);
      setSearchTotal(result.total);
      setSearchTruncated(result.truncated);
    } catch (err) {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [workspace, searchQuery]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setIsSearchMode(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSearch();
      } else if (e.key === 'Escape') {
        handleClearSearch();
      }
    },
    [handleSearch, handleClearSearch],
  );

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  if (!workspace) {
    return (
      <div
        className={cn(
          'flex items-center justify-center h-full text-muted-foreground',
          className,
        )}
      >
        <p className="text-sm">{t('chat.no_workspace')}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <IconRefresh className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center h-full gap-2',
          className,
        )}
      >
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={loadTree}>
          <IconRefresh className="size-4 mr-1" />
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  if (!tree) {
    return (
      <div
        className={cn(
          'flex items-center justify-center h-full text-muted-foreground',
          className,
        )}
      >
        <p className="text-sm">{t('chat.no_files_found')}</p>
      </div>
    );
  }

  return (
    <>
      <div className={cn('h-full flex flex-col ', className)}>
        {/* 头部：路径和刷新按钮 */}
        <div className="flex items-center justify-between px-2 py-1 border-b">
          <div className="flex-1 min-w-0">
            <Button
              variant="link"
              size="sm"
              className="text-xs text-muted-foreground truncate justify-start w-full"
              title={workspace}
              onClick={() => {
                window.electron.app.openPath(workspace);
              }}
            >
              {workspace}
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={loadTree}
            title={t('common.refresh')}
          >
            <IconRefresh className="size-3" />
          </Button>
        </div>

        {/* 搜索框 */}
        <div className="px-2 py-1.5 border-b">
          <div className="relative">
            <IconSearch className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              className="h-7 pl-7 pr-7 text-xs"
              placeholder={t('chat.search_files')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full w-5 h-5"
                onClick={handleClearSearch}
              >
                <IconX className="size-3" />
              </Button>
            )}
          </div>
        </div>

        {/* 内容区域 */}
        <ScrollArea className="flex-1 h-[calc(100%-82px)]">
          {searching && (
            <div className="flex items-center justify-center py-8">
              <IconRefresh className="size-4 animate-spin text-muted-foreground" />
              <span className="ml-2 text-xs text-muted-foreground">
                {t('chat.searching')}
              </span>
            </div>
          )}
          {!searching && isSearchMode && (
            <div className="py-1">
              {searchResults.length > 0 ? (
                <>
                  <div className="px-2 py-1 text-xs text-muted-foreground">
                    {searchTruncated
                      ? t('chat.showing_results', { count: 50, total: searchTotal })
                      : t('chat.results_count', { count: searchTotal })}
                  </div>
                  {searchResults.map((result, index) => (
                    <SearchResultItem
                      key={`${result.file}:${result.line}:${index}`}
                      result={result}
                      workspace={workspace}
                      searchQuery={searchQuery}
                      onPreviewFile={handlePreviewFile}
                    />
                  ))}
                </>
              ) : (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <p className="text-xs">{t('chat.no_results')}</p>
                </div>
              )}
            </div>
          )}
          {!searching && !isSearchMode && (
            <div className="p-1">
              {tree.children?.map((child) => (
                <TreeNode
                  key={child.path}
                  node={child}
                  level={0}
                  onPreviewFile={handlePreviewFile}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* 文件预览对话框 */}
      <FilePreviewDialog state={previewState} onClose={handleClosePreview} />
    </>
  );
});

ChatFilesystem.displayName = 'ChatFilesystem';
