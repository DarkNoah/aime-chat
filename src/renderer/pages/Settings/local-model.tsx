import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from '@/renderer/components/ui/field';
import { useGlobal } from '@/renderer/hooks/use-global';
import { useHeader } from '@/renderer/hooks/use-title';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/renderer/components/ui/button';
import { IconLoader2 } from '@tabler/icons-react';
import {
  LocalModelItem,
  LocalModelType,
  LocalModelTypes,
} from '@/types/local-model';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/renderer/components/ui/item';
import { Badge } from '@/renderer/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/renderer/components/ui/dropdown-menu';
import { isArray } from '@/utils/is';
import toast from 'react-hot-toast';
import { useLocalModelStore } from '@/renderer/store/use-local-model-store';

export default function LocalModel() {
  const { t } = useTranslation();
  const { appInfo, getAppInfo } = useGlobal();
  const { setTitle } = useHeader();
  useEffect(() => {
    setTitle(t('settings.local_model'));
  }, [setTitle, t]);
  const [localModelList, setLocalModelList] = useState<
    Record<LocalModelType, LocalModelItem[]>
  >({} as Record<LocalModelType, LocalModelItem[]>);
  const downloadingIds = useLocalModelStore((state) => state.downloadingIds);
  const startDownload = useLocalModelStore((state) => state.startDownload);
  const finishDownload = useLocalModelStore((state) => state.finishDownload);
  const isBusy =
    downloadingIds.size > 0 ||
    Object.values(localModelList).some((items) =>
      items.some(
        (item) => item.status === 'downloading' || item.status === 'deleting',
      ),
    );

  const onSelectPath = async () => {
    const res = await window.electron.app.showOpenDialog({
      properties: ['openDirectory'],
    });
    if (res.canceled) return;
    const { filePaths } = res;
    if (filePaths.length !== 1) return;
    const path = filePaths[0];
    await window.electron.app.saveSettings({
      id: 'modelPath',
      value: path,
    });
    await getAppInfo();
  };

  const getData = useCallback(async () => {
    const res = await window.electron.localModel.getList();
    setLocalModelList(res);
  }, []);

  useEffect(() => {
    const refresh = () => {
      getData().catch((err) => toast.error(err.message));
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [getData, appInfo?.modelPath]);

  useEffect(() => {
    if (!isBusy) return undefined;
    const timer = setInterval(() => {
      getData().catch(() => {});
    }, 1500);
    return () => clearInterval(timer);
  }, [getData, isBusy]);

  const handleDownload = async (
    model: LocalModelItem,
    type: LocalModelType,
    source: string,
  ) => {
    if (!startDownload(model.id)) return;

    toast.promise(
      window.electron.localModel
        .downloadModel({
          modelId: model.id,
          type,
          source,
        })
        .finally(async () => {
          finishDownload(model.id);
          await getData();
        }),
      {
        loading: t('common.downloading_model', { id: model.id }),
        success: <b>{t('common.download_success')}</b>,
        error: <b>{t('common.download_failed')}</b>,
      },
    );
  };
  const handleDelete = async (model: LocalModelItem, type: LocalModelType) => {
    try {
      await window.electron.localModel.deleteModel(model.id, type);
      await getData();
      toast.success(t('common.delete_success'));
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <FieldGroup className="p-4">
        <Field>
          <FieldLabel>{t('settings.model_location')}</FieldLabel>
          <FieldContent className="flex flex-row items-center gap-2">
            <Button
              variant="link"
              className="flex-1 truncate justify-start bg-secondary"
              onClick={() => {
                window.electron.app.openPath(appInfo?.modelPath);
              }}
            >
              <span className="truncate">{appInfo?.modelPath}</span>
            </Button>
            <Button onClick={onSelectPath} disabled={isBusy}>
              {t('local-model.change_directory')}
            </Button>
          </FieldContent>
        </Field>
        <p className="text-sm text-muted-foreground">
          {t('local-model.audio_hint')}
        </p>
      </FieldGroup>
      {LocalModelTypes.map((type) => (
        <FieldGroup className="p-4" key={type}>
          <Field>
            <FieldLabel className="uppercase">
              {t(`local-model.${type}`)}
            </FieldLabel>
            <FieldContent className="flex flex-col gap-2">
              {localModelList[type]?.map((model) => {
                const isDownloading =
                  downloadingIds.has(model.id) ||
                  model.status === 'downloading';
                const isDeleting = model.status === 'deleting';
                return (
                  <Item key={model.id} variant="outline">
                    <ItemContent>
                      <ItemTitle className="flex-col items-start gap-0.5">
                        {model.name || model.id}{' '}
                        <small className="text-muted-foreground text-xs">
                          {model.repo}
                        </small>
                      </ItemTitle>
                      <ItemDescription>
                        {model.library && (
                          <Badge variant="outline">{model.library}</Badge>
                        )}

                        {model.description}
                        {model.status === 'incomplete' && (
                          <span className="ml-2">
                            {t('local-model.incomplete')}
                          </span>
                        )}
                        {model.dependencies?.length ? (
                          <span className="block mt-1">
                            {t('local-model.dependencies', {
                              models: model.dependencies.join(', '),
                            })}
                          </span>
                        ) : null}
                        {model.selectable === false && (
                          <span className="ml-2">
                            {t('local-model.dependency_model')}
                          </span>
                        )}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      {(model.isDownloaded || model.status === 'incomplete') &&
                        !isDownloading && (
                          <Button
                            variant="destructive"
                            disabled={isDeleting}
                            onClick={() => handleDelete(model, type)}
                          >
                            {t('common.delete')}
                          </Button>
                        )}
                      {isDownloading && (
                        <Button variant="outline" disabled>
                          <IconLoader2 className="animate-spin" />
                          {t('common.downloading')}
                        </Button>
                      )}
                      {!model.isDownloaded && !isDownloading && (
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" disabled={isDeleting}>
                              {t('common.download')}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              {isArray(model?.download) &&
                                model?.download?.map((d) => {
                                  return (
                                    <DropdownMenuItem
                                      key={d.url}
                                      onClick={() =>
                                        handleDownload(model, type, d.source)
                                      }
                                    >
                                      {d.source}
                                    </DropdownMenuItem>
                                  );
                                })}
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </ItemActions>
                  </Item>
                );
              })}
            </FieldContent>
          </Field>
        </FieldGroup>
      ))}
    </div>
  );
}
