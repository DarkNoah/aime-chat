import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BrainIcon, GlobeIcon, SquareIcon, TrashIcon } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '../ui/command';
import { Popover, PopoverAnchor, PopoverContent } from '../ui/popover';
import { useTranslation } from 'react-i18next';
import { usePromptInputController } from '../ai-elements/prompt-input';

export interface SlashCommandDefinition {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  visible?: boolean;
}

export interface ChatSlashCommandProps {
  input: string;
  /** Fill the completed command text into the input */
  onComplete: (text: string) => void;
  commands?: SlashCommandDefinition[];
  children: React.ReactNode;
}

function getSlashQuery(input: string): string | null {
  if (!input.startsWith('/')) return null;
  const text = input.slice(1);
  if (text.includes(' ') || text.includes('\n')) return null;
  return text.toLowerCase();
}

export function ChatSlashCommand({
  input,
  onComplete,
  commands = [],
  children,
}: ChatSlashCommandProps) {
  const query = getSlashQuery(input);
  const [selectedValue, setSelectedValue] = useState('');
  const { t } = useTranslation();
  const filtered = useMemo(() => {
    if (query === null) return [];
    return commands
      .filter((cmd) => cmd.visible !== false)
      .filter(
        (cmd) =>
          cmd.id.toLowerCase().includes(query) ||
          cmd.label.toLowerCase().includes(query),
      );
  }, [commands, query]);

  const isOpen = query !== null && filtered.length > 0;

  useEffect(() => {
    setSelectedValue(filtered.length > 0 ? filtered[0].id : '');
  }, [filtered]);
  const controller = usePromptInputController();

  const completeSelected = useCallback(() => {
    const cmd = filtered.find((c) => c.id === selectedValue) ?? filtered[0];
    if (cmd) {
      controller.textInput.setInput(`/${cmd.id} `);
      onComplete(`/${cmd.id} `);
    }
  }, [filtered, selectedValue, onComplete, controller]);

  const handleKeyDownCapture = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          e.stopPropagation();
          setSelectedValue((prev) => {
            const idx = filtered.findIndex((c) => c.id === prev);
            return filtered[(idx + 1) % filtered.length].id;
          });
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          e.stopPropagation();
          setSelectedValue((prev) => {
            const idx = filtered.findIndex((c) => c.id === prev);
            return filtered[(idx - 1 + filtered.length) % filtered.length].id;
          });
          break;
        }
        case 'Tab': {
          e.preventDefault();
          e.stopPropagation();
          completeSelected();
          break;
        }
        case 'Enter': {
          e.preventDefault();
          e.stopPropagation();
          completeSelected();
          break;
        }
        case 'Escape': {
          e.preventDefault();
          e.stopPropagation();
          onComplete('');
          break;
        }
        default:
          break;
      }
    },
    [isOpen, filtered, completeSelected, onComplete],
  );

  return (
    <Popover open={isOpen} modal={false}>
      <PopoverAnchor asChild>
        <div onKeyDownCapture={handleKeyDownCapture}>{children}</div>
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="start"
        className="w-[280px] p-0"
        sideOffset={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <Command value={selectedValue} onValueChange={setSelectedValue} loop>
          <CommandList>
            {/* <CommandEmpty>No commands found</CommandEmpty> */}
            <CommandGroup
              heading={t('common.slash_commands', 'Slash Commands')}
            >
              {filtered.map((cmd) => (
                <CommandItem
                  key={cmd.id}
                  value={cmd.id}
                  onSelect={() => {
                    controller.textInput.setInput(`/${cmd.id} `);
                    onComplete(`/${cmd.id} `);
                  }}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  {cmd.icon && (
                    <span className="flex items-center justify-center size-5 shrink-0 text-muted-foreground">
                      {cmd.icon}
                    </span>
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium">/{cmd.id}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {cmd.description}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
