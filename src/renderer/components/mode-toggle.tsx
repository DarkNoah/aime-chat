'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';

import { Switch } from '@/renderer/components/ui/switch';
import { useGlobal } from '../hooks/use-global';

export function ModeToggle() {
  const { theme, setTheme } = useTheme();
  const { appInfo, getAppInfo } = useGlobal();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    setTheme(appInfo?.shouldUseDarkColors ? 'dark' : 'light');
  }, [appInfo?.shouldUseDarkColors, setTheme]);

  if (!mounted) {
    return null;
  }

  const handleThemeChange = async (_theme: 'light' | 'dark') => {
    setTheme(_theme);
    await window.electron.app.setTheme(_theme);
    await getAppInfo();
  };

  return (
    <Switch
      checked={theme === 'dark'}
      onCheckedChange={(checked) =>
        handleThemeChange(checked ? 'dark' : 'light')
      }
    />
  );
}
