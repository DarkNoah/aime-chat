import { cn } from '@/renderer/lib/utils';
import { Project } from '@/types/project';
import React, { ForwardedRef, useMemo, useState } from 'react';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '../ui/item';
import { Button } from '../ui/button';
import { useTranslation } from 'react-i18next';
import {
  IconChevronRight,
  IconExternalLink,
  IconFolder,
  IconReload,
  IconTrash,
} from '@tabler/icons-react';
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
} from '../ui/alert-dialog';
import { SkillDetailDialog } from '../skills-ui/skill-detail';
import { SkillInfo } from '@/types/skill';
import { Spinner } from '../ui/spinner';
import { SkillManagerDialog } from '../skills-ui/skill-manager-dialog';
import { getSkillDisplayName } from '../skills-ui/skill-metadata';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../ui/collapsible';
import { groupProjectSkills } from './project-skill-groups';

export type ProjectViewProps = {
  project?: Project;
  className?: string;
  onProjectChanged?: () => void;
};

export interface ProjectViewRef {}

export const ProjectView = React.forwardRef<ProjectViewRef, ProjectViewProps>(
  (props: ProjectViewProps, ref: ForwardedRef<ProjectViewRef>) => {
    const { project, className, onProjectChanged } = props;
    const [openSkillDialog, setOpenSkillDialog] = useState(false);
    const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);
    const [openSkillDetail, setOpenSkillDetail] = useState(false);
    const [loadings, setLoadings] = useState<Record<string, boolean>>({});
    const { t } = useTranslation();
    const skillItems = useMemo(
      () => groupProjectSkills(project?.skills || [], project?.path),
      [project?.skills, project?.path],
    );
    const handleDeleteSkill = async (skillId: string) => {
      await window.electron.projects.deleteSkill(project?.id, skillId);
      onProjectChanged?.();
    };
    const handleUpdateSkill = async (skill: SkillInfo) => {
      if (!skill.source || !skill.path) return;
      setLoadings((prev) => ({ ...prev, [skill.id]: true }));
      await window.electron.tools.importSkills({
        repo_or_url: skill.source,
        // selectedSkills: [skill.path],
        path: project?.path,
      });
      setLoadings((prev) => ({ ...prev, [skill.id]: false }));
      onProjectChanged?.();
    };
    const renderSkillItem = (skill: SkillInfo) => (
      <Item
        key={skill.id}
        variant="outline"
        className="w-full hover:bg-accent/50 transition-colors"
      >
        <ItemContent>
          <ItemTitle className="text-lg">
            {skill.source && (
              <Button
                variant="outline"
                size="icon-sm"
                className="p-0 mr-2 cursor-pointer"
                onClick={() => window.open(skill.source, '_blank')}
                aria-label={t('project.open_skill_source', {
                  name: getSkillDisplayName(skill),
                })}
              >
                <IconExternalLink />
              </Button>
            )}
            <button
              type="button"
              className="cursor-pointer text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              onClick={() => {
                setSelectedSkill(skill);
                setOpenSkillDetail(true);
              }}
            >
              {getSkillDisplayName(skill)}
            </button>
          </ItemTitle>
          <ItemDescription className="line-clamp-2 text-xs text-muted-foreground">
            {skill.description}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          {skill.source && (
            <Button
              variant="outline"
              size="icon-sm"
              className="cursor-pointer"
              disabled={loadings[skill.id]}
              onClick={() => handleUpdateSkill(skill)}
              aria-label={t('project.update_skill', {
                name: getSkillDisplayName(skill),
              })}
            >
              {loadings[skill.id] ? (
                <Spinner className="w-4 h-4" />
              ) : (
                <IconReload className="w-4 h-4" />
              )}
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="icon-sm"
                className="cursor-pointer"
                disabled={loadings[skill.id]}
                aria-label={t('common.delete')}
              >
                <IconTrash />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('common.ask_to_delete_skill')}
                </AlertDialogTitle>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleDeleteSkill(skill.id)}>
                  {t('common.delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </ItemActions>
      </Item>
    );
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        <Item variant="outline">
          <ItemContent>
            <ItemTitle>
              Skills{' '}
              {project?.skills && project?.skills.length > 0
                ? `(${project?.skills.length})`
                : ''}
            </ItemTitle>
            {/* <ItemDescription>
              A simple item with title and description.
            </ItemDescription> */}
          </ItemContent>
          <ItemActions>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpenSkillDialog(true)}
            >
              {t('project.add_skills')}
            </Button>

            <SkillManagerDialog
              open={openSkillDialog}
              onOpenChange={setOpenSkillDialog}
              importPath={project?.path}
              projectSkills={project?.skills || []}
              onImportSuccess={() => onProjectChanged?.()}
            />
          </ItemActions>
          {project?.skills && project?.skills.length > 0 && (
            <div className="max-h-[400px] overflow-y-auto w-full">
              <div className="w-full flex flex-col gap-2 pr-2">
                {skillItems.map((item) =>
                  item.kind === 'group' ? (
                    <Collapsible key={item.key} className="w-full space-y-2">
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="group w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Item
                            variant="outline"
                            className="w-full hover:bg-accent/50"
                          >
                            <IconFolder className="size-5 shrink-0" />
                            <ItemContent className="min-w-0">
                              <ItemTitle className="truncate text-lg">
                                {item.name}
                              </ItemTitle>
                              <ItemDescription>
                                {item.skills.length}{' '}
                                {t('common.skills', 'skills')}
                              </ItemDescription>
                            </ItemContent>
                            <IconChevronRight className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none" />
                          </Item>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-2 pl-4">
                        {item.skills.map(renderSkillItem)}
                      </CollapsibleContent>
                    </Collapsible>
                  ) : (
                    renderSkillItem(item.skill)
                  ),
                )}
              </div>
            </div>
          )}
        </Item>
        {/* <Item variant="outline">
          <ItemContent>
            <ItemTitle>Work Memory</ItemTitle>
          </ItemContent>
          <ItemActions></ItemActions>
        </Item> */}
        <SkillDetailDialog
          skill={selectedSkill}
          open={openSkillDetail}
          onOpenChange={setOpenSkillDetail}
        />
      </div>
    );
  },
);
