import React, {
  ForwardedRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import {
  IconBrandVscode,
  IconChevronDown,
  IconChevronRight,
  IconEye,
  IconFile,
  IconFilePlus,
  IconFolderPlus,
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
import type { ChatFilePreviewRequest } from '@/types/chat';
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
import { FileTabs, FileTabPanel, type OpenFile } from './file-tabs';
import {
  EntryActions,
  entryActionKeys,
  type EntryTarget,
  type EntryActionHandler,
} from './entry-actions';
import type { WorkspaceEntryAction } from '@/types/workspace-entry';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../ui/dialog';
import { isFileWithinDirectory } from './file-preview-path';

export type ChatFilesystemProps = {
  workspace?: string;
  active?: boolean;
  filePreviewRequest?: ChatFilePreviewRequest;
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
  onEntryAction: EntryActionHandler;
};

const TreeNode: React.FC<TreeNodeProps> = ({
  rootPath,
  node,
  level,
  defaultOpen = false,
  refreshVersion,
  selectedFilePath,
  onPreviewFile,
  onEntryAction,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [children, setChildren] = useState<DirectoryTreeNode[] | undefined>(
    node.children,
  );
  const [isLoading, setIsLoading] = useState(false);
  const isOpenRef = useRef(defaultOpen);
  const childrenRequestIdRef = useRef(0);
  const handledRefreshVersionRef = useRef(refreshVersion);
  const fileNodeRef = useRef<HTMLDivElement>(null);
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

  const refreshChildren = useCallback(async () => {
    childrenRequestIdRef.current += 1;
    const requestId = childrenRequestIdRef.current;
    setIsLoading(true);
    try {
      const loadedChildren = await window.electron.app.getDirectoryChildren(
        node.path,
      );
      if (childrenRequestIdRef.current === requestId)
        setChildren(loadedChildren);
    } catch {
      if (childrenRequestIdRef.current === requestId) setChildren([]);
    } finally {
      if (childrenRequestIdRef.current === requestId) setIsLoading(false);
    }
  }, [node.path]);

  useEffect(
    () => () => {
      childrenRequestIdRef.current += 1;
    },
    [node.path],
  );

  const handleToggle = useCallback(
    async (open: boolean) => {
      isOpenRef.current = open;
      setIsOpen(open);
      if (!open) {
        childrenRequestIdRef.current += 1;
        setIsLoading(false);
        return;
      }
      if (hasChildren) await refreshChildren();
    },
    [hasChildren, refreshChildren],
  );

  useEffect(() => {
    if (!selectedFilePath) return;
    if (
      node.isDirectory &&
      isFileWithinDirectory(selectedFilePath, node.path)
    ) {
      // Revealing a selected file should not reload an already expanded folder.
      if (!isOpenRef.current) handleToggle(true).catch(() => undefined);
    } else if (selectedFilePath === node.path) {
      fileNodeRef.current?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [handleToggle, node.isDirectory, node.path, selectedFilePath]);

  useEffect(() => {
    if (handledRefreshVersionRef.current === refreshVersion) return;
    handledRefreshVersionRef.current = refreshVersion;
    if (!hasChildren || !isOpen || refreshVersion === 0) return;
    refreshChildren().catch(() => undefined);
  }, [hasChildren, isOpen, refreshChildren, refreshVersion]);

  const paddingLeft = level * 16;

  if (node.isDirectory) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <Collapsible open={isOpen} onOpenChange={handleToggle}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full cursor-pointer select-none items-center gap-1 rounded-sm px-2 py-1 text-left hover:bg-muted/50"
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
              </button>
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
                  onEntryAction={onEntryAction}
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
          <EntryActions target={node} onAction={onEntryAction} />
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  const handleFileClick = () => onPreviewFile(node.path);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={fileNodeRef}
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
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handleFileClick();
            }
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
        <EntryActions target={node} onAction={onEntryAction} />
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
  onEntryAction: EntryActionHandler;
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
  onEntryAction,
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
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handleClick();
            }
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
        <EntryActions
          target={{ path: result.file, name: fileName, isDirectory: isFolder }}
          onAction={onEntryAction}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
};

export const ChatFilesystem = React.forwardRef<
  ChatFilesystemRef,
  ChatFilesystemProps
>((props: ChatFilesystemProps, _ref: ForwardedRef<ChatFilesystemRef>) => {
  const { t } = useTranslation();
  const {
    workspace,
    className,
    active = true,
    onAddToChat,
    filePreviewRequest,
  } = props;
  const tabIdPrefix = useId();
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
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
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const openFilesRef = useRef(openFiles);
  openFilesRef.current = openFiles;
  const [entryOperation, setEntryOperation] = useState<{
    action: WorkspaceEntryAction;
    target: EntryTarget;
  } | null>(null);
  const [entryName, setEntryName] = useState('');
  const [entryError, setEntryError] = useState<string | null>(null);
  const [entryBusy, setEntryBusy] = useState(false);
  const loadRequestIdRef = useRef(0);
  const handledPreviewRequestRef = useRef<ChatFilePreviewRequest | undefined>(
    undefined,
  );

  const handlePreviewFile = useCallback((filePath: string) => {
    setOpenFiles((files) =>
      files.some((file) => file.path === filePath)
        ? files
        : [...files, { path: filePath, dirty: false }],
    );
    setSelectedFilePath(filePath);
    return true;
  }, []);

  const handleDirtyChange = useCallback((filePath: string, dirty: boolean) => {
    setOpenFiles((files) =>
      files.map((file) =>
        file.path === filePath && file.dirty !== dirty
          ? { ...file, dirty }
          : file,
      ),
    );
  }, []);

  const closeFile = (filePath: string, confirmed = false) => {
    if (
      !confirmed &&
      openFiles.some((file) => file.path === filePath && file.dirty) &&
      // eslint-disable-next-line no-alert
      !window.confirm(t('chat.file_discard_changes'))
    )
      return;
    const index = openFiles.findIndex((file) => file.path === filePath);
    const remaining = openFiles.filter((file) => file.path !== filePath);
    setOpenFiles(remaining);
    if (selectedFilePath === filePath)
      setSelectedFilePath(
        remaining[Math.min(index, remaining.length - 1)]?.path ?? null,
      );
  };

  const handleEntryAction: EntryActionHandler = (action, target) => {
    setEntryName(action === 'rename' ? target.name : '');
    setEntryError(null);
    setEntryOperation({ action, target });
  };

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

  const submitEntryOperation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!entryOperation || !workspace || entryBusy) return;
    const { action, target } = entryOperation;
    const affected = (filePath: string) =>
      filePath === target.path || isFileWithinDirectory(filePath, target.path);
    if (
      action === 'rename' &&
      openFiles.some((file) => affected(file.path) && file.dirty)
    ) {
      setEntryError(t('chat.file_save_before_rename'));
      return;
    }
    setEntryBusy(true);
    setEntryError(null);
    try {
      const result = await window.electron.app.mutateWorkspaceEntry({
        workspace,
        path: target.path,
        action,
        name: entryName,
      });
      if (workspaceRef.current !== workspace) return;
      if (action === 'rename') {
        const renamed = (filePath: string) =>
          affected(filePath)
            ? result.path + filePath.slice(target.path.length)
            : filePath;
        setOpenFiles((files) =>
          files.map((file) => ({ ...file, path: renamed(file.path) })),
        );
        setSelectedFilePath((current) => (current ? renamed(current) : null));
      } else if (action === 'delete') {
        const remaining = openFilesRef.current.filter(
          (file) => !affected(file.path),
        );
        setOpenFiles((files) => files.filter((file) => !affected(file.path)));
        setSelectedFilePath((current) =>
          current && affected(current) ? (remaining[0]?.path ?? null) : current,
        );
      } else if (action === 'create-file') handlePreviewFile(result.path);
      setEntryOperation(null);
      handleClearSearch();
      await loadTree();
    } catch (operationError) {
      if (workspaceRef.current !== workspace) return;
      setEntryError(
        operationError instanceof Error
          ? operationError.message
          : t('chat.file_operation_error'),
      );
    } finally {
      setEntryBusy(false);
    }
  };

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
    setOpenFiles([]);
    setEntryOperation(null);
    handleClearSearch();
  }, [workspace, handleClearSearch]);

  useEffect(() => {
    if (
      !active ||
      !filePreviewRequest ||
      handledPreviewRequestRef.current === filePreviewRequest
    )
      return;
    handledPreviewRequestRef.current = filePreviewRequest;
    if (
      !workspace ||
      !isFileWithinDirectory(filePreviewRequest.filePath, workspace)
    )
      return;
    if (!handlePreviewFile(filePreviewRequest.filePath)) return;
    handleClearSearch();
  }, [
    active,
    workspace,
    filePreviewRequest,
    handleClearSearch,
    handlePreviewFile,
  ]);

  useEffect(() => {
    if (!active) return;
    loadTree().catch(() => undefined);
  }, [active, loadTree, filePreviewRequest]);

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

  if (error && !tree) {
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
        <div className="flex flex-row gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            title={t('chat.file_new')}
            aria-label={t('chat.file_new')}
            onClick={() => handleEntryAction('create-file', tree)}
          >
            <IconFilePlus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title={t('chat.folder_new')}
            aria-label={t('chat.folder_new')}
            onClick={() => handleEntryAction('create-directory', tree)}
          >
            <IconFolderPlus className="size-4" />
          </Button>
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

      {error && (
        <p role="alert" className="px-2 py-1 text-xs text-destructive">
          {error}
        </p>
      )}
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
                    onEntryAction={handleEntryAction}
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
                onEntryAction={handleEntryAction}
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
              <div className="flex h-full min-w-0 flex-col">
                <FileTabs
                  idPrefix={tabIdPrefix}
                  files={openFiles}
                  selected={selectedFilePath}
                  onSelect={setSelectedFilePath}
                  onClose={closeFile}
                />
                {openFiles.map((file, index) => (
                  <div
                    key={file.path}
                    role="tabpanel"
                    id={`${tabIdPrefix}-panel-${index}`}
                    aria-labelledby={`${tabIdPrefix}-tab-${index}`}
                    hidden={selectedFilePath !== file.path}
                    className="min-h-0 flex-1 overflow-hidden"
                  >
                    <FileTabPanel
                      filePath={file.path}
                      workspace={workspace}
                      active={active && selectedFilePath === file.path}
                      onAddToChat={onAddToChat}
                      onDirtyChange={handleDirtyChange}
                      onClose={() => closeFile(file.path, true)}
                    />
                  </div>
                ))}
              </div>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
      <Dialog
        open={!!entryOperation}
        onOpenChange={(open) => {
          if (!open && !entryBusy) setEntryOperation(null);
        }}
      >
        <DialogContent>
          <form onSubmit={submitEntryOperation} className="space-y-4">
            <DialogHeader>
              <DialogTitle>
                {entryOperation && t(entryActionKeys[entryOperation.action])}
              </DialogTitle>
              <DialogDescription className="break-all">
                {entryOperation?.action === 'delete'
                  ? t('chat.file_delete_confirm', {
                      name: entryOperation.target.name,
                    })
                  : entryOperation?.target.path}
              </DialogDescription>
            </DialogHeader>
            {entryOperation?.action !== 'delete' && (
              <Input
                autoFocus
                aria-label={t('chat.file_name')}
                value={entryName}
                onChange={(event) => setEntryName(event.target.value)}
                disabled={entryBusy}
              />
            )}
            {entryOperation?.action === 'delete' &&
              openFiles.some(
                (file) =>
                  file.dirty &&
                  (file.path === entryOperation.target.path ||
                    isFileWithinDirectory(
                      file.path,
                      entryOperation.target.path,
                    )),
              ) && (
                <p className="text-sm text-destructive">
                  {t('chat.file_delete_unsaved')}
                </p>
              )}
            {entryError && (
              <p role="alert" className="text-sm text-destructive">
                {entryError}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={entryBusy}
                onClick={() => setEntryOperation(null)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                variant={
                  entryOperation?.action === 'delete'
                    ? 'destructive'
                    : 'default'
                }
                disabled={
                  entryBusy ||
                  (entryOperation?.action !== 'delete' && !entryName.trim())
                }
              >
                {entryBusy
                  ? t('common.loading')
                  : entryOperation && t(entryActionKeys[entryOperation.action])}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
});

ChatFilesystem.displayName = 'ChatFilesystem';
