import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import type { UIMessage } from 'ai';
import {
  buildReplayPartSteps,
  buildReplaySequence,
  buildReplaySnapshot,
  CHAT_REPLAY_INTERVAL_MS,
  ChatReplayButton,
  ChatReplayControls,
  useChatReplay,
} from './chat-replay';

class ResizeObserverMock {
  observe = jest.fn();

  unobserve = jest.fn();

  disconnect = jest.fn();
}

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { seconds?: number }) =>
      values?.seconds === undefined ? key : `${key}:${values.seconds}`,
  }),
}));

const textMessage = (
  id: string,
  text: string,
  metadata?: Record<string, any>,
) =>
  ({
    id,
    role: id.startsWith('user') ? 'user' : 'assistant',
    parts: [{ type: 'text', text }],
    metadata,
  }) as UIMessage;

describe('message replay', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      value: ResizeObserverMock,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('opens interval choices with one second selected by default', () => {
    const onStart = jest.fn();
    render(
      <ChatReplayButton
        disabled={false}
        isChatInProgress={false}
        isLoading={false}
        onStart={onStart}
      />,
    );

    fireEvent.keyDown(screen.getByRole('button'), { key: 'ArrowDown' });

    const oneSecond = screen.getByRole('menuitemradio', {
      name: 'chat.replay_interval_option:1',
    });
    expect(oneSecond).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('menuitemradio', {
        name: 'chat.replay_interval_option:0.5',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitemradio', {
        name: 'chat.replay_interval_option:3',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitemradio', {
        name: 'chat.replay_interval_option:5',
      }),
    ).toBeInTheDocument();

    fireEvent.click(oneSecond);
    expect(onStart).toHaveBeenCalledWith(1_000);
  });

  it('offers slower and faster controls during playback', () => {
    const onSlowDown = jest.fn();
    const onSpeedUp = jest.fn();
    render(
      <ChatReplayControls
        canSlowDown
        canSpeedUp
        current={1}
        includesCompressedHistory={false}
        isComplete={false}
        isPlaying
        intervalMs={1_000}
        total={3}
        onExit={jest.fn()}
        onPause={jest.fn()}
        onResume={jest.fn()}
        onSeek={jest.fn()}
        onSlowDown={onSlowDown}
        onSpeedUp={onSpeedUp}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'chat.replay_slow_down' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'chat.replay_speed_up' }),
    );

    expect(onSlowDown).toHaveBeenCalledTimes(1);
    expect(onSpeedUp).toHaveBeenCalledTimes(1);
    expect(screen.getByText('chat.replay_interval:1')).toBeInTheDocument();
  });

  it('merges compressed history before live messages and removes hidden rows', () => {
    const duplicate = textMessage('assistant-duplicate', 'Saved answer');
    const compressedPlaceholder = textMessage('compressed', '', {
      compressed: true,
    });
    const systemReminder = textMessage(
      'user-reminder',
      '<system-reminder>background update</system-reminder>',
      { systemReminder: true },
    );

    expect(
      buildReplaySequence(
        [
          textMessage('user-history', 'Archived question'),
          duplicate,
          compressedPlaceholder,
          systemReminder,
        ],
        [duplicate, textMessage('assistant-live', 'Current answer')],
      ).map(({ id }) => id),
    ).toEqual(['user-history', 'assistant-duplicate', 'assistant-live']);
  });

  it('builds each frame from visible parts while preserving supporting data', () => {
    const message = {
      ...textMessage('assistant-1', 'First part'),
      parts: [
        { type: 'text', text: 'First part' },
        { type: 'data-status', data: { value: 'working' } },
        { type: 'text', text: 'Second part' },
        { type: 'data-status', data: { value: 'done' } },
      ],
    } as UIMessage;
    const steps = buildReplayPartSteps([message]);

    expect(steps).toHaveLength(2);
    expect(buildReplaySnapshot([message], steps, 1)[0].parts).toHaveLength(1);
    expect(buildReplaySnapshot([message], steps, 2)[0].parts).toHaveLength(4);
  });

  it('shows the first part immediately and advances at the default interval', async () => {
    const historyMessage = {
      ...textMessage('user-history', 'Archived question'),
      parts: [
        { type: 'text', text: 'Archived question' },
        { type: 'text', text: 'Archived detail' },
      ],
    } as UIMessage;
    const loadHistory = jest.fn().mockResolvedValue([historyMessage]);
    const { result } = renderHook(() =>
      useChatReplay({
        threadId: 'thread-1',
        liveMessages: [
          textMessage('assistant-live-1', 'First current answer'),
          textMessage('assistant-live-2', 'Second current answer'),
        ],
        isChatInProgress: false,
        loadHistory,
      }),
    );

    await act(async () => {
      expect(await result.current.start()).toBe('started');
    });

    expect(loadHistory).toHaveBeenCalledTimes(1);
    expect(result.current.includesCompressedHistory).toBe(true);
    expect(result.current.visibleMessages.map(({ id }) => id)).toEqual([
      'user-history',
    ]);
    expect(result.current.visibleMessages[0].parts).toHaveLength(1);

    act(() => {
      jest.advanceTimersByTime(CHAT_REPLAY_INTERVAL_MS - 1);
    });
    expect(result.current.position).toBe(1);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.position).toBe(2);
    expect(result.current.visibleMessages).toHaveLength(1);
    expect(result.current.visibleMessages[0].parts).toHaveLength(2);

    act(() => {
      jest.advanceTimersByTime(CHAT_REPLAY_INTERVAL_MS);
    });
    expect(result.current.position).toBe(3);

    act(() => {
      jest.advanceTimersByTime(CHAT_REPLAY_INTERVAL_MS);
    });
    expect(result.current.position).toBe(4);
    expect(result.current.isComplete).toBe(true);
    expect(result.current.isPlaying).toBe(false);
  });

  it('uses the interval selected before playback starts', async () => {
    const { result } = renderHook(() =>
      useChatReplay({
        threadId: 'thread-1',
        liveMessages: [
          textMessage('user-1', 'Question'),
          textMessage('assistant-1', 'Answer'),
        ],
        isChatInProgress: false,
        loadHistory: jest.fn().mockResolvedValue([]),
      }),
    );

    await act(async () => {
      await result.current.start(3_000);
    });
    expect(result.current.intervalMs).toBe(3_000);

    act(() => {
      jest.advanceTimersByTime(2_999);
    });
    expect(result.current.position).toBe(1);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.position).toBe(2);
  });

  it('reschedules the next part when playback speed changes', async () => {
    const { result } = renderHook(() =>
      useChatReplay({
        threadId: 'thread-1',
        liveMessages: [
          textMessage('user-1', 'Question'),
          textMessage('assistant-1', 'Answer'),
          textMessage('user-2', 'Follow-up'),
        ],
        isChatInProgress: false,
        loadHistory: jest.fn().mockResolvedValue([]),
      }),
    );

    await act(async () => {
      await result.current.start(3_000);
    });
    act(() => {
      jest.advanceTimersByTime(1_000);
      result.current.speedUp();
    });
    expect(result.current.intervalMs).toBe(1_000);
    expect(result.current.position).toBe(1);

    act(() => {
      jest.advanceTimersByTime(999);
    });
    expect(result.current.position).toBe(1);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.position).toBe(2);

    act(() => {
      result.current.speedUp();
    });
    expect(result.current.intervalMs).toBe(500);
    expect(result.current.canSpeedUp).toBe(false);

    act(() => {
      result.current.slowDown();
    });
    expect(result.current.intervalMs).toBe(1_000);
    expect(result.current.canSpeedUp).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(result.current.position).toBe(3);
  });

  it('supports pause, backward seeking, resume, and automatic exit on chat start', async () => {
    const props = {
      threadId: 'thread-1',
      liveMessages: [
        textMessage('user-1', 'Question'),
        textMessage('assistant-1', 'Answer'),
        textMessage('user-2', 'Follow-up'),
      ],
      isChatInProgress: false,
      loadHistory: jest.fn().mockResolvedValue([]),
    };
    const { result, rerender } = renderHook(
      (options: typeof props) => useChatReplay(options),
      { initialProps: props },
    );

    await act(async () => {
      await result.current.start();
    });
    act(() => {
      jest.advanceTimersByTime(CHAT_REPLAY_INTERVAL_MS);
      result.current.pause();
    });
    expect(result.current.position).toBe(2);

    act(() => {
      jest.advanceTimersByTime(CHAT_REPLAY_INTERVAL_MS * 2);
      result.current.seek(3);
    });
    expect(result.current.position).toBe(3);

    act(() => {
      result.current.seek(1);
    });
    expect(result.current.position).toBe(1);

    act(() => {
      result.current.resume();
    });
    act(() => {
      jest.advanceTimersByTime(CHAT_REPLAY_INTERVAL_MS);
    });
    expect(result.current.position).toBe(2);

    rerender({ ...props, isChatInProgress: true });
    expect(result.current.isActive).toBe(false);
    expect(result.current.visibleMessages).toEqual([]);
  });

  it('does not start or load history while a chat is in progress', async () => {
    const loadHistory = jest.fn().mockResolvedValue([]);
    const { result } = renderHook(() =>
      useChatReplay({
        threadId: 'thread-1',
        liveMessages: [textMessage('user-1', 'Question')],
        isChatInProgress: true,
        loadHistory,
      }),
    );

    await act(async () => {
      expect(await result.current.start()).toBe('blocked');
    });

    expect(loadHistory).not.toHaveBeenCalled();
    expect(result.current.isActive).toBe(false);
  });
});
