import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  IconCheck,
  IconLoader2,
  IconPhoto,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import type {
  ThemeBackgroundConfig,
  ThemeBackgroundSourcePaths,
  ThemeBackgroundTarget,
  ThemeConfig,
} from '@/types/app';
import { Button } from '@/renderer/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/renderer/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select';
import { Slider } from '@/renderer/components/ui/slider';
import { useGlobal } from '@/renderer/hooks/use-global';
import { useHeader } from '@/renderer/hooks/use-title';
import { cn } from '@/renderer/lib/utils';

const ACCENT_PRESETS = [
  { color: '#0F766E', labelKey: 'settings.accent_color_teal' },
  { color: '#2563EB', labelKey: 'settings.accent_color_blue' },
  { color: '#7C3AED', labelKey: 'settings.accent_color_violet' },
  { color: '#B45309', labelKey: 'settings.accent_color_amber' },
  { color: '#BE123C', labelKey: 'settings.accent_color_rose' },
] as const;

const createThemeConfig = (value?: ThemeConfig): ThemeConfig => ({
  ...(value?.primaryColor ? { primaryColor: value.primaryColor } : {}),
  sidebarBackground: {
    opacity: 0.2,
    blur: 0,
    ...value?.sidebarBackground,
  },
  chatBackground: {
    opacity: 0.2,
    blur: 0,
    ...value?.chatBackground,
  },
});

type BackgroundSettingProps = {
  title: string;
  description: string;
  background: ThemeBackgroundConfig;
  importing: boolean;
  disabled: boolean;
  /** The image is pinned by an environment variable and cannot be replaced. */
  locked: boolean;
  onChoose: () => void;
  onRemove: () => void;
  onChange: (value: ThemeBackgroundConfig, persist: boolean) => void;
};

function BackgroundSetting({
  title,
  description,
  background,
  importing,
  disabled,
  locked,
  onChoose,
  onRemove,
  onChange,
}: BackgroundSettingProps) {
  const { t } = useTranslation();
  const opacity = Math.round(background.opacity * 100);

  return (
    <FieldSet
      className="gap-4 rounded-lg border p-4 disabled:opacity-70"
      disabled={disabled}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <FieldLegend className="mb-0">{title}</FieldLegend>
          <FieldDescription className="max-w-[65ch]">
            {description}
          </FieldDescription>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || locked}
            onClick={onChoose}
          >
            {importing ? (
              <IconLoader2 className="animate-spin" />
            ) : (
              <IconPhoto />
            )}
            {background.url
              ? t('settings.background_replace_image')
              : t('settings.background_choose_image')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!background.url || disabled || locked}
            onClick={onRemove}
          >
            <IconTrash />
            {t('settings.background_remove_image')}
          </Button>
        </div>
      </div>

      <div className="relative h-28 overflow-hidden rounded-lg border bg-background">
        {background.url ? (
          <>
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: `url(${JSON.stringify(background.url)})`,
                filter: `blur(${background.blur}px)`,
                opacity: background.opacity,
              }}
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-background opacity-[0.32]"
            />
          </>
        ) : null}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            role="status"
            aria-live="polite"
            className="rounded-md bg-background/90 px-3 py-1.5 text-sm text-foreground shadow-sm"
          >
            {background.url
              ? t('settings.background_is_set')
              : t('settings.background_not_set')}
          </span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {locked
          ? t('settings.background_managed_by_environment')
          : t('settings.background_image_requirements')}
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field data-disabled={!background.url || undefined}>
          <div className="flex items-center justify-between gap-3">
            <FieldLabel>{t('settings.background_opacity')}</FieldLabel>
            <span className="text-xs tabular-nums text-muted-foreground">
              {opacity}%
            </span>
          </div>
          <Slider
            aria-label={t('settings.background_opacity')}
            aria-valuetext={`${opacity}%`}
            disabled={!background.url || disabled}
            min={0}
            max={50}
            step={1}
            value={[opacity]}
            onValueChange={([value]) =>
              onChange({ ...background, opacity: value / 100 }, false)
            }
            onValueCommit={([value]) =>
              onChange({ ...background, opacity: value / 100 }, true)
            }
          />
          <FieldDescription>
            {t('settings.background_opacity_description')}
          </FieldDescription>
        </Field>

        <Field data-disabled={!background.url || undefined}>
          <div className="flex items-center justify-between gap-3">
            <FieldLabel>{t('settings.background_blur')}</FieldLabel>
            <span className="text-xs tabular-nums text-muted-foreground">
              {background.blur}px
            </span>
          </div>
          <Slider
            aria-label={t('settings.background_blur')}
            aria-valuetext={`${background.blur}px`}
            disabled={!background.url || disabled}
            min={0}
            max={20}
            step={1}
            value={[background.blur]}
            onValueChange={([value]) =>
              onChange({ ...background, blur: value }, false)
            }
            onValueCommit={([value]) =>
              onChange({ ...background, blur: value }, true)
            }
          />
          <FieldDescription>
            {t('settings.background_blur_description')}
          </FieldDescription>
        </Field>
      </div>
    </FieldSet>
  );
}

