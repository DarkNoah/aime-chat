/** @jest-environment node */
import type { UIMessage, UIMessageChunk } from 'ai';
import type { ThreadState } from '@/types/chat';
import { ChatRuntime } from './chat-runtime';
import { useThreadStore } from '../store/use-thread-store';

const transportSend = jest.fn();
jest.mock('../pages/chat/ipc-chat-transport', () => ({
  IpcChatTransport: jest.fn().mockImplementation(() => ({
    sendMessages: (...args: any[]) => transportSend(...args),
  })),
}));

const message = (id: string): UIMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text: id }],
});
const snapshot = (
  id = 'thread-1',
  messages = [message('saved')],
): ThreadState => ({
  id,
  resourceId: 'default',
  title: 'Thread',
  createdAt: new Date(),
  updatedAt: new Date(),
  status: 'ready',
  messages,
  metadata: {},
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return { promise, resolve, reject };
};
const getThread = jest.fn();
const clearMessages = jest.fn();
const chatAbort = jest.fn();
let runtime: ChatRuntime;
let events: {
  onData: jest.Mock;
  onFinish: jest.Mock;
  onThreadChanged: jest.Mock;
  onError: jest.Mock;
};
const state = () => useThreadStore.getState().threadStates['thread-1'];

beforeEach(() => {
  jest.clearAllMocks();
  getThread.mockReset().mockResolvedValue(snapshot());
  clearMessages.mockReset().mockResolvedValue(undefined);
  transportSend.mockReset().mockImplementation(
    async () =>
      new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
  );
  useThreadStore.setState({ threadStates: {}, threadKeepList: [] });
  Object.defineProperty(global, 'window', {
    configurable: true,
    value: { electron: { mastra: { getThread, clearMessages, chatAbort } } },
  });
  events = {
    onData: jest.fn(),
    onFinish: jest.fn(),
    onThreadChanged: jest.fn(),
    onError: jest.fn(),
  };
  runtime = new ChatRuntime(events);
});

it('deduplicates initialization and reads the current store on later calls', async () => {
  const loading = deferred<ThreadState>();
  getThread.mockReturnValueOnce(loading.promise);
  const first = runtime.ensureThread('thread-1', false);
  const second = runtime.ensureThread('thread-1');
  expect(getThread).toHaveBeenCalledTimes(1);
  loading.resolve(snapshot());
  await Promise.all([first, second]);
  await runtime.setMessages('thread-1', [message('updated')]);
  expect((await runtime.ensureThread('thread-1')).messages).toEqual([
    message('updated'),
  ]);
  expect(getThread).toHaveBeenCalledTimes(1);
  expect(useThreadStore.getState().threadKeepList).toEqual(['thread-1']);
});

it('retains messages set before initialization or React mounting', async () => {
  const loading = deferred<ThreadState>();
  getThread.mockReturnValueOnce(loading.promise);
  const first = runtime.setMessages('thread-1', [message('older')]);
  const latest = runtime.setMessages('thread-1', [message('latest')]);
  loading.resolve(snapshot());
  await Promise.all([first, latest]);
  expect(state().messages).toEqual([message('latest')]);
  expect(runtime.getSession('thread-1').messages).toEqual([message('latest')]);
  expect(events.onError).not.toHaveBeenCalled();
});

it('sends immediately after creation without any mounted session component', async () => {
  await runtime.ensureThread('thread-1');
  // Preserve the synchronous setMessages -> sendMessage contract for loaded threads.
  const updating = runtime.setMessages('thread-1', [message('edited-history')]);
  await runtime.sendMessage(
    'thread-1',
    { text: 'next', files: [] },
    { model: 'test-model' },
  );
  await updating;
  expect(transportSend).toHaveBeenCalledTimes(1);
  expect(transportSend.mock.calls[0][0]).toMatchObject({
    chatId: 'thread-1',
    body: { model: 'test-model' },
    messages: [
      message('edited-history'),
      expect.objectContaining({
        role: 'user',
        parts: [{ type: 'text', text: 'next' }],
      }),
    ],
  });
  expect(state().messages).toHaveLength(2);
});

it('loads a message event for a thread that has never been opened', async () => {
  await runtime.messagesChanged('thread-1');
  expect(state()).toMatchObject({
    id: 'thread-1',
    status: 'ready',
    messages: [message('saved')],
  });
  expect(runtime.getSession('thread-1').messages).toEqual([message('saved')]);
  expect(events.onError).not.toHaveBeenCalled();
});

it('does not overwrite a background run with an idle SDK session', async () => {
  getThread.mockResolvedValue({ ...snapshot(), status: 'streaming' });
  await runtime.started('thread-1');
  const chat = runtime.getSession('thread-1');
  expect(chat.status).toBe('ready');
  runtime.syncSession('thread-1', chat);
  expect(state().status).toBe('streaming');
  expect(state().messages).toEqual([message('saved')]);
});

it('handles Start and Finish arriving before initialization completes', async () => {
  const loading = deferred<ThreadState>();
  getThread
    .mockReturnValueOnce(loading.promise)
    .mockResolvedValueOnce(snapshot('thread-1', [message('final')]));
  events.onFinish.mockImplementation(() => {
    expect(state().messages).toEqual([message('final')]);
    expect(state().status).toBe('ready');
  });
  const start = runtime.started('thread-1');
  await Promise.resolve();
  const finish = runtime.finished('thread-1', { type: 'finish' });
  loading.resolve({ ...snapshot(), status: 'streaming' });
  await Promise.all([start, finish]);
  expect(events.onFinish).toHaveBeenCalledTimes(1);
  expect(state()).toBeUndefined();
});

it('handles Finish without Start and ignores the backend pre-cleanup running flag', async () => {
  useThreadStore.getState().keepThread('thread-1');
  getThread.mockResolvedValue({ ...snapshot(), status: 'streaming' });
  await runtime.finished('thread-1', {});
  expect(state().status).toBe('ready');
  expect(state().messages).toEqual([message('saved')]);
  expect(events.onFinish).toHaveBeenCalledTimes(1);
});

it('does not let an older Finish overwrite or unregister the next run', async () => {
  await runtime.ensureThread('thread-1', false);
  const loading = deferred<ThreadState>();
  getThread.mockReturnValueOnce(loading.promise);
  const finish = runtime.finished('thread-1', {});
  await Promise.resolve();
  const start = runtime.started('thread-1');
  await runtime.setMessages('thread-1', [message('new-run')]);
  loading.resolve(snapshot('thread-1', [message('old-run')]));
  await Promise.all([finish, start]);
  expect(state().status).toBe('streaming');
  expect(state().messages).toEqual([message('new-run')]);
  expect(events.onFinish).not.toHaveBeenCalled();
});

it('does not apply a stale refresh over a newer local edit', async () => {
  await runtime.ensureThread('thread-1');
  const loading = deferred<ThreadState>();
  getThread.mockReturnValueOnce(loading.promise);
  const refresh = runtime.messagesChanged('thread-1');
  await Promise.resolve();
  await runtime.setMessages('thread-1', [message('edited')]);
  loading.resolve(snapshot());
  await refresh;
  expect(state().messages).toEqual([message('edited')]);
});

it('does not resurrect a thread closed during initialization', async () => {
  const loading = deferred<ThreadState>();
  getThread.mockReturnValueOnce(loading.promise);
  const initialization = runtime.ensureThread('thread-1');
  runtime.unregisterThread('thread-1', true);
  loading.resolve(snapshot());
  await expect(initialization).rejects.toMatchObject({ name: 'AbortError' });
  expect(state()).toBeUndefined();
  expect(useThreadStore.getState().threadKeepList).toEqual([]);
});

it('retries failed initialization and does not leave a keep entry', async () => {
  getThread.mockRejectedValueOnce(new Error('temporary failure'));
  await expect(runtime.ensureThread('thread-1')).rejects.toThrow(
    'temporary failure',
  );
  expect(useThreadStore.getState().threadKeepList).toEqual([]);
  await runtime.ensureThread('thread-1');
  expect(state()).toBeDefined();
  expect(getThread).toHaveBeenCalledTimes(2);
});

it('continues processing events after a refresh fails', async () => {
  await runtime.ensureThread('thread-1');
  getThread.mockRejectedValueOnce(new Error('read failed'));
  const refresh = runtime.messagesChanged('thread-1');
  const finish = runtime.finished('thread-1', {});
  await expect(refresh).rejects.toThrow('read failed');
  await finish;
  expect(state().status).toBe('ready');
  expect(events.onFinish).toHaveBeenCalledTimes(1);
});

it('does not recreate a closed thread from delayed store updates', async () => {
  await runtime.ensureThread('thread-1');
  runtime.unregisterThread('thread-1', true);
  const store = useThreadStore.getState();
  store.updateMessages('thread-1', [message('late')]);
  store.updateStatus('thread-1', 'ready');
  store.updateError('thread-1', new Error('late'));
  store.updateThreadState('thread-1', { title: 'late' });
  store.updateThreadMeatadata('thread-1', { late: true });
  expect(state()).toBeUndefined();
});

it('stops a background run directly when there is no local stream', async () => {
  await runtime.started('thread-1');
  runtime.getSession('thread-1');
  await runtime.stop('thread-1');
  expect(chatAbort).toHaveBeenCalledWith('thread-1');
});

it('clears SDK errors without stopping the thread', async () => {
  transportSend.mockRejectedValueOnce(new Error('provider failed'));
  await runtime.sendMessage('thread-1', { text: 'next', files: [] });
  const chat = runtime.getSession('thread-1');
  const stop = jest.spyOn(chat, 'stop');
  expect(state().status).toBe('error');
  runtime.clearError('thread-1');
  expect(chat.error).toBeUndefined();
  expect(state().error).toBeUndefined();
  expect(state().status).toBe('ready');
  expect(stop).not.toHaveBeenCalled();
  expect(chatAbort).not.toHaveBeenCalled();
});

it('waits for clearMessages to finish before resolving and clears the SDK too', async () => {
  await runtime.ensureThread('thread-1');
  const chat = runtime.getSession('thread-1');
  const clearing = deferred<void>();
  clearMessages.mockReturnValueOnce(clearing.promise);
  const completed = jest.fn();
  const operation = runtime.clearMessages('thread-1').then(completed);
  await Promise.resolve();
  expect(completed).not.toHaveBeenCalled();
  expect(state().messages).toHaveLength(1);
  clearing.resolve();
  await operation;
  expect(state().messages).toEqual([]);
  expect(chat.messages).toEqual([]);
});

it('forwards actual SDK stream updates and retains the final persisted snapshot', async () => {
  let controller!: ReadableStreamDefaultController<UIMessageChunk>;
  const sending = deferred<void>();
  transportSend.mockImplementationOnce(async () => {
    sending.resolve();
    return new ReadableStream<UIMessageChunk>({
      start(value) {
        controller = value;
      },
    });
  });
  const operation = runtime.sendMessage('thread-1', {
    text: 'next',
    files: [],
  });
  await sending.promise;
  const chat = runtime.getSession('thread-1');
  controller.enqueue({ type: 'start', messageId: 'answer' });
  controller.enqueue({ type: 'text-start', id: 'text' });
  controller.enqueue({ type: 'text-delta', id: 'text', delta: 'hello' });
  controller.enqueue({ type: 'text-end', id: 'text' });
  controller.enqueue({ type: 'finish', finishReason: 'stop' });
  controller.close();
  await operation;
  expect(state().messages.at(-1)).toMatchObject({
    id: 'answer',
    parts: [{ type: 'text', text: 'hello', state: 'done' }],
  });
  getThread.mockResolvedValue(
    snapshot('thread-1', [message('persisted-final')]),
  );
  await runtime.finished('thread-1', {});
  // A delayed effect from the closing stream cannot overwrite the final reload.
  chat.messages = [message('stale-sdk')];
  runtime.syncSession('thread-1', chat);
  expect(state().messages).toEqual([message('persisted-final')]);
});

it('leaves the running state when the final message refresh fails', async () => {
  await runtime.ensureThread('thread-1');
  await runtime.started('thread-1');
  getThread.mockRejectedValueOnce(new Error('final refresh failed'));
  await expect(runtime.finished('thread-1', {})).rejects.toThrow(
    'final refresh failed',
  );
  expect(state().status).toBe('ready');
  expect(state().messages).toEqual([message('saved')]);
  expect(events.onFinish).toHaveBeenCalledTimes(1);
});

it('uses persisted messages for the next send after delayed SDK writes', async () => {
  await runtime.sendMessage('thread-1', { text: 'first', files: [] });
  getThread.mockResolvedValue(snapshot('thread-1', [message('persisted')]));
  await runtime.finished('thread-1', {});
  runtime.getSession('thread-1').messages = [message('stale-buffer')];
  await runtime.sendMessage('thread-1', { text: 'next', files: [] });
  expect(transportSend.mock.calls[1][0].messages[0]).toEqual(
    message('persisted'),
  );
});

it('ignores pending initialization after the provider unmounts', async () => {
  const loading = deferred<ThreadState>();
  getThread.mockReturnValueOnce(loading.promise);
  const initialization = runtime.ensureThread('thread-1');
  runtime.setActive(false);
  loading.resolve(snapshot());
  await expect(initialization).rejects.toMatchObject({ name: 'AbortError' });
  expect(state()).toBeUndefined();
});

it('preserves initial history when Start arrives during an existing load', async () => {
  const loading = deferred<ThreadState>();
  getThread.mockReturnValueOnce(loading.promise);
  const initialization = runtime.ensureThread('thread-1');
  const start = runtime.started('thread-1');
  loading.resolve(snapshot());
  await Promise.all([initialization, start]);
  expect(state().messages).toEqual([message('saved')]);
  expect(state().status).toBe('streaming');
});

it('prevents concurrent sends while the first SDK request is preparing', async () => {
  let controller!: ReadableStreamDefaultController<UIMessageChunk>;
  transportSend.mockImplementationOnce(
    async () =>
      new ReadableStream<UIMessageChunk>({
        start(value) {
          controller = value;
        },
      }),
  );
  const first = runtime.sendMessage('thread-1', { text: 'first', files: [] });
  const second = runtime.sendMessage('thread-1', { text: 'second', files: [] });
  await expect(second).rejects.toThrow('线程仍在运行');
  expect(transportSend).toHaveBeenCalledTimes(1);
  controller.close();
  await first;
});
