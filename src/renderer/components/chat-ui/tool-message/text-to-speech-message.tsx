import { useEffect, useId, useState } from 'react';
import type { ToolUIPart } from 'ai';
import { useTranslation } from 'react-i18next';
import type { FileInfo } from '@/types/common';
import { splitContextAndFiles } from '@/utils/context-utils';
import { Item, ItemContent } from '../../ui/item';
import { toFileUrl } from '../chat-filesystem/file-workspace-utils';

function SpeechAudio({
  output,
  transcriptId,
}: {
  output: string;
  transcriptId?: string;
}) {
  const { t } = useTranslation();
  const [file, setFile] = useState<FileInfo | null>(null);
  const [status, setStatus] = useState<
    'loading' | 'ready' | 'missing' | 'error'
  >('loading');

  useEffect(() => {
    let cancelled = false;

    const loadAudio = async () => {
      try {
        const { attachments } = await splitContextAndFiles(output);
        const audio = attachments.find(
          (attachment) =>
            attachment?.path &&
            attachment.isFile !== false &&
            (attachment.mimeType?.startsWith('audio/') ||
              /\.wav$/i.test(attachment.path)),
        );
        if (!cancelled) {
          setFile(audio ?? null);
          if (!audio) setStatus('error');
          else if (!audio.isExist) setStatus('missing');
          else setStatus('ready');
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    };

    loadAudio();
    return () => {
      cancelled = true;
    };
  }, [output]);

  if (status !== 'ready') {
    const messages = {
      loading: 'common.loading',
      missing: 'chat.speech_audio_missing',
      error: 'chat.speech_audio_unavailable',
    };
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t(messages[status])}
        {file?.path ? (
          <span className="mt-1 block break-all text-xs">{file.path}</span>
        ) : null}
      </p>
    );
  }

  return (
    <audio
      src={toFileUrl(file.path)}
      controls
      preload="metadata"
      aria-label={file.name || t('tool_name.texttospeech')}
      aria-describedby={transcriptId}
      className="w-full min-w-0 [color-scheme:light] dark:[color-scheme:dark]"
      onError={() => setStatus('error')}
    >
      <track kind="captions" />
    </audio>
  );
}

export function TextToSpeechMessage({ part }: { part: ToolUIPart }) {
  const transcriptId = useId();
  const input = part?.input as { text?: unknown } | undefined;
  const text = typeof input?.text === 'string' ? input.text : '';
  const output =
    part?.state === 'output-available' && typeof part.output === 'string'
      ? part.output
      : undefined;

  if (
    output === 'Tool call was not approved by the user' ||
    (!text && !output)
  ) {
    return null;
  }

  return (
    <Item
      variant="outline"
      className="w-full min-w-0 max-w-[520px] bg-secondary p-3"
    >
      <ItemContent className="min-w-0 gap-3">
        {output ? (
          <SpeechAudio
            key={`${part.toolCallId}-${output}`}
            output={output}
            transcriptId={text ? transcriptId : undefined}
          />
        ) : null}
        {text ? (
          <p
            id={transcriptId}
            className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground"
          >
            {text}
          </p>
        ) : null}
      </ItemContent>
    </Item>
  );
}
