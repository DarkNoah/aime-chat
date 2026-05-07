import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
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
  SaveAssistantSoulInput,
} from '@/types/assistant-soul';

export default function Personality() {
  const { t } = useTranslation();
  const { appInfo, getAppInfo } = useGlobal();
  const { setTitle } = useHeader();
  const [presets, setPresets] = useState<AssistantSoulPreset[]>([]);
  const [soul, setSoul] = useState<AssistantSoulDraft>(
    normalizeAssistantSoulDraft(appInfo?.assistantSoul),
  );
  const [saving, setSaving] = useState(false);

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
              voicePath: activeAssistant.voicePath,
              voiceFilePath: activeAssistant.voiceFilePath,
              voice: activeAssistant.voice,
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
        toast.error(err.message || t('settings.personality_load_error')),
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
            voice: nextSoul.voice,
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
      toast.success(t('settings.personality_saved'));
    } catch (err: any) {
      toast.error(err.message || t('settings.personality_save_error'));
    } finally {
      setSaving(false);
    }
  };

  const clearSoul = async () => {
    const nextSoul = {
      ...defaultAssistantSoul,
      presetId: soul.presetId,
      name: soul.name,
      content: '',
    };
    setSoul(nextSoul);
    await saveSoul(nextSoul);
  };

  return (
    <FieldGroup className="p-4 overflow-y-auto">
      <div className="max-w-4xl space-y-6">
        <div>
          <h2 className="text-lg font-semibold">
            {t('settings.personality_title')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('settings.personality_description')}
          </p>
        </div>

        <AssistantSoulForm value={soul} presets={presets} onChange={setSoul} />

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={clearSoul} disabled={saving}>
            {t('settings.personality_clear')}
          </Button>
          <Button onClick={() => saveSoul(soul)} disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </div>
    </FieldGroup>
  );
}
