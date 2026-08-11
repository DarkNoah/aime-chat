import { useEffect, useLayoutEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { useGlobal } from '@/renderer/hooks/use-global';
import { applyThemeConfig } from '@/renderer/lib/theme-config';

export function ThemeConfigApplier() {
  const { appInfo } = useGlobal();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const syncedTheme = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (appInfo?.theme && syncedTheme.current !== appInfo.theme) {
      syncedTheme.current = appInfo.theme;
      if (theme === appInfo.theme) {
        return;
      }
      setTheme(appInfo.theme);
    }
  }, [appInfo?.theme, setTheme, theme]);

  useLayoutEffect(() => {
    applyThemeConfig(
      document.documentElement,
      appInfo?.themeConfig,
      resolvedTheme === 'dark' ||
        (resolvedTheme === undefined && appInfo?.shouldUseDarkColors === true),
    );
  }, [appInfo?.shouldUseDarkColors, appInfo?.themeConfig, resolvedTheme]);

  return null;
}
