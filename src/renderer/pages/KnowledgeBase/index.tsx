import { Button } from '@/renderer/components/ui/button';
import { Input } from '@/renderer/components/ui/input';
import { ScrollArea } from '@/renderer/components/ui/scroll-area';
import { Separator } from '@/renderer/components/ui/separator';
import { useHeader } from '@/renderer/hooks/use-title';
import React, { useEffect, useState } from 'react';

import {
  IconBox,
  IconDots,
  IconEdit,
  IconPlus,
  IconShare,
  IconTrashX,
  IconUpload,
} from '@tabler/icons-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/renderer/components/ui/dialog';
import { Label } from '@/renderer/components/ui/label';
import { Textarea } from '@/renderer/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select';
import {
  KnowledgeBase,
  KnowledgeBaseEvent,
  KnowledgeBaseReembeddingProgress,
  KnowledgeBaseSQLiteImportMode,
  KnowledgeBaseSQLiteInfo,
  KnowledgeBaseVectorStoreConfig,
  VectorStoreType,
} from '@/types/knowledge-base';
import { FieldGroup } from '@/renderer/components/ui/field';
import { useTranslation } from 'react-i18next';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/renderer/components/ui/form';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/renderer/components/ui/sidebar';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/renderer/components/ui/item';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/renderer/components/ui/dropdown-menu';
import { Badge } from '@/renderer/components/ui/badge';
import KnowledgeBaseDetail from './detail';
import { ModelType } from '@/types/provider';
import { ChatModelSelect } from '@/renderer/components/chat-ui/chat-model-select';
import { Skeleton } from '@/renderer/components/ui/skeleton';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
} from '@/renderer/components/ui/empty';
import { Switch } from '@/renderer/components/ui/switch';
import toast from 'react-hot-toast';
import { useGlobal } from '@/renderer/hooks/use-global';
import { Progress } from '@/renderer/components/ui/progress';

type KnowledgeBaseFormValues = {
  name: string;
  description?: string;
  vectorStoreType: VectorStoreType | string;
  embedding?: string;
  reranker?: string;
  forceReturnFullContent?: boolean;
  extendColumns?: { name: string; columnType: string }[];
};

