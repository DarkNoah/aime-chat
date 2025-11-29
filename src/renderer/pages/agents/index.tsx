'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/renderer/components/ui/button';
import { Progress } from '@/renderer/components/ui/progress';
import { CircleCheckIcon, Loader2Icon } from 'lucide-react';
import { useHeader } from '@/renderer/hooks/use-title';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

function AgentPage() {
  const { setTitle } = useHeader();
  const [isRunning, setIsRunning] = useState(false);
  const { t } = useTranslation();
  useEffect(() => {
    setTitle(t('sidebar.agents'));
  }, [setTitle, t]);

  const handleStart = () => {
    // window.electron.app.toast('开始同步', { type: 'success' });
  };

  return <div className="flex h-full flex-col gap-4 p-6"></div>;
}

export default AgentPage;
