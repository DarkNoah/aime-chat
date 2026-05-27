import { cn } from '@/renderer/lib/utils';
import React, { useEffect, useState, type ComponentProps } from 'react';
import { Dialog, DialogContent, DialogTrigger } from '../ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Tool, ToolType } from '@/types/tool';
import { CheckIcon } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import {
  IconSquare,
  IconSquareAsterisk,
  IconSquareCheck,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

export type SkillToolGroup = {
  id: string;
  name: string;
  skills: Tool[];
};

export type SkillToolListItem = Tool | SkillToolGroup;

const isSkillToolGroup = (tool: SkillToolListItem): tool is SkillToolGroup =>
  'skills' in tool;

const getRepoDisplayName = (repo: string) => {
  const parts = repo.split('/').filter(Boolean);
  if (parts.length > 1) {
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  }

  return repo;
};

export const groupSkillsByRepo = (skills: Tool[]): SkillToolListItem[] => {
  const groupedSkills: SkillToolListItem[] = [];

  for (const skill of skills) {
    if (!skill.repo) {
      groupedSkills.push(skill);
    } else {
      const existingGroup = groupedSkills.find(
        (item): item is SkillToolGroup =>
          isSkillToolGroup(item) && item.id === skill.repo,
      );

      if (existingGroup) {
        existingGroup.skills.push(skill);
      } else {
        groupedSkills.push({
          id: skill.repo,
          name: getRepoDisplayName(skill.repo),
          skills: [skill],
        });
      }
    }
  }

  return groupedSkills;
};

export const toggleSkillGroupSelection = (
  selectedToolIds: string[],
  group: SkillToolGroup,
): string[] => {
  const skillIds = group.skills.map((skill) => skill.id);
  const selectedSkillIds = selectedToolIds.filter((id) =>
    skillIds.includes(id),
  );
  const nextSelectedToolIds = selectedToolIds.filter(
    (id) => !skillIds.includes(id),
  );

  if (selectedSkillIds.length === skillIds.length) {
    return nextSelectedToolIds;
  }

  return nextSelectedToolIds.concat(skillIds);
};

export type ChatToolSelectorProps = ComponentProps<typeof Dialog> & {
  children: React.ReactNode;
  className?: string;
  value?: string[];
  showGoal?: boolean;
  onChange?: (value: string[]) => void;
};

export const ChatToolSelector = ({
  children,
  ...props
}: ChatToolSelectorProps) => {
  const { value = [], onChange, showGoal = false } = props;
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();
  const [data, setData] = useState<{
    [ToolType.MCP]: Tool[];
    [ToolType.SKILL]: Tool[];
    [ToolType.BUILD_IN]: Tool[];
  } | null>({
    [ToolType.MCP]: [],
    [ToolType.SKILL]: [],
    [ToolType.BUILD_IN]: [],
  });
  const getAvailableTools = async () => {
    try {
      setLoading(true);
      const tools = await window.electron.tools.getAvailableTools();
      setData(tools);
      setLoading(false);
    } catch (error) {
      setLoading(false);
    }
  };
  useEffect(() => {
    getAvailableTools();
  }, []);

  function intersection<T>(a: T[], b: T[]): T[] {
    const setB = new Set(b);
    return a.filter((item) => setB.has(item));
  }

  const handleSelect = (tool: Tool) => {
    if (tool.isToolkit) {
      const selected = intersection(
        value,
        tool.tools.map((x) => x.id),
      );

      const v = value.filter(
        (x) => !tool.tools.map((subtool) => subtool.id).includes(x),
      );
      if (selected.length === tool.tools.length) {
        onChange?.(v);
      } else {
        v.push(...tool.tools.map((subtool) => subtool.id));
        onChange?.(v);
      }
    } else if (value?.includes(tool.id)) {
      onChange?.(value?.filter((x) => x !== tool.id));
    } else {
      onChange?.(value?.concat(tool.id));
    }
  };

  function renderCheckIcon(
    tool: Tool,
  ): React.ReactNode & (React.ReactNode | Iterable<React.ReactNode>) {
    if (tool.isToolkit) {
      const selectedCount = intersection(
        tool.tools?.map((x) => x.id) ?? [],
        value,
      ).length;
      if (selectedCount === tool.tools.length) {
        return <IconSquareCheck className="ml-auto size-4" />;
      } else if (selectedCount > 0) {
        return <IconSquareAsterisk className="ml-auto size-4" />;
      } else {
        return <IconSquare className="ml-auto size-4" />;
      }
    } else {
      return value?.includes(tool.id) ? (
        <IconSquareCheck className="ml-auto size-4" />
      ) : (
        <IconSquare className="ml-auto size-4" />
      );
    }
  }

  const renderSkillGroupCheckIcon = (tool: SkillToolGroup) => {
    const selectedCount = intersection(
      tool.skills.map((skill) => skill.id),
      value,
    ).length;

    if (selectedCount === tool.skills.length) {
      return <IconSquareCheck className="ml-auto size-4" />;
    }

    if (selectedCount > 0) {
      return <IconSquareAsterisk className="ml-auto size-4" />;
    }

    return <IconSquare className="ml-auto size-4" />;
  };

  const groupedSkills = groupSkillsByRepo(data[ToolType.SKILL] ?? []);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) {
          getAvailableTools();
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent className={cn('p-0')}>
        <Command className="**:data-[slot=command-input-wrapper]:h-auto">
          <CommandInput className={cn('h-auto py-3.5')} />
          <Tabs className="p-4" defaultValue={ToolType.BUILD_IN}>
            <TabsList>
              <TabsTrigger
                value={ToolType.BUILD_IN}
              >{`Built-in (${value.filter((x) => x.startsWith(ToolType.BUILD_IN)).length})`}</TabsTrigger>
              <TabsTrigger
                value={ToolType.MCP}
              >{`MCP (${value.filter((x) => x.startsWith(ToolType.MCP)).length})`}</TabsTrigger>

              <TabsTrigger
                value={ToolType.SKILL}
              >{`Skill (${value.filter((x) => x.startsWith(ToolType.SKILL)).length})`}</TabsTrigger>
            </TabsList>
            <TabsContent value={ToolType.MCP}>
              <CommandList>
                <CommandEmpty>No tools found.</CommandEmpty>
                {data[ToolType.MCP]?.map((tool) => (
                  <>
                    <CommandItem
                      key={tool.id}
                      value={tool.id}
                      onSelect={() => handleSelect(tool)}
                    >
                      {t(`tool_name.${tool.name.toLowerCase()}`, tool.name)}{' '}
                      {renderCheckIcon(tool)}
                    </CommandItem>
                    {tool.isToolkit && (
                      <div className="my-2">
                        <ToggleGroup
                          type="multiple"
                          variant="outline"
                          spacing={2}
                          size="sm"
                          className="flex-wrap"
                          value={
                            value.includes(tool.id)
                              ? tool.tools.map((x) => x.id)
                              : value
                          }
                          onValueChange={(_value) => {
                            const selected = intersection(
                              _value,
                              tool.tools.map((x) => x.id),
                            );
                            const v = value.filter(
                              (x) =>
                                !tool.tools
                                  .map((subtool) => subtool.id)
                                  .includes(x),
                            );
                            v.push(...selected);
                            onChange?.(v);
                          }}
                        >
                          {tool.tools.map((subtool) => {
                            return (
                              <ToggleGroupItem
                                value={subtool.id}
                                aria-label={subtool.name}
                                className=""
                              >
                                {subtool.name}
                              </ToggleGroupItem>
                            );
                          })}
                        </ToggleGroup>
                      </div>
                    )}
                  </>
                ))}
              </CommandList>
            </TabsContent>
            <TabsContent value={ToolType.BUILD_IN}>
              <CommandList>
                <CommandEmpty>No tools found.</CommandEmpty>

                {data[ToolType.BUILD_IN]?.map((tool) => (
                  <>
                    <CommandItem
                      key={tool.id}
                      value={tool.id}
                      onSelect={() => handleSelect(tool)}
                    >
                      {t(`tool_name.${tool.name.toLowerCase()}`, tool.name)}{' '}
                      {renderCheckIcon(tool)}
                    </CommandItem>
                    {tool.isToolkit && (
                      <div className="my-2">
                        <ToggleGroup
                          type="multiple"
                          variant="outline"
                          spacing={2}
                          size="sm"
                          className="flex-wrap"
                          value={
                            value.includes(tool.id)
                              ? tool.tools.map((x) => x.id)
                              : value
                          }
                          onValueChange={(_value) => {
                            const selected = intersection(
                              _value,
                              tool.tools.map((x) => x.id),
                            );
                            const v = value.filter(
                              (x) =>
                                !tool.tools
                                  .map((subtool) => subtool.id)
                                  .includes(x),
                            );
                            v.push(...selected);
                            onChange?.(v);
                          }}
                        >
                          {tool.tools.map((subtool) => {
                            return (
                              <ToggleGroupItem
                                value={subtool.id}
                                aria-label={subtool.name}
                                className=""
                              >
                                {t(
                                  `tool_name.${subtool.name.toLowerCase()}`,
                                  subtool.name,
                                )}
                              </ToggleGroupItem>
                            );
                          })}
                        </ToggleGroup>
                      </div>
                    )}
                  </>
                ))}
              </CommandList>
            </TabsContent>
            <TabsContent value={ToolType.SKILL}>
              <CommandList>
                <CommandEmpty>No tools found.</CommandEmpty>
                {groupedSkills.map((tool) =>
                  isSkillToolGroup(tool) ? (
                    <CommandGroup
                      key={tool.id}
                      className="[&_[cmdk-group]]:px-0"
                    >
                      <CommandItem
                        value={`${tool.id} ${tool.name} ${tool.skills
                          .map((skill) => skill.name)
                          .join(' ')}`}
                        onSelect={() =>
                          onChange?.(toggleSkillGroupSelection(value, tool))
                        }
                      >
                        {tool.name} {renderSkillGroupCheckIcon(tool)}
                      </CommandItem>
                      <div className="my-2">
                        <ToggleGroup
                          type="multiple"
                          variant="outline"
                          spacing={2}
                          size="sm"
                          className="flex-wrap"
                          value={intersection(
                            value,
                            tool.skills.map((skill) => skill.id),
                          )}
                          onValueChange={(_value) => {
                            const selected = intersection(
                              _value,
                              tool.skills.map((skill) => skill.id),
                            );
                            const v = value.filter(
                              (id) =>
                                !tool.skills
                                  .map((skill) => skill.id)
                                  .includes(id),
                            );
                            v.push(...selected);
                            onChange?.(v);
                          }}
                        >
                          {tool.skills.map((skill) => (
                            <ToggleGroupItem
                              key={skill.id}
                              value={skill.id}
                              aria-label={skill.name}
                            >
                              {skill.name}
                            </ToggleGroupItem>
                          ))}
                        </ToggleGroup>
                      </div>
                    </CommandGroup>
                  ) : (
                    <CommandItem
                      key={tool.id}
                      value={tool.id}
                      onSelect={() => handleSelect(tool)}
                    >
                      {tool.name}{' '}
                      {value?.includes(tool.id) ? (
                        <CheckIcon className="ml-auto size-4" />
                      ) : (
                        <div className="ml-auto size-4" />
                      )}
                    </CommandItem>
                  ),
                )}
              </CommandList>
            </TabsContent>
          </Tabs>
        </Command>
      </DialogContent>
    </Dialog>
  );
};
