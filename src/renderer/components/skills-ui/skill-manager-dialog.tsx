/* eslint-disable no-await-in-loop */
import { DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/renderer/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/renderer/components/ui/tabs';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/renderer/components/ui/input-group';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/renderer/components/ui/item';
import { Badge } from '@/renderer/components/ui/badge';
import { Button } from '@/renderer/components/ui/button';
import { Checkbox } from '@/renderer/components/ui/checkbox';
import { cn } from '@/renderer/lib/utils';
import { SkillInfo } from '@/types/skill';
import { ToolType } from '@/types/tool';
import {
  DownloadIcon,
  FileIcon,
  PackagePlusIcon,
  PlusIcon,
  SearchIcon,
  UploadIcon,
  XIcon,
} from 'lucide-react';
import { IconLoader } from '@tabler/icons-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { FileInfo } from '@/types/common';

const SEARCH_HISTORY_KEY = 'skill-import-search-history';
const MAX_HISTORY = 5;

interface SearchSkillResult {
  name: string;
  slug: string;
  source: string;
  installs: number;
}

function loadSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSearchHistory(history: string[]) {
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
}

function formatInstalls(count: number): string {
  if (!count || count <= 0) return '';
  if (count >= 1_000_000)
    return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (count >= 1_000)
    return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${count}`;
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function isDirectSkillUrl(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const isGithubHost = host === 'github.com' || host.endsWith('.github.com');
    return (
      /^https?:$/i.test(u.protocol) &&
      !isGithubHost &&
      /\.md$/i.test(u.pathname)
    );
  } catch {
    return false;
  }
}

function getSkillKey(skill: SkillInfo) {
  return skill.id.split(':').slice(1).join(':');
}

function isProjectSkill(projectSkills: SkillInfo[], skill: SkillInfo) {
  const key = getSkillKey(skill);
  const localKey = skill.id.split(':').slice(2).join(':');
  return projectSkills.some((item) => {
    const projectKey = getSkillKey(item);
    return (
      projectKey === key ||
      projectKey === localKey ||
      item.name === skill.name ||
      (item.path && skill.path && item.path.endsWith(`/${projectKey}`))
    );
  });
}

function AddSkillTab({
  importPath,
  onImportSuccess,
}: {
  importPath?: string;
  onImportSuccess?: () => void;
}) {
  const { t } = useTranslation();
  const [isDragOver, setIsDragOver] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<FileInfo[]>([]);
  const [gitUrl, setGitUrl] = useState('');
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [searchHistory, setSearchHistory] =
    useState<string[]>(loadSearchHistory);
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        historyRef.current &&
        !historyRef.current.contains(e.target as Node)
      ) {
        setShowHistory(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const reset = useCallback(() => {
    setSkills([]);
    setSelectedSkills([]);
    setGitUrl('');
    setDroppedFiles([]);
  }, []);

  const addToHistory = useCallback((url: string) => {
    setSearchHistory((prev) => {
      const next = [url, ...prev.filter((x) => x !== url)].slice(
        0,
        MAX_HISTORY,
      );
      saveSearchHistory(next);
      return next;
    });
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files).filter(
        (x) =>
          x.name.toLocaleLowerCase().endsWith('.skill') ||
          x.name.toLocaleLowerCase().endsWith('.zip'),
      );

      if (files.length === 0 && Array.from(e.dataTransfer.files).length > 0) {
        toast.error(t('common.please_drop_skill_file'));
        return;
      }

      for (const file of files) {
        const path = window.electron.app.getPathForFile(file);
        const fileInfo = await window.electron.app.getFileInfo(path);
        setDroppedFiles((prev) => [...prev, fileInfo]);
      }
    },
    [t],
  );

  const handlePreviewGitSkill = async () => {
    if (loading || !gitUrl.trim()) return;
    setLoading(true);
    setSkills([]);
    setSelectedSkills([]);
    const result = await window.electron.tools.previewGitSkill({
      gitUrl,
    });
    if (result.success) {
      setSkills(result.skills);
      setSelectedSkills(result.skills.map((x: SkillInfo) => x.path || ''));
      addToHistory(gitUrl.trim());
      setShowHistory(false);
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  };

  const handleImport = async () => {
    try {
      setImporting(true);
      if (droppedFiles.length > 0) {
        const result = await window.electron.tools.importSkills({
          files: droppedFiles.map((x) => x.path),
          path: importPath,
        });
        if (result && !result.success) throw new Error(result.error);
      } else if (isDirectSkillUrl(gitUrl)) {
        const result = await window.electron.tools.importSkills({
          repo_or_url: gitUrl,
          selectedSkills: [],
          path: importPath,
        });
        if (result && !result.success) throw new Error(result.error);
      } else if (selectedSkills.length > 0) {
        const result = await window.electron.tools.importSkills({
          repo_or_url: gitUrl,
          selectedSkills,
          path: importPath,
        });
        if (result && !result.success) throw new Error(result.error);
      }

      toast.success(t('common.import_success'));
      onImportSuccess?.();
      reset();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(true);
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(false);
        }}
        onDrop={handleDrop}
        className={cn(
          'relative flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-all',
          isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 bg-muted/30 hover:border-muted-foreground/50',
        )}
      >
        <div className="flex flex-col items-center gap-2 p-4 text-center pointer-events-none">
          <UploadIcon
            className={cn(
              'h-8 w-8',
              isDragOver ? 'text-primary' : 'text-muted-foreground',
            )}
          />
          <p
            className={cn(
              'text-sm',
              isDragOver ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {isDragOver
              ? t('common.drop_files_here')
              : t('common.drag_files_here')}
          </p>
        </div>
      </div>

      {droppedFiles.length > 0 && (
        <div className="space-y-2">
          {droppedFiles.map((file, index) => (
            <div
              key={`${file.path}-${index}`}
              className="group flex items-center gap-2 rounded-md bg-muted/50 p-2"
            >
              <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate text-sm" title={file.path}>
                {file.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatFileSize(file.size)}
              </span>
              <button
                type="button"
                onClick={() =>
                  setDroppedFiles((prev) => prev.filter((_, i) => i !== index))
                }
                className="rounded-md p-1 opacity-0 transition-all group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative" ref={historyRef}>
        <InputGroup>
          <InputGroupInput
            value={gitUrl}
            onChange={(e) => setGitUrl(e.target.value)}
            onFocus={() => {
              if (searchHistory.length > 0) setShowHistory(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isDirectSkillUrl(gitUrl)) {
                handlePreviewGitSkill();
                setShowHistory(false);
              } else if (e.key === 'Escape') {
                setShowHistory(false);
              }
            }}
            placeholder={t('common.enter_git_url_or_skill_url')}
          />
          {!isDirectSkillUrl(gitUrl) && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                variant="ghost"
                className="rounded-full"
                onClick={() => handlePreviewGitSkill()}
                disabled={loading}
              >
                {loading ? (
                  <IconLoader className="h-4 w-4 animate-spin" />
                ) : (
                  <SearchIcon className="h-4 w-4" />
                )}
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
        {showHistory && searchHistory.length > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
            {searchHistory.map((url) => (
              <button
                key={url}
                type="button"
                className="flex w-full items-center gap-2 truncate px-3 py-2 text-left text-sm transition-colors first:rounded-t-md last:rounded-b-md hover:bg-accent"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setGitUrl(url);
                  setShowHistory(false);
                }}
              >
                <SearchIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{url}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {skills.length > 0 && (
        <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
          {skills.map((skill) => (
            <Item
              key={skill.path}
              variant="muted"
              size="sm"
              className="cursor-pointer"
              onClick={() => {
                if (!skill.path) return;
                setSelectedSkills((prev) =>
                  prev.includes(skill.path)
                    ? prev.filter((x) => x !== skill.path)
                    : [...prev, skill.path],
                );
              }}
            >
              <ItemContent className="flex flex-row items-center gap-2">
                <Checkbox checked={selectedSkills.includes(skill.path || '')} />
                <div className="flex min-w-0 flex-col">
                  <ItemTitle className="truncate">{skill.name}</ItemTitle>
                  <ItemDescription className="line-clamp-2">
                    {skill.description}
                  </ItemDescription>
                </div>
              </ItemContent>
            </Item>
          ))}
        </div>
      )}

      <Button
        onClick={handleImport}
        disabled={
          (selectedSkills.length === 0 &&
            droppedFiles.length === 0 &&
            !isDirectSkillUrl(gitUrl)) ||
          importing
        }
      >
        {!importing ? (
          <>
            <PackagePlusIcon className="h-4 w-4" />
            {t('common.import')}
          </>
        ) : (
          <>
            {t('common.importing')}
            <IconLoader className="h-4 w-4 animate-spin" />
          </>
        )}
      </Button>
    </div>
  );
}

function SearchSkillTab({
  importPath,
  onImportSuccess,
}: {
  importPath?: string;
  onImportSuccess?: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchSkillResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<SearchSkillResult[]>([]);
  const [importing, setImporting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q || q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const res = await window.electron.tools.searchSkills(q);
      setResults(res.success ? res.skills : []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || query.length < 2) {
      setResults([]);
      return undefined;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  const handleImport = async () => {
    if (selectedSkills.length === 0) return;
    setImporting(true);
    try {
      const grouped = new Map<string, SearchSkillResult[]>();
      for (const skill of selectedSkills) {
        const source = skill.source || skill.slug;
        if (!grouped.has(source)) grouped.set(source, []);
        grouped.get(source)!.push(skill);
      }

      for (const [source, skills] of grouped) {
        const preview = await window.electron.tools.previewGitSkill({
          gitUrl: source,
        });
        if (!preview.success) {
          toast.error(`${source}: ${preview.error}`);
        } else {
          const skillNames = skills.map((s) => s.name);
          const matchedPaths = preview.skills
            .filter(
              (s: SkillInfo) =>
                skillNames.includes(s.name) || skillNames.includes(s.id),
            )
            .map((s: SkillInfo) => s.path)
            .filter(Boolean);

          const pathsToImport =
            matchedPaths.length > 0
              ? matchedPaths
              : preview.skills.map((s: SkillInfo) => s.path).filter(Boolean);

          await window.electron.tools.importSkills({
            repo_or_url: source,
            selectedSkills: pathsToImport,
            path: importPath,
          });
        }
      }

      toast.success(t('common.import_success'));
      onImportSuccess?.();
      setSelectedSkills([]);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <InputGroup>
        <InputGroupInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(
            'tools.search_skills_placeholder',
            'Search skills on skills.sh...',
          )}
        />
        <InputGroupAddon align="inline-end">
          {searching ? (
            <IconLoader className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <SearchIcon className="h-4 w-4 text-muted-foreground" />
          )}
        </InputGroupAddon>
      </InputGroup>

      {results.length > 0 && (
        <div className="max-h-[360px] space-y-1.5 overflow-y-auto pr-1">
          {results.map((skill) => (
            <Item
              key={skill.slug}
              variant="muted"
              size="sm"
              className="cursor-pointer"
              onClick={() =>
                setSelectedSkills((prev) =>
                  prev.some((s) => s.slug === skill.slug)
                    ? prev.filter((s) => s.slug !== skill.slug)
                    : [...prev, skill],
                )
              }
            >
              <ItemContent className="flex flex-row items-center gap-2">
                <Checkbox
                  checked={selectedSkills.some((s) => s.slug === skill.slug)}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <ItemTitle className="flex w-full flex-row justify-between gap-2">
                    <span className="truncate">{skill.name}</span>
                    {skill.installs > 0 && (
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        <DownloadIcon className="mr-0.5 h-3 w-3" />
                        {formatInstalls(skill.installs)}
                      </Badge>
                    )}
                  </ItemTitle>
                  <ItemDescription className="truncate">
                    {skill.source || skill.slug}
                  </ItemDescription>
                </div>
              </ItemContent>
            </Item>
          ))}
        </div>
      )}

      {!searching && query.length >= 2 && results.length === 0 && (
        <div className="py-6 text-center text-sm text-muted-foreground">
          {t('tools.no_skills_found', 'No skills found')}
        </div>
      )}

      <Button
        onClick={handleImport}
        disabled={selectedSkills.length === 0 || importing}
      >
        {!importing ? (
          <>
            <PlusIcon className="h-4 w-4" />
            {t('common.import')}{' '}
            {selectedSkills.length > 0 ? `(${selectedSkills.length})` : ''}
          </>
        ) : (
          <>
            {t('common.importing')}
            <IconLoader className="h-4 w-4 animate-spin" />
          </>
        )}
      </Button>
    </div>
  );
}

function InstalledSkillTab({
  projectSkills,
  importPath,
  onImportSuccess,
}: {
  projectSkills: SkillInfo[];
  importPath?: string;
  onImportSuccess?: () => void;
}) {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<Record<string, boolean>>({});

  const loadSkills = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.electron.tools.getList({
        type: ToolType.SKILL,
      });
      setSkills(data?.[ToolType.SKILL] || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const handleAdd = async (skill: SkillInfo) => {
    setImporting((prev) => ({ ...prev, [skill.id]: true }));
    try {
      const result = await window.electron.tools.importSkills({
        sourceSkillIds: [skill.id],
        path: importPath,
      });
      if (result && !result.success) throw new Error(result.error);
      toast.success(t('common.import_success'));
      onImportSuccess?.();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setImporting((prev) => ({ ...prev, [skill.id]: false }));
    }
  };

  return (
    <div className="flex max-h-[480px] flex-col gap-4 overflow-y-auto pr-1">
      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">
          {t('project.installed_skills', 'Installed Skills')}
        </div>
        {projectSkills.length === 0 && (
          <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
            {t('tools.no_skills_found', 'No skills found')}
          </div>
        )}
        {projectSkills.map((skill) => (
          <Item key={skill.id} variant="outline" size="sm">
            <ItemContent>
              <ItemTitle className="truncate">{skill.name}</ItemTitle>
              <ItemDescription className="line-clamp-2">
                {skill.description}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Badge variant="secondary">{t('common.added', 'Added')}</Badge>
            </ItemActions>
          </Item>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium">
            {t('tools.skill_manager_skills', 'SkillManager Skills')}
          </div>
          <Button variant="outline" size="sm" onClick={loadSkills}>
            {loading ? (
              <IconLoader className="h-4 w-4 animate-spin" />
            ) : (
              <SearchIcon className="h-4 w-4" />
            )}
          </Button>
        </div>
        {skills.length === 0 && !loading && (
          <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
            {t('tools.no_skills_found', 'No skills found')}
          </div>
        )}
        {skills.map((skill) => {
          const added = isProjectSkill(projectSkills, skill);
          return (
            <Item key={skill.id} variant="muted" size="sm">
              <ItemContent>
                <ItemTitle className="truncate">{skill.name}</ItemTitle>
                <ItemDescription className="line-clamp-2">
                  {skill.description}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button
                  variant={added ? 'outline' : 'default'}
                  size="sm"
                  disabled={added || importing[skill.id]}
                  onClick={() => handleAdd(skill)}
                >
                  {importing[skill.id] ? (
                    <IconLoader className="h-4 w-4 animate-spin" />
                  ) : (
                    <PlusIcon className="h-4 w-4" />
                  )}
                  {added ? t('common.added', 'Added') : t('common.add', 'Add')}
                </Button>
              </ItemActions>
            </Item>
          );
        })}
      </div>
    </div>
  );
}

export function SkillManagerDialog({
  open,
  onOpenChange,
  importPath,
  projectSkills = [],
  onImportSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importPath?: string;
  projectSkills?: SkillInfo[];
  onImportSuccess?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100vh-4rem)] overflow-hidden sm:max-w-3xl"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t('project.add_skills', 'Add Skills')}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="add" className="min-h-0">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="add">
              <PackagePlusIcon className="h-4 w-4" />
              {t('project.add_skills', 'Add Skills')}
            </TabsTrigger>
            <TabsTrigger value="search">
              <SearchIcon className="h-4 w-4" />
              {t('tools.search_skills', 'Search Skills')}
            </TabsTrigger>
            <TabsTrigger value="installed">
              <DownloadIcon className="h-4 w-4" />
              {t('project.installed_skills', 'Installed Skills')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="add">
            <AddSkillTab
              importPath={importPath}
              onImportSuccess={onImportSuccess}
            />
          </TabsContent>
          <TabsContent value="search">
            <SearchSkillTab
              importPath={importPath}
              onImportSuccess={onImportSuccess}
            />
          </TabsContent>
          <TabsContent value="installed">
            <InstalledSkillTab
              importPath={importPath}
              projectSkills={projectSkills}
              onImportSuccess={onImportSuccess}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