function KnowledgeBasePage() {
  const { setTitle } = useHeader();
  const { appInfo } = useGlobal();
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [currentKb, setCurrentKb] = useState<KnowledgeBase | null>(null);
  const [importingSqlite, setImportingSqlite] = useState(false);
  const [pendingSqliteImport, setPendingSqliteImport] = useState<{
    filePath: string;
    info: KnowledgeBaseSQLiteInfo;
  } | null>(null);
  const [pendingEmbeddingChange, setPendingEmbeddingChange] = useState<{
    values: KnowledgeBaseFormValues;
    previousEmbedding?: string;
  } | null>(null);
  const [reembeddingProgress, setReembeddingProgress] =
    useState<KnowledgeBaseReembeddingProgress | null>(null);

  const form = useForm<KnowledgeBaseFormValues>({
    mode: 'onChange',
    defaultValues: {
      name: '',
      description: '',
      vectorStoreType: VectorStoreType.LibSQL,
      embedding: appInfo?.defaultModel?.embeddingModel ?? '',
      reranker: appInfo?.defaultModel?.rerankerModel ?? '',
      forceReturnFullContent: false,
      extendColumns: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'extendColumns' as any,
  });
  const getData = async () => {
    setLoading(true);
    const list = await window.electron.knowledgeBase.getList();
    console.log(list);
    setLoading(false);
    setKbs(list || []);
  };
  useEffect(() => {
    setTitle(t('sidebar.knowledge-base'));

    getData();
  }, [setTitle, t]);

  useEffect(() => {
    return window.electron.ipcRenderer.on(
      KnowledgeBaseEvent.ReembeddingProgress,
      (value: unknown) => {
        const progress = value as KnowledgeBaseReembeddingProgress;
        setReembeddingProgress((current) =>
          current && current.kbId === progress.kbId ? progress : current,
        );
      },
    );
  }, []);

  const saveKnowledgeBase = async (
    values: KnowledgeBaseFormValues,
    reembed = false,
  ) => {
    if (submitting) return;
    const knowledgeBaseToUpdate = currentKb;
    try {
      setSubmitting(true);
      if (knowledgeBaseToUpdate) {
        if (reembed) {
          setOpen(false);
          setReembeddingProgress({
            kbId: knowledgeBaseToUpdate.id,
            completed: 0,
            total: 0,
            progress: 0,
            stage: 'preparing',
          });
        }
        await window.electron.knowledgeBase.update(knowledgeBaseToUpdate.id, {
          name: values.name.trim(),
          description: values.description?.trim() || '',
          embedding: values.embedding?.trim() || '',
          reembed,
          reranker: values.reranker?.trim() || '',
          forceReturnFullContent: values.forceReturnFullContent || false,
        });
      } else {
        const extendColumns = values.extendColumns?.filter((col) =>
          col.name?.trim(),
        );
        const vectorStoreConfig: KnowledgeBaseVectorStoreConfig | undefined =
          extendColumns && extendColumns.length > 0
            ? {
                extendColumns: extendColumns.map((col) => ({
                  name: col.name.trim(),
                  columnType: col.columnType as
                    | 'text'
                    | 'blob'
                    | 'number'
                    | 'boolean',
                })),
              }
            : undefined;
        const kb = await window.electron.knowledgeBase.create({
          name: values.name.trim(),
          description: values.description?.trim() || '',
          vectorStoreType: values.vectorStoreType as VectorStoreType,
          embedding: values.embedding?.trim() || undefined,
          reranker: values.reranker?.trim() || '',
          forceReturnFullContent: values.forceReturnFullContent || false,
          ...(vectorStoreConfig ? { vectorStoreConfig } : {}),
        });
        navigate(`/knowledge-base/${kb.id}`);
      }
      await getData();
      setOpen(false);
      form.reset();
      toast.success(t('common.save_success', '保存成功'));
    } catch (error) {
      if (reembed) {
        setOpen(true);
      }
      toast.error(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setPendingEmbeddingChange(null);
      setReembeddingProgress(null);
      setSubmitting(false);
    }
  };

  const handleSubmit = async (values: KnowledgeBaseFormValues) => {
    const nextEmbedding = values.embedding?.trim() || undefined;
    const previousEmbedding = currentKb?.embedding?.trim() || undefined;
    if (currentKb && nextEmbedding !== previousEmbedding) {
      setPendingEmbeddingChange({ values, previousEmbedding });
      return;
    }
    await saveKnowledgeBase(values);
  };

  const handleDelete = async (id: string) => {
    if (submitting) return;
    try {
      setSubmitting(true);
      await window.electron.knowledgeBase.delete(id);
      navigate('/knowledge-base');
      getData();
    } finally {
      setSubmitting(false);
    }
  };

  const openDialog = (data?: any) => {
    setCurrentKb(data);
    setOpen(true);
    form.reset({
      name: '',
      description: '',
      vectorStoreType: VectorStoreType.LibSQL,
      embedding: appInfo?.defaultModel?.embeddingModel ?? '',
      reranker: appInfo?.defaultModel?.rerankerModel ?? '',
      forceReturnFullContent: false,
      extendColumns: [],
    });

    if (data) {
      form.setValue('name', data.name);
      form.setValue('description', data.description);
      form.setValue('embedding', data.embedding ?? '');
      form.setValue('reranker', data.reranker);
      form.setValue(
        'forceReturnFullContent',
        data.forceReturnFullContent || false,
      );
    }
  };

  const executeImportSQLite = async (
    filePath: string,
    mode: KnowledgeBaseSQLiteImportMode,
  ) => {
    if (importingSqlite) return;
    setImportingSqlite(true);
    try {
      const info = await window.electron.knowledgeBase.importSQLite(filePath, mode);
      await getData();
      setPendingSqliteImport(null);
      navigate(`/knowledge-base/${info.id}`);
      toast.success(t('knowledge-base.import_success', '导入成功'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setImportingSqlite(false);
    }
  };

  const handleImportSQLite = async () => {
    if (importingSqlite) return;
    try {
      const result = await window.electron.app.showOpenDialog({
        title: t('knowledge-base.import_sqlite', '导入 SQLite'),
        buttonLabel: t('knowledge-base.import_sqlite', '导入 SQLite'),
        properties: ['openFile'],
        filters: [{ name: 'SQLite', extensions: ['sqlite', 'db'] }],
      });
      if (!result.filePaths || result.filePaths.length === 0) {
        return;
      }

      const filePath = result.filePaths[0];
      const info = await window.electron.knowledgeBase.inspectSQLite(filePath);
      if (kbs.some((kb) => kb.id === info.id)) {
        setPendingSqliteImport({ filePath, info });
        return;
      }
      await executeImportSQLite(filePath, 'append');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'));
    }
  };

  const isEditingKnowledgeBase = Boolean(currentKb);
  const knowledgeBaseDialogTitle = isEditingKnowledgeBase
    ? t('knowledge-base.edit_knowledge-base')
    : t('knowledge-base.new_knowledge-base');
  const knowledgeBaseSubmitText = (() => {
    if (submitting) return t('common.loading');
    if (isEditingKnowledgeBase) return t('common.save');
    return t('knowledge-base.new_knowledge-base');
  })();
  const reembeddingProgressText = (() => {
    switch (reembeddingProgress?.stage) {
      case 'embedding':
        return t(
          'knowledge-base.reembedding_embedding',
          '正在使用新模型计算向量…',
        );
      case 'committing':
        return t(
          'knowledge-base.reembedding_committing',
          '正在原子更新知识库…',
        );
      case 'completed':
        return t('knowledge-base.reembedding_completed', '重算完成');
      default:
        return t('knowledge-base.reembedding_preparing', '正在准备知识库数据…');
    }
  })();

  return (
    <div className="h-full w-full flex flex-row justify-between">
      <div className="flex flex-col gap-2 h-full p-4 w-[--sidebar-width]">
        <div className="flex flex-row items-center gap-2">
          <Input></Input>
          <Button
            variant="outline"
            size="icon"
            disabled={importingSqlite}
            onClick={handleImportSQLite}
            title={t('knowledge-base.import_sqlite', '导入 SQLite')}
          >
            <IconUpload></IconUpload>
          </Button>
          <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
              if (!submitting) setOpen(nextOpen);
            }}
          >
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => openDialog()}
              >
                <IconPlus></IconPlus>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{knowledgeBaseDialogTitle}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form
                  className="flex flex-col gap-4"
                  onSubmit={form.handleSubmit(handleSubmit)}
                >
                  <FieldGroup>
                    <FormField
                      name="name"
                      control={form.control}
                      rules={{ required: t('common.required') as string }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel htmlFor="kb-name">
                            {t('knowledge-base.name')}
                          </FormLabel>
                          <FormControl>
                            <Input
                              id="kb-name"
                              placeholder="请输入知识库名称"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="description"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel htmlFor="kb-desc">
                            {t('knowledge-base.description')}
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              id="kb-desc"
                              placeholder="可选：为知识库添加描述"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {!currentKb && (
                      <>
                        <FormField
                          name="vectorStoreType"
                          control={form.control}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel htmlFor="kb-vector-store-type">
                                {t('knowledge-base.vector-store-type')}
                              </FormLabel>
                              <Select
                                value={String(field.value)}
                                onValueChange={field.onChange}
                              >
                                <FormControl>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="请选择向量库类型" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value={VectorStoreType.LibSQL}>
                                    LibSQL
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">
                              {t('knowledge-base.extend-columns')}
                            </Label>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => append({ name: '', columnType: 'text' })}
                            >
                              <IconPlus className="size-3.5 mr-1" />
                              {t('knowledge-base.add-column')}
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {t('knowledge-base.extend-columns-desc')}
                          </p>
                          {fields.length > 0 && (
                            <div className="space-y-2">
                              {fields.map((field, index) => (
                                <div key={field.id} className="flex items-center gap-2">
                                  <Input
                                    placeholder={t('knowledge-base.column-name-placeholder')}
                                    className="flex-1"
                                    {...form.register(`extendColumns.${index}.name` as any)}
                                  />
                                  <Controller
                                    control={form.control}
                                    name={`extendColumns.${index}.columnType` as any}
                                    render={({ field: selectField }) => (
                                      <Select
                                        value={selectField.value}
                                        onValueChange={selectField.onChange}
                                      >
                                        <SelectTrigger className="w-[120px]">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="text">Text</SelectItem>
                                          <SelectItem value="number">Number</SelectItem>
                                          <SelectItem value="boolean">Boolean</SelectItem>
                                          <SelectItem value="blob">Blob</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    )}
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 shrink-0"
                                    onClick={() => remove(index)}
                                  >
                                    <IconTrashX className="size-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                    <FormField
                      name="embedding"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel htmlFor="kb-embedding">
                            {t('knowledge-base.embedding')}
                          </FormLabel>
                          <FormControl>
                            <ChatModelSelect
                              type={ModelType.EMBEDDING}
                              clearable
                              {...field}
                              className="border w-full"
                            ></ChatModelSelect>
                          </FormControl>
                          <FormDescription>
                            {t(
                              'knowledge-base.embedding_optional_hint',
                              '不选择模型时，将仅使用 BM25 全文检索。',
                            )}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="reranker"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel htmlFor="kb-reranker">
                            {t('knowledge-base.reranker')}
                          </FormLabel>
                          <FormControl>
                            <ChatModelSelect
                              clearable
                              type={ModelType.RERANKER}
                              {...field}
                              className="border w-full"
                            ></ChatModelSelect>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="forceReturnFullContent"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel htmlFor="kb-force-return-full-content">
                            {t('knowledge-base.force-return-full-content')}
                          </FormLabel>
                          <FormControl>
                            <Switch
                              id="kb-force-return-full-content"
                              {...field}
                              onCheckedChange={field.onChange}
                              checked={field.value}
                              value={field.value ? 'true' : 'false'}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </FieldGroup>

                  <DialogFooter>
                    <Button
                      type="submit"
                      disabled={!form.formState.isValid || submitting}
                    >
                      {knowledgeBaseSubmitText}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
          <Dialog
            open={Boolean(pendingEmbeddingChange)}
            onOpenChange={(nextOpen) => {
              if (!nextOpen && !submitting) {
                setPendingEmbeddingChange(null);
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {t(
                    'knowledge-base.reembedding_confirm_title',
                    '重新计算全部向量？',
                  )}
                </DialogTitle>
                <DialogDescription>
                  {t(
                    'knowledge-base.reembedding_confirm_description',
                    '向量模型已发生变化。使用新模型重新计算全部内容后，才会更新知识库；任一计算失败都会保留原模型和原数据。',
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
                <div className="break-all">
                  {t('knowledge-base.reembedding_old_model', '原模型')}:{' '}
                  {pendingEmbeddingChange?.previousEmbedding || 'BM25'}
                </div>
                <div className="break-all">
                  {t('knowledge-base.reembedding_new_model', '新模型')}:{' '}
                  {pendingEmbeddingChange?.values.embedding?.trim() || 'BM25'}
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={submitting}
                  onClick={() => setPendingEmbeddingChange(null)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    if (!pendingEmbeddingChange) return;
                    const { values } = pendingEmbeddingChange;
                    setPendingEmbeddingChange(null);
                    saveKnowledgeBase(values, true);
                  }}
                >
                  {t(
                    'knowledge-base.reembedding_confirm_action',
                    '重新计算并保存',
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={Boolean(reembeddingProgress)} onOpenChange={() => {}}>
            <DialogContent
              showCloseButton={false}
              onEscapeKeyDown={(event) => event.preventDefault()}
              onPointerDownOutside={(event) => event.preventDefault()}
              onInteractOutside={(event) => event.preventDefault()}
            >
              <DialogHeader>
                <DialogTitle>
                  {t(
                    'knowledge-base.reembedding_progress_title',
                    '正在重建知识库向量',
                  )}
                </DialogTitle>
                <DialogDescription>
                  {t(
                    'knowledge-base.reembedding_progress_description',
                    '请等待全部计算完成。此窗口在处理期间不能关闭。',
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <Progress value={reembeddingProgress?.progress ?? 0} />
                <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
                  <span>{reembeddingProgressText}</span>
                  <span className="shrink-0 tabular-nums">
                    {reembeddingProgress?.total
                      ? `${reembeddingProgress.completed}/${reembeddingProgress.total}`
                      : `${reembeddingProgress?.progress ?? 0}%`}
                  </span>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog
            open={Boolean(pendingSqliteImport)}
            onOpenChange={(nextOpen) => {
              if (!nextOpen && !importingSqlite) {
                setPendingSqliteImport(null);
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {t('knowledge-base.import_conflict', '同 ID 知识库已存在')}
                </DialogTitle>
              </DialogHeader>
              <div className="text-sm text-muted-foreground break-all">
                {pendingSqliteImport?.info.name} ({pendingSqliteImport?.info.id})
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={importingSqlite}
                  onClick={() => setPendingSqliteImport(null)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={importingSqlite}
                  onClick={() => {
                    if (!pendingSqliteImport) return;
                    executeImportSQLite(pendingSqliteImport.filePath, 'append');
                  }}
                >
                  {t('knowledge-base.import_append', '追加')}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={importingSqlite}
                  onClick={() => {
                    if (!pendingSqliteImport) return;
                    executeImportSQLite(pendingSqliteImport.filePath, 'overwrite');
                  }}
                >
                  {t('knowledge-base.import_overwrite', '覆盖')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <ScrollArea className="h-full  flex-1 min-h-0 ">
          <SidebarMenu className="pr-3">
            {kbs.map((kb) => (
              <SidebarMenuItem
                key={kb.id}
                className="group/item mb-1 cursor-pointer w-[calc(var(--sidebar-width))]"
                onClick={() => {
                  navigate(`/knowledge-base/${kb.id}`);
                }}
              >
                <SidebarMenuButton
                  asChild
                  isActive={location?.pathname?.startsWith(
                    `/knowledge-base/${kb.id}`,
                  )}
                  className="truncate w-full flex flex-row justify-between h-full"
                >
                  <Item
                    className="truncate w-full flex flex-row justify-between flex-nowrap"
                    onClick={() => navigate(`/knowledge-base/${kb.id}`)}
                  >
                    <ItemContent className="min-w-0">
                      <ItemTitle className="line-clamp-1 w-auto flex flex-row items-center gap-1">
                        <span className="truncate">{kb.name}</span>
                        {kb.static && (
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            {t('knowledge-base.static-badge', '全局记忆')}
                          </Badge>
                        )}
                      </ItemTitle>

                      {kb.description && (
                        <ItemDescription>{kb.description}</ItemDescription>
                      )}
                    </ItemContent>
                    {/* <ItemDescription>
                      <Badge variant="secondary">{kb.embedding}</Badge>
                    </ItemDescription> */}

                    <ItemActions>
                      <div className="opacity-0 group-hover/item:opacity-100 transition-opacity duration-200">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              className="size-6 cursor-pointer border"
                            >
                              <IconDots></IconDots>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            side="bottom"
                            align="end"
                            sideOffset={8}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <DropdownMenuItem
                              onSelect={(event) => {
                                openDialog(kb);
                              }}
                            >
                              <IconEdit /> {t('common.edit')}
                            </DropdownMenuItem>

                            {!kb.static && (
                              <DropdownMenuItem
                                onSelect={(event) => {
                                  handleDelete(kb.id);
                                }}
                                variant="destructive"
                              >
                                <IconTrashX /> {t('common.delete')}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </ItemActions>
                  </Item>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            {loading && (
              <div className="flex items-center space-x-4 w-[calc(var(--sidebar-width))]">
                <div className="space-y-2 w-full">
                  <Skeleton className="h-4 " />
                  <Skeleton className="h-4 w-[200px]" />
                </div>
              </div>
            )}
            {kbs.length === 0 && (
              <div className="flex items-center space-x-4 w-[calc(var(--sidebar-width))]">
                <Empty className="bg-secondary/50">
                  <EmptyHeader>
                    {/* <EmptyMedia variant="icon"></EmptyMedia> */}
                    <EmptyDescription className="flex flex-col items-center gap-2">
                      <IconBox />
                      No Result
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </div>
            )}
          </SidebarMenu>
        </ScrollArea>
      </div>

      <div className="flex flex-col flex-1 w-full min-w-0">
        <Routes>
          <Route path=":id" element={<KnowledgeBaseDetail />} />
        </Routes>
      </div>
    </div>
  );
}
export default KnowledgeBasePage;
