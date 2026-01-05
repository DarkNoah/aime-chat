import { ChatModelSelect } from '@/renderer/components/chat-ui/chat-model-select';
import { Badge } from '@/renderer/components/ui/badge';
import { Button } from '@/renderer/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/renderer/components/ui/dialog';
import { Input } from '@/renderer/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupTextarea,
} from '@/renderer/components/ui/input-group';
import { Item, ItemContent, ItemHeader } from '@/renderer/components/ui/item';
import { Label } from '@/renderer/components/ui/label';
import { useHeader } from '@/renderer/hooks/use-title';
import { KnowledgeBase, KnowledgeBaseSourceType } from '@/types/knowledge-base';
import { ModelType } from '@/types/provider';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/renderer/components/ui/form';
import {
  IconFile,
  IconNetwork,
  IconSearch,
  IconTextCaption,
} from '@tabler/icons-react';
import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { Field, FieldContent } from '@/renderer/components/ui/field';
import { Textarea } from '@/renderer/components/ui/textarea';

const importSourceWebSchema = z.object({
  url: z.string(),
});
const importSourceTextSchema = z.object({
  content: z.string(),
});
function KnowledgeBaseDetail() {
  const { setTitle } = useHeader();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const getData = async () => {
    const data = await window.electron.knowledgeBase.get(id);
    setKb(data);
    setTitle(data?.name || '');
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

  const handleSubmit = (data: any, type: KnowledgeBaseSourceType) => {
    // const url = formData.get('url') as string;
    console.log(data);
    window.electron.knowledgeBase.importSource({
      kbId: id,
      source: data,
      type,
    });
  };

  return (
    <div className="p-4 flex flex-col gap-2">
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
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{t('knowledge-base.add_files')}</DialogTitle>
            </DialogHeader>
            <Form {...textForm}>
              <form
                onSubmit={textForm.handleSubmit((data) =>
                  handleSubmit(data, KnowledgeBaseSourceType.Text),
                )}
              >
                <div className="grid gap-4">
                  <div className="grid gap-3">
                    <FormField
                      control={textForm.control}
                      name="content"
                      rules={{ required: t('common.required') as string }}
                      render={({ field }) => (
                        <Field>
                          <FieldContent className="flex flex-row items-center gap-2 ">
                            <Textarea id="content" name="content" {...field} />
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
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput placeholder={t('common.search')} />
        </InputGroup>
      </div>
    </div>
  );
}

export default KnowledgeBaseDetail;
