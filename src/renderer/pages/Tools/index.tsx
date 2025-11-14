import { useEffect, useState } from 'react';
import { useHeader } from '@/renderer/hooks/use-title';
import { useTranslation } from 'react-i18next';
import ThreadsList from '@/renderer/components/threads-list';

function Tools() {
  const { setTitle } = useHeader();
  const [model, setModel] = useState<string>('');
  const { t } = useTranslation();
  useEffect(() => {
    setTitle(t('common.tools'));
  }, [setTitle, t]);
  return <div className="overflow-auto h-full"></div>;
}

export default Tools;
