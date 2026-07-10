import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { WindowMode } from '@/types/app';
import { useGlobal } from '@/renderer/hooks/use-global';
import {
  Field,
  FieldDescription,
  FieldLabel,
} from '@/renderer/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select';

export function WindowModeSetting() {
  const { t } = useTranslation();
  const { appInfo, setWindowMode } = useGlobal();
  const [saving, setSaving] = useState(false);
  const windowMode = appInfo?.windowMode;

  const handleChange = async (mode: WindowMode) => {
    setSaving(true);
    try {
      await setWindowMode(mode, true);
    } catch {
      toast.error(t('settings.window_mode_change_failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Field className="max-w-[320px]">
      <FieldLabel>{t('settings.window_mode')}</FieldLabel>
      <Select
        value={windowMode?.configured ?? 'normal'}
        disabled={saving}
        onValueChange={(value) => handleChange(value as WindowMode)}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="normal">
              {t('settings.window_mode_normal')}
            </SelectItem>
            <SelectItem value="compact">
              {t('settings.window_mode_compact')}
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      {windowMode && windowMode.configured !== windowMode.current ? (
        <FieldDescription>
          {t('settings.window_mode_temporary_override')}
        </FieldDescription>
      ) : null}
    </Field>
  );
}
