import React, { useState, useEffect } from 'react';
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
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  SkipForward,
  Check,
  Download,
  Terminal,
  Package,
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

interface SetupStepProps {
  onNext: () => void;
  onBack?: () => void;
  onSkip?: () => void;
}

type RuntimeKey = 'uv' | 'bun' | 'node';

function RuntimeStep({ onNext, onBack, onSkip }: SetupStepProps) {
  const { t } = useTranslation();
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [installingMap, setInstallingMap] = useState<
    Record<RuntimeKey, boolean>
  >({
    uv: false,
    bun: false,
    node: false,
  });

  const getRuntimeInfo = async (useLoading = true) => {
    if (useLoading) {
      setLoading(true);
    }
    try {
      const data = await window.electron.app.getRuntimeInfo();
      setRuntimeInfo(data);
    } finally {
      if (useLoading) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    getRuntimeInfo();
  }, []);

  // const handleInstallUV = async () => {
  //   setInstalling(true);
  //   setRuntimeInfo((prev) => {
  //     if (!prev) return null;
  //     return { ...prev, uv: { ...prev.uv, status: 'installing' } as any };
  //   });
  //   try {
  //     await window.electron.app.installRuntime('uv');
  //     await getRuntimeInfo();
  //   } finally {
  //     setInstalling(false);
  //   }
  // };

  // const handleInstallBun = async () => {
  //   setInstalling(true);
  //   setRuntimeInfo((prev) => {
  //     if (!prev) return null;
  //     return { ...prev, bun: { ...prev.bun, status: 'installing' } as any };
  //   });
  //   try {
  //     await window.electron.app.installRuntime('bun');
  //     await getRuntimeInfo();
  //   } finally {
  //     setInstalling(false);
  //   }
  // };

  const handleInstallRuntime = async (pkg: RuntimeKey) => {
    setInstallingMap((prev) => ({ ...prev, [pkg]: true }));
    try {
      await window.electron.app.installRuntime(pkg);
      await getRuntimeInfo(false);
    } finally {
      setInstallingMap((prev) => ({ ...prev, [pkg]: false }));
    }
  };

  const isUVInstalled = runtimeInfo?.uv?.status === 'installed';
  const isBunInstalled = runtimeInfo?.bun?.status === 'installed';

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
            {/* UV Runtime */}
            <Item variant="outline" className="rounded-lg">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-purple-500/10 text-purple-500 shrink-0">
                <Package className="w-5 h-5" />
              </div>
              <ItemContent>
                <ItemTitle className="flex items-center gap-2">
                  UV
                  {isUVInstalled && runtimeInfo?.uv?.version && (
                    <Badge variant="secondary">{runtimeInfo.uv.version}</Badge>
                  )}
                  {isUVInstalled &&
                    runtimeInfo?.uv?.pythonRuntime?.pythonVersion && (
                      <Badge variant="secondary">
                        Python {runtimeInfo.uv.pythonRuntime.pythonVersion}
                      </Badge>
                    )}
                </ItemTitle>
                <ItemDescription>{t('setup.runtime.uv_desc')}</ItemDescription>
              </ItemContent>
              <ItemActions>
                {isUVInstalled && (
                  <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20">
                    <Check className="w-3 h-3 mr-1" />
                    {t('setup.runtime.installed')}
                  </Badge>
                )}
                {!isUVInstalled && installingMap['uv'] && (
                  <Button disabled size="sm">
                    <Spinner className="w-4 h-4 mr-2" />
                    {t('setup.runtime.installing')}
                  </Button>
                )}
                {!isUVInstalled && !installingMap['uv'] && (
                  <Button size="sm" onClick={() => handleInstallRuntime('uv')}>
                    <Download className="w-4 h-4 mr-2" />
                    {t('setup.runtime.install')}
                  </Button>
                )}
              </ItemActions>
            </Item>

            {/* Bun Runtime */}
            {/* <Item variant="outline" className="rounded-lg">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-green-500/10 text-green-500 shrink-0">
                <Terminal className="w-5 h-5" />
              </div>
              <ItemContent>
                <ItemTitle className="flex items-center gap-2">
                  Bun
                  {isBunInstalled && runtimeInfo?.bun?.version && (
                    <Badge variant="secondary">{runtimeInfo.bun.version}</Badge>
                  )}
                </ItemTitle>
                <ItemDescription>
                  {t('setup.runtime.node_desc')}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                {isBunInstalled && (
                  <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20">
                    <Check className="w-3 h-3 mr-1" />
                    {t('setup.runtime.installed')}
                  </Badge>
                )}
                {!isBunInstalled && installingMap['bun'] && (
                  <Button disabled size="sm">
                    <Spinner className="w-4 h-4 mr-2" />
                    {t('setup.runtime.installing')}
                  </Button>
                )}
                {!isBunInstalled && !installingMap['bun'] && (
                  <Button size="sm" onClick={() => handleInstallRuntime('bun')}>
                    <Download className="w-4 h-4 mr-2" />
                    {t('setup.runtime.install')}
                  </Button>
                )}
              </ItemActions>
            </Item> */}

            {/* Info Box */}
            <div className="p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground">
              <p>{t('setup.runtime.tip')}</p>
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
          <Button onClick={onNext} disabled={installingMap['uv']}>
            {t('common.next')}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

export default RuntimeStep;