export default function Appearance() {
  const { t } = useTranslation();
  const { setTitle } = useHeader();
  const { appInfo, getAppInfo } = useGlobal();
  const { setTheme } = useTheme();
  const [config, setConfig] = useState<ThemeConfig>(() =>
    createThemeConfig(appInfo?.themeConfig),
  );
  const [importing, setImporting] = useState<ThemeBackgroundTarget>();
  const configRef = useRef(config);
  const pendingConfigSaveRef = useRef<
    | {
        config: ThemeConfig;
        showSuccess: boolean;
        sourcePaths?: ThemeBackgroundSourcePaths;
        failureMessage?: string;
      }
    | undefined
  >(undefined);
  const saveLoopRef = useRef<Promise<boolean> | null>(null);

  const updateLocalConfig = useCallback((nextConfig: ThemeConfig) => {
    configRef.current = nextConfig;
    setConfig(nextConfig);
  }, []);

  useEffect(() => {
    setTitle(t('settings.appearance'));
  }, [setTitle, t]);

  useEffect(() => {
    if (saveLoopRef.current || pendingConfigSaveRef.current) {
      return;
    }
    updateLocalConfig(createThemeConfig(appInfo?.themeConfig));
  }, [appInfo?.themeConfig, updateLocalConfig]);

  const drainConfigSaves = useCallback(async () => {
    let allSucceeded = true;
    let shouldShowSuccess = false;
    let latestAppInfo = appInfo;
    let failureReported = false;

    async function flushPendingSaves(): Promise<void> {
      const request = pendingConfigSaveRef.current;
      if (!request) {
        return;
      }
      pendingConfigSaveRef.current = undefined;
      shouldShowSuccess ||= request.showSuccess;
      try {
        await window.electron.app.saveSettings({
          id: 'themeConfig',
          value: request.config,
          themeBackgroundSourcePaths: request.sourcePaths,
        });
      } catch {
        allSucceeded = false;
        if (!failureReported) {
          failureReported = true;
          toast.error(
            request.failureMessage ?? t('settings.appearance_save_failed'),
          );
        }
      }
      await flushPendingSaves();
    }

    async function refreshUntilStable(): Promise<void> {
      await flushPendingSaves();
      try {
        latestAppInfo = await getAppInfo();
      } catch {
        allSucceeded = false;
        if (!failureReported) {
          failureReported = true;
          toast.error(t('settings.appearance_save_failed'));
        }
      }
      if (pendingConfigSaveRef.current) {
        await refreshUntilStable();
      }
    }

    await refreshUntilStable();

    if (latestAppInfo?.themeConfig) {
      updateLocalConfig(createThemeConfig(latestAppInfo.themeConfig));
    }
    if (allSucceeded && shouldShowSuccess) {
      toast.success(t('settings.appearance_saved'));
    }
    return allSucceeded;
  }, [appInfo, getAppInfo, t, updateLocalConfig]);

  const persistConfig = useCallback(
    (
      nextConfig: ThemeConfig,
      options: {
        showSuccess?: boolean;
        sourcePaths?: ThemeBackgroundSourcePaths;
        failureMessage?: string;
      } = {},
    ) => {
      const { showSuccess = false, sourcePaths, failureMessage } = options;
      updateLocalConfig(nextConfig);
      pendingConfigSaveRef.current = {
        config: nextConfig,
        showSuccess:
          showSuccess || pendingConfigSaveRef.current?.showSuccess === true,
        sourcePaths: {
          ...pendingConfigSaveRef.current?.sourcePaths,
          ...sourcePaths,
        },
        failureMessage:
          failureMessage ?? pendingConfigSaveRef.current?.failureMessage,
      };
      if (!saveLoopRef.current) {
        const saveLoop = drainConfigSaves().finally(() => {
          if (saveLoopRef.current === saveLoop) {
            saveLoopRef.current = null;
          }
        });
        saveLoopRef.current = saveLoop;
      }
      return saveLoopRef.current!;
    },
    [drainConfigSaves, updateLocalConfig],
  );

  const changeThemeMode = async (value: string) => {
    const previousTheme = appInfo?.theme ?? 'system';
    setTheme(value);
    try {
      await window.electron.app.setTheme(value);
      await getAppInfo();
    } catch {
      setTheme(previousTheme);
      toast.error(t('settings.appearance_save_failed'));
      await getAppInfo();
    }
  };

  const setAccentColor = (primaryColor?: string) => {
    const nextConfig = {
      ...configRef.current,
      ...(primaryColor ? { primaryColor } : {}),
    };
    if (!primaryColor) {
      delete nextConfig.primaryColor;
    }
    persistConfig(nextConfig).catch(() => undefined);
  };

  const updateBackground = (
    target: ThemeBackgroundTarget,
    background: ThemeBackgroundConfig,
    persist: boolean,
  ) => {
    const key = target === 'sidebar' ? 'sidebarBackground' : 'chatBackground';
    const nextConfig = { ...configRef.current, [key]: background };
    updateLocalConfig(nextConfig);
    if (persist) {
      persistConfig(nextConfig).catch(() => undefined);
    }
  };

  const chooseBackground = async (target: ThemeBackgroundTarget) => {
    setImporting(target);
    try {
      if (saveLoopRef.current) {
        await saveLoopRef.current;
      }
      const result = await window.electron.app.showOpenDialog({
        title: t('settings.background_choose_image'),
        properties: ['openFile'],
        filters: [
          {
            name: 'Images',
            extensions: ['png', 'jpg', 'jpeg', 'webp'],
          },
        ],
      });
      const sourcePath = result.filePaths[0];
      if (result.canceled || !sourcePath) {
        return;
      }
      await persistConfig(configRef.current, {
        showSuccess: true,
        sourcePaths: { [target]: sourcePath },
        failureMessage: t('settings.background_import_failed'),
      });
    } catch {
      toast.error(t('settings.background_import_failed'));
    } finally {
      setImporting(undefined);
    }
  };

  const removeBackground = (target: ThemeBackgroundTarget) => {
    const key = target === 'sidebar' ? 'sidebarBackground' : 'chatBackground';
    const background = { ...configRef.current[key] };
    delete background.url;
    persistConfig(
      { ...configRef.current, [key]: background },
      { showSuccess: true },
    ).catch(() => undefined);
  };

  const resetAppearance = () => {
    persistConfig(createThemeConfig(), { showSuccess: true }).catch(
      () => undefined,
    );
  };

  const customColorValue = useMemo(
    () => config.primaryColor ?? '#0F766E',
    [config.primaryColor],
  );

  const backgroundLocks = appInfo?.themeBackgroundLocks ?? {
    sidebar: false,
    chat: false,
  };

  return (
    <div className="h-full overflow-y-auto">
      <FieldGroup className="mx-auto max-w-4xl p-4 pb-10 sm:p-6">
        <FieldDescription className="max-w-[65ch]">
          {t('settings.appearance_description')}
        </FieldDescription>

        <FieldSet disabled={Boolean(importing)}>
          <FieldLegend>{t('settings.theme_mode')}</FieldLegend>
          <Field className="max-w-sm">
            <Select
              value={appInfo?.theme ?? 'system'}
              onValueChange={changeThemeMode}
            >
              <SelectTrigger aria-label={t('settings.theme_mode')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="system">
                    {t('settings.theme_system')}
                  </SelectItem>
                  <SelectItem value="light">
                    {t('settings.theme_light')}
                  </SelectItem>
                  <SelectItem value="dark">
                    {t('settings.theme_dark')}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              {t('settings.theme_mode_description')}
            </FieldDescription>
          </Field>
        </FieldSet>

        <FieldSet disabled={Boolean(importing)}>
          <FieldLegend>{t('settings.accent_color')}</FieldLegend>
          <FieldDescription className="max-w-[65ch]">
            {t('settings.accent_color_description')}
          </FieldDescription>
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label={t('settings.accent_color')}
          >
            <Button
              type="button"
              variant={config.primaryColor ? 'outline' : 'secondary'}
              size="sm"
              aria-pressed={!config.primaryColor}
              onClick={() => setAccentColor(undefined)}
            >
              {!config.primaryColor ? <IconCheck /> : <IconRefresh />}
              {t('settings.accent_color_default')}
            </Button>
            {ACCENT_PRESETS.map((preset) => {
              const selected = config.primaryColor === preset.color;
              return (
                <button
                  key={preset.color}
                  type="button"
                  aria-label={t(preset.labelKey)}
                  aria-pressed={selected}
                  title={t(preset.labelKey)}
                  className={cn(
                    'relative size-9 rounded-full border-2 border-background shadow-sm outline-none ring-offset-2 ring-offset-background transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                    selected && 'ring-2 ring-ring',
                  )}
                  style={{ backgroundColor: preset.color }}
                  onClick={() => setAccentColor(preset.color)}
                >
                  {selected ? (
                    <IconCheck className="absolute inset-0 m-auto size-4 text-white drop-shadow-sm" />
                  ) : null}
                </button>
              );
            })}
            <label
              htmlFor="appearance-custom-color"
              className="flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium shadow-xs hover:bg-accent focus-within:ring-2 focus-within:ring-ring"
            >
              <input
                id="appearance-custom-color"
                type="color"
                className="size-5 cursor-pointer border-0 bg-transparent p-0"
                aria-label={t('settings.accent_color_custom')}
                value={customColorValue}
                onChange={(event) => setAccentColor(event.target.value)}
              />
              {t('settings.accent_color_custom')}
            </label>
          </div>
        </FieldSet>

        <div className="grid gap-4 xl:grid-cols-2">
          <BackgroundSetting
            title={t('settings.sidebar_background')}
            description={t('settings.sidebar_background_description')}
            background={config.sidebarBackground}
            importing={importing === 'sidebar'}
            disabled={Boolean(importing)}
            locked={backgroundLocks.sidebar}
            onChoose={() => chooseBackground('sidebar')}
            onRemove={() => removeBackground('sidebar')}
            onChange={(value, persist) =>
              updateBackground('sidebar', value, persist)
            }
          />
          <BackgroundSetting
            title={t('settings.chat_background')}
            description={t('settings.chat_background_description')}
            background={config.chatBackground}
            importing={importing === 'chat'}
            disabled={Boolean(importing)}
            locked={backgroundLocks.chat}
            onChoose={() => chooseBackground('chat')}
            onRemove={() => removeBackground('chat')}
            onChange={(value, persist) =>
              updateBackground('chat', value, persist)
            }
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          <FieldDescription className="max-w-[55ch]">
            {t('settings.appearance_reset_description')}
          </FieldDescription>
          <Button
            type="button"
            variant="outline"
            disabled={Boolean(importing)}
            onClick={resetAppearance}
          >
            <IconRefresh />
            {t('settings.appearance_reset')}
          </Button>
        </div>
      </FieldGroup>
    </div>
  );
}
