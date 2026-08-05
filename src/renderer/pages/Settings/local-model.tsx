import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from '@/renderer/components/ui/field';
import { useGlobal } from '@/renderer/hooks/use-global';
import { useHeader } from '@/renderer/hooks/use-title';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
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

  const getData = async () => {
    const res = await window.electron.localModel.getList();
    setLocalModelList(res);
  };

  useEffect(() => {
    getData();
  }, []);

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
        .then(() => {
          return getData();
        })
        .finally(() => {
          finishDownload(model.id);
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
            <Button onClick={onSelectPath}>更改目录</Button>
          </FieldContent>
        </Field>
      </FieldGroup>
      {LocalModelTypes.map((type) => (
        <FieldGroup className="p-4" key={type}>
          <Field>
            <FieldLabel className="uppercase">
              {t(`local-model.${type}`)}
            </FieldLabel>
            <FieldContent className="flex flex-col gap-2">
              {localModelList[type]?.map((model) => {
                const isDownloading = downloadingIds.has(model.id);
                return (
                  <Item key={model.id} variant="outline">
                    <ItemContent>
                      <ItemTitle className="flex-col items-start gap-0.5">
                        {model.id}{' '}
                        <small className="text-muted-foreground text-xs">
                          {model.repo}
                        </small>
                      </ItemTitle>
                      <ItemDescription>
                        {model.library && (
                          <Badge variant="outline">{model.library}</Badge>
                        )}

                        {model.description}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      {model.isDownloaded && !isDownloading && (
                        <Button
                          variant="destructive"
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
                            <Button variant="outline">
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
