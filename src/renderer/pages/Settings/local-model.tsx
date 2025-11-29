import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from '@/renderer/components/ui/field';
import { Separator } from '@/renderer/components/ui/separator';
import { useGlobal } from '@/renderer/hooks/use-global';
import { useHeader } from '@/renderer/hooks/use-title';
import { useTranslation } from 'react-i18next';
import logo from '@/../assets/icon.png';
import { useEffect, useState } from 'react';
import { Button } from '@/renderer/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupButton,
} from '@/renderer/components/ui/input-group';
import { ArrowUpIcon } from 'lucide-react';
import { Input } from '@/renderer/components/ui/input';
import { IconFolder } from '@tabler/icons-react';
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
  DropdownMenuLabel,
  DropdownMenuSubContent,
  DropdownMenuTrigger,
} from '@/renderer/components/ui/dropdown-menu';
import { isArray } from '@/utils/is';
import toast from 'react-hot-toast';

export default function LocalModel() {
  const { t } = useTranslation();
  const { appInfo, getAppInfo } = useGlobal();
  const { setTitle } = useHeader();
  useEffect(() => {
    setTitle(t('settings.local_model'));
  }, [setTitle, t]);
  const [localModelList, setLocalModelList] = useState<
    Record<LocalModelType, LocalModelItem[]>
  >([]);

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
    console.log(res);
  };

  useEffect(() => {
    getData();
  }, []);

  const handleDownload = async (
    model: LocalModelItem,
    type: LocalModelType,
    source: string,
  ) => {
    // const toast = getToast();
    toast.promise(
      new Promise((resolve, reject) => {
        window.electron.localModel
          .downloadModel({
            modelId: model.id,
            type,
            source,
          })
          .then(resolve)
          .catch(reject);
      }),
      {
        loading: `Downloading ${model.id}...`,
        success: <b>Download success!</b>,
        error: <b>Download failed.</b>,
      },
    );
  };
  const handleDelete = async (model: LocalModelItem, type: LocalModelType) => {
    try {
      const res = await window.electron.localModel.deleteModel(model.id, type);
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
        <FieldGroup className="p-4">
          <Field>
            <FieldLabel className="uppercase">
              {t(`local-model.${type}`)}
            </FieldLabel>
            <FieldContent className="flex flex-col gap-2">
              {localModelList[type]?.map((model) => (
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
                    {model.isDownloaded && (
                      <Button
                        variant="destructive"
                        onClick={() => handleDelete(model, type)}
                      >
                        {t('common.delete')}
                      </Button>
                    )}
                    {!model.isDownloaded && (
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

                      // <Button
                      //   variant="outline"
                      //   size="sm"
                      //   onClick={() => handleDownload(model)}
                      // >
                      //   {t('common.download')}
                      // </Button>
                    )}
                  </ItemActions>
                </Item>
              ))}
            </FieldContent>
          </Field>
        </FieldGroup>
      ))}
    </div>
  );
}
