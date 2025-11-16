import { Button } from '@/renderer/components/ui/button';
import { Input } from '@/renderer/components/ui/input';
import { ScrollArea } from '@/renderer/components/ui/scroll-area';
import { Separator } from '@/renderer/components/ui/separator';
import { useHeader } from '@/renderer/hooks/use-title';
import React, { useEffect, useState } from 'react';

import {
  IconDots,
  IconEdit,
  IconPlus,
  IconShare,
  IconTrashX,
} from '@tabler/icons-react';
import {
  Dialog,
  DialogContent,
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
  CreateKnowledgeBase,
  KnowledgeBase,
  UpdateKnowledgeBase,
  VectorStoreType,
} from '@/types/knowledge-base';
import { FieldGroup } from '@/renderer/components/ui/field';
import { useTranslation } from 'react-i18next';
import { Controller, useForm } from 'react-hook-form';
import {
  Form,
  FormControl,
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

function KnowledgeBasePage() {
  const { setTitle } = useHeader();
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [currentKb, setCurrentKb] = useState<KnowledgeBase | null>(null);

  const form = useForm<CreateKnowledgeBase | UpdateKnowledgeBase>({
    mode: 'onChange',
    defaultValues: {
      name: '',
      description: '',
      vectorStoreType: VectorStoreType.LibSQL,
      embedding: '',
    },
  });
  const getData = async () => {
    const list = await window.electron.knowledgeBase.getList();
    console.log(list);
    setKbs(list || []);
  };
  useEffect(() => {
    setTitle('Knowledge Base');

    getData();
  }, [setTitle]);

  const handleSubmit = async (values: {
    name: string;
    description?: string;
    vectorStoreType: VectorStoreType | string;
    embedding: string;
  }) => {
    if (submitting) return;
    try {
      setSubmitting(true);
      if (currentKb) {
        await window.electron.knowledgeBase.update(currentKb.id, {
          name: values.name.trim(),
          description: values.description?.trim() || '',
        });
      } else {
        await window.electron.knowledgeBase.create({
          name: values.name.trim(),
          description: values.description?.trim() || '',
          vectorStoreType: values.vectorStoreType as VectorStoreType,
          embedding: values.embedding.trim(),
        });
      }
      getData();
      setOpen(false);
      form.reset();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (submitting) return;
    try {
      setSubmitting(true);
      await window.electron.knowledgeBase.delete(id);
      getData();
    } finally {
      setSubmitting(false);
    }
  };

  const openDialog = (data?: any) => {
    setCurrentKb(data);
    setOpen(true);
    form.reset();

    if (data) {
      form.setValue('name', data.name);
      form.setValue('description', data.description);
    }
  };

  return (
    <div className="h-full w-full flex flex-row justify-between">
      <div className="flex flex-col gap-2 h-full p-4 w-[--sidebar-width]">
        <div className="flex flex-row items-center gap-2">
          <Input></Input>
          <Dialog open={open} onOpenChange={setOpen}>
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
                <DialogTitle>新建知识库</DialogTitle>
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
                        <FormField
                          name="embedding"
                          control={form.control}
                          rules={{ required: t('common.required') as string }}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel htmlFor="kb-embedding">
                                {t('knowledge-base.embedding')}
                              </FormLabel>
                              <FormControl>
                                <ChatModelSelect
                                  type={ModelType.EMBEDDING}
                                  {...field}
                                  className="border w-full"
                                ></ChatModelSelect>
                                {/* <Input
                              id="kb-embedding"
                              placeholder="例如：text-embedding-3-large"
                              {...field}
                            /> */}
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}
                  </FieldGroup>

                  <DialogFooter>
                    <Button
                      type="submit"
                      disabled={!form.formState.isValid || submitting}
                    >
                      {submitting ? '创建中…' : '创建'}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
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
                      <ItemTitle className="line-clamp-1 w-auto">
                        {kb.name}
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

                            <DropdownMenuItem
                              onSelect={(event) => {
                                handleDelete(kb.id);
                              }}
                              variant="destructive"
                            >
                              <IconTrashX /> {t('common.delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </ItemActions>
                  </Item>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            {kbs.length === 0 && (
              <div className="flex items-center space-x-4 w-[calc(var(--sidebar-width))]">
                <div className="space-y-2 w-full">
                  <Skeleton className="h-4 " />
                  <Skeleton className="h-4 w-[200px]" />
                </div>
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
