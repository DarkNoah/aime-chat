import React, { type ReactNode, useEffect, useState } from 'react';
import { Button } from '@/renderer/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/renderer/components/ui/card';
import { Badge } from '@/renderer/components/ui/badge';
import { Checkbox } from '@/renderer/components/ui/checkbox';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  SkipForward,
  Check,
  Terminal,
  Package,
  ScanText,
} from 'lucide-react';
import { Spinner } from '@/renderer/components/ui/spinner';
import {
  Item,
  ItemContent,
  ItemActions,
  ItemTitle,
  ItemDescription,
} from '@/renderer/components/ui/item';
import { RuntimeInfo } from '@/types/app';
import toast from 'react-hot-toast';
import type { TFunction } from 'i18next';

interface SetupStepProps {
  onNext: () => void;
  onBack?: () => void;
  onSkip?: () => void;
}

type RuntimeKey = 'uv' | 'node' | 'paddleOcr';

interface RuntimeDefinition {
  key: RuntimeKey;
  label: string;
  descriptionKey: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClassName: string;
}

const RUNTIME_DEFINITIONS: RuntimeDefinition[] = [
  {
    key: 'uv',
    label: 'UV',
    descriptionKey: 'setup.runtime.uv_desc',
    icon: Package,
    iconClassName: 'bg-purple-500/10 text-purple-500',
  },
  {
    key: 'node',
    label: 'Node.js',
    descriptionKey: 'setup.runtime.node_desc',
    icon: Terminal,
    iconClassName: 'bg-green-600/10 text-green-600',
  },
  {
    key: 'paddleOcr',
    label: 'PaddleOCR',
    descriptionKey: 'setup.runtime.paddle_ocr_desc',
    icon: ScanText,
    iconClassName: 'bg-blue-500/10 text-blue-500',
  },
];

const INSTALL_ORDER: RuntimeKey[] = ['uv', 'paddleOcr', 'node'];
const INSTALL_TOAST_ID = 'setup-runtime-install';

let activeRuntimeInstall: Promise<void> | null = null;

async function installSelectedRuntimes(
  packages: RuntimeKey[],
  t: TFunction,
): Promise<void> {
  const definitions = new Map(
    RUNTIME_DEFINITIONS.map((definition) => [definition.key, definition]),
  );
  const failures: string[] = [];

  for (const [index, pkg] of packages.entries()) {
    const label = definitions.get(pkg)?.label ?? pkg;
    toast.loading(
      t('setup.runtime.install_progress', {
        name: label,
        current: index + 1,
        total: packages.length,
      }),
      { id: INSTALL_TOAST_ID },
    );

    try {
      // PaddleOCR depends on UV, so this queue must remain sequential.
      // eslint-disable-next-line no-await-in-loop
      const result = (await window.electron.app.installRuntime(
        pkg,
      )) as RuntimeInfo[RuntimeKey];
      if (!result?.installed) {
        failures.push(label);
      }
    } catch {
      failures.push(label);
    }
  }

  if (failures.length > 0) {
    toast.error(
      t('setup.runtime.install_failed', { names: failures.join(', ') }),
      {
        id: INSTALL_TOAST_ID,
        duration: 6000,
      },
    );
    return;
  }

  toast.success(
    t('setup.runtime.install_complete', { count: packages.length }),
    {
      id: INSTALL_TOAST_ID,
    },
  );
}

function startRuntimeInstall(packages: RuntimeKey[], t: TFunction) {
  if (!activeRuntimeInstall) {
    activeRuntimeInstall = installSelectedRuntimes(packages, t).finally(() => {
      activeRuntimeInstall = null;
    });
  }
  return activeRuntimeInstall;
}

