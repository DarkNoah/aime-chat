/* eslint-disable no-nested-ternary */
import { Badge } from '@/renderer/components/ui/badge';
import { Button } from '@/renderer/components/ui/button';
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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemTitle,
} from '@/renderer/components/ui/item';
import { useHeader } from '@/renderer/hooks/use-title';
import {
  KnowledgeBase,
  KnowledgeBaseItemState,
  KnowledgeBaseSourceType,
  SearchKnowledgeBaseItemResult,
} from '@/types/knowledge-base';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormField } from '@/renderer/components/ui/form';
import {
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconFile,
  IconNetwork,
  IconSearch,
  IconTextCaption,
  IconTrash,
} from '@tabler/icons-react';
import React, { useEffect, useRef, useState } from 'react';
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/renderer/components/ui/tabs';

const PAGE_SIZE = 10;

const importSourceWebSchema = z.object({
  url: z.string(),
});
const importSourceTextSchema = z.object({
  content: z.string(),
});

type SelectedImportFile = {
  id: string;
  name: string;
  path: string;
  size: number;
};

const formatFileSize = (size: number) => {
  if (!size || size <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(
    Math.floor(Math.log(size) / Math.log(1024)),
    units.length - 1,
  );
  const value = size / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

function KnowledgeBaseDetail() {
  const { setTitle } = useHeader();
  const { t } = useTranslation();
  const { id } = useParams();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [items, setItems] = useState<KnowledgeBaseItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);
  const [selectedItem, setSelectedItem] = useState<KnowledgeBaseItem | null>(
    null,
  );
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<
    SearchKnowledgeBaseItemResult[]
  >([]);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [importingFiles, setImportingFiles] = useState(false);
  const [fileImportError, setFileImportError] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<SelectedImportFile[]>([]);
  const [pendingDeleteItem, setPendingDeleteItem] =
    useState<KnowledgeBaseItem | null>(null);
  const [deletingItem, setDeletingItem] = useState(false);
  const getStateVariant = (
    state?: string,
  ): 'default' | 'secondary' | 'destructive' | 'outline' => {
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
      const data = await window.electron.knowledgeBase.getKnowledgeBaseItems(
        id,
        {
          page: targetPage,
          size: PAGE_SIZE,
          sort: 'updatedAt',
          order: 'DESC',
        },
      );
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
    const trimmedQuery = query.trim();
    if (!id || !trimmedQuery) {
      return;
    }
    setSearchLoading(true);
    setSearchError('');
    setSearchDialogOpen(true);
    try {
      const data = await window.electron.knowledgeBase.searchKnowledgeBase(
        id,
        trimmedQuery,
      );
      setSearchResults(data.results);
    } catch (error) {
      setSearchResults([]);
      setSearchError(
        error instanceof Error ? error.message : t('common.error'),
      );
    } finally {
      setSearchLoading(false);
    }
  };

  const formatSearchScore = (score: unknown) => {
    const normalizedScore = typeof score === 'number' ? score : Number(score);
    if (Number.isFinite(normalizedScore)) {
      return normalizedScore.toFixed(4);
    }
    return '-';
  };

  const formatSearchResult = (result: Record<string, any>) => {
    return result.chunk;
  };

  const resetFileImportDialog = () => {
    setDraggingFiles(false);
    setImportingFiles(false);
    setFileImportError('');
    setSelectedFiles([]);
  };

  const appendSelectedFiles = (files: File[] | FileList) => {
    const incoming = Array.from(files);
    if (incoming.length === 0) {
      return;
    }
    setSelectedFiles((prev) => {
      const exists = new Set(prev.map((file) => file.path));
      const next = [...prev];
      incoming.forEach((file) => {
        const path = window.electron.app.getPathForFile(file);
        if (!path || exists.has(path)) {
          return;
        }
        exists.add(path);
        next.push({
          id: `${path}-${file.lastModified}`,
          name: file.name || path.split(/[\\/]/).pop() || path,
          path,
          size: file.size || 0,
        });
      });
      return next;
    });
  };

  const handleImportFiles = async () => {
    if (!id || selectedFiles.length === 0 || importingFiles) {
      return;
    }
    setImportingFiles(true);
    setFileImportError('');
    try {
      await window.electron.knowledgeBase.importSource({
        kbId: id,
        source: { files: selectedFiles.map((x) => x.path) },
        type: KnowledgeBaseSourceType.File,
      });
      setFileDialogOpen(false);
      resetFileImportDialog();
      await loadItems(1);
    } catch (error) {
      setFileImportError(
        error instanceof Error ? error.message : t('common.error'),
      );
    } finally {
      setImportingFiles(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!pendingDeleteItem || deletingItem) {
      return;
    }
    setDeletingItem(true);
    try {
      await window.electron.knowledgeBase.deleteKnowledgeBaseItem(
        pendingDeleteItem.id,
      );
      if (selectedItem?.id === pendingDeleteItem.id) {
        setSelectedItem(null);
      }
      const targetPage = items.length === 1 && page > 1 ? page - 1 : page;
      await loadItems(targetPage);
      setPendingDeleteItem(null);
    } finally {
      setDeletingItem(false);
    }
  };

  // const totalPages = Math.max(1, Math.ceil(total / Math.max(size, 1)));

  return (
    <div className="p-4 flex flex-col gap-2 flex-1 min-h-0">
      <Badge variant="secondary">
        @{kb?.embeddingModel}[{kb?.vectorLength}]
      </Badge>
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('knowledge-base.add_text')}</DialogTitle>
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
                            <Textarea
                              id="content"
                              name="content"
                              {...field}
                              className="whitespace-pre-wrap break-all  max-h-[300px] overflow-y-auto"
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

        <Dialog
          open={fileDialogOpen}
          onOpenChange={(open) => {
            setFileDialogOpen(open);
            if (!open) {
              resetFileImportDialog();
            }
          }}
        >
          <DialogTrigger asChild>
            <Item variant="outline" className="cursor-pointer">
              <ItemHeader>
                <IconFile></IconFile>
              </ItemHeader>
              <ItemContent>{t('knowledge-base.add_files')}</ItemContent>
            </Item>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[560px]">
            <DialogHeader>
              <DialogTitle>{t('knowledge-base.add_files')}</DialogTitle>
            </DialogHeader>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files) {
                  appendSelectedFiles(event.target.files);
                }
                event.target.value = '';
              }}
            />
            <div
              className={`rounded-md border border-dashed p-6 text-center cursor-pointer transition-colors ${
                draggingFiles
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/40 hover:border-primary/60'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setDraggingFiles(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDraggingFiles(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDraggingFiles(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDraggingFiles(false);
                appendSelectedFiles(event.dataTransfer.files);
              }}
            >
              <div className="flex flex-col items-center gap-2">
                <IconFile className="size-6 text-muted-foreground" />
                <div className="text-sm font-medium">
                  Drag files here or click to choose
                </div>
                <div className="text-xs text-muted-foreground">
                  You can select multiple files at once
                </div>
              </div>
            </div>
            <div className="space-y-2 max-h-[220px] overflow-y-auto">
              {selectedFiles.length === 0 ? (
                <div className="text-xs text-muted-foreground">
                  {t('common.no_data')}
                </div>
              ) : (
                selectedFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm">{file.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {file.path}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {formatFileSize(file.size)}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedFiles((prev) =>
                            prev.filter((x) => x.path !== file.path),
                          );
                        }}
                      >
                        {t('common.delete')}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            {fileImportError && (
              <div className="text-sm text-destructive break-all">
                {fileImportError}
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                onClick={handleImportFiles}
                disabled={selectedFiles.length === 0 || importingFiles}
              >
                {importingFiles ? t('common.loading') : t('common.submit')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex flex-row gap-2 items-center w-full justify-center">
        <InputGroup>
          <InputGroupInput
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (searchLoading || !search.trim()) {
                  return;
                }
                searchKnowledgeBase(search);
              }
            }}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              onClick={() => searchKnowledgeBase(search)}
              disabled={searchLoading || !search.trim()}
            >
              <IconSearch />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
      <div className="flex flex-col gap-2 mt-2 flex-1 overflow-y-auto">
        {itemsLoading ? (
          <div className="text-sm text-muted-foreground">
            {t('common.loading')}
          </div>
        ) : items.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {t('common.no_data')}
          </div>
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
                  {item.state === KnowledgeBaseItemState.Completed && (
                    <IconCheck className="size-4 text-green-500" />
                  )}
                  {item.state === KnowledgeBaseItemState.Fail && (
                    <IconAlertCircle className="size-4 text-red-500" />
                  )}
                  {item.state === KnowledgeBaseItemState.Pending && (
                    <IconClock className="size-4 text-yellow-500" />
                  )}
                  <Badge variant="outline">
                    {getSourceTypeLabel(item.sourceType)}
                  </Badge>
                  <Button
                    variant="link"
                    className="truncate cursor-pointer text-left"
                    onClick={() => {
                      console.log(item);
                      setSelectedItem(item);
                    }}
                  >
                    {item.name || item.source || '-'}
                  </Button>
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
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setPendingDeleteItem(item);
                  }}
                >
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
        <div className="flex-1">
          <Pagination className="justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  className={
                    itemsLoading || page <= 1
                      ? 'pointer-events-none opacity-50'
                      : ''
                  }
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
                <PaginationLink
                  href="#"
                  isActive
                  onClick={(event) => event.preventDefault()}
                >
                  {page}
                </PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  className={
                    itemsLoading || !hasMore
                      ? 'pointer-events-none opacity-50'
                      : ''
                  }
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
      <AlertDialog
        open={Boolean(pendingDeleteItem)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteItem(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.delete')}</AlertDialogTitle>
            <AlertDialogDescription className="break-all">
              {pendingDeleteItem?.name || pendingDeleteItem?.source || '-'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingItem}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={async (event) => {
                event.preventDefault();
                await handleDeleteItem();
              }}
            >
              {deletingItem ? t('common.loading') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('common.search')}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {searchLoading ? (
              <div className="text-sm text-muted-foreground">
                {t('common.loading')}
              </div>
            ) : searchError ? (
              <div className="text-sm text-destructive break-all">
                {searchError}
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                {t('common.no_data')}
              </div>
            ) : (
              searchResults.map((result, index) => (
                <Item
                  key={`${result.id || index}`}
                  variant="outline"
                  className=""
                >
                  <ItemContent className="w-full gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <ItemTitle className="text-sm break-all">
                        {String(result.itemId || result.id || '-')}
                      </ItemTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          score: {formatSearchScore(result.score)}
                        </Badge>
                        {result.rerankScore && (
                          <Badge variant="secondary">
                            score: {formatSearchScore(result.rerankScore)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <pre className="bg-secondary rounded-md p-2 text-xs whitespace-pre-wrap break-all">
                      {formatSearchResult(result)}
                    </pre>
                  </ItemContent>
                </Item>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
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
              {selectedItem?.sourceType === KnowledgeBaseSourceType.Web && (
                <Button
                  variant="link"
                  onClick={() => {
                    window.open(selectedItem?.source?.url, '_blank');
                  }}
                >
                  {selectedItem?.source?.url}
                </Button>
              )}
              {selectedItem?.sourceType === KnowledgeBaseSourceType.File &&
                selectedItem?.source && (
                  <Button
                    variant="link"
                    onClick={() => {
                      window.electron.app.openPath(
                        selectedItem?.source as string,
                      );
                    }}
                  >
                    {selectedItem?.source}
                  </Button>
                )}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-2 px-4 pb-4 overflow-y-auto ">
            <div className="text-sm font-medium break-all">
              {selectedItem?.name || selectedItem?.source || '-'}
            </div>
            <Tabs defaultValue="markdown">
              <TabsList>
                <TabsTrigger value="markdown">Markdown</TabsTrigger>
                <TabsTrigger value="text">Text</TabsTrigger>
              </TabsList>
              <TabsContent value="markdown">
                <Streamdown className="bg-secondary p-4 rounded-2xl text-wrap break-all whitespace-pre-wrap text-sm">
                  {selectedItem?.content}
                </Streamdown>
              </TabsContent>
              <TabsContent value="text">
                <pre className="bg-secondary rounded-md p-2 text-xs whitespace-pre-wrap break-all">
                  {selectedItem?.content}
                </pre>
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default KnowledgeBaseDetail;
