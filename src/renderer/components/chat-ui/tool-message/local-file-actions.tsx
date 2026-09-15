import { ChevronDown, FolderOpen, PanelLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';

export function LocalFileActions({
  fileName,
  onOpenInFilesystem,
  onShowInExplorer,
}: {
  fileName: string;
  onOpenInFilesystem?: () => void;
  onShowInExplorer: () => void;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground"
          aria-label={t('chat.file_open_options', { name: fileName })}
        >
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={!onOpenInFilesystem}
          onSelect={onOpenInFilesystem}
        >
          <PanelLeft className="size-4" />
          {t('chat.open_in_filesystem_default')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onShowInExplorer}>
          <FolderOpen className="size-4" />
          {t('chat.show_in_system_explorer')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
