import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, SkipForward } from 'lucide-react';
import { AssistantSoulForm } from '@/renderer/components/assistant-soul-form';
import { Button } from '@/renderer/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/renderer/components/ui/card';
import { Spinner } from '@/renderer/components/ui/spinner';
import { useGlobal } from '@/renderer/hooks/use-global';
import {
  AssistantSoulDraft,
  AssistantSoulLibrary,
  AssistantSoulPreset,
  defaultAssistantSoul,
  normalizeAssistantSoulDraft,
  SaveAssistantSoulInput,
} from '@/types/assistant-soul';

interface SetupStepProps {
  onNext: () => void;
  onBack?: () => void;
  onSkip?: () => void;
}

function PersonalityStep({ onNext, onBack, onSkip }: SetupStepProps) {
  const { t } = useTranslation();
  const { appInfo, getAppInfo } = useGlobal();
  const [saving, setSaving] = useState(false);
  const [presets, setPresets] = useState<AssistantSoulPreset[]>([]);
  const [soul, setSoul] = useState<AssistantSoulDraft>(
    normalizeAssistantSoulDraft(appInfo?.assistantSoul),
  );

  const applyLibrary = (library: AssistantSoulLibrary) => {
    setPresets(library.assistants);
    const activeAssistant = library.assistants.find(
      (assistant) => assistant.id === library.activeId,
    );
    setSoul(
      normalizeAssistantSoulDraft(
        activeAssistant
          ? {
              enabled: library.enabled,
              presetId: activeAssistant.id,
              name: activeAssistant.name,
              title: activeAssistant.title,
              titleKey: activeAssistant.titleKey,
              description: activeAssistant.description,
              descriptionKey: activeAssistant.descriptionKey,
              avatarPath: activeAssistant.avatarPath,
              avatarFilePath: activeAssistant.avatarFilePath,
              soulPath: activeAssistant.soulPath,
              soulFilePath: activeAssistant.soulFilePath,
              voiceStyle: activeAssistant.voiceStyle,
              content: activeAssistant.content,
            }
          : appInfo?.assistantSoul,
      ),
    );
  };

  useEffect(() => {
    window.electron.app
      .getAssistantSoulLibrary()
      .then(applyLibrary)
      .catch((err: any) =>
        toast.error(err.message || t('setup.personality.load_error')),
      );
  }, [appInfo?.assistantSoul]);

  const buildSaveInput = (
    nextSoul: AssistantSoulDraft,
  ): SaveAssistantSoulInput => ({
    enabled: nextSoul.enabled,
    activeId: nextSoul.presetId,
    assistant:
      nextSoul.presetId || nextSoul.content || nextSoul.name
        ? {
            id: nextSoul.presetId,
            name: nextSoul.name,
            title: nextSoul.title,
            titleKey: nextSoul.titleKey,
            description: nextSoul.description,
            descriptionKey: nextSoul.descriptionKey,
            avatarSourcePath: nextSoul.avatarSourcePath,
            content: nextSoul.content,
          }
        : undefined,
  });

  const saveSoul = async (nextSoul: AssistantSoulDraft) => {
    setSaving(true);
    try {
      const library = await window.electron.app.saveAssistantSoul(
        buildSaveInput(normalizeAssistantSoulDraft(nextSoul)),
      );
      applyLibrary(library);
      await getAppInfo();
      toast.success(t('setup.personality.saved_success'));
      onNext();
    } catch (err: any) {
      toast.error(err.message || t('setup.personality.saved_error'));
    } finally {
      setSaving(false);
    }
  };

  const skipSoul = async () => {
    await saveSoul({ ...defaultAssistantSoul });
  };

  return (
    <Card className="border-0 shadow-2xl bg-card/80 backdrop-blur-sm">
      <CardHeader className="text-center pb-4">
        <CardTitle className="text-2xl font-bold">
          {t('setup.personality.title')}
        </CardTitle>
        <CardDescription className="text-base">
          {t('setup.personality.description')}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <AssistantSoulForm value={soul} presets={presets} onChange={setSoul} />
      </CardContent>

      <CardFooter className="flex justify-between pt-6 border-t">
        <Button variant="ghost" onClick={onBack} disabled={!onBack || saving}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('common.back')}
        </Button>
        <div className="flex gap-2">
          {onSkip && (
            <Button variant="ghost" onClick={skipSoul} disabled={saving}>
              {t('common.skip')}
              <SkipForward className="w-4 h-4 ml-2" />
            </Button>
          )}
          <Button onClick={() => saveSoul(soul)} disabled={saving}>
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

export default PersonalityStep;
