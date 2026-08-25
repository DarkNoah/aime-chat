import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  IconBrandGithub,
  IconExternalLink,
  IconLoader,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import { Tool, ToolEvent, ToolType } from '@/types/tool';
import { useHeader } from '@/renderer/hooks/use-title';
import { Button } from '@/renderer/components/ui/button';
import { Badge } from '@/renderer/components/ui/badge';
import { Switch } from '@/renderer/components/ui/switch';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/renderer/components/ui/item';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/renderer/components/ui/alert-dialog';
import {
  getSkillDisplayName,
  SkillIcon,
} from '@/renderer/components/skills-ui/skill-metadata';

function getRepoDisplayName(repo: string) {
  const parts = repo.replace(/\/+$/, '').split('/').filter(Boolean);
  return parts.length > 1
    ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
    : repo;
}

export default function SkillGroupDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const repo = searchParams.get('repo') || '';
  const { setTitle } = useHeader();
  const [skills, setSkills] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [autoLoadUpdating, setAutoLoadUpdating] = useState(false);

  const groupName = useMemo(() => getRepoDisplayName(repo), [repo]);
  const autoLoadCount = useMemo(
    () => skills.filter((skill) => skill.autoLoad).length,
    [skills],
  );
  const allAutoLoad = skills.length > 0 && autoLoadCount === skills.length;
  let autoLoadStatus = t('tools.auto_load_off');
  if (allAutoLoad) {
    autoLoadStatus = t('tools.auto_load_all');
  } else if (autoLoadCount > 0) {
    autoLoadStatus = t('tools.auto_load_partial', {
      count: autoLoadCount,
      total: skills.length,
    });
  }

  const loadSkills = useCallback(
    async (showLoading = true) => {
      if (!repo) {
        setSkills([]);
        if (showLoading) setLoading(false);
        return;
      }

      if (showLoading) setLoading(true);
      try {
        const data = await window.electron.tools.getList({
          type: ToolType.SKILL,
        });
        setSkills(
          (data?.[ToolType.SKILL] || []).filter(
            (skill: Tool) => skill.repo === repo,
          ),
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [repo],
  );

  useEffect(() => {
    setTitle(groupName);
  }, [groupName, setTitle]);

  useEffect(() => {
    loadSkills();
    const handleToolListUpdated = () => loadSkills(false);
    window.electron.ipcRenderer.on(
      ToolEvent.ToolListUpdated,
      handleToolListUpdated,
    );
    return () => {
      window.electron.ipcRenderer.removeListener(
        ToolEvent.ToolListUpdated,
        handleToolListUpdated,
      );
    };
  }, [loadSkills]);

  const handleUpdate = async () => {
    if (!repo || skills.length === 0 || updating) return;

    setUpdating(true);
    try {
      const result = await window.electron.tools.importSkills({
        repo_or_url: repo,
        installAllSkills: true,
        replaceSkillIds: skills.map((skill) => skill.id),
        group: repo,
      });
      if (result && !result.success) {
        throw new Error(result.error);
      }

      await loadSkills(false);
      toast.success(t('tools.skill_group_update_success'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      await loadSkills(false);
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (skills.length === 0 || deleting) return;

    setDeleting(true);
    try {
      await Promise.all(
        skills.map((skill) => window.electron.tools.deleteTool(skill.id)),
      );
      toast.success(
        t('tools.skill_group_delete_success', { count: skills.length }),
      );
      navigate('/tools');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      await loadSkills();
    } finally {
      setDeleting(false);
    }
  };

  const handleSetAutoLoad = async (ids: string[], autoLoad: boolean) => {
    if (ids.length === 0 || autoLoadUpdating) return;
    setAutoLoadUpdating(true);
    try {
      await window.electron.tools.setSkillAutoLoad({ ids, autoLoad });
      await loadSkills(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setAutoLoadUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <IconLoader className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!repo || skills.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('tools.skill_group_not_found')}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <Item variant="outline">
        <ItemMedia>
          <IconBrandGithub className="size-6" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{groupName}</ItemTitle>
          <ItemDescription className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">GitHub</Badge>
            <span>
              {t('tools.skill_group_count', { count: skills.length })}
            </span>
            <a
              href={repo}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              {repo}
              <IconExternalLink className="size-3.5" />
            </a>
          </ItemDescription>
        </ItemContent>
        <ItemActions className="gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Switch
              aria-label={t('tools.auto_load')}
              checked={allAutoLoad}
              disabled={autoLoadUpdating || updating || deleting}
              onCheckedChange={() =>
                handleSetAutoLoad(
                  skills.map((skill) => skill.id),
                  !allAutoLoad,
                )
              }
            />
            <span>{autoLoadStatus}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={updating || deleting}
            onClick={handleUpdate}
          >
            {updating ? (
              <IconLoader className="size-4 animate-spin" />
            ) : (
              <IconRefresh className="size-4" />
            )}
            {t('tools.update_skill_group')}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                disabled={updating || deleting}
              >
                {deleting ? (
                  <IconLoader className="size-4 animate-spin" />
                ) : (
                  <IconTrash className="size-4" />
                )}
                {t('tools.delete_skill_group')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('tools.delete_skill_group_title')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t('tools.delete_skill_group_description', {
                    name: groupName,
                    count: skills.length,
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>
                  {t('common.cancel')}
                </AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deleting}
                  onClick={handleDelete}
                >
                  {t('common.delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </ItemActions>
      </Item>

      <section className="mt-4 space-y-2">
        <h2 className="text-sm font-medium">
          {t('tools.skill_group_installed_skills')}
        </h2>
        {skills.map((skill) => (
          <Item
            key={skill.id}
            variant="muted"
            className="cursor-pointer"
            onClick={() => navigate(`/tools/${skill.id}`)}
          >
            <ItemMedia>
              <SkillIcon skill={skill} className="size-6" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{getSkillDisplayName(skill)}</ItemTitle>
              <ItemDescription>{skill.description}</ItemDescription>
            </ItemContent>
            <ItemActions
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <div className="flex items-center gap-2 text-sm">
                <span>{t('tools.auto_load')}</span>
                <Switch
                  aria-label={t('tools.auto_load')}
                  checked={skill.autoLoad ?? false}
                  disabled={autoLoadUpdating}
                  onCheckedChange={(autoLoad) =>
                    handleSetAutoLoad([skill.id], autoLoad)
                  }
                />
              </div>
            </ItemActions>
          </Item>
        ))}
      </section>
    </div>
  );
}
