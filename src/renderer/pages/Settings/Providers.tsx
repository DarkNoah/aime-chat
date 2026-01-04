import { Button } from '@/renderer/components/ui/button';
import { useHeader } from '@/renderer/hooks/use-title';
import { useTranslation } from 'react-i18next';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select';
import { Input } from '@/renderer/components/ui/input';
import { Switch } from '@/renderer/components/ui/switch';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/renderer/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/renderer/components/ui/dialog';
import { Label } from '@/renderer/components/ui/label';
import { Textarea } from '@/renderer/components/ui/textarea';
import {
  Provider,
  ProviderModel,
  CreateProvider,
  ProviderType,
  UpdateProvider,
} from '@/types/provider';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/renderer/components/ui/alert-dialog';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/renderer/components/ui/item';
import { ScrollArea } from '@/renderer/components/ui/scroll-area';
import ProviderIcon from '@/renderer/components/provider-icon';
import {
  AlertCircleIcon,
  Edit,
  Package,
  Plus,
  Search,
  Trash,
} from 'lucide-react';
import { Spinner } from '@/renderer/components/ui/spinner';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/renderer/components/ui/alert';
import {
  Field,
  FieldDescription,
  FieldGroup,
} from '@/renderer/components/ui/field';
import {
  IconBrain,
  IconMicrophone,
  IconPhoto,
  IconSearch,
  IconTool,
  IconTrashX,
  IconVideo,
} from '@tabler/icons-react';
import { Badge } from '@/renderer/components/ui/badge';
import modelsData from '@/../assets/models.json';
import { ModelSelectorLogo } from '@/renderer/components/ai-elements/model-selector';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/renderer/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/renderer/components/ui/input-group';
import toast from 'react-hot-toast';