function RuntimeStep({ onNext, onBack, onSkip }: SetupStepProps) {
  const { t } = useTranslation();
  const runtimeLoadErrorText = t('setup.runtime.load_error');
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<RuntimeKey, boolean>>({
    uv: false,
    node: false,
    paddleOcr: false,
  });

  useEffect(() => {
    let active = true;

    const getRuntimeInfo = async () => {
      setLoading(true);
      try {
        const data = await window.electron.app.getRuntimeInfo();
        if (!active) return;

        setRuntimeInfo(data);
        setSelected({
          uv:
            data.uv?.status !== 'installed' &&
            data.uv?.status !== 'installing',
          node:
            data.node?.status !== 'installed' &&
            data.node?.status !== 'installing',
          paddleOcr:
            data.paddleOcr?.status !== 'installed' &&
            data.paddleOcr?.status !== 'installing',
        });
      } catch {
        if (active) {
          toast.error(runtimeLoadErrorText);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    getRuntimeInfo().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [runtimeLoadErrorText]);

  const isInstalled = (key: RuntimeKey) =>
    runtimeInfo?.[key]?.status === 'installed';

  const isInstalling = (key: RuntimeKey) =>
    runtimeInfo?.[key]?.status === 'installing';

  const handleSelectionChange = (key: RuntimeKey, checked: boolean) => {
    setSelected((previous) => {
      const next = { ...previous, [key]: checked };

      // PaddleOCR is installed through UV. Keep the dependency selection valid
      // without making users discover the relationship after a failed install.
      if (key === 'paddleOcr' && checked && !isInstalled('uv')) {
        next.uv = true;
      }
      if (key === 'uv' && !checked && !isInstalled('uv')) {
        next.paddleOcr = false;
      }

      return next;
    });
  };

  const selectedPackages = INSTALL_ORDER.filter(
    (key) => selected[key] && !isInstalled(key) && !isInstalling(key),
  );

  const handleNext = () => {
    if (selectedPackages.length > 0) {
      startRuntimeInstall(selectedPackages, t).catch(() => undefined);
    }
    onNext();
  };

  const renderVersionBadges = (key: RuntimeKey): ReactNode => {
    const info = runtimeInfo?.[key];
    if (!info) return null;
    const pythonVersion =
      key === 'uv' ? runtimeInfo?.uv?.pythonRuntime?.pythonVersion : undefined;

    return (
      <>
        {info.version && <Badge variant="secondary">{info.version}</Badge>}
        {pythonVersion && (
          <Badge variant="secondary">Python {pythonVersion}</Badge>
        )}
      </>
    );
  };

  const renderRuntimeAction = (
    key: RuntimeKey,
    label: string,
    installed: boolean,
    installing: boolean,
  ): ReactNode => {
    if (installed) {
      return (
        <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20">
          <Check className="size-3.5" />
          {t('setup.runtime.installed')}
        </Badge>
      );
    }

    if (installing) {
      return (
        <Badge variant="secondary">
          <Spinner className="size-3.5" />
          {t('setup.runtime.installing')}
        </Badge>
      );
    }

    return (
      <Checkbox
        id={`setup-runtime-${key}`}
        checked={selected[key]}
        onCheckedChange={(checked) =>
          handleSelectionChange(key, checked === true)
        }
        aria-label={t('setup.runtime.select_runtime', { name: label })}
      />
    );
  };

  const renderRuntimeItem = (definition: RuntimeDefinition) => {
    const {
      key,
      label,
      descriptionKey,
      icon: Icon,
      iconClassName,
    } = definition;
    const installed = isInstalled(key);
    const installing = isInstalling(key);
    const selectable = !installed && !installing;
    const content = (
      <>
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${iconClassName}`}
        >
          <Icon className="size-5" />
        </div>
        <ItemContent>
          <ItemTitle className="flex flex-wrap items-center gap-2">
            {label}
            {renderVersionBadges(key)}
          </ItemTitle>
          <ItemDescription>{t(descriptionKey)}</ItemDescription>
        </ItemContent>
        <ItemActions>
          {renderRuntimeAction(key, label, installed, installing)}
        </ItemActions>
      </>
    );

    if (selectable) {
      return (
        <Item
          key={key}
          asChild
          variant="outline"
          className="cursor-pointer rounded-lg has-[[data-state=checked]]:border-primary/40 has-[[data-state=checked]]:bg-primary/5"
        >
          <label htmlFor={`setup-runtime-${key}`}>{content}</label>
        </Item>
      );
    }

    return (
      <Item key={key} variant="outline" className="rounded-lg">
        {content}
      </Item>
    );
  };

  return (
    <Card className="border-0 shadow-2xl bg-card/80 backdrop-blur-sm">
      <CardHeader className="text-center pb-4">
        <CardTitle className="text-2xl font-bold">
          {t('setup.runtime.title')}
        </CardTitle>
        <CardDescription className="text-base">
          {t('setup.runtime.description')}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="w-8 h-8" />
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {RUNTIME_DEFINITIONS.map(renderRuntimeItem)}
            </div>

            <div
              className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground"
              aria-live="polite"
            >
              <p>
                {selectedPackages.length > 0
                  ? t('setup.runtime.selection_tip', {
                      count: selectedPackages.length,
                    })
                  : t('setup.runtime.no_selection_tip')}
              </p>
            </div>
          </>
        )}
      </CardContent>

      <CardFooter className="flex justify-between pt-6 border-t">
        <Button variant="ghost" onClick={onBack} disabled={!onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('common.back')}
        </Button>
        <div className="flex gap-2">
          {onSkip && (
            <Button variant="ghost" onClick={onSkip}>
              {t('common.skip')}
              <SkipForward className="w-4 h-4 ml-2" />
            </Button>
          )}
          <Button onClick={handleNext} disabled={loading}>
            {selectedPackages.length > 0
              ? t('setup.runtime.install_and_continue', {
                  count: selectedPackages.length,
                })
              : t('common.next')}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

export default RuntimeStep;
