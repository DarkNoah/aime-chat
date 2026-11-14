import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  IconBrandGithub,
  IconExternalLink,
  IconRefresh,
} from '@tabler/icons-react';
import { Tool, ToolEvent, ToolType } from '@/types/tool';
import { Button } from '@/renderer/components/ui/button';
import { Spinner } from '@/renderer/components/ui/spinner';
import { Switch } from '@/renderer/components/ui/switch';
import {
  SkillIcon,
  useSkillDisplayName,
} from '@/renderer/components/skills-ui/skill-metadata';
import {
  getRepoDisplayName,
  hubTabPath,
  skillGroupPath,
  toolDetailPath,
} from './hub-model';
import { HubAvatar, StatusIndicator, TAB_META, TagChip } from './hub-visuals';
import {
  ConfirmDeleteButton,
  DetailHeader,
  DetailLoading,
  DetailNotFound,
  DetailPage,
  DetailSection,
  LabeledSwitch,
  useDetailBreadcrumb,
} from './detail-layout';

export default function SkillGroupDetail() {
  const { t } = useTranslation();
  const skillName = useSkillDisplayName();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const repo = searchParams.get('repo') || '';
  const [skills, setSkills] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [autoLoadUpdating, setAutoLoadUpdating] = useState(false);

  const groupName = useMemo(() => getRepoDisplayName(repo), [repo]);
  const autoLoadCount = skills.filter((skill) => skill.autoLoad).length;
  const activeCount = skills.filter((skill) => skill.isActive).length;
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

  useDetailBreadcrumb(
    'skills',
    repo ? groupName : undefined,
    skillGroupPath(repo),
  );

  const loadSkills = useCallback(
    async (showLoading = true) => {
      if (!repo) {
        setSkills([]);
        setLoading(false);
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
    loadSkills();
    return window.electron.ipcRenderer.on(ToolEvent.ToolListUpdated, () =>
      loadSkills(false),
    );
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
    try {
      await Promise.all(
        skills.map((skill) => window.electron.tools.deleteTool(skill.id)),
      );
      toast.success(
        t('tools.skill_group_delete_success', { count: skills.length }),
      );
      navigate(hubTabPath('skills'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      await loadSkills();
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

  if (loading) return <DetailLoading />;
  if (!repo || skills.length === 0) {
    return (
      <DetailNotFound tab="skills" message={t('tools.skill_group_not_found')} />
    );
  }

  return (
    <DetailPage>
      <DetailHeader
        media={
          <HubAvatar hue={TAB_META.skills.hue} size="lg">
            <IconBrandGithub />
          </HubAvatar>
        }
        title={groupName}
        meta={
          <>
            <TagChip>{t('tools_hub.scope.groups')}</TagChip>
            <span>{t('tools.skill_group_count', { count: skills.length })}</span>
            <StatusIndicator
              tone={activeCount > 0 ? 'positive' : 'neutral'}
              label={t('tools_hub.group_active', {
                active: activeCount,
                count: skills.length,
              })}
            />
            <a
              href={repo}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 outline-none hover:text-foreground focus-visible:underline"
            >
              <span className="break-all">{repo}</span>
              <IconExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
            </a>
          </>
        }
        actions={
          <>
            <LabeledSwitch
              label={autoLoadStatus}
              checked={allAutoLoad}
              disabled={autoLoadUpdating || updating}
              onCheckedChange={() =>
                handleSetAutoLoad(
                  skills.map((skill) => skill.id),
                  !allAutoLoad,
                )
              }
            />
            <Button
              variant="outline"
              size="sm"
              disabled={updating}
              onClick={handleUpdate}
            >
              {updating ? <Spinner className="size-4" /> : <IconRefresh />}
              {t('tools.update_skill_group')}
            </Button>
            <ConfirmDeleteButton
              iconOnly
              disabled={updating}
              label={t('tools.delete_skill_group')}
              title={t('tools.delete_skill_group_title')}
              description={t('tools.delete_skill_group_description', {
                name: groupName,
                count: skills.length,
              })}
              onConfirm={handleDelete}
            />
          </>
        }
      >
        <p className="text-xs text-muted-foreground">{t('tools.auto_load_hint')}</p>
      </DetailHeader>

      <DetailSection
        title={t('tools.skill_group_installed_skills')}
        count={skills.length}
        bodyClassName="p-1.5"
      >
        <ul className="flex flex-col">
          {skills.map((skill) => {
            const name = skillName(skill);
            return (
              <li
                key={skill.id}
                className="relative flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors duration-150 hover:bg-accent/50"
              >
                <SkillIcon
                  skill={skill}
                  className={skill.isActive ? 'size-9' : 'size-9 opacity-60'}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Link
                    to={toolDetailPath(skill.id)}
                    className="truncate text-sm font-medium outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:underline"
                  >
                    {name}
                  </Link>
                  {skill.description ? (
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {skill.description}
                    </p>
                  ) : null}
                </div>
                <StatusIndicator
                  className="hidden sm:inline-flex"
                  tone={skill.isActive ? 'positive' : 'neutral'}
                  label={
                    skill.isActive
                      ? t('tools_hub.enabled')
                      : t('tools_hub.disabled')
                  }
                />
                <label className="relative z-10 flex items-center gap-2 text-xs text-muted-foreground">
                  {t('tools.auto_load')}
                  <Switch
                    checked={skill.autoLoad ?? false}
                    disabled={autoLoadUpdating}
                    onCheckedChange={(autoLoad) =>
                      handleSetAutoLoad([skill.id], autoLoad)
                    }
                  />
                </label>
              </li>
            );
          })}
        </ul>
      </DetailSection>
    </DetailPage>
  );
}
