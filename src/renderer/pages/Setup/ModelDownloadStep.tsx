import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/renderer/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/renderer/components/ui/card';
import { Checkbox } from '@/renderer/components/ui/checkbox';
import { Badge } from '@/renderer/components/ui/badge';
import { useLocalModelStore } from '@/renderer/store/use-local-model-store';
import type { SetupStepProps } from './index';
import { useGlobal } from '@/renderer/hooks/use-global';
import { LOCAL_MODEL_DEFAULT_FIELDS } from '@/types/local-model';
import {
  SETUP_MODELS,
  resolveSetupModels,
  startSetupDownloads,
  type SetupModelCatalog,
  type SetupModelKey,
  type SetupDownload,
} from './model-download';

export default function ModelDownloadStep({
  onNext,
  onBack,
  onSkip,
}: SetupStepProps) {
  const { t } = useTranslation();
  const { getAppInfo } = useGlobal();
  const [defaultKeys, setDefaultKeys] = useState(
    () => new Set<SetupModelKey>(['embedding', 'reranker']),
  );
  const [catalog, setCatalog] = useState<SetupModelCatalog>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState(
    () =>
      new Set<SetupModelKey>(
        SETUP_MODELS.filter((item) => item.selected).map((item) => item.key),
      ),
  );
  const downloadingIds = useLocalModelStore((state) => state.downloadingIds);
  const models = resolveSetupModels(catalog);
  const isBusy =
    downloadingIds.size > 0 ||
    models.some(
      ({ model }) =>
        model?.status === 'downloading' || model?.status === 'deleting',
    );

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const data = await window.electron.localModel.getList();
        if (active) {
          setCatalog(data);
          setLoadError(false);
        }
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    refresh().catch(() => undefined);
    const timer = isBusy
      ? setInterval(() => {
          refresh().catch(() => undefined);
        }, 1500)
      : undefined;
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [reload, isBusy]);

  const isSelectable = (model: (typeof models)[number]['model']) =>
    Boolean(
      model &&
      !model.isDownloaded &&
      model.status !== 'downloaded' &&
      model.status !== 'downloading' &&
      model.status !== 'deleting' &&
      !downloadingIds.has(model.id) &&
      model.download?.length,
    );
  const downloads = models
    .filter(({ key, model }) => selected.has(key) && isSelectable(model))
    .map(({ key, model }) => ({
      key,
      model,
      setAsDefault: defaultKeys.has(key),
    })) as SetupDownload[];
  const toggleDefault = (key: SetupModelKey, checked: boolean) => {
    setDefaultKeys((previous) => {
      const next = new Set(previous);
      if (checked) {
        for (const candidate of next) {
          if (
            LOCAL_MODEL_DEFAULT_FIELDS[candidate] ===
            LOCAL_MODEL_DEFAULT_FIELDS[key]
          )
            next.delete(candidate);
        }
        next.add(key);
      } else next.delete(key);
      return next;
    });
  };
  const toggle = useCallback((key: SetupModelKey, checked: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  return (
    <Card className="border-0 shadow-2xl bg-card">
      <CardHeader className="text-center pb-4">
        <CardTitle className="text-2xl font-bold">
          {t('setup.download_models.title')}
        </CardTitle>
        <CardDescription className="text-base">
          {t('setup.download_models.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loadError && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 text-sm text-destructive"
          >
            <span>{t('setup.download_models.load_error')}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLoading(true);
                setReload((value) => value + 1);
              }}
            >
              {t('setup.download_models.retry')}
            </Button>
          </div>
        )}
        {(['knowledge', 'audio'] as const).map((group) => (
          <fieldset
            key={group}
            className="min-w-0"
            disabled={loading || loadError}
          >
            <legend className="mb-1 text-base font-semibold">
              {t(`setup.download_models.${group}_title`)}
            </legend>
            <p className="mb-2 text-sm text-muted-foreground">
              {t(`setup.download_models.${group}_description`)}
            </p>
            <div className="divide-y divide-border">
              {models
                .filter(({ key }) =>
                  group === 'audio'
                    ? key === 'tts' || key === 'stt'
                    : key !== 'tts' && key !== 'stt',
                )
                .map(({ key, label, model }) => {
                  const available = isSelectable(model);
                  const busy =
                    model &&
                    (downloadingIds.has(model.id) ||
                      model.status === 'downloading');
                  const downloaded =
                    model?.isDownloaded || model?.status === 'downloaded';
                  const name =
                    key === 'tts'
                      ? model?.name || model?.id.split('/').pop() || label
                      : label;
                  let statusText: string | undefined;
                  if (busy) statusText = t('common.downloading');
                  else if (model?.status === 'deleting')
                    statusText = t('setup.download_models.deleting');
                  else if (downloaded)
                    statusText = t('setup.download_models.downloaded');
                  else if (!model && !loading)
                    statusText = t('setup.download_models.unavailable');
                  return (
                    <div key={key} className="py-3">
                      <label
                        htmlFor={`setup-model-${key}`}
                        className={`flex items-start gap-3 rounded-md ${available ? 'cursor-pointer hover:bg-muted/50' : ''}`}
                      >
                        <Checkbox
                          id={`setup-model-${key}`}
                          className="mt-0.5 shrink-0"
                          checked={selected.has(key)}
                          disabled={!available || loading || loadError}
                          onCheckedChange={(checked) =>
                            toggle(key, checked === true)
                          }
                          aria-label={t('setup.download_models.select_model', {
                            name,
                          })}
                          aria-describedby={`setup-model-${key}-description`}
                        />
                        <span className="min-w-0 flex-1 space-y-1">
                          <span className="flex flex-wrap items-center gap-2 text-sm font-medium break-all">
                            {name}
                            {statusText && (
                              <Badge variant={model ? 'secondary' : 'outline'}>
                                {statusText}
                              </Badge>
                            )}
                          </span>
                          <span
                            id={`setup-model-${key}-description`}
                            className="block text-sm text-muted-foreground"
                          >
                            {t(`setup.download_models.${key}_description`)}
                          </span>
                          {group === 'audio' && model && (
                            <span className="block break-all text-xs text-muted-foreground">
                              {model.id}
                            </span>
                          )}
                        </span>
                      </label>
                      <label
                        htmlFor={`setup-default-${key}`}
                        className="mt-2 ml-7 flex items-center gap-2 text-sm text-muted-foreground"
                      >
                        <Checkbox
                          id={`setup-default-${key}`}
                          checked={defaultKeys.has(key)}
                          disabled={
                            !available ||
                            !selected.has(key) ||
                            loading ||
                            loadError
                          }
                          onCheckedChange={(checked) =>
                            toggleDefault(key, checked === true)
                          }
                          aria-label={t(
                            'setup.download_models.set_default_label',
                            { name },
                          )}
                        />
                        {t('setup.download_models.set_default')}
                      </label>
                    </div>
                  );
                })}
            </div>
          </fieldset>
        ))}
        <div
          className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground"
          aria-live="polite"
        >
          {loading
            ? t('setup.download_models.loading')
            : t('setup.download_models.selection_tip', {
                count: downloads.length,
              })}
          <p className="mt-1">{t('setup.download_models.runtime_tip')}</p>
          <p className="mt-1">{t('setup.download_models.default_tip')}</p>
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap justify-between gap-2 border-t pt-4">
        <Button variant="ghost" onClick={onBack} disabled={!onBack}>
          <ArrowLeft className="size-4" />
          {t('common.back')}
        </Button>
        <div className="flex flex-wrap gap-2">
          {onSkip && (
            <Button variant="ghost" onClick={onSkip}>
              {t('common.skip')}
            </Button>
          )}
          <Button
            disabled={loading || loadError}
            onClick={() => {
              startSetupDownloads(downloads, t, getAppInfo).catch(
                () => undefined,
              );
              onNext();
            }}
          >
            {downloads.length
              ? t('setup.download_models.download_and_continue', {
                  count: downloads.length,
                })
              : t('common.next')}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
