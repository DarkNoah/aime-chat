import React, { useEffect, useState } from 'react';
// import {
//   PromptInputModelSelect,
//   PromptInputModelSelectContent,
//   PromptInputModelSelectItem,
//   PromptInputModelSelectTrigger,
// } from '../ai-elements/prompt-input';
import { useProviders } from '@/renderer/hooks/use-providers';
import { useProviderStore } from '@/renderer/store/index';
import { CheckIcon, Loader2Icon } from 'lucide-react';
import { Spinner } from '../ui/spinner';
import { SelectLabel } from '../ui/select';
import { ModelType, Provider, ProviderModel } from '@/types/provider';
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorLogoGroup,
  ModelSelectorName,
  ModelSelectorTrigger,
} from '../ai-elements/model-selector';
import { PromptInputButton } from '../ai-elements/prompt-input';
import { cn } from '@/renderer/lib/utils';

export type ChatModelSelectProps = {
  className?: string;
  value?: string;
  type?: ModelType;
  onChange?: (model: string) => void;
};

export interface ChatModelSelectRef {}

export const ChatModelSelect = React.forwardRef<
  ChatModelSelectRef,
  ChatModelSelectProps
>((props, ref) => {
  const { className, value, onChange, type = ModelType.LLM } = props;
  const [data, setData] = useState<Provider[]>([]);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [selectedModelData, setSelectedModelData] =
    useState<ProviderModel | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    const getAvailableModels = async () => {
      setLoading(true);
      try {
        const providers =
          await window.electron.providers.getAvailableModels(type);

        const models = [];
        providers.forEach((provider) => {
          models.push(...provider.models);
        });

        if (
          (!selectedModelData || selectedModelData?.id !== value) &&
          models.length > 0
        ) {
          if (value && models.find((m) => m.id === value)) {
            const model = models.find((m) => m.id === value);

            setSelectedModelData(model);
            onChange?.(model.id);
          }
        }
        setData(providers);
      } finally {
        setLoading(false);
      }
    };
    getAvailableModels();
  }, [onChange, selectedModelData, type, value]);

  return (
    <ModelSelector onOpenChange={setModelSelectorOpen} open={modelSelectorOpen}>
      <ModelSelectorTrigger asChild className={cn('w-full ', className)}>
        <PromptInputButton className="justify-start" disabled={loading}>
          {selectedModelData?.providerType && (
            <ModelSelectorLogo provider={selectedModelData.providerType} />
          )}
          {selectedModelData?.name && (
            <ModelSelectorName>{selectedModelData.name}</ModelSelectorName>
          )}
          {/* {loading ? (
            <div className="flex flex-row gap-2 items-center">
              <Spinner />
              Loading...
            </div>
          ) : null} */}
        </PromptInputButton>
      </ModelSelectorTrigger>
      <ModelSelectorContent>
        <ModelSelectorInput placeholder="Search models..." />
        <ModelSelectorList>
          <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
          {data.map((provider) => (
            <ModelSelectorGroup heading={provider.name} key={provider.id}>
              {provider.models.map((m) => (
                <ModelSelectorItem
                  key={m.id}
                  onSelect={() => {
                    onChange?.(m.id);
                    setSelectedModelData(m);
                    setModelSelectorOpen(false);
                  }}
                  value={m.id}
                >
                  <ModelSelectorLogo provider={provider.type} />
                  <ModelSelectorName>{m.name}</ModelSelectorName>
                  {/* <ModelSelectorLogoGroup>
                    {m.providers.map((provider) => (
                      <ModelSelectorLogo key={provider} provider={provider} />
                    ))}
                  </ModelSelectorLogoGroup> */}
                  {value === m.id ? (
                    <CheckIcon className="ml-auto size-4" />
                  ) : (
                    <div className="ml-auto size-4" />
                  )}
                </ModelSelectorItem>
              ))}
            </ModelSelectorGroup>
          ))}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>

    // <PromptInputModelSelect
    //   onValueChange={(_value) => {
    //     if (_value) {
    //       onChange?.(_value);
    //       // setDefaultModel(value);
    //     }
    //   }}
    //   value={value}
    // >
    //   <PromptInputModelSelectTrigger>
    //     <PromptInputModelSelectValue placeholder="Select a model" />
    //   </PromptInputModelSelectTrigger>
    //   <PromptInputModelSelectContent>
    //     {data.map((provider) => {
    //       return (
    //         <div key={provider.id}>
    //           <div className="text-xs text-muted-foreground flex flex-row gap-2 items-center">
    //             {provider.name}
    //           </div>

    //           {provider.models.map((model) => (
    //             <PromptInputModelSelectItem
    //               key={model.id}
    //               value={`${provider.id}/${model.id}`}
    //             >
    //               {model.name}
    //             </PromptInputModelSelectItem>
    //           ))}
    //         </div>
    //       );
    //     })}
    //     {isLoading ? (
    //       <div className="p-2 text-sm text-muted-foreground">
    //         <Spinner />
    //       </div>
    //     ) : (
    //       data.providers
    //         ?.filter(
    //           (provider) => provider.models && provider.models?.length > 0,
    //         )
    //         ?.map((provider) => (
    //           <div key={provider.id}>
    //             <SelectLabel className="text-xs text-muted-foreground">
    //               {provider.name}
    //             </SelectLabel>

    //             {provider.models.map((model) => (
    //               <PromptInputModelSelectItem
    //                 key={model.id}
    //                 value={`${provider.id}/${model.id}`}
    //               >
    //                 {model.name}
    //               </PromptInputModelSelectItem>
    //             ))}
    //           </div>
    //         ))
    //     )}
    //   </PromptInputModelSelectContent>
    // </PromptInputModelSelect>
  );
});

ChatModelSelect.displayName = 'ChatModelSelect';
