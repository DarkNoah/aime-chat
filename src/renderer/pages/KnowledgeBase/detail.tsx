import { ChatModelSelect } from '@/renderer/components/chat-ui/chat-model-select';
import { Badge } from '@/renderer/components/ui/badge';
import { Button } from '@/renderer/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupTextarea,
} from '@/renderer/components/ui/input-group';
import { useHeader } from '@/renderer/hooks/use-title';
import { KnowledgeBase } from '@/types/knowledge-base';
import { ModelType } from '@/types/provider';
import { IconSearch } from '@tabler/icons-react';
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
    <div className="p-4">
      <div className="flex flex-row justify-between items-center">
        <Badge variant="outline">{kb?.embedding.split('/').pop()}</Badge>
        <div className="flex flex-row gap-2 items-center">
          <InputGroup>
            <InputGroupAddon>
              <IconSearch />
            </InputGroupAddon>
            <InputGroupInput placeholder={t('common.search')} />
          </InputGroup>
          <Button variant="outline">{t('common.add')}</Button>
        </div>
      </div>
    </div>
  );
}

export default KnowledgeBaseDetail;
