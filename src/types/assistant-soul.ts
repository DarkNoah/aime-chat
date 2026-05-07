export type AssistantSoulSettings = {
  enabled: boolean;
  presetId?: string;
  content: string;
};

export type AssistantSoulDraft = AssistantSoulSettings & {
  name?: string;
  title?: string;
  titleKey?: string;
  description?: string;
  descriptionKey?: string;
  avatarPath?: string;
  avatarFilePath?: string;
  avatarSourcePath?: string;
  soulPath?: string;
  soulFilePath?: string;
  voicePath?: string;
  voiceFilePath?: string;
  voice?: AssistantVoicePreset;
};

export type AssistantVoicePreset = {
  id: string;
  label: string;
  style: string;
  speed?: number;
  pitch?: number;
};

export type AssistantSoulPreset = {
  id: string;
  name: string;
  title?: string;
  titleKey?: string;
  description?: string;
  descriptionKey?: string;
  avatarPath?: string;
  avatarFilePath?: string;
  soulPath?: string;
  soulFilePath?: string;
  voicePath?: string;
  voiceFilePath?: string;
  voice?: AssistantVoicePreset;
  content: string;
};

export type AssistantSoulLibrary = {
  enabled: boolean;
  activeId?: string;
  directory?: string;
  assistants: AssistantSoulPreset[];
};

export type SaveAssistantSoulInput = {
  enabled: boolean;
  activeId?: string;
  assistant?: Partial<AssistantSoulPreset> & {
    id?: string;
    name?: string;
    avatarSourcePath?: string;
    content?: string;
  };
};

export const defaultAssistantSoul: AssistantSoulSettings = {
  enabled: false,
  presetId: undefined,
  content: '',
};

export const normalizeAssistantSoul = (
  value?: Partial<AssistantSoulSettings> | null,
): AssistantSoulSettings => ({
  enabled: !!value?.enabled,
  presetId: value?.presetId,
  content: value?.content ?? '',
});

export const normalizeAssistantSoulDraft = (
  value?: Partial<AssistantSoulDraft> | null,
): AssistantSoulDraft => ({
  ...(value ?? {}),
  ...normalizeAssistantSoul(value),
});
