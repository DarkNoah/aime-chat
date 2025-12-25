import { cn } from '@/renderer/lib/utils';
import React, { useEffect, useState, type ComponentProps } from 'react';
import { Dialog, DialogContent, DialogTrigger } from '../ui/dialog';
import {
  Command,
  CommandEmpty,
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

export type ChatToolSelectorProps = ComponentProps<typeof Dialog> & {
  children: React.ReactNode;
  className?: string;
  value?: string[];
  onChange?: (value: string[]) => void;
};

export const ChatToolSelector = ({
  children,
  ...props
}: ChatToolSelectorProps) => {
  const { value = [], onChange } = props;
  const [loading, setLoading] = useState(false);
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
      console.log(tools);
      setData(tools);
      setLoading(false);
    } catch (error) {
      console.error(error);
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

      const v = value.filter((x) => !tool.tools.map((t) => t.id).includes(x));
      if (selected.length === tool.tools.length) {
        onChange?.(v);
      } else {
        v.push(...tool.tools.map((t) => t.id));
        onChange?.(v);
      }
    } else {
      if (value?.includes(tool.id)) {
        onChange?.(value?.filter((x) => x !== tool.id));
      } else {
        onChange?.(value?.concat(tool.id));
      }
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
                      {tool.name} {renderCheckIcon(tool)}
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
                              (x) => !tool.tools.map((t) => t.id).includes(x),
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
                      {tool.name} {renderCheckIcon(tool)}
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
                              (x) => !tool.tools.map((t) => t.id).includes(x),
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
            <TabsContent value={ToolType.SKILL}>
              <CommandList>
                <CommandEmpty>No tools found.</CommandEmpty>
                {data[ToolType.SKILL]?.map((tool) => (
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
                ))}
              </CommandList>
            </TabsContent>
          </Tabs>
        </Command>
      </DialogContent>
    </Dialog>
  );
};
