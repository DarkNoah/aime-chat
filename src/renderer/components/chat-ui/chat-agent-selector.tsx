import { cn } from '@/renderer/lib/utils';
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
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
import { Agent } from '@/types/agent';
import { Button } from '../ui/button';
import { useTranslation } from 'react-i18next';
import { Badge } from '../ui/badge';
import { XIcon } from 'lucide-react';
import { IconCheck } from '@tabler/icons-react';

type BaseProps = ComponentProps<typeof Dialog> & {
  children?: React.ReactNode;
  className?: string;
  clearable?: boolean;
  defaultAgentId?: string;
};

interface SingleModeProps extends BaseProps {
  mode: 'single';
  value?: string;
  onChange?: (value: string | undefined) => void;
  onSelectedAgent?: (agent?: Agent) => void;
}

interface MultipleModeProps extends BaseProps {
  mode: 'multiple';
  value?: string[];
  onChange?: (value: string[] | undefined) => void;
  onSelectedAgent?: (agent?: Agent[]) => void;
}

export type ChatAgentSelectorProps = SingleModeProps | MultipleModeProps;

export const ChatAgentSelector = ({
  children,
  ...props
}: ChatAgentSelectorProps) => {
  const { t } = useTranslation();
  const { clearable = false, defaultAgentId, className } = props;
  const isSingleMode = props.mode === 'single';
  const singleProps = isSingleMode ? props : undefined;
  const multipleProps = !isSingleMode ? props : undefined;

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Agent[]>([]);
  const [open, setOpen] = useState(false);
  const [internalSingleValue, setInternalSingleValue] = useState<
    string | undefined
  >(singleProps?.value);
  const [internalMultipleValue, setInternalMultipleValue] = useState<string[]>(
    multipleProps?.value ?? [],
  );
  const initializedDefaultRef = useRef(false);

  useEffect(() => {
    if (isSingleMode) {
      setInternalSingleValue(singleProps?.value);
      return;
    }

    setInternalMultipleValue(multipleProps?.value ?? []);
  }, [isSingleMode, multipleProps?.value, singleProps?.value]);

  const selectedSingleAgent = useMemo(() => {
    if (!isSingleMode || !internalSingleValue) {
      return undefined;
    }

    return data.find((agent) => agent.id === internalSingleValue);
  }, [data, internalSingleValue, isSingleMode]);

  const selectedMultipleIds = isSingleMode ? [] : internalMultipleValue;

  const handleSingleSelect = (agent: Agent | undefined) => {
    const nextValue = agent?.id;
    setInternalSingleValue(nextValue);
    singleProps?.onChange?.(nextValue);
    singleProps?.onSelectedAgent?.(agent);
  };

  const handleMultipleSelect = (ids: string[]) => {
    setInternalMultipleValue(ids);
    multipleProps?.onChange?.(ids);
    multipleProps?.onSelectedAgent?.(
      data.filter((agent) => ids.includes(agent.id)),
    );
  };

  const getAvailableAgents = async () => {
    try {
      setLoading(true);
      const agents = await window.electron.agents.getAvailableAgents();
      setData(agents);
      return agents;
    } catch {
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getAvailableAgents();
  }, []);

  useEffect(() => {
    if (
      !isSingleMode ||
      initializedDefaultRef.current ||
      singleProps?.value != null ||
      internalSingleValue ||
      !defaultAgentId ||
      data.length === 0
    ) {
      return;
    }

    const defaultAgent = data.find((agent) => agent.id === defaultAgentId);
    if (!defaultAgent) {
      return;
    }

    initializedDefaultRef.current = true;
    handleSingleSelect(defaultAgent);
  }, [
    data,
    defaultAgentId,
    internalSingleValue,
    isSingleMode,
    singleProps?.value,
  ]);

  const handleClear = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (isSingleMode) {
      handleSingleSelect(undefined);
      return;
    }

    handleMultipleSelect([]);
  };

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
            className="w-fit h-full cursor-pointer backdrop-blur shadow flex flex-row items-center justify-between"
          >
            <small className="text-xs text-muted-foreground">
              {isSingleMode && selectedSingleAgent
                ? `@${selectedSingleAgent.name}`
                : t('common.select_agent')}
            </small>
            {clearable &&
              ((isSingleMode && selectedSingleAgent) ||
                (!isSingleMode && selectedMultipleIds.length > 0)) && (
                <Button
                  variant="link"
                  size="icon-sm"
                  className="rounded-full w-5 h-5 hover:bg-muted-foreground/20 transition-all cursor-pointer text-muted-foreground"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={handleClear}
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
            <CommandEmpty>
              {loading ? t('common.loading') : 'No agents found.'}
            </CommandEmpty>
            <div className="p-2">
              {data.map((agent) => {
                const isSelected = isSingleMode
                  ? internalSingleValue === agent.id
                  : selectedMultipleIds.includes(agent.id);

                return (
                  <CommandItem
                    key={agent.id}
                    value={agent.id}
                    disabled={agent.isHidden}
                    onSelect={() => {
                      if (isSingleMode) {
                        handleSingleSelect(agent);
                        setOpen(false);
                        return;
                      }

                      const nextIds = selectedMultipleIds.includes(agent.id)
                        ? selectedMultipleIds.filter((id) => id !== agent.id)
                        : [...new Set([...selectedMultipleIds, agent.id])];

                      handleMultipleSelect(nextIds);
                    }}
                    className="flex flex-row gap-2 items-center justify-between"
                  >
                    <div className="flex flex-col gap-1 items-start">
                      {agent.name}
                      <small className="text-xs text-muted-foreground line-clamp-2">
                        {agent.description}
                      </small>
                    </div>
                    {isSelected && <IconCheck className="w-4 h-4" />}
                  </CommandItem>
                );
              })}
            </div>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
};