function Providers() {
  const { setTitle } = useHeader();
  const { t } = useTranslation();
  setTitle(t('providers'));
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingModels, setLoadingModels] = useState<boolean>(false);
  const [getModelsError, setGetModelsError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [modelsOpen, setModelsOpen] = useState<boolean>(false);
  const [editProvider, setEditProvider] = useState<Provider | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const form = useForm<CreateProvider | UpdateProvider>({
    mode: 'onChange',
    shouldUnregister: true,
    defaultValues: {
      name: '',
      type: '',
      isActive: true,
      apiBase: '',
      apiKey: '',
    },
  });
  const selectedType = form.watch('type');

  const [models, setModels] = useState<ProviderModel[]>([]);
  const [deleteOpen, setDeleteOpen] = useState<boolean>(false);
  const [deleteInfo, setDeleteInfo] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // 添加模型弹窗状态
  const [addModelOpen, setAddModelOpen] = useState<boolean>(false);
  const [newModelId, setNewModelId] = useState<string>('');
  const [newModelName, setNewModelName] = useState<string>('');

  async function refreshProviders() {
    setLoading(true);
    try {
      const data = await window.electron.providers.getList();
      setProviders(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshProviders();
  }, []);

  const openCreate = () => {
    setEditProvider(null);
    form.register('type');
    form.reset();
    setEditorOpen(true);
  };

  const openEdit = async (data: Provider) => {
    setEditProvider(data);
    const provider: any = await window.electron.providers.get(data.id);

    form.reset();
    form.setValue('name', provider.name);
    form.setValue('isActive', provider.isActive);
    form.setValue('apiBase', provider.apiBase);
    form.setValue('apiKey', provider.apiKey);
    form.setValue('icon', provider.icon);
    form.unregister('type');
    setEditorOpen(true);
  };

  const saveProvider = async (data: CreateProvider | UpdateProvider) => {
    setSubmitting(true);
    try {
      if (editProvider) {
        await window.electron.providers.update(
          editProvider.id,
          data as UpdateProvider,
        );
      } else {
        await window.electron.providers.create(data as CreateProvider);
      }
    } catch (err) {
      toast.error(err.message);
      return;
    } finally {
      setSubmitting(false);
    }
    form.reset();
    setEditorOpen(false);
    await refreshProviders();
  };

  const askRemoveProvider = (id: string, name: string) => {
    setDeleteInfo({ id, name });
    setDeleteOpen(true);
  };

  const removeProvider = async () => {
    if (!deleteInfo) return;
    await window.electron.providers.delete(deleteInfo.id);
    setDeleteOpen(false);
    setDeleteInfo(null);
    await refreshProviders();
  };

  const toggleActive = async (id: string, next: boolean) => {
    await window.electron.providers.update(id, { isActive: next } as any);
    await refreshProviders();
  };

  const openModels = async (data: Provider) => {
    setSearch('');
    setModels([]);
    setEditProvider(data);
    setLoadingModels(true);
    setModelsOpen(true);
    setGetModelsError(null);
    try {
      const list = await window.electron.providers.getModelList(data.id);
      console.log(list);
      setModels(list || []);
    } catch {
      setGetModelsError('获取模型失败');
    }

    setLoadingModels(false);
  };

  const saveModels = async () => {
    if (!editProvider) return;
    try {
      await window.electron.providers.updateModels(editProvider.id, models);
      setModelsOpen(false);
    } catch (err) {
      toast.error(err.message);
    }
  };

  // 打开添加模型弹窗
  const openAddModel = () => {
    setNewModelId('');
    setNewModelName('');
    setAddModelOpen(true);
  };

  // 添加自定义模型
  const addCustomModel = () => {
    if (!newModelId.trim()) {
      toast.error('模型 ID 不能为空');
      return;
    }
    // 检查是否已存在
    if (models.some((m) => m.id === newModelId.trim())) {
      toast.error('模型 ID 已存在');
      return;
    }
    const newModel: ProviderModel = {
      id: newModelId.trim(),
      name: newModelName.trim() || newModelId.trim(),
      isActive: true,
      isCustom: true,
    };
    setModels((prev) => [newModel, ...prev]);
    setAddModelOpen(false);
  };

  // 删除自定义模型
  const removeCustomModel = (modelId: string) => {
    setModels((prev) => prev.filter((m) => m.id !== modelId));
  };

  const renderApi = useCallback(() => {
    const doc = modelsData[editProvider?.type ?? selectedType]?.doc;
    if (!doc) return null;
    return (
      <FormDescription className="truncate">
        <a href={doc} target="_blank" rel="noopener noreferrer">
          {doc}
        </a>
      </FormDescription>
    );
  }, [editProvider?.type, selectedType]);

  const renderList = () => {
    if (loading) {
      return (
        <div className="p-4 text-sm text-muted-foreground">
          {t('common.loading')}
        </div>
      );
    }
    if (!providers || providers.length === 0) {
      return (
        <div className="p-8 text-center text-sm text-muted-foreground">
          暂无 Provider，请点击右上角“新建”添加
        </div>
      );
    }
    return (
      <div className="p-4 flex flex-col gap-2">
        {providers.map((p) => (
          <Item variant="outline" key={p.id}>
            <ItemContent>
              <ItemTitle>
                <div className="flex flex-row gap-2 items-center">
                  <ProviderIcon
                    provider={p.type}
                    className="rounded-sm"
                    size={32}
                  />
                  <div className="flex flex-col">
                    {p.name}
                    <small>{p.type}</small>
                  </div>
                </div>
              </ItemTitle>
            </ItemContent>
            <ItemActions>
              <div className="col-span-3 flex items-center justify-end gap-2">
                <Switch
                  checked={(p as any).isActive as boolean}
                  onCheckedChange={(v) => toggleActive(p.id, !!v)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openModels(p)}
                >
                  <Package />
                  {t('common.model')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                  <Edit></Edit>
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => askRemoveProvider(p.id, p.name)}
                >
                  <Trash />
                </Button>
              </div>
            </ItemActions>
          </Item>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4">
        <div className="text-base font-semibold">Providers</div>
        <div className="flex items-center gap-2">
          <Button onClick={openCreate}>{t('common.add')}</Button>
        </div>
      </div>
      <ScrollArea className="flex-1 min-h-0">{renderList()}</ScrollArea>

      {/* 编辑/新建抽屉 */}
      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent className="min-w-[560px]">
          <SheetHeader>
            <SheetTitle>
              {editProvider ? '编辑 Provider' : '新建 Provider'}
            </SheetTitle>
          </SheetHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(saveProvider)} className="p-4">
              <FieldGroup>
                <FormField
                  control={form.control}
                  name="name"
                  rules={{ required: true }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('common.name')}</FormLabel>
                      <FormControl>
                        <Input placeholder="OpenAI-US" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                ></FormField>
                {!editProvider && (
                  <FormField
                    control={form.control}
                    name="type"
                    rules={{ required: true }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>类型</FormLabel>
                        <FormControl>
                          <Select
                            value={field.value}
                            onValueChange={(v) => {
                              field.onChange(v);
                              if (modelsData[v]) {
                                form.setValue('name', modelsData[v].name);
                              }
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="选择类型" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectLabel>
                                  {t('common.model_provider')}
                                </SelectLabel>
                                {Object.values(modelsData)
                                  .sort((x, y) => x.name.localeCompare(y.name))
                                  .map((m) => (
                                    <SelectItem key={m.id} value={m.id}>
                                      <ModelSelectorLogo
                                        provider={m.id}
                                      ></ModelSelectorLogo>
                                      {m.name}
                                    </SelectItem>
                                  ))}
                              </SelectGroup>
                              <SelectGroup>
                                <SelectLabel>
                                  {t('common.other_provider')}
                                </SelectLabel>
                                <SelectItem
                                  key="brave-search"
                                  value="brave-search"
                                >
                                  <IconSearch /> Brave Search
                                </SelectItem>
                                <SelectItem key="jina-ai" value="jina-ai">
                                  <IconSearch /> Jina AI
                                </SelectItem>
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </FormControl>

                        <FormMessage />
                      </FormItem>
                    )}
                  ></FormField>
                )}

                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('common.active')}</FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                ></FormField>
                <FormField
                  control={form.control}
                  name="apiBase"
                  render={({ field, formState, fieldState }) => (
                    <FormItem>
                      <FormLabel>API Base</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={
                            modelsData[editProvider?.type ?? selectedType]?.api
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                ></FormField>
                <FormField
                  control={form.control}
                  name="apiKey"
                  render={({ field, formState, fieldState }) => (
                    <FormItem>
                      <FormLabel>API Key</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="sk-..."
                          {...field}
                        />
                      </FormControl>
                      {renderApi()}
                      <FormMessage />
                    </FormItem>
                  )}
                ></FormField>
              </FieldGroup>
              <SheetFooter className="p-0 mt-6 gap-2">
                <Button
                  type="submit"
                  disabled={!form.formState.isValid || submitting}
                >
                  {t('common.save')}
                </Button>
              </SheetFooter>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      {/* 模型管理抽屉 */}
      <Sheet open={modelsOpen} onOpenChange={setModelsOpen}>
        <SheetContent className="min-w-[560px]">
          <SheetHeader>
            <SheetTitle>模型管理</SheetTitle>
            <div className="flex flex-row gap-2">
              <InputGroup>
                <InputGroupInput
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupAddon align="inline-end">
                  {
                    models.filter(
                      (m) =>
                        m.name.toLowerCase().includes(search.toLowerCase()) ||
                        m.id.toLowerCase().includes(search.toLowerCase()),
                    ).length
                  }{' '}
                  model
                </InputGroupAddon>
              </InputGroup>
              <Button variant="outline" onClick={openAddModel}>
                <Plus />
                添加模型
              </Button>
            </div>
          </SheetHeader>
          {getModelsError && (
            <div className="p-4">
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>{getModelsError}</AlertTitle>
              </Alert>
            </div>
          )}
          {loadingModels && (
            <div className="p-4">
              <Item variant="muted">
                <ItemMedia>
                  <Spinner />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle className="line-clamp-1">
                    Loading models...
                  </ItemTitle>
                </ItemContent>
              </Item>
            </div>
          )}
          {!loadingModels && !getModelsError && (
            <>
              <ScrollArea className="flex-1 overflow-y-auto">
                <div className="p-4">
                  {models && models.length > 0 && (
                    <div className=" p-4 flex flex-col gap-2">
                      {models
                        .filter(
                          (m) =>
                            m.name
                              .toLowerCase()
                              .includes(search.toLowerCase()) ||
                            m.id.toLowerCase().includes(search.toLowerCase()),
                        )
                        .sort((a, b) => {
                          if (a.isActive !== b.isActive) {
                            return a.isActive ? -1 : 1;
                          }

                          const aTime = a.release_date
                            ? new Date(a.release_date).getTime()
                            : 0;
                          const bTime = b.release_date
                            ? new Date(b.release_date).getTime()
                            : 0;
                          return bTime - aTime;
                        })
                        .map((m, idx) => (
                          <Item variant="outline" key={m.id}>
                            <ItemContent>
                              <Field className="w-full">
                                <Label className="flex items-center gap-2">
                                  {m.name}
                                  {m.isCustom && (
                                    <Badge
                                      variant="secondary"
                                      className="text-xs"
                                    >
                                      自定义
                                    </Badge>
                                  )}
                                </Label>
                                <FieldDescription className="text-sm">
                                  {m.id}
                                </FieldDescription>
                                <div className="flex flex-row justify-between items-center">
                                  <div className="flex flex-row gap-2 items-center">
                                    {m?.limit?.context &&
                                      m?.limit?.context > 0 && (
                                        <Badge variant="outline">
                                          {(
                                            (m?.limit?.context ?? 0) / 1000
                                          ).toFixed(0)}
                                          K
                                        </Badge>
                                      )}
                                    {m?.modalities?.input.includes('image') && (
                                      <IconPhoto size={16}></IconPhoto>
                                    )}
                                    {m?.modalities?.input.includes('audio') && (
                                      <IconMicrophone
                                        size={16}
                                      ></IconMicrophone>
                                    )}
                                    {m?.modalities?.input.includes('video') && (
                                      <IconVideo size={16}></IconVideo>
                                    )}

                                    {m?.reasoning && (
                                      <IconBrain size={16}></IconBrain>
                                    )}
                                    {m?.tool_call && (
                                      <IconTool size={16}></IconTool>
                                    )}
                                  </div>
                                  <small>{m.release_date}</small>
                                </div>
                              </Field>
                            </ItemContent>
                            <ItemActions>
                              <div className="col-span-3 flex items-center gap-2">
                                <Switch
                                  checked={!!m.isActive}
                                  onCheckedChange={(v) =>
                                    setModels((list) => {
                                      return list.map((it, i) =>
                                        it.id === m.id
                                          ? { ...it, isActive: !!v }
                                          : it,
                                      );
                                    })
                                  }
                                />
                                {m.isCustom && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={() => removeCustomModel(m.id)}
                                  >
                                    <Trash className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </ItemActions>
                          </Item>
                        ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
              <SheetFooter className="gap-2">
                <Button onClick={saveModels}>{t('common.save')}</Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* 删除确认（AlertDialog） */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确认删除 Provider：
              <span className="font-medium text-foreground">
                {deleteInfo?.name}
              </span>
              ？该操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={removeProvider}
              className="bg-destructive"
            >
              <IconTrashX /> {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 添加自定义模型弹窗 */}
      <Dialog open={addModelOpen} onOpenChange={setAddModelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加自定义模型</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="modelId">
                模型 ID <span className="text-destructive">*</span>
              </Label>
              <Input
                id="modelId"
                placeholder="例如：gpt-4o-mini"
                value={newModelId}
                onChange={(e) => setNewModelId(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="modelName">模型名称（可选）</Label>
              <Input
                id="modelName"
                placeholder="例如：GPT-4o Mini"
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddModelOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={addCustomModel} disabled={!newModelId.trim()}>
              {t('common.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Providers;
