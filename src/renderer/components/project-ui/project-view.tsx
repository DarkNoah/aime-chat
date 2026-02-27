import { cn } from '@/renderer/lib/utils';
import { Project } from '@/types/project';
import React, { ForwardedRef, useState } from 'react';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '../ui/item';
import { Button } from '../ui/button';
import { SkillImportDialog } from '@/renderer/pages/Tools/skill-import-dialog';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from '../ui/scroll-area';
import { Input } from '../ui/input';
import { IconSearch, IconTrash } from '@tabler/icons-react';
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
import { ButtonGroup } from '../ui/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { ChevronDownIcon } from 'lucide-react';
import { SkillSearch } from '../skills-ui/skill-search';
import { SkillDetailDialog } from '../skills-ui/skill-detail';
import { SkillInfo } from '@/types/skill';

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
    const [openSkillSearchDialog, setOpenSkillSearchDialog] = useState(false);
    const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);
    const [openSkillDetail, setOpenSkillDetail] = useState(false);
    const { t } = useTranslation();
    const handleDeleteSkill = async (skillId: string) => {
      await window.electron.projects.deleteSkill(project?.id, skillId);
      onProjectChanged?.();
    };
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
            <ButtonGroup>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpenSkillDialog(true)}
              >
                {t('project.add_skills')}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="!pl-2" size="sm">
                    <ChevronDownIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      onClick={() => setOpenSkillSearchDialog(true)}
                    >
                      <IconSearch />
                      {t('tools.search_skills')}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </ButtonGroup>

            <SkillImportDialog
              open={openSkillDialog}
              onOpenChange={setOpenSkillDialog}
              importPath={project?.path}
              onImportSkillsSuccess={() => onProjectChanged?.()}
            ></SkillImportDialog>
            <SkillSearch
              open={openSkillSearchDialog}
              onOpenChange={setOpenSkillSearchDialog}
              importPath={project?.path}
              onImportSuccess={() => onProjectChanged?.()}
            />
          </ItemActions>
          {project?.skills && project?.skills.length > 0 && (
            <div className="max-h-[400px] overflow-y-auto w-full">
              <div className="w-full flex flex-col gap-2 pr-2">
                {project?.skills.map((skill) => {
                  return (
                    <Item
                      key={skill.id}
                      variant="outline"
                      className="w-full hover:bg-accent/50 transition-colors"
                    >
                      <ItemContent>
                        <ItemTitle
                          onClick={() => {
                            setSelectedSkill(skill);
                            setOpenSkillDetail(true);
                          }}
                          className="cursor-pointer"
                        >
                          {skill.name}
                        </ItemTitle>
                        <ItemDescription className="line-clamp-2 text-xs text-muted-foreground">
                          {skill.description}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="destructive"
                              size="icon-sm"
                              className="cursor-pointer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <IconTrash></IconTrash>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t('common.ask_to_delete_skill')}
                              </AlertDialogTitle>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>
                                {t('common.cancel')}
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteSkill(skill.id)}
                              >
                                {t('common.delete')}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </ItemActions>
                    </Item>
                  );
                })}
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
