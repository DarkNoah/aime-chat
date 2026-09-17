import { useId, useState } from 'react';
import type { ToolUIPart } from 'ai';
import { useTranslation } from 'react-i18next';
import { isObject } from '@/utils/is';
import { toFileUrl } from '../chat-filesystem/file-workspace-utils';

type VoiceItem = {
  id: string;
  audioPath: string;
  text: string;
};

function isVoiceItem(value: unknown): value is VoiceItem {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.audioPath === 'string' &&
    value.audioPath.trim().length > 0 &&
    typeof value.text === 'string'
  );
}

function VoicePreview({ voice }: { voice: VoiceItem }) {
  const { t } = useTranslation();
  const transcriptId = useId();
  const [failed, setFailed] = useState(false);

  return (
    <li className="flex min-w-0 flex-col gap-3 p-3">
      <div className="break-words text-sm font-medium text-foreground">
        {voice.id}
      </div>
      {failed ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t('chat.speech_audio_unavailable')}
          <span className="mt-1 block break-all text-xs">
            {voice.audioPath}
          </span>
        </p>
      ) : (
        <audio
          src={toFileUrl(voice.audioPath)}
          controls
          preload="none"
          aria-label={t('chat.voice_preview', { name: voice.id })}
          aria-describedby={voice.text ? transcriptId : undefined}
          className="w-full min-w-0 [color-scheme:light] dark:[color-scheme:dark]"
          onError={() => setFailed(true)}
        >
          <track kind="captions" />
        </audio>
      )}
      {voice.text ? (
        <p
          id={transcriptId}
          className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground"
        >
          {voice.text}
        </p>
      ) : null}
    </li>
  );
}

export function ListVoicesMessage({ part }: { part: ToolUIPart }) {
  const { t } = useTranslation();
  const output = part?.output;

  if (
    part?.state !== 'output-available' ||
    !isObject(output) ||
    !Array.isArray(output.voices)
  ) {
    return null;
  }

  const voices = output.voices.filter(isVoiceItem);
  const voicesPath =
    typeof output.voicesPath === 'string' ? output.voicesPath : '';
  const label = t('chat.voices_count', { count: voices.length });

  return (
    <div className="w-full min-w-0 max-w-[560px] overflow-hidden rounded-md border bg-secondary">
      <div className="border-b px-3 py-2 text-sm font-medium text-foreground">
        {label}
      </div>
      {voices.length > 0 ? (
        <ul
          aria-label={label}
          className="m-0 max-h-[420px] list-none divide-y divide-border overflow-y-auto p-0"
        >
          {voices.map((voice) => (
            <VoicePreview
              key={`${voice.id}-${voice.audioPath}`}
              voice={voice}
            />
          ))}
        </ul>
      ) : (
        <p role="status" className="p-3 text-sm text-muted-foreground">
          {t('chat.voices_empty')}
        </p>
      )}
      {voicesPath ? (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          <span className="block">{t('chat.voices_directory')}</span>
          <span className="block break-all">{voicesPath}</span>
        </p>
      ) : null}
    </div>
  );
}
