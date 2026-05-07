import { useTranslation } from 'react-i18next';
import {
  AssistantSoulDraft,
  AssistantSoulPreset,
  normalizeAssistantSoulDraft,
} from '@/types/assistant-soul';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { cn } from '../lib/utils';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Plus, Upload } from 'lucide-react';

const toFileUrl = (filePath: string | undefined) => {
  if (!filePath) {
    return undefined;
  }
  const fullPath = filePath.replace(/\\/g, '/');
  return `file://${fullPath.startsWith('/') ? '' : '/'}${fullPath}`;
};

const createLocalAssistantId = () => `custom-${Date.now()}`;

const createDefaultSoul = (name: string) => `# SOUL.md

You are ${name || 'Assistant'}, a personalized assistant configured by the user.

## Core Truths

- Help the user make steady progress.
- Be clear about assumptions, risks, and next steps.
- Adapt your tone to the user's stated preferences.

## Boundaries

- Do not pretend certainty when information is missing.
- Ask before destructive or externally visible actions.

## Vibe

Describe the assistant's tone and working style here.

## Continuity

Carry forward the user's durable preferences and project context.
`;

export function AssistantSoulForm({
  value,
  presets,
  onChange,
  className,
}: {
  value: AssistantSoulDraft;
  presets: AssistantSoulPreset[];
  onChange: (value: AssistantSoulDraft) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const soul = normalizeAssistantSoulDraft(value);
  const selectedPreset = presets.find((preset) => preset.id === soul.presetId);

  const update = (next: Partial<AssistantSoulDraft>) => {
    onChange(normalizeAssistantSoulDraft({ ...soul, ...next }));
  };

  const selectPreset = (preset: AssistantSoulPreset) => {
    onChange({
      enabled: true,
      presetId: preset.id,
      name: preset.name,
      title: preset.title,
      titleKey: preset.titleKey,
      description: preset.description,
      descriptionKey: preset.descriptionKey,
      avatarPath: preset.avatarPath,
      avatarFilePath: preset.avatarFilePath,
      soulPath: preset.soulPath,
      soulFilePath: preset.soulFilePath,
      voicePath: preset.voicePath,
      voiceFilePath: preset.voiceFilePath,
      voice: preset.voice,
      content: preset.content,
    });
  };

  const createAssistant = () => {
    const name = t('settings.personality_new_default_name');
    onChange({
      enabled: true,
      presetId: createLocalAssistantId(),
      name,
      title: t('settings.personality_custom_title'),
      description: t('settings.personality_custom_description'),
      content: createDefaultSoul(name),
    });
  };

  const displayTitle = (preset: AssistantSoulPreset) =>
    preset.titleKey ? t(preset.titleKey) : preset.title || '';

  const displayDescription = (preset: AssistantSoulPreset) =>
    preset.descriptionKey ? t(preset.descriptionKey) : preset.description || '';

  return (
    <div className={cn('space-y-6', className)}>
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-1">
          <Label className="text-sm font-medium">
            {t('settings.personality_enable')}
          </Label>
          <p className="text-sm text-muted-foreground">
            {t('settings.personality_enable_description')}
          </p>
        </div>
        <Switch
          checked={soul.enabled}
          onCheckedChange={(enabled) => update({ enabled })}
        />
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">
            {t('settings.personality_presets')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t('settings.personality_presets_description')}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {presets.map((preset) => (
            <Card
              key={preset.id}
              role="button"
              tabIndex={0}
              className={cn(
                'cursor-pointer transition-colors hover:border-primary',
                soul.presetId === preset.id && 'border-primary bg-primary/5',
              )}
              onClick={() => selectPreset(preset)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  selectPreset(preset);
                }
              }}
            >
              <CardHeader className="flex flex-row items-center gap-3 p-4 pb-2">
                {preset.avatarFilePath && (
                  <img
                    src={toFileUrl(preset.avatarFilePath)}
                    alt=""
                    className="h-10 w-10 rounded-lg border object-cover"
                  />
                )}
                <div className="min-w-0">
                  <CardTitle className="text-sm">{preset.name}</CardTitle>
                  <p className="truncate text-xs text-muted-foreground">
                    {displayTitle(preset)}
                  </p>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 text-sm text-muted-foreground">
                {displayDescription(preset)}
              </CardContent>
            </Card>
          ))}
          <Button
            type="button"
            variant="outline"
            className="h-full min-h-[112px] justify-start gap-3 p-4"
            onClick={createAssistant}
          >
            <Plus className="h-4 w-4" />
            <span className="text-left">
              <span className="block text-sm font-medium">
                {t('settings.personality_new')}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t('settings.personality_new_description')}
              </span>
            </span>
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t('settings.personality_name')}
            </Label>
            <Input
              value={soul.name ?? selectedPreset?.name ?? ''}
              disabled={!soul.enabled}
              placeholder={t('settings.personality_name_placeholder')}
              onChange={(event) =>
                update({
                  name: event.target.value,
                  title:
                    soul.titleKey || selectedPreset?.titleKey
                      ? soul.title
                      : event.target.value,
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t('settings.personality_avatar')}
            </Label>
            <Button
              type="button"
              variant="outline"
              className="w-full md:w-auto"
              disabled={!soul.enabled}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*,.svg';
                input.onchange = () => {
                  const file = input.files?.[0];
                  if (!file) return;
                  const filePath = window.electron.app.getPathForFile(file);
                  update({
                    avatarSourcePath: filePath,
                    avatarFilePath: filePath,
                  });
                };
                input.click();
              }}
            >
              <Upload className="mr-2 h-4 w-4" />
              {t('settings.personality_avatar_upload')}
            </Button>
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium">
            {t('settings.personality_markdown')}
          </Label>
          <p className="text-sm text-muted-foreground">
            {t('settings.personality_markdown_description')}
          </p>
        </div>
        <Textarea
          value={soul.content}
          disabled={!soul.enabled}
          className="min-h-[260px] font-mono text-sm"
          placeholder={t('settings.personality_placeholder')}
          onChange={(event) =>
            update({
              content: event.target.value,
              presetId:
                event.target.value === selectedPreset?.content
                  ? soul.presetId
                  : soul.presetId,
            })
          }
        />
      </div>
    </div>
  );
}
