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

export type ChatToolSelectorTriggerProps = ComponentProps<typeof DialogTrigger>;

export const ChatToolSelectorTrigger = (
  props: ChatToolSelectorTriggerProps,
) => <DialogTrigger {...props} />;

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
  const { value, onChange } = props;
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
  useEffect(() => {
    const getAvailableTools = async () => {
      try {
        setLoading(true);
        const _data = await window.electron.tools.getAvailableTools();
        console.log(_data);
        setData(_data);
        setLoading(false);
      } catch (error) {
        console.error(error);
        setLoading(false);
      }
    };
    getAvailableTools();
  }, []);

  const handleSelect = (id: string) => {
    if (value?.includes(id)) {
      onChange?.(value?.filter((x) => x !== id));
    } else {
      onChange?.(value?.concat(id));
    }
  };

  return (
    <Dialog>
      {children}

      <DialogContent className={cn('p-0')}>
        <Command className="**:data-[slot=command-input-wrapper]:h-auto">
          <CommandInput className={cn('h-auto py-3.5')} />
          <Tabs className="p-4" defaultValue={ToolType.MCP}>
            <TabsList>
              <TabsTrigger value={ToolType.MCP}>MCP</TabsTrigger>
              <TabsTrigger value={ToolType.BUILD_IN}>Built-in</TabsTrigger>
              <TabsTrigger value={ToolType.SKILL}>Skill</TabsTrigger>
            </TabsList>
            <TabsContent value={ToolType.MCP}>
              <CommandList>
                <CommandEmpty>No tools found.</CommandEmpty>
                {data?.mcp.map((tool) => (
                  <CommandItem
                    key={tool.id}
                    value={tool.id}
                    onSelect={() => handleSelect(tool.id)}
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
            <TabsContent value={ToolType.BUILD_IN}>
              <CommandList>
                <CommandEmpty>No tools found.</CommandEmpty>
                {data[ToolType.BUILD_IN]?.map((tool) => (
                  <CommandItem
                    key={tool.id}
                    value={tool.id}
                    onSelect={() => handleSelect(tool.id)}
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
            <TabsContent value={ToolType.SKILL}>
              <CommandList>
                <CommandEmpty>No tools found.</CommandEmpty>
                {data[ToolType.SKILL]?.map((tool) => (
                  <CommandItem
                    key={tool.id}
                    value={tool.id}
                    onSelect={() => handleSelect(tool.id)}
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
