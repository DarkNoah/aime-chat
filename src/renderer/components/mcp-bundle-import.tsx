import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  IconAlertTriangle,
  IconFileZip,
  IconFolderOpen,
  IconLoader2,
  IconPackageImport,
  IconReplace,
} from '@tabler/icons-react';
import {
  McpBundlePreview,
  McpBundleUserConfigOption,
  McpBundleUserConfigValue,
} from '@/types/mcp';
import { Button } from '@/renderer/components/ui/button';
import { Input } from '@/renderer/components/ui/input';
import { Label } from '@/renderer/components/ui/label';
import { Switch } from '@/renderer/components/ui/switch';
import { Badge } from '@/renderer/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/renderer/components/ui/dialog';

type McpBundleImportPanelProps = {
  sourcePath?: string;
  onSourcePathChange?: (filePath: string) => void;
  onInstalled?: () => void;
};

const getFileName = (filePath: string) =>
  filePath.split(/[\\/]/).filter(Boolean).pop() || filePath;

const hasConfigValue = (value: McpBundleUserConfigValue | undefined) => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

const getMcpBundleFile = (dataTransfer: DataTransfer | null) => {
  if (!dataTransfer) return undefined;
  return Array.from(dataTransfer.files).find((file) =>
    file.name.toLowerCase().endsWith('.mcpb'),
  );
};

