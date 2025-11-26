import { cn } from '@/renderer/lib/utils';
import React, { useEffect, useState, type ComponentProps } from 'react';
import { Tool, ToolType } from '@/types/tool';
import { CheckIcon } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Provider, ProviderTag } from '@/types/provider';

export type ProviderSelectorProps = ComponentProps<typeof Select> & {
  children?: React.ReactNode;
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
  const { value, onChange } = props;
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
    <Select {...props}>
      <SelectTrigger>
        <SelectValue placeholder="Select a provider" />
      </SelectTrigger>
      <SelectContent>
        {data.map((provider) => (
          <SelectItem key={provider.id} value={provider.id}>
            {provider.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
