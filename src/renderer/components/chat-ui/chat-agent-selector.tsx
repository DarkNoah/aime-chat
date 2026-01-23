import { cn } from '@/renderer/lib/utils';
import React, { useEffect, useState, type ComponentProps } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Tool, ToolType } from '@/types/tool';
import { CheckIcon, CircleXIcon, XIcon } from 'lucide-react';
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
import { Badge } from '../ui/badge';

type BaseProps = ComponentProps<typeof Dialog> & {
  children?: React.ReactNode;
  className?: string;
  clearable?: boolean;
};
interface SingleModeProps extends BaseProps {
  mode: 'single';
  value?: string | undefined;
  onChange?: (value: string | undefined) => void;
  onSelectedAgent?: (agent?: Agent) => void;
}

// 3. 定义 Mode 为 'multiple' 的专属 Props
interface MultipleModeProps extends BaseProps {
  mode: 'multiple';
  value?: string[] | undefined;
  onChange?: (value: string[] | undefined) => void;
  onSelectedAgent?: (agent?: Agent[]) => void;
}

export type ChatAgentSelectorProps = SingleModeProps | MultipleModeProps;

export const ChatAgentSelector = ({
  children,
  ...props
}: ChatAgentSelectorProps) => {
  const { t } = useTranslation();
  const {
    value,
    onChange,
    onSelectedAgent,
    mode = 'single',
    clearable = false,
  } = props;
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Agent[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | undefined>(
    undefined,
  );
  const [insideValue, setInsideValue] = useState<string[] | string | undefined>(
    undefined,
  );

  useEffect(() => {
    if (insideValue !== value) {
      setInsideValue(value);
      setSelectedAgent(data?.find((agent) => agent.id === value));
      onChange?.(value);
      onSelectedAgent?.(data?.find((agent) => agent.id === value));
    }
  }, [value, data]);

  const getAvailableAgents = async () => {
    try {
      setLoading(true);
      const agents = await window.electron.agents.getAvailableAgents();
      console.log(agents);
      setData(agents);
      setLoading(false);
      return agents;
    } catch (error) {
      console.error(error);
      setLoading(false);
      return [];
    }
  };
  useEffect(() => {
    getAvailableAgents();
  }, []);

  // useEffect(() => {

  // }, [data, value]);

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
        {children || (
          <Badge
            variant="outline"
            className="w-fit cursor-pointer backdrop-blur shadow flex flex-row items-center justify-between"
          >
            <small className="text-xs text-muted-foreground">
              {selectedAgent
                ? `@${selectedAgent?.name}`
                : t('common.select_agent')}
            </small>
            {clearable && selectedAgent && (
              <Button
                variant="link"
                size="icon-sm"
                className="rounded-full w-5 h-5 hover:bg-muted-foreground/20 transition-all cursor-pointer text-muted-foreground"
                onPointerDown={(e) => {
                  // Prevent the click from reaching ModelSelectorTrigger (which would open the popover)
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (mode === 'single') {

                    onSelectedAgent(undefined);
                  } else {
                    onSelectedAgent([]);
                  }

                  // setOpen(false);
                }}
              >
                <XIcon className="size-3" />
              </Button>
            )}
          </Badge>
        )}
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
                    if (mode === 'single') {
                      (onChange as (value: string | undefined) => void)?.(
                        agent.id,
                      );
                      onSelectedAgent?.(agent);
                      setOpen(false);
                    } else if (mode === 'multiple') {
                      let ids;
                      if ((insideValue as string[]).includes(agent.id)) {
                        ids = (insideValue as string[]).filter(
                          (id) => id !== agent.id,
                        );
                      } else {
                        ids = [...new Set([...insideValue, agent.id])];
                      }

                      (onChange as (value: string[] | undefined) => void)?.(
                        ids,
                      );
                      onSelectedAgent?.(
                        data?.filter((a) => ids.includes(a.id)),
                      );
                    }
                  }}
                  className="flex flex-row gap-2 items-center justify-between"
                >
                  <div className="flex flex-col gap-1 items-start">
                    {agent.name}
                    <small className="text-xs text-muted-foreground">
                      {agent.description}
                    </small>
                  </div>
                  {mode === 'single' && insideValue === agent.id && (
                    <IconCheck className="w-4 h-4" />
                  )}
                  {mode === 'multiple' && insideValue?.includes(agent.id) && (
                    <IconCheck className="w-4 h-4" />
                  )}
                </CommandItem>
              ))}
            </div>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
};
