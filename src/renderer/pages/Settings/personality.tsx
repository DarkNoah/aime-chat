import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { AssistantSoulForm } from '@/renderer/components/assistant-soul-form';
import { Button } from '@/renderer/components/ui/button';
import { FieldGroup } from '@/renderer/components/ui/field';
import { useGlobal } from '@/renderer/hooks/use-global';
import { useHeader } from '@/renderer/hooks/use-title';
import {
  AssistantSoulDraft,
  AssistantSoulLibrary,
  AssistantSoulPreset,
  defaultAssistantSoul,
  normalizeAssistantSoulDraft,
} from '@/types/assistant-soul';

export default function Personality() {
  const { t } = useTranslation();
  const { appInfo, getAppInfo } = useGlobal();
  const { setTitle } = useHeader();
  const [presets, setPresets] = useState<AssistantSoulPreset[]>([]);
  const [soul, setSoul] = useState<AssistantSoulDraft>(
    normalizeAssistantSoulDraft(appInfo?.assistantSoul),
  );
  const [syncing, setSyncing] = useState(false);
  const contentSaveChainRef = useRef(Promise.resolve());
  const latestContentRef = useRef('');

  useEffect(() => {
    setTitle(t('settings.personality'));
  }, [setTitle, t]);

  const applyLibrary = (library: AssistantSoulLibrary) => {
    setPresets(library.assistants);
    const activeAssistant = library.assistants.find(
      (assistant) => assistant.id === library.activeId,
    );

    setSoul(
      normalizeAssistantSoulDraft(
        library.enabled && activeAssistant
          ? {
              enabled: true,
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
          : defaultAssistantSoul,
      ),
    );
  };

  useEffect(() => {
    window.electron.app
      .getAssistantSoulLibrary()
      .then(applyLibrary)
      .catch((err: any) =>
        toast.error(err.message || t('settings.personality_load_error')),
      );
  }, []);

  const selectPreset = async (preset: AssistantSoulPreset) => {
    setSyncing(true);
    try {
      const library = await window.electron.app.saveAssistantSoul({
        enabled: true,
        activeId: preset.id,
      });
      applyLibrary(library);
      await getAppInfo();
    } catch (err: any) {
      toast.error(err.message || t('settings.personality_save_error'));
    } finally {
      setSyncing(false);
    }
  };

  const disablePersonality = async () => {
    setSyncing(true);
    try {
      const library = await window.electron.app.saveAssistantSoul({
        enabled: false,
      });
      applyLibrary(library);
      await getAppInfo();
    } catch (err: any) {
      toast.error(err.message || t('settings.personality_save_error'));
    } finally {
      setSyncing(false);
    }
  };

  const saveContent = async (content: string) => {
    if (!soul.presetId) return;
    const activeId = soul.presetId;
    latestContentRef.current = content;
    setSyncing(true);
    contentSaveChainRef.current = contentSaveChainRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          const library = await window.electron.app.saveAssistantSoul({
            enabled: true,
            activeId,
            assistant: {
              id: activeId,
              content,
            },
          });
          if (latestContentRef.current === content) {
            applyLibrary(library);
            await getAppInfo();
          }
        } catch (err: any) {
          toast.error(err.message || t('settings.personality_save_error'));
        } finally {
          if (latestContentRef.current === content) {
            setSyncing(false);
          }
        }
      });
  };

  const resetCurrent = async () => {
    if (!soul.presetId) return;
    setSyncing(true);
    try {
      const library = await window.electron.app.resetAssistantSoul(soul.presetId);
      applyLibrary(library);
      await getAppInfo();
      toast.success(t('settings.personality_reset_success'));
    } catch (err: any) {
      toast.error(err.message || t('settings.personality_reset_error'));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <FieldGroup className="p-4 overflow-y-auto">
      <div className="max-w-4xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              {t('settings.personality_title')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('settings.personality_description')}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={resetCurrent}
            disabled={syncing || !soul.enabled || !soul.presetId}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {t('settings.personality_reset')}
          </Button>
        </div>

        <AssistantSoulForm
          value={soul}
          presets={presets}
          onChange={setSoul}
          onSelectPreset={selectPreset}
          onDisable={disablePersonality}
          onContentChange={saveContent}
        />
      </div>
    </FieldGroup>
  );
}
