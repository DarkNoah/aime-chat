import { Badge } from '@/renderer/components/ui/badge';
import { Button } from '@/renderer/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/renderer/components/ui/dialog';
import { Input } from '@/renderer/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/renderer/components/ui/input-group';
import { Item, ItemActions, ItemContent, ItemDescription, ItemHeader, ItemTitle } from '@/renderer/components/ui/item';
import { useHeader } from '@/renderer/hooks/use-title';
import { KnowledgeBase, KnowledgeBaseSourceType } from '@/types/knowledge-base';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormField,
} from '@/renderer/components/ui/form';
import {
  IconFile,
  IconNetwork,
  IconSearch,
  IconTextCaption,
  IconTrash,
} from '@tabler/icons-react';
import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { z } from 'zod';
import { Field, FieldContent } from '@/renderer/components/ui/field';
import { Textarea } from '@/renderer/components/ui/textarea';
import { KnowledgeBaseItem } from '@/entities/knowledge-base';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/renderer/components/ui/pagination';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/renderer/components/ui/sheet';
import { Streamdown } from '@/renderer/components/ai-elements/streamdown';

const PAGE_SIZE = 10;

const importSourceWebSchema = z.object({
  url: z.string(),
});
const importSourceTextSchema = z.object({
  content: z.string(),
});
function KnowledgeBaseDetail() {
  const { setTitle } = useHeader();
  const { t } = useTranslation();
  const { id } = useParams();
  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [items, setItems] = useState<KnowledgeBaseItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);
  const [selectedItem, setSelectedItem] = useState<KnowledgeBaseItem | null>(null);
  const [search, setSearch] = useState('');
  const getStateVariant = (state?: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (state === 'completed') {
      return 'default';
    }
    if (state === 'fail') {
      return 'destructive';
    }
    if (state === 'processing') {
      return 'secondary';
    }
    return 'outline';
  };

  const getSourceTypeLabel = (sourceType?: string) => {
    if (sourceType === KnowledgeBaseSourceType.Web) {
      return 'Web';
    }
    if (sourceType === KnowledgeBaseSourceType.File) {
      return 'File';
    }
    if (sourceType === KnowledgeBaseSourceType.Folder) {
      return 'Folder';
    }
    if (sourceType === KnowledgeBaseSourceType.Text) {
      return 'Text';
    }
    return '-';
  };

  const loadItems = async (targetPage = 1) => {
    if (!id) {
      return;
    }
    setItemsLoading(true);
    try {
      const data = await window.electron.knowledgeBase.getKnowledgeBaseItems(id, {
        page: targetPage,
        size: PAGE_SIZE,
        sort: 'updatedAt',
        order: 'DESC',
      });
      console.log(data.items)
      setItems(data.items || []);
      setTotal(data.total || 0);
      setPage(data.page || targetPage);
      setSize(data.size || PAGE_SIZE);
      setHasMore(Boolean(data.hasMore));
    } finally {
      setItemsLoading(false);
    }
  };

  const getData = async () => {
    if (!id) {
      return;
    }
    const data = await window.electron.knowledgeBase.get(id);
    setKb(data);
    setTitle(data?.name || '');
    await loadItems(1);
  };

  const webForm = useForm<z.infer<typeof importSourceWebSchema>>({
    resolver: zodResolver(importSourceWebSchema),
    defaultValues: {
      url: '',
    },
    reValidateMode: 'onSubmit',
  });

  const textForm = useForm<z.infer<typeof importSourceTextSchema>>({
    resolver: zodResolver(importSourceTextSchema),
    defaultValues: {
      content: '',
    },
    reValidateMode: 'onSubmit',
  });

  useEffect(() => {
    getData();
  }, [id]);

  const handleSubmit = async (data: any, type: KnowledgeBaseSourceType) => {
    if (!id) {
      return;
    }
    await window.electron.knowledgeBase.importSource({
      kbId: id,
      source: data,
      type,
    });
    await loadItems(1);
  };

  const searchKnowledgeBase = async (query: string) => {
    if (!id) {
      return;
    }
    const data = await window.electron.knowledgeBase.searchKnowledgeBase(id, query);
    console.log(data)
  };

  const totalPages = Math.max(1, Math.ceil(total / Math.max(size, 1)));

  return (
    <div className="p-4 flex flex-col gap-2 flex-1 min-h-0">
      <Badge variant="secondary">@{kb?.embedding}[{kb?.vectorLength}]</Badge>
      <div className="flex flex-row gap-2">
        <Dialog>
          <DialogTrigger asChild>
            <Item variant="outline" className="cursor-pointer">
              <ItemHeader>
                <IconNetwork></IconNetwork>
              </ItemHeader>
              <ItemContent>{t('knowledge-base.add_url')}</ItemContent>
            </Item>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{t('knowledge-base.add_url')}</DialogTitle>
            </DialogHeader>
            <Form {...webForm}>
              <form
                onSubmit={webForm.handleSubmit((data) =>
                  handleSubmit(data, KnowledgeBaseSourceType.Web),
                )}
              >
                <div className="grid gap-4">
                  <div className="grid gap-3">
                    <FormField
                      control={webForm.control}
                      name="url"
                      rules={{ required: t('common.required') as string }}
                      render={({ field }) => (
                        <Field>
                          <FieldContent className="flex flex-row items-center gap-2 ">
                            <Input
                              id="url"
                              name="url"
                              {...field}
                              placeholder="https://example.com"
                            />
                          </FieldContent>
                        </Field>
                      )}
                    />
                  </div>
                </div>
                <DialogFooter className="mt-4">
                  <Button type="submit">{t('common.submit')}</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <Item variant="outline" className="cursor-pointer">
              <ItemHeader>
                <IconTextCaption></IconTextCaption>
              </ItemHeader>
              <ItemContent>{t('knowledge-base.add_text')}</ItemContent>
            </Item>
          </DialogTrigger>
          <DialogContent >
            <DialogHeader>
              <DialogTitle>{t('knowledge-base.add_files')}</DialogTitle>
            </DialogHeader>
            <Form {...textForm}>
              <form
                onSubmit={textForm.handleSubmit((data) =>
                  handleSubmit(data, KnowledgeBaseSourceType.Text),
                )}
              >
                <div className="grid gap-4 ">
                  <div className="grid gap-3">
                    <FormField
                      control={textForm.control}
                      name="content"
                      rules={{ required: t('common.required') as string }}
                      render={({ field }) => (
                        <Field>
                          <FieldContent className="">
                            <Textarea id="content" name="content" {...field} className='whitespace-pre-wrap break-all  max-h-[300px] overflow-y-auto' />
                          </FieldContent>
                        </Field>
                      )}
                    />
                  </div>
                </div>
                <DialogFooter className="mt-4">
                  <Button type="submit">{t('common.submit')}</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Item variant="outline" className="cursor-pointer">
          <ItemHeader>
            <IconFile></IconFile>
          </ItemHeader>
          <ItemContent>{t('knowledge-base.add_files')}</ItemContent>
        </Item>
      </div>
      <div className="flex flex-row gap-2 items-center w-full justify-center">
        <InputGroup>

          <InputGroupInput placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <InputGroupAddon align="block-end">

            <InputGroupButton variant="default" size="sm" className="ml-auto" onClick={() => searchKnowledgeBase(search)}>
              <IconSearch />
            </InputGroupButton>
          </InputGroupAddon>
          {/* <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon> */}
        </InputGroup>
      </div>
      <div className="flex flex-col gap-2 mt-2 flex-1 overflow-y-auto">

        {itemsLoading ? (
          <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-muted-foreground">{t('common.no_data')}</div>
        ) : (
          items.map((item) => (
            <Item key={item.id} variant="outline" className="">
              {/* <ItemHeader className="w-full">
                
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{getSourceTypeLabel(item.sourceType)}</Badge>
                  <Badge variant={getStateVariant(item.state)}>{item.state || '-'}</Badge>
                </div>
              </ItemHeader> */}
              <ItemContent className="w-full gap-2">
                <ItemTitle className="max-w-[60%] truncate flex items-center gap-2">
                  <Badge variant="outline">{getSourceTypeLabel(item.sourceType)}</Badge>
                  <button
                    type="button"
                    className="truncate cursor-pointer hover:underline text-left"
                    onClick={() => {
                      console.log(item)
                      setSelectedItem(item)
                    }}
                  >
                    {item.name || item.source || '-'}
                  </button>
                </ItemTitle>
                <ItemDescription className="line-clamp-2 break-all text-xs">
                  {item.content || item.source || '-'}
                </ItemDescription>
                <div className="text-xs text-muted-foreground flex items-center justify-between">
                  <span>{new Date(item.updatedAt).toLocaleString()}</span>
                  <span>Chunk: {item.chunkCount || 0}</span>
                </div>
              </ItemContent>
              <ItemActions>
                <Button size="sm" variant="destructive">
                  <IconTrash></IconTrash>
                </Button>
              </ItemActions>
            </Item>
          ))
        )}
      </div>
      <div className="mt-2 flex flex-row items-center justify-between gap-2 w-full">
        <span className="text-xs text-muted-foreground text-center">
          total {total} items
        </span>
        <div className='flex-1'>
          <Pagination className='justify-end'>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  className={itemsLoading || page <= 1 ? 'pointer-events-none opacity-50' : ''}
                  onClick={(event) => {
                    event.preventDefault();
                    if (itemsLoading || page <= 1) {
                      return;
                    }
                    loadItems(page - 1);
                  }}
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#" isActive onClick={(event) => event.preventDefault()}>
                  {page}
                </PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  className={itemsLoading || !hasMore ? 'pointer-events-none opacity-50' : ''}
                  onClick={(event) => {
                    event.preventDefault();
                    if (itemsLoading || !hasMore) {
                      return;
                    }
                    loadItems(page + 1);
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>

      </div>
      <Sheet
        open={Boolean(selectedItem)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedItem(null);
          }
        }}
      >
        <SheetContent side="right" className="w-[680px] sm:max-w-[680px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Badge variant="outline">
                {getSourceTypeLabel(selectedItem?.sourceType)}
              </Badge>
              <Badge variant={getStateVariant(selectedItem?.state)}>
                {selectedItem?.state || '-'}
              </Badge>
            </SheetTitle>
            <SheetDescription>
              {selectedItem?.sourceType === KnowledgeBaseSourceType.Web && <Button variant="link" onClick={() => {
                window.open(selectedItem?.source?.url, '_blank');
              }}>{selectedItem?.source?.url}</Button>}

            </SheetDescription>
          </SheetHeader>
          <div className="space-y-2 px-4 pb-4 overflow-y-auto ">
            <div className="text-sm font-medium break-all">
              {selectedItem?.name || selectedItem?.source || '-'}
            </div>
            <Streamdown
              className="bg-secondary p-4 rounded-2xl text-wrap break-all whitespace-pre-wrap text-sm"
            >
              {selectedItem?.content}
            </Streamdown>

          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default KnowledgeBaseDetail;
