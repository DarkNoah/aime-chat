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
  IconCheck,
  IconSquare,
  IconSquareAsterisk,
  IconSquareCheck,
} from '@tabler/icons-react';
import { Agent } from '@/types/agent';
import { Button } from '../ui/button';

export type ChatAgentSelectorProps = ComponentProps<typeof Dialog> & {
  children?: React.ReactNode;
  className?: string;
  value?: Agent;
  onChange?: (value: Agent) => void;
};

export const ChatAgentSelector = ({
  children,
  ...props
}: ChatAgentSelectorProps) => {
  const { value, onChange } = props;
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Agent[]>([]);
  const [open, setOpen] = useState(false);

  const getAvailableAgents = async () => {
    try {
      setLoading(true);
      const tools = await window.electron.agents.getAvailableAgents();
      console.log(tools);
      setData(tools);
      setLoading(false);
    } catch (error) {
      console.error(error);
      setLoading(false);
    }
  };
  useEffect(() => {
    getAvailableAgents();
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={(_open) => {
        if (_open) {
          getAvailableAgents();
        }
        setOpen(_open);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="w-fit">
          <small className="text-xs text-muted-foreground">
            {`@${value?.name}`}
          </small>
        </Button>
      </DialogTrigger>

      <DialogContent className={cn('p-0')}>
        <Command className="**:data-[slot=command-input-wrapper]:h-auto">
          <CommandInput className={cn('h-auto py-3.5')} />
          <CommandList>
            <CommandEmpty>No agents found.</CommandEmpty>
            <div className="p-2">
              {data?.map((agent) => (
                <CommandItem
                  key={agent.id}
                  value={agent.id}
                  onSelect={() => {
                    setOpen(false);
                    onChange?.(agent);
                  }}
                  className="flex flex-row gap-2 items-center justify-between"
                >
                  <div className="flex flex-col gap-1 items-start">
                    {agent.name}
                    <small className="text-xs text-muted-foreground">
                      {agent.description}
                    </small>
                  </div>
                  {value?.id === agent.id && <IconCheck className="w-4 h-4" />}
                </CommandItem>
              ))}
            </div>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
};
