import { useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useGlobal } from '@/renderer/hooks/use-global';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

export function WindowModeToggle() {
  const { t } = useTranslation();
  const { appInfo, setWindowMode } = useGlobal();
  const [switching, setSwitching] = useState(false);
  const isCompact = appInfo?.windowMode?.current === 'compact';
  const label = isCompact
    ? t('chat.restore_normal_window')
    : t('chat.enter_compact_mode');

  const handleToggle = async () => {
    setSwitching(true);
    try {
      await setWindowMode(isCompact ? 'normal' : 'compact', false);
    } catch {
      toast.error(t('settings.window_mode_change_failed'));
    } finally {
      setSwitching(false);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={label}
          disabled={switching}
          onClick={handleToggle}
        >
          {isCompact ? (
            <Maximize2 className="size-3.5" />
          ) : (
            <Minimize2 className="size-3.5" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