function BundleConfigField({
  configKey,
  option,
  value,
  onChange,
}: {
  configKey: string;
  option: McpBundleUserConfigOption;
  value?: McpBundleUserConfigValue;
  onChange: (value: McpBundleUserConfigValue) => void;
}) {
  const { t } = useTranslation();

  const choosePath = async () => {
    const result = await window.electron.app.showOpenDialog({
      title: option.title,
      properties: [
        option.type === 'directory' ? 'openDirectory' : 'openFile',
        ...(option.multiple ? (['multiSelections'] as const) : []),
      ],
    });
    if (!result.canceled && result.filePaths.length > 0) {
      onChange(option.multiple ? result.filePaths : result.filePaths[0]);
    }
  };

  if (option.type === 'boolean') {
    return (
      <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
        <div className="space-y-1">
          <Label htmlFor={`mcpb-${configKey}`}>
            {option.title}
            {option.required ? ' *' : ''}
          </Label>
          <p className="text-xs text-muted-foreground">{option.description}</p>
        </div>
        <Switch
          id={`mcpb-${configKey}`}
          checked={Boolean(value)}
          onCheckedChange={onChange}
        />
      </div>
    );
  }

  if (option.type === 'file' || option.type === 'directory') {
    const paths = Array.isArray(value) ? value : value ? [String(value)] : [];
    return (
      <div className="space-y-2">
        <Label>
          {option.title}
          {option.required ? ' *' : ''}
        </Label>
        <p className="text-xs text-muted-foreground">{option.description}</p>
        <Button type="button" variant="outline" className="w-full justify-start" onClick={choosePath}>
          <IconFolderOpen className="size-4" />
          {paths.length > 0
            ? paths.map(getFileName).join(', ')
            : t('tools.mcp_bundle_choose_path')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={`mcpb-${configKey}`}>
        {option.title}
        {option.required ? ' *' : ''}
      </Label>
      <p className="text-xs text-muted-foreground">{option.description}</p>
      <Input
        id={`mcpb-${configKey}`}
        type={
          option.type === 'number'
            ? 'number'
            : option.sensitive
              ? 'password'
              : 'text'
        }
        min={option.min}
        max={option.max}
        value={value === undefined ? '' : String(value)}
        onChange={(event) =>
          onChange(
            option.type === 'number'
              ? Number(event.target.value)
              : event.target.value,
          )
        }
      />
    </div>
  );
}

export function McpBundleImportPanel({
  sourcePath,
  onSourcePathChange,
  onInstalled,
}: McpBundleImportPanelProps) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<McpBundlePreview>();
  const [config, setConfig] = useState<
    Record<string, McpBundleUserConfigValue>
  >({});
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState('');

  const loadPreview = useCallback(async (filePath: string) => {
    setLoading(true);
    setError('');
    setPreview(undefined);
    try {
      const nextPreview = await window.electron.tools.previewMCPBundle(filePath);
      setPreview(nextPreview);
      setConfig(nextPreview.defaultUserConfig);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sourcePath) {
      void loadPreview(sourcePath);
    } else {
      setPreview(undefined);
      setConfig({});
      setError('');
    }
  }, [loadPreview, sourcePath]);

  const chooseBundle = async () => {
    const result = await window.electron.app.showOpenDialog({
      title: t('tools.mcp_bundle_select_title'),
      filters: [{ name: 'MCP Bundle', extensions: ['mcpb'] }],
      properties: ['openFile'],
    });
    if (!result.canceled && result.filePaths[0]) {
      onSourcePathChange?.(result.filePaths[0]);
      if (!onSourcePathChange) {
        await loadPreview(result.filePaths[0]);
      }
    }
  };

  const requiredConfigReady = useMemo(
    () =>
      !preview ||
      Object.entries(preview.userConfig).every(
        ([key, option]) => !option.required || hasConfigValue(config[key]),
      ),
    [config, preview],
  );

  const install = async () => {
    if (!preview) return;
    setInstalling(true);
    try {
      const result = await window.electron.tools.installMCPBundle({
        filePath: preview.filePath,
        userConfig: config,
        replaceToolId: preview.installed?.toolId,
      });
      toast.success(
        t('tools.mcp_bundle_installed', { name: result.name }),
      );
      onInstalled?.();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setInstalling(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    const file = getMcpBundleFile(event.dataTransfer);
    if (!file) return;
    event.preventDefault();
    event.stopPropagation();
    const filePath = window.electron.app.getPathForFile(file);
    onSourcePathChange?.(filePath);
    if (!onSourcePathChange) {
      void loadPreview(filePath);
    }
  };

  if (!sourcePath && !preview && !loading) {
    return (
      <div
        data-mcpb-drop-zone="true"
        className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/30 p-8 text-center"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="rounded-full bg-primary/10 p-3 text-primary">
          <IconPackageImport className="size-7" />
        </div>
        <div>
          <p className="font-medium">{t('tools.mcp_bundle_drop_title')}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('tools.mcp_bundle_drop_description')}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={chooseBundle}>
          <IconFileZip className="size-4" />
          {t('tools.mcp_bundle_select')}
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-muted-foreground">
        <IconLoader2 className="size-5 animate-spin" />
        {t('tools.mcp_bundle_reading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm text-destructive">{error}</p>
        <Button type="button" variant="outline" onClick={chooseBundle}>
          <IconReplace className="size-4" />
          {t('tools.mcp_bundle_select_another')}
        </Button>
      </div>
    );
  }

  if (!preview) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{preview.displayName}</h3>
              <Badge variant="secondary">v{preview.version}</Badge>
              <Badge variant="outline">{preview.serverType}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {preview.description}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {t('tools.mcp_bundle_author', { author: preview.author })} · MCPB {preview.manifestVersion}
            </p>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={chooseBundle}>
            <IconReplace className="size-4" />
            {t('tools.mcp_bundle_replace')}
          </Button>
        </div>
        {preview.tools.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {preview.tools.slice(0, 8).map((tool) => (
              <Badge key={tool.name} variant="outline">
                {tool.name}
              </Badge>
            ))}
            {preview.tools.length > 8 ? (
              <Badge variant="outline">+{preview.tools.length - 8}</Badge>
            ) : null}
          </div>
        ) : null}
      </div>

      {!preview.platformSupported ? (
        <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          {t('tools.mcp_bundle_platform_unsupported', {
            platforms: preview.supportedPlatforms?.join(', '),
          })}
        </div>
      ) : null}

      {preview.installed ? (
        <div className="flex gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm">
          <IconReplace className="mt-0.5 size-4 shrink-0 text-blue-600" />
          <div>
            <p className="font-medium">
              {preview.installed.version === preview.version
                ? t('tools.mcp_bundle_same_version_title', {
                    version: preview.version,
                  })
                : t('tools.mcp_bundle_update_title', {
                    current: preview.installed.version || t('common.unknown'),
                    next: preview.version,
                  })}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {preview.installed.isBundle
                ? t('tools.mcp_bundle_replace_description')
                : t('tools.mcp_bundle_replace_manual_description')}
            </p>
          </div>
        </div>
      ) : null}

      {Object.keys(preview.userConfig).length > 0 ? (
        <div className="max-h-72 space-y-4 overflow-y-auto rounded-xl border p-4">
          <div>
            <h4 className="text-sm font-medium">{t('tools.mcp_bundle_configuration')}</h4>
            <p className="text-xs text-muted-foreground">
              {t('tools.mcp_bundle_configuration_description')}
            </p>
          </div>
          {Object.entries(preview.userConfig).map(([key, option]) => (
            <BundleConfigField
              key={key}
              configKey={key}
              option={option}
              value={config[key]}
              onChange={(value) =>
                setConfig((current) => ({ ...current, [key]: value }))
              }
            />
          ))}
        </div>
      ) : null}

      <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
        <IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <p>{t('tools.mcp_bundle_security_warning')}</p>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          disabled={
            installing || !requiredConfigReady || !preview.platformSupported
          }
          onClick={install}
        >
          {installing ? <IconLoader2 className="size-4 animate-spin" /> : <IconPackageImport className="size-4" />}
          {installing
            ? t('tools.mcp_bundle_installing')
            : preview.installed?.version === preview.version
              ? t('tools.mcp_bundle_confirm_reinstall')
              : preview.installed
                ? t('tools.mcp_bundle_confirm_update')
                : t('tools.mcp_bundle_confirm_install')}
        </Button>
      </div>
    </div>
  );
}

export function GlobalMcpBundleImport() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [sourcePath, setSourcePath] = useState<string>();

  const requestImport = useCallback((filePath: string) => {
    setSourcePath(filePath);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onDragOver = (event: DragEvent) => {
      const target = event.target as Element | null;
      if (
        target?.closest('[data-mcpb-drop-exclude="true"]') ||
        target?.closest('[data-mcpb-drop-zone="true"]')
      ) {
        return;
      }
      if (getMcpBundleFile(event.dataTransfer)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onDrop = (event: DragEvent) => {
      const target = event.target as Element | null;
      if (
        target?.closest('[data-mcpb-drop-exclude="true"]') ||
        target?.closest('[data-mcpb-drop-zone="true"]')
      ) {
        return;
      }
      const file = getMcpBundleFile(event.dataTransfer);
      if (!file) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      requestImport(window.electron.app.getPathForFile(file));
    };

    window.addEventListener('dragover', onDragOver, true);
    window.addEventListener('drop', onDrop, true);
    return () => {
      window.removeEventListener('dragover', onDragOver, true);
      window.removeEventListener('drop', onDrop, true);
    };
  }, [requestImport]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('tools.mcp_bundle_install_title')}</DialogTitle>
          <DialogDescription>
            {t('tools.mcp_bundle_install_description')}
          </DialogDescription>
        </DialogHeader>
        <McpBundleImportPanel
          sourcePath={sourcePath}
          onSourcePathChange={requestImport}
          onInstalled={() => {
            setOpen(false);
            setSourcePath(undefined);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
