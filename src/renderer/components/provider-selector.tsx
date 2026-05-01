import { cn } from '@/renderer/lib/utils';
import React, { useEffect, useState, type ComponentProps } from 'react';
import { Tool, ToolType } from '@/types/tool';
import { CheckIcon, XIcon } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Provider, ProviderTag } from '@/types/provider';
import { Button } from './ui/button';

export type ProviderSelectorProps = ComponentProps<typeof Select> & {
  children?: React.ReactNode;
  clearable?: boolean;
  className?: string;
  value?: string;
  type?: ProviderTag;
  onChange?: (value: string) => void;
};

export const ProviderSelector = ({
  children,
  type,
  ...props
}: ProviderSelectorProps) => {
  const { value, onChange, clearable = false } = props;
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Provider[]>([]);
  useEffect(() => {
    const getProviders = async () => {
      try {
        setLoading(true);
        const providers = await window.electron.providers.getList({
          tags: type ? [type] : undefined,
        });
        console.log(providers);
        setData(providers);
        setLoading(false);
      } catch (error) {
        console.error(error);
        setLoading(false);
      }
    };
    getProviders();
  }, []);

  return (
    <Select {...props} >
      <SelectTrigger>
        <SelectValue placeholder="Select a provider" />
      
      {/* {clearable && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Clear selected model"
            className="rounded-full w-5 h-5 mr-2 hover:bg-muted-foreground/20 transition-all cursor-pointer"
            onPointerDown={(e) => {
              // Prevent the click from reaching ModelSelectorTrigger (which would open the popover)
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange?.(null);
            }}
          >
            <XIcon className="size-3" />
          </Button>
        )} */}
      </SelectTrigger>
      <SelectContent>
        {clearable && (
          <SelectItem key="local" value={"default"}>
            <span className="text-muted-foreground">Default Search</span>
          </SelectItem>
        )}
        {data.map((provider) => (
          <SelectItem key={provider.id} value={provider.id}>
            {provider.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
