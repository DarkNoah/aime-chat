import { useTranslation } from 'react-i18next';
import {
  AssistantSoulDraft,
  AssistantSoulPreset,
  normalizeAssistantSoulDraft,
} from '@/types/assistant-soul';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { cn } from '../lib/utils';

const toFileUrl = (filePath?: string) =>
  filePath
    ? `file://${filePath.replaceAll('\\', '/')}?v=${Date.now()}`
    : undefined;

export function AssistantSoulForm({
  value,
  presets,
  onChange,
  onSelectPreset,
  onDisable,
  onContentChange,
  className,
}: {
  value: AssistantSoulDraft;
  presets: AssistantSoulPreset[];
  onChange: (value: AssistantSoulDraft) => void;
  onSelectPreset?: (preset: AssistantSoulPreset) => void;
  onDisable?: () => void;
  onContentChange?: (content: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const soul = normalizeAssistantSoulDraft(value);
  const selectedPreset = presets.find((preset) => preset.id === soul.presetId);

  const selectPreset = (preset: AssistantSoulPreset) => {
    const nextSoul = normalizeAssistantSoulDraft({
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
      voiceStyle: preset.voiceStyle,
      content: preset.content,
    });
    onChange(nextSoul);
    onSelectPreset?.(preset);
  };

  const disablePersonality = () => {
    onChange(
      normalizeAssistantSoulDraft({
        enabled: false,
        presetId: undefined,
        content: '',
      }),
    );
    onDisable?.();
  };

  const changeContent = (content: string) => {
    onChange(
      normalizeAssistantSoulDraft({
        ...soul,
        content,
      }),
    );
    onContentChange?.(content);
  };

  const displayTitle = (preset: AssistantSoulPreset) =>
    preset.titleKey ? t(preset.titleKey) : preset.title || preset.name;

  const displayDescription = (preset: AssistantSoulPreset) =>
    preset.descriptionKey ? t(preset.descriptionKey) : preset.description || '';

  const displayVoiceStyle = (preset?: AssistantSoulPreset) =>
    preset?.voiceStyle?.trim() || '';

  const renderAvatar = (preset: AssistantSoulPreset) => {
    const avatarUrl = toFileUrl(preset.avatarFilePath);
    if (avatarUrl) {
      return (
        <img
          src={avatarUrl}
          alt={preset.name}
          className="h-12 w-12 shrink-0 rounded-lg object-cover"
        />
      );
    }

    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground">
        {preset.name.slice(0, 2).toUpperCase()}
      </div>
    );
  };

  return (
    <div className={cn('space-y-6', className)}>
      <div className="space-y-3">
        {/* <div>
          <h3 className="text-sm font-medium">
            {t('settings.personality_presets')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t('settings.personality_presets_description')}
          </p>
        </div> */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card
            role="button"
            tabIndex={0}
            className={cn(
              'cursor-pointer transition-colors hover:border-primary',
              !soul.enabled && 'border-primary bg-primary/5',
            )}
            onClick={disablePersonality}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                disablePersonality();
              }
            }}
          >
            <CardHeader>
              <CardTitle className="text-sm">
                {t('settings.personality_none')}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 text-sm text-muted-foreground">
              {t('settings.personality_none_description')}
            </CardContent>
          </Card>

          {presets.map((preset) => (
            <Card
              key={preset.id}
              role="button"
              tabIndex={0}
              className={cn(
                'cursor-pointer transition-colors gap-0 hover:border-primary h-fit',
                soul.enabled &&
                  soul.presetId === preset.id &&
                  'border-primary bg-primary/5',
              )}
              onClick={() => selectPreset(preset)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  selectPreset(preset);
                }
              }}
            >
              <CardHeader className="flex-row items-start">
                <CardTitle className="text-sm flex items-center gap-2">
                  {renderAvatar(preset)}
                  {preset.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 px-4 text-sm text-muted-foreground">
                <p className="line-clamp-2">{displayDescription(preset)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {soul.enabled && (
        <div className="space-y-3">
          <div>
            <Label className="text-sm font-medium">
              {t('settings.personality_markdown')}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t('settings.personality_markdown_description')}
            </p>
          </div>
          <Textarea
            value={soul.enabled ? soul.content : ''}
            disabled={!soul.enabled || !selectedPreset}
            className="min-h-[320px] font-mono text-sm"
            placeholder={t('settings.personality_placeholder')}
            onChange={(event) => changeContent(event.target.value)}
          />
        </div>
      )}
    </div>
  );
}
