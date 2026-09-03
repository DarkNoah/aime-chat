import type { UIMessage } from 'ai';
import {
  FastForwardIcon,
  HistoryIcon,
  LoaderCircleIcon,
  PauseIcon,
  PlayIcon,
  RewindIcon,
  XIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Slider } from '../ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

export const CHAT_REPLAY_INTERVAL_MS = 1_000;
const EMPTY_REPLAY_MESSAGES: UIMessage[] = [];
export const REPLAY_INTERVAL_OPTIONS = [500, 1_000, 3_000, 5_000];

type ReplayStartResult = 'started' | 'blocked' | 'empty';

type UseChatReplayOptions = {
  threadId?: string;
  liveMessages?: UIMessage[];
  isChatInProgress: boolean;
  loadHistory: () => Promise<UIMessage[]>;
  intervalMs?: number;
};

type ChatReplayButtonProps = {
  disabled: boolean;
  isChatInProgress: boolean;
  isLoading: boolean;
  onStart: (intervalMs: number) => void;
};

type ChatReplayControlsProps = {
  canSlowDown: boolean;
  canSpeedUp: boolean;
  current: number;
  includesCompressedHistory: boolean;
  isComplete: boolean;
  isPlaying: boolean;
  intervalMs: number;
  total: number;
  onExit: () => void;
  onPause: () => void;
  onResume: () => void;
  onSeek: (position: number) => void;
  onSlowDown: () => void;
  onSpeedUp: () => void;
};

export const getAdjacentReplayInterval = (
  currentIntervalMs: number,
  direction: 'faster' | 'slower',
) => {
  if (direction === 'faster') {
    for (
      let index = REPLAY_INTERVAL_OPTIONS.length - 1;
      index >= 0;
      index -= 1
    ) {
      const option = REPLAY_INTERVAL_OPTIONS[index];
      if (option < currentIntervalMs) return option;
    }
  } else {
    for (const option of REPLAY_INTERVAL_OPTIONS) {
      if (option > currentIntervalMs) return option;
    }
  }

  return currentIntervalMs;
};

export const isReplayablePart = (part: any) => {
  if (part.type?.startsWith('tool-')) return true;
  if (part.type === 'file') return true;
  if (part.type === 'reasoning') {
    return typeof part.text === 'string' && part.text.trim().length > 0;
  }
  if (part.type !== 'text' || typeof part.text !== 'string') return false;

  const text = part.text.trim();
  return (
    text.length > 0 &&
    text !== '</attachment>' &&
    !text.startsWith('<system-reminder>')
  );
};

export const isReplayableMessage = (message: UIMessage) =>
  (message.metadata as any)?.systemReminder !== true &&
  message.parts.some(isReplayablePart);

export const buildReplaySequence = (
  historyMessages: UIMessage[],
  liveMessages: UIMessage[],
) => {
  const seen = new Set<string>();

  return [...historyMessages, ...liveMessages].filter((message) => {
    if (seen.has(message.id) || !isReplayableMessage(message)) return false;
    seen.add(message.id);
    return true;
  });
};

type ReplayPartStep = {
  messageIndex: number;
  partIndex: number;
};

export const buildReplayPartSteps = (messages: UIMessage[]) =>
  messages.flatMap((message, messageIndex) =>
    message.parts.flatMap((part, partIndex) =>
      isReplayablePart(part) ? [{ messageIndex, partIndex }] : [],
    ),
  );

export const buildReplaySnapshot = (
  messages: UIMessage[],
  steps: ReplayPartStep[],
  position: number,
) => {
  if (position <= 0 || steps.length === 0) return EMPTY_REPLAY_MESSAGES;

  const activeStepIndex = Math.min(position, steps.length) - 1;
  const lastStep = steps[activeStepIndex];
  const nextStep = steps[activeStepIndex + 1];

  return messages
    .slice(0, lastStep.messageIndex + 1)
    .map((message, messageIndex) => {
      if (messageIndex < lastStep.messageIndex) return message;

      const isLastReplayablePart =
        !nextStep || nextStep.messageIndex !== lastStep.messageIndex;
      return {
        ...message,
        parts: message.parts.slice(
          0,
          isLastReplayablePart ? message.parts.length : lastStep.partIndex + 1,
        ),
      } as UIMessage;
    });
};

