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
import { useTranslation } from 'react-i18next';
import { Spinner } from '../ui/spinner';

export type ChatAgentSelectorProps = ComponentProps<typeof Dialog> & {
  children?: React.ReactNode;
  className?: string;
  value?: string | undefined;
  onChange?: (value: string | undefined) => void;
  onSelectedAgent?: (agent?: Agent) => void;
};

export const ChatAgentSelector = ({
  children,
  ...props
}: ChatAgentSelectorProps) => {
  const { t } = useTranslation();
  const { value, onChange, onSelectedAgent } = props;
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Agent[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | undefined>();

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

  useEffect(() => {
    setSelectedAgent(data?.find((agent) => agent.id === value));
  }, [data, value]);

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
        <Button variant="ghost" size="sm" className="w-fit" disabled={loading}>
          {loading ? (
            <div className="flex flex-row gap-2 items-center">
              <Spinner />
              <small className="text-xs text-muted-foreground">
                {t('common.loading')}
              </small>
            </div>
          ) : (
            <small className="text-xs text-muted-foreground">
              {selectedAgent
                ? `@${selectedAgent?.name}`
                : t('common.select_agent')}
            </small>
          )}
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
                    setSelectedAgent(agent);
                    onChange?.(agent.id);
                    onSelectedAgent?.(agent);
                  }}
                  className="flex flex-row gap-2 items-center justify-between"
                >
                  <div className="flex flex-col gap-1 items-start">
                    {agent.name}
                    <small className="text-xs text-muted-foreground">
                      {agent.description}
                    </small>
                  </div>
                  {value === agent.id && <IconCheck className="w-4 h-4" />}
                </CommandItem>
              ))}
            </div>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
};
