import React, { useState, useEffect } from 'react';
import { Button } from '@/renderer/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/renderer/components/ui/card';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  SkipForward,
  Check,
  Zap,
  Brain,
} from 'lucide-react';
import { ChatModelSelect } from '@/renderer/components/chat-ui/chat-model-select';
import { Spinner } from '@/renderer/components/ui/spinner';
import { useGlobal } from '@/renderer/hooks/use-global';
import toast from 'react-hot-toast';

interface SetupStepProps {
  onNext: () => void;
  onBack?: () => void;
  onSkip?: () => void;
}

function ModelStep({ onNext, onBack, onSkip }: SetupStepProps) {
  const { t } = useTranslation();
  const { appInfo, getAppInfo } = useGlobal();
  const [saving, setSaving] = useState(false);
  const [fastModel, setFastModel] = useState<string | undefined>(
    appInfo?.defaultModel?.fastModel,
  );
  const [model, setModel] = useState<string | undefined>(
    appInfo?.defaultModel?.model,
  );

  useEffect(() => {
    if (appInfo?.defaultModel) {
      setFastModel(appInfo.defaultModel.fastModel);
      setModel(appInfo.defaultModel.model);
    }
  }, [appInfo]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.electron.app.saveSettings({
        id: 'defaultModel',
        value: {
          ...appInfo?.defaultModel,
          fastModel,
          model,
        },
      });
      await getAppInfo();
      toast.success(t('setup.model.saved_success'));
      onNext();
    } catch (err: any) {
      toast.error(err.message || t('setup.model.saved_error'));
    } finally {
      setSaving(false);
    }
  };

  const hasModelsSelected = fastModel || model;

  return (
    <Card className="border-0 shadow-2xl bg-card/80 backdrop-blur-sm">
      <CardHeader className="text-center pb-4">
        <CardTitle className="text-2xl font-bold">
          {t('setup.model.title')}
        </CardTitle>
        <CardDescription className="text-base">
          {t('setup.model.description')}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Fast Model Selection */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-500/10 text-amber-500">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-medium">{t('setup.model.fast_model')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('setup.model.fast_model_desc')}
              </p>
            </div>
          </div>
          <ChatModelSelect
            className="w-full border"
            value={fastModel}
            onChange={setFastModel}
          />
        </div>

        {/* Default Model Selection */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-medium">{t('setup.model.default_model')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('setup.model.default_model_desc')}
              </p>
            </div>
          </div>
          <ChatModelSelect
            className="w-full border"
            value={model}
            onChange={setModel}
          />
        </div>

        {/* Info Box */}
        <div className="p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground">
          <p>{t('setup.model.tip')}</p>
        </div>
      </CardContent>

      <CardFooter className="flex justify-between pt-6 border-t">
        <Button variant="ghost" onClick={onBack} disabled={!onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('common.back')}
        </Button>
        <div className="flex gap-2">
          {onSkip && (
            <Button variant="ghost" onClick={onSkip}>
              {t('common.skip')}
              <SkipForward className="w-4 h-4 ml-2" />
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Spinner className="w-4 h-4 mr-2" />
                {t('common.saving')}
              </>
            ) : (
              <>
                {t('common.next')}
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

export default ModelStep;