export function useChatReplay({
  threadId,
  liveMessages = EMPTY_REPLAY_MESSAGES,
  isChatInProgress,
  loadHistory,
  intervalMs = CHAT_REPLAY_INTERVAL_MS,
}: UseChatReplayOptions) {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [position, setPosition] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [includesCompressedHistory, setIncludesCompressedHistory] =
    useState(false);
  const [playbackIntervalMs, setPlaybackIntervalMs] = useState(intervalMs);
  const requestIdRef = useRef(0);
  const previousThreadIdRef = useRef(threadId);
  const steps = useMemo(() => buildReplayPartSteps(messages), [messages]);
  const total = steps.length;

  const exit = useCallback(() => {
    requestIdRef.current += 1;
    setMessages([]);
    setPosition(0);
    setIsActive(false);
    setIsPlaying(false);
    setIsLoading(false);
    setIncludesCompressedHistory(false);
  }, []);

  const start = useCallback(
    async (selectedIntervalMs = intervalMs): Promise<ReplayStartResult> => {
      if (!threadId || isChatInProgress || isLoading) return 'blocked';

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setIsLoading(true);
      setPlaybackIntervalMs(selectedIntervalMs);

      try {
        const historyMessages = await loadHistory();
        if (requestIdRef.current !== requestId) return 'blocked';

        const replayMessages = buildReplaySequence(
          historyMessages,
          liveMessages,
        );
        const replayPartCount = buildReplayPartSteps(replayMessages).length;
        if (replayPartCount === 0) return 'empty';

        setMessages(replayMessages);
        setPosition(1);
        setIsActive(true);
        setIsPlaying(replayPartCount > 1);
        setIncludesCompressedHistory(historyMessages.some(isReplayableMessage));
        return 'started';
      } finally {
        if (requestIdRef.current === requestId) setIsLoading(false);
      }
    },
    [
      intervalMs,
      isChatInProgress,
      isLoading,
      liveMessages,
      loadHistory,
      threadId,
    ],
  );

  const pause = useCallback(() => setIsPlaying(false), []);

  const slowDown = useCallback(() => {
    setPlaybackIntervalMs((current) =>
      getAdjacentReplayInterval(current, 'slower'),
    );
  }, []);

  const speedUp = useCallback(() => {
    setPlaybackIntervalMs((current) =>
      getAdjacentReplayInterval(current, 'faster'),
    );
  }, []);

  const resume = useCallback(() => {
    if (total <= 1) return;
    setPosition((current) => (current >= total ? 1 : current));
    setIsPlaying(true);
  }, [total]);

  const seek = useCallback(
    (nextPosition: number) => {
      if (total === 0) return;
      const clampedPosition = Math.min(Math.max(nextPosition, 1), total);
      setPosition(clampedPosition);
      if (clampedPosition >= total) setIsPlaying(false);
    },
    [total],
  );

  useEffect(() => {
    if (previousThreadIdRef.current === threadId) return;
    previousThreadIdRef.current = threadId;
    exit();
  }, [exit, threadId]);

  useEffect(() => {
    if (isChatInProgress && (isActive || isLoading)) exit();
  }, [exit, isActive, isChatInProgress, isLoading]);

  useEffect(() => {
    if (!isActive || !isPlaying || position >= total) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const nextPosition = position + 1;
      setPosition(nextPosition);
      if (nextPosition >= total) setIsPlaying(false);
    }, playbackIntervalMs);

    return () => window.clearTimeout(timer);
  }, [isActive, isPlaying, playbackIntervalMs, position, total]);

  const visibleMessages = useMemo(
    () => buildReplaySnapshot(messages, steps, position),
    [messages, position, steps],
  );

  return {
    canSlowDown:
      playbackIntervalMs <
      REPLAY_INTERVAL_OPTIONS[REPLAY_INTERVAL_OPTIONS.length - 1],
    canSpeedUp: playbackIntervalMs > REPLAY_INTERVAL_OPTIONS[0],
    exit,
    includesCompressedHistory,
    intervalMs: playbackIntervalMs,
    isActive,
    isComplete: isActive && position >= total,
    isLoading,
    isPlaying,
    pause,
    position,
    resume,
    seek,
    slowDown,
    speedUp,
    start,
    total,
    visibleMessages,
  };
}

