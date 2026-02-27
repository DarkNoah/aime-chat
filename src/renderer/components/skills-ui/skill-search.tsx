/* eslint-disable no-await-in-loop */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/renderer/components/ui/dialog';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/renderer/components/ui/input-group';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/renderer/components/ui/item';
import { Button } from '@/renderer/components/ui/button';
import { Checkbox } from '@/renderer/components/ui/checkbox';
import { Badge } from '@/renderer/components/ui/badge';
import { IconLoader, IconSearch } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { DownloadIcon } from 'lucide-react';

interface SearchSkillResult {
  name: string;
  slug: string;
  source: string;
  installs: number;
}

function formatInstalls(count: number): string {
  if (!count || count <= 0) return '';
  if (count >= 1_000_000)
    return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (count >= 1_000)
    return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${count}`;
}

export function SkillSearch({
  open,
  onOpenChange,
  importPath,
  onImportSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

  const reset = useCallback(() => {
    setQuery('');
    setResults([]);
    setSelectedSkills([]);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q || q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const res = await window.electron.tools.searchSkills(q);
      console.log(res);
      if (res.success) {
        setResults(res.skills);
      } else {
        setResults([]);
      }
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
    debounceRef.current = setTimeout(() => {
      doSearch(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  const toggleSelect = (skill: SearchSkillResult) => {
    setSelectedSkills((prev) => {
      const exists = prev.find((s) => s.slug === skill.slug);
      if (exists) return prev.filter((s) => s.slug !== skill.slug);
      return [...prev, skill];
    });
  };

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
          // eslint-disable-next-line no-continue
          continue;
        }

        const skillNames = skills.map((s) => s.name);
        const matchedPaths = preview.skills
          .filter(
            (s: any) =>
              skillNames.includes(s.name) || skillNames.includes(s.id),
          )
          .map((s: any) => s.path);

        const pathsToImport =
          matchedPaths.length > 0
            ? matchedPaths
            : preview.skills.map((s: any) => s.path);

        await window.electron.tools.importSkills({
          repo_or_url: source,
          selectedSkills: pathsToImport,
          path: importPath,
        });
      }

      toast.success(t('common.import_success'));
      onImportSuccess?.();
      onOpenChange(false);
      reset();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleOpenChange = (_open: boolean) => {
    if (!_open) reset();
    onOpenChange(_open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('tools.search_skills', 'Search Skills')}</DialogTitle>
        </DialogHeader>

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
              <IconLoader className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : (
              <IconSearch className="w-4 h-4 text-muted-foreground" />
            )}
          </InputGroupAddon>
        </InputGroup>

        {query.length > 0 && query.length < 2 && (
          <p className="text-xs text-muted-foreground">
            {t(
              'tools.search_min_chars',
              'Type at least 2 characters to search',
            )}
          </p>
        )}

        {results.length > 0 && (
          <div className="mt-1 space-y-1.5 max-h-[360px] overflow-y-auto">
            {results.map((skill) => (
              <Item
                key={skill.slug}
                variant="muted"
                size="sm"
                className="cursor-pointer"
                onClick={() => toggleSelect(skill)}
              >
                <ItemContent className="flex flex-row items-center gap-2">
                  <Checkbox
                    checked={selectedSkills.some((s) => s.slug === skill.slug)}
                  />
                  <div className="flex flex-col flex-1 min-w-0">
                    <ItemTitle className="flex flex-row justify-between w-full">
                      {skill.name}
                      {skill.installs > 0 && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          <DownloadIcon className="w-3 h-3 mr-0.5" />
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
          {!importing &&
            `${t('common.import')} ${selectedSkills.length > 0 ? `(${selectedSkills.length})` : ''}`}
          {importing && (
            <div className="flex flex-row gap-2 items-center">
              {t('common.importing')}{' '}
              <IconLoader className="w-4 h-4 animate-spin" />
            </div>
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
