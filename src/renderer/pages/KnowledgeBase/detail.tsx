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
import { KnowledgeBase } from '@/types/knowledge-base';
import { ModelType } from '@/types/provider';
import {
  IconFile,
  IconNetwork,
  IconSearch,
  IconTextCaption,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

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

  useEffect(() => {
    getData();
  }, [id]);

  return (
    <div className="p-4 flex flex-col gap-2">
      <div className="flex flex-row gap-2">
        <Dialog>
          <form>
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
              <div className="grid gap-4">
                <div className="grid gap-3">
                  <Label htmlFor="url">URL</Label>
                  <Input
                    id="url"
                    name="url"
                    placeholder="https://example.com"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">{t('common.submit')}</Button>
              </DialogFooter>
            </DialogContent>
          </form>
        </Dialog>

        <Item variant="outline">
          <ItemHeader>
            <IconFile></IconFile>
          </ItemHeader>
          <ItemContent>{t('knowledge-base.add_files')}</ItemContent>
        </Item>
        <Item variant="outline">
          <ItemHeader>
            <IconTextCaption></IconTextCaption>
          </ItemHeader>
          <ItemContent>{t('knowledge-base.add_text')}</ItemContent>
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
