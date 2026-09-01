import React, {
  ForwardedRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  IconBrandVscode,
  IconChevronDown,
  IconChevronRight,
  IconEye,
  IconFile,
  IconFolder,
  IconFolderOpen,
  IconFolderShare,
  IconRefresh,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import { ChevronDownIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DirectoryTreeNode, SearchResult } from '@/types/common';
import { cn } from '@/renderer/lib/utils';
import { setChatFileReferenceDragData } from '@/renderer/lib/chat-file-reference';
import type { ChatFileSelectionReference } from '@/renderer/lib/chat-file-selection';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../ui/collapsible';
import { Button } from '../../ui/button';
import { ScrollArea } from '../../ui/scroll-area';
import { Input } from '../../ui/input';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../../ui/context-menu';
import { ButtonGroup } from '../../ui/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '../../ui/resizable';
import { FileWorkspace } from './file-workspace';

export type ChatFilesystemProps = {
  workspace?: string;
  active?: boolean;
  className?: string;
  onAddToChat?: (reference: ChatFileSelectionReference) => void;
};

export interface ChatFilesystemRef {}

type TreeNodeProps = {
  rootPath?: string;
  node: DirectoryTreeNode;
  level: number;
  defaultOpen?: boolean;
  refreshVersion: number;
  selectedFilePath?: string | null;
  onPreviewFile: (path: string) => void;
};

const TreeNode: React.FC<TreeNodeProps> = ({
  rootPath,
  node,
  level,
  defaultOpen = false,
  refreshVersion,
  selectedFilePath,
  onPreviewFile,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [children, setChildren] = useState<DirectoryTreeNode[] | undefined>(
    node.children,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(
    (node.children && node.children.length > 0) || node.children === undefined,
  );
  const handledRefreshVersionRef = useRef(refreshVersion);
  const hasChildren = node.children !== undefined;

  const handleDragStart = (event: React.DragEvent) => {
    let serializedPath = node.path;
    const normalizedNodePath = node.path.replaceAll('\\', '/');
    const normalizedRootPath = rootPath?.replaceAll('\\', '/');
    if (
      normalizedRootPath &&
      normalizedNodePath.startsWith(`${normalizedRootPath}/`)
    ) {
      serializedPath = `"./${normalizedNodePath.substring(normalizedRootPath.length + 1)}"`;
    }

    setChatFileReferenceDragData(event.dataTransfer, {
      serializedPath,
      sourcePath: node.path,
      name: node.name,
      kind: node.isDirectory ? 'directory' : 'file',
    });
  };

  const handleToggle = async (open: boolean) => {
    setIsOpen(open);
    if (!open || isLoaded || !hasChildren) return;

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
  };

  useEffect(() => {
    if (handledRefreshVersionRef.current === refreshVersion) return;
    handledRefreshVersionRef.current = refreshVersion;
    if (!isOpen || !hasChildren || refreshVersion === 0) return;

    const refreshChildren = async () => {
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
    };

    refreshChildren().catch(() => undefined);
  }, [hasChildren, isOpen, node.path, refreshVersion]);

  const paddingLeft = level * 16;

  if (node.isDirectory) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <Collapsible open={isOpen} onOpenChange={handleToggle}>
            <CollapsibleTrigger asChild>
              <div
                className="flex cursor-pointer select-none items-center gap-1 rounded-sm px-2 py-1 hover:bg-muted/50"
                style={{ paddingLeft }}
                draggable
                onDragStart={handleDragStart}
              >
                {hasChildren &&
                  (isOpen ? (
                    <IconChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  ))}
                {!hasChildren && <span className="size-4 shrink-0" />}
                {isOpen ? (
                  <IconFolderOpen className="size-4 shrink-0 text-yellow-500" />
                ) : (
                  <IconFolder className="size-4 shrink-0 text-yellow-500" />
                )}
                <span className="truncate text-sm">{node.name}</span>
                {isLoading && (
                  <IconRefresh className="ml-1 size-3 animate-spin text-muted-foreground" />
                )}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {children?.map((child) => (
                <TreeNode
                  key={child.path}
                  node={child}
                  level={level + 1}
                  rootPath={rootPath}
                  refreshVersion={refreshVersion}
                  selectedFilePath={selectedFilePath}
                  onPreviewFile={onPreviewFile}
                />
              ))}
            </CollapsibleContent>
          </Collapsible>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onClick={() => window.electron.app.openPath(node.path)}
          >
            <IconFolderShare className="mr-2 size-4" />
            {t('chat.open_in_explorer')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  const handleFileClick = () => onPreviewFile(node.path);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          className={cn(
            'flex cursor-pointer select-none items-center gap-1 rounded-sm px-2 py-1 hover:bg-muted/50',
            selectedFilePath === node.path &&
              'bg-accent text-accent-foreground',
          )}
          style={{ paddingLeft: paddingLeft + 20 }}
          onClick={handleFileClick}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') handleFileClick();
          }}
          draggable
          onDragStart={handleDragStart}
        >
          <IconFile className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm">{node.name}</span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={handleFileClick}>
          <IconEye className="mr-2 size-4" />
          {t('chat.preview_file')}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => window.electron.app.openPath(node.path)}
        >
          <IconFolderShare className="mr-2 size-4" />
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
  selectedFilePath?: string | null;
  onPreviewFile: (path: string) => void;
};

const highlightMatch = (text: string, query: string) => {
  if (!query) return text;

  try {
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escapedQuery})`, 'gi'));
    return parts.map((part, index) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <span
          key={`${part}:${index}`}
          className="rounded bg-yellow-300 px-0.5 text-foreground dark:bg-yellow-600"
        >
          {part}
        </span>
      ) : (
        part
      ),
    );
  } catch {
    return text;
  }
};

const SearchResultItem: React.FC<SearchResultItemProps> = ({
  result,
  workspace,
  searchQuery,
  selectedFilePath,
  onPreviewFile,
}) => {
  const { t } = useTranslation();
  const relativePath = result.file.replace(workspace, '').replace(/^[/\\]/, '');
  const fileName = relativePath.split(/[/\\]/).pop() || relativePath;
  const directoryPath = relativePath.substring(
    0,
    relativePath.length - fileName.length,
  );
  const isFolder = result.type === 'folder';

  const handleClick = () => {
    if (isFolder) {
      window.electron.app.openPath(result.file);
    } else {
      onPreviewFile(result.file);
    }
  };

  const handleDragStart = (event: React.DragEvent) => {
    let serializedPath = result.file;
    const normalizedFilePath = result.file.replaceAll('\\', '/');
    const normalizedWorkspacePath = workspace.replaceAll('\\', '/');
    if (normalizedFilePath.startsWith(`${normalizedWorkspacePath}/`)) {
      serializedPath = `"./${normalizedFilePath.substring(normalizedWorkspacePath.length + 1)}"`;
    }
    setChatFileReferenceDragData(event.dataTransfer, {
      serializedPath,
      sourcePath: result.file,
      name: fileName,
      kind: isFolder ? 'directory' : 'file',
    });
  };

  const resultClassName = cn(
    'cursor-pointer rounded-sm border-b border-border/50 px-2 py-1.5 last:border-b-0 hover:bg-muted/50',
    selectedFilePath === result.file && 'bg-accent text-accent-foreground',
  );
  const icon = isFolder ? (
    <IconFolder className="size-3 shrink-0 text-yellow-500" />
  ) : (
    <IconFile className="size-3 shrink-0 text-muted-foreground" />
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          className={resultClassName}
          onClick={handleClick}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') handleClick();
          }}
          draggable
          onDragStart={handleDragStart}
        >
          <div className="flex items-center gap-1.5 text-xs">
            {icon}
            <span className="truncate font-medium">
              {result.type === 'content'
                ? fileName
                : highlightMatch(result.match, searchQuery)}
            </span>
            {result.type === 'content' && (
              <span className="shrink-0 text-muted-foreground">
                :{result.line}
              </span>
            )}
          </div>
          <div className="truncate pl-4 text-xs text-muted-foreground">
            {result.type === 'content' ? directoryPath : relativePath}
          </div>
          {result.type === 'content' && (
            <div className="mt-0.5 truncate pl-4 font-mono text-xs">
              {highlightMatch(result.context, searchQuery)}
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {!isFolder && (
          <ContextMenuItem onClick={() => onPreviewFile(result.file)}>
            <IconEye className="mr-2 size-4" />
            {t('chat.preview_file')}
          </ContextMenuItem>
        )}
        <ContextMenuItem
          onClick={() => window.electron.app.openPath(result.file)}
        >
          <IconFolderShare className="mr-2 size-4" />
          {t('chat.open_in_explorer')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export const ChatFilesystem = React.forwardRef<
  ChatFilesystemRef,
  ChatFilesystemProps
>((props: ChatFilesystemProps, _ref: ForwardedRef<ChatFilesystemRef>) => {
  const { t } = useTranslation();
  const { workspace, className, active = true, onAddToChat } = props;
  const [tree, setTree] = useState<DirectoryTreeNode | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const loadRequestIdRef = useRef(0);

  const handlePreviewFile = useCallback(
    (filePath: string) => {
      if (filePath === selectedFilePath) return;
      // eslint-disable-next-line no-alert
      if (editorDirty && !window.confirm(t('chat.file_discard_changes')))
        return;
      setEditorDirty(false);
      setSelectedFilePath(filePath);
    },
    [editorDirty, selectedFilePath, t],
  );

  const loadTree = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;

    if (!workspace) {
      setTree(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const nextTree = await window.electron.app.getDirectoryTree(workspace);
      if (loadRequestIdRef.current !== requestId) return;
      setTree(nextTree);
      setRefreshVersion((version) => version + 1);
    } catch (loadError) {
      if (loadRequestIdRef.current !== requestId) return;
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load directory',
      );
    } finally {
      if (loadRequestIdRef.current === requestId) setLoading(false);
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
    } catch {
      setSearchResults([]);
      setSearchTotal(0);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, workspace]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setIsSearchMode(false);
  }, []);

  const openWith = useCallback(
    (action: string) => {
      if (workspace) window.electron.projects.openWith(workspace, action);
    },
    [workspace],
  );

  useEffect(() => {
    loadRequestIdRef.current += 1;
    setTree(null);
    setRefreshVersion(0);
    setLoading(false);
    setError(null);
    setSelectedFilePath(null);
    setEditorDirty(false);
  }, [workspace]);

  useEffect(() => {
    if (!active) return;
    loadTree().catch(() => undefined);
  }, [active, loadTree]);

  if (!workspace) {
    return (
      <div
        className={cn(
          'flex h-full items-center justify-center text-muted-foreground',
          className,
        )}
      >
        <p className="text-sm">{t('chat.no_workspace')}</p>
      </div>
    );
  }

  if (loading && !tree) {
    return (
      <div className={cn('flex h-full items-center justify-center', className)}>
        <IconRefresh className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          'flex h-full flex-col items-center justify-center gap-2',
          className,
        )}
      >
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={loadTree}>
          <IconRefresh className="mr-1 size-4" />
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  if (!tree) {
    return (
      <div
        className={cn(
          'flex h-full items-center justify-center text-muted-foreground',
          className,
        )}
      >
        <p className="text-sm">{t('chat.no_files_found')}</p>
      </div>
    );
  }

  const treePanel = (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <div className="flex items-center justify-between border-b px-2 py-1">
        <div className="min-w-0 flex-1">
          <Button
            variant="link"
            size="sm"
            className="w-full justify-start truncate text-xs text-muted-foreground"
            title={workspace}
            onClick={() => window.electron.app.openPath(workspace)}
          >
            {workspace}
          </Button>
        </div>
        <div className="flex flex-row gap-2">
          <ButtonGroup>
            <Button
              variant="outline"
              size="sm"
              className="pl-2!"
              onClick={() => openWith('vscode')}
            >
              <IconBrandVscode />
              Open
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="pl-2!">
                  <ChevronDownIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => openWith('vscode')}>
                    VS Code
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openWith('cursor')}>
                    Cursor
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openWith('terminal')}>
                    Terminal
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={loadTree}
            title={t('common.refresh')}
          >
            <IconRefresh className={cn('size-3', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <div className="border-b px-2 py-1.5">
        <div className="relative">
          <IconSearch className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-7 pl-7 pr-7 text-xs"
            placeholder={t('chat.search_files')}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                handleSearch().catch(() => undefined);
              }
              if (event.key === 'Escape') handleClearSearch();
            }}
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute right-1 top-1/2 size-5 -translate-y-1/2 rounded-full"
              onClick={handleClearSearch}
            >
              <IconX className="size-3" />
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
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
                    ? t('chat.showing_results', {
                        count: 50,
                        total: searchTotal,
                      })
                    : t('chat.results_count', { count: searchTotal })}
                </div>
                {searchResults.map((result, index) => (
                  <SearchResultItem
                    key={`${result.file}:${result.line}:${index}`}
                    result={result}
                    workspace={workspace}
                    searchQuery={searchQuery}
                    selectedFilePath={selectedFilePath}
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
                rootPath={workspace}
                refreshVersion={refreshVersion}
                selectedFilePath={selectedFilePath}
                onPreviewFile={handlePreviewFile}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  return (
    <div className={cn('h-full min-w-0 overflow-hidden', className)}>
      <ResizablePanelGroup direction="horizontal" className="h-full w-full">
        <ResizablePanel
          id="chat-file-tree"
          order={1}
          defaultSize={selectedFilePath ? 35 : 100}
          minSize={22}
          className="h-full min-w-0"
        >
          {treePanel}
        </ResizablePanel>
        {selectedFilePath && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel
              id="chat-file-workspace"
              order={2}
              defaultSize={65}
              minSize={35}
              className="h-full min-w-0"
            >
              <FileWorkspace
                key={selectedFilePath}
                filePath={selectedFilePath}
                workspace={workspace}
                active={active}
                onAddToChat={onAddToChat}
                onDirtyChange={setEditorDirty}
                onClose={() => {
                  setSelectedFilePath(null);
                  setEditorDirty(false);
                }}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
});

ChatFilesystem.displayName = 'ChatFilesystem';
