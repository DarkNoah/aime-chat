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
} from '@tabler/icons-react';
import { DirectoryTreeNode, SearchResult } from '@/types/common';
import { Button } from '../../ui/button';
import { cn } from '@/renderer/lib/utils';
import { ScrollArea } from '../../ui/scroll-area';
import { Input } from '../../ui/input';

export type ChatFilesystemProps = {
  workspace?: string;
  className?: string;
};

export interface ChatFilesystemRef {}

type TreeNodeProps = {
  node: DirectoryTreeNode;
  level: number;
  defaultOpen?: boolean;
};

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  level,
  defaultOpen = false,
}) => {
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
      window.electron.app.openPath(node.path);
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
            <TreeNode key={child.path} node={child} level={level + 1} />
          ))}
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
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
  );
};

type SearchResultItemProps = {
  result: SearchResult;
  workspace: string;
  searchQuery: string;
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
}) => {
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
    );
  }

  // 内容匹配时的渲染
  return (
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
  );
};

export const ChatFilesystem = React.forwardRef<
  ChatFilesystemRef,
  ChatFilesystemProps
>((props: ChatFilesystemProps, ref: ForwardedRef<ChatFilesystemRef>) => {
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
        <p className="text-sm">No workspace configured</p>
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
          Retry
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
        <p className="text-sm">No files found</p>
      </div>
    );
  }

  return (
    <div className={cn('h-full flex flex-col ', className)}>
      {/* 头部：路径和刷新按钮 */}
      <div className="flex items-center justify-between px-2 py-1 border-b">
        <Button
          variant="link"
          size="sm"
          className="text-xs text-muted-foreground truncate flex-1 justify-start"
          title={workspace}
          onClick={() => {
            window.electron.app.openPath(workspace);
          }}
        >
          {workspace}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={loadTree}
          title="Refresh"
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
            placeholder="Search files... (Enter to search)"
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
              Searching...
            </span>
          </div>
        )}
        {!searching && isSearchMode && (
          <div className="py-1">
            {searchResults.length > 0 ? (
              <>
                <div className="px-2 py-1 text-xs text-muted-foreground">
                  {searchTruncated
                    ? `Showing 50 of ${searchTotal} results`
                    : `${searchTotal} result${searchTotal !== 1 ? 's' : ''}`}
                </div>
                {searchResults.map((result, index) => (
                  <SearchResultItem
                    key={`${result.file}:${result.line}:${index}`}
                    result={result}
                    workspace={workspace}
                    searchQuery={searchQuery}
                  />
                ))}
              </>
            ) : (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <p className="text-xs">No results found</p>
              </div>
            )}
          </div>
        )}
        {!searching && !isSearchMode && (
          <div className="py-1">
            {tree.children?.map((child) => (
              <TreeNode key={child.path} node={child} level={0} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
});

ChatFilesystem.displayName = 'ChatFilesystem';