export function ChatReplayButton({
  disabled,
  isChatInProgress,
  isLoading,
  onStart,
}: ChatReplayButtonProps) {
  const { t } = useTranslation();
  const [selectedIntervalMs, setSelectedIntervalMs] = useState(
    CHAT_REPLAY_INTERVAL_MS,
  );
  let label = t('chat.replay_start');
  if (isLoading) {
    label = t('chat.replay_loading');
  } else if (isChatInProgress) {
    label = t('chat.replay_unavailable_while_chatting');
  } else if (disabled) {
    label = t('chat.replay_no_messages');
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={label}
          title={label}
          disabled={disabled || isLoading}
        >
          {isLoading ? (
            <LoaderCircleIcon className="size-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <HistoryIcon className="size-3.5" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('chat.replay_speed_title')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(selectedIntervalMs)}
          onValueChange={(value) => {
            const nextIntervalMs = Number(value);
            setSelectedIntervalMs(nextIntervalMs);
          }}
        >
          {REPLAY_INTERVAL_OPTIONS.map((option) => (
            <DropdownMenuRadioItem
              key={option}
              value={String(option)}
              onSelect={() => onStart(option)}
            >
              {t('chat.replay_interval_option', {
                seconds: option / 1000,
              })}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ChatReplayControls({
  canSlowDown,
  canSpeedUp,
  current,
  includesCompressedHistory,
  isComplete,
  isPlaying,
  intervalMs,
  total,
  onExit,
  onPause,
  onResume,
  onSeek,
  onSlowDown,
  onSpeedUp,
}: ChatReplayControlsProps) {
  const { t } = useTranslation();
  let status = t('chat.replay_paused');
  if (isComplete) {
    status = t('chat.replay_complete');
  } else if (isPlaying) {
    status = t('chat.replay_playing');
  }

  let toggleLabel = t('chat.replay_resume');
  if (isPlaying) {
    toggleLabel = t('chat.replay_pause');
  } else if (isComplete) {
    toggleLabel = t('chat.replay_restart');
  }

  return (
    <section
      className="rounded-lg border bg-background p-2 shadow-sm"
      aria-label={t('chat.replay_controls')}
      data-testid="chat-replay-controls"
    >
      <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <HistoryIcon className="size-3.5 shrink-0 text-primary" />
          <span className="truncate text-xs font-medium">
            {t('chat.replay_title')}
          </span>
          {includesCompressedHistory ? (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
              {t('chat.replay_includes_compressed_history')}
            </Badge>
          ) : null}
        </div>
        <span
          className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
          aria-live="polite"
        >
          {status} · {current}/{total}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label={toggleLabel}
              disabled={total <= 1}
              onClick={isPlaying ? onPause : onResume}
            >
              {isPlaying ? (
                <PauseIcon className="size-3.5" />
              ) : (
                <PlayIcon className="size-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{toggleLabel}</TooltipContent>
        </Tooltip>

        <div
          className="flex shrink-0 items-center gap-0.5"
          role="group"
          aria-label={t('chat.replay_speed_controls')}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={t('chat.replay_slow_down')}
                disabled={!canSlowDown}
                onClick={onSlowDown}
              >
                <RewindIcon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('chat.replay_slow_down')}</TooltipContent>
          </Tooltip>

          <Badge
            variant="secondary"
            className="h-6 min-w-[4.5rem] justify-center px-1.5 text-[10px] tabular-nums"
            aria-live="polite"
            aria-atomic="true"
          >
            {t('chat.replay_interval', {
              seconds: intervalMs / 1000,
            })}
          </Badge>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={t('chat.replay_speed_up')}
                disabled={!canSpeedUp}
                onClick={onSpeedUp}
              >
                <FastForwardIcon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('chat.replay_speed_up')}</TooltipContent>
          </Tooltip>
        </div>

        <Slider
          className="min-w-0 flex-1"
          min={1}
          max={Math.max(total, 1)}
          step={1}
          value={[Math.max(current, 1)]}
          aria-label={t('chat.replay_progress')}
          aria-valuetext={t('chat.replay_progress_value', {
            current,
            total,
          })}
          disabled={total <= 1}
          onValueChange={([value]) => onSeek(value)}
        />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label={t('chat.replay_exit')}
              onClick={onExit}
            >
              <XIcon className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('chat.replay_exit')}</TooltipContent>
        </Tooltip>
      </div>
    </section>
  );
}
