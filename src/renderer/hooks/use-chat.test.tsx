import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import type { UIMessage, UIMessageChunk } from 'ai';
import { ChatChangedType, ChatEvent, ThreadState } from '@/types/chat';
import { ChatProvider, ChatState, useChat } from './use-chat';
import { useThreadStore } from '../store/use-thread-store';

jest.mock('@ai-sdk/react', () => {
  const { TextEncoder, TextDecoder } = jest.requireActual('util');
  const { serialize, deserialize } = jest.requireActual('v8');
  const { ReadableStream, TransformStream, WritableStream } =
    jest.requireActual('stream/web');
  Object.assign(global, {
    TextEncoder,
    TextDecoder,
    ReadableStream,
    TransformStream,
    WritableStream,
    structuredClone: (value: unknown) => deserialize(serialize(value)),
  });
  return jest.requireActual('@ai-sdk/react');
});
jest.mock('./use-global', () => ({
  useGlobal: () => ({ appInfo: { isPackaged: true } }),
}));
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}));
const transportSend = jest.fn();
jest.mock('../pages/chat/ipc-chat-transport', () => ({
  IpcChatTransport: jest.fn().mockImplementation(() => ({
    sendMessages: (...args: any[]) => transportSend(...args),
  })),
}));

const getThread = jest.fn();
const message = (id: string): UIMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text: id }],
});
const snapshot: ThreadState = {
  id: 'thread-1',
  title: 'Thread',
  resourceId: 'default',
  createdAt: new Date(),
  updatedAt: new Date(),
  status: 'ready',
  messages: [message('saved')],
};
const listeners = new Map<string, Set<(event: any) => void>>();
const emit = (channel: string, data: any) => {
  listeners.get(channel)?.forEach((handler) => handler({ data }));
};
const state = () => useThreadStore.getState().threadStates['thread-1'];
let api: ChatState;
function Consumer() {
  api = useChat();
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  listeners.clear();
  useThreadStore.setState({ threadStates: {}, threadKeepList: [] });
  getThread.mockReset().mockResolvedValue(snapshot);
  transportSend.mockReset().mockImplementation(
    async () =>
      new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
  );
  Object.defineProperty(window, 'electron', {
    configurable: true,
    value: {
      mastra: { getThread },
      ipcRenderer: {
        on: (channel: string, handler: (event: any) => void) => {
          if (!listeners.has(channel)) listeners.set(channel, new Set());
          listeners.get(channel).add(handler);
        },
        removeListener: (channel: string, handler: (event: any) => void) =>
          listeners.get(channel)?.delete(handler),
      },
    },
  });
});

it('hydrates SDK messages at mount without ever clearing the stored history', async () => {
  const histories: UIMessage[][] = [];
  const unsubscribe = useThreadStore.subscribe((store) => {
    if (store.threadStates['thread-1'])
      histories.push(store.threadStates['thread-1'].messages);
  });
  render(
    <ChatProvider>
      <Consumer />
    </ChatProvider>,
  );
  await act(async () => {
    await api.ensureThread('thread-1');
  });
  expect(state().messages).toEqual([message('saved')]);
  expect(histories.length).toBeGreaterThan(0);
  expect(histories.every((messages) => messages.length > 0)).toBe(true);
  unsubscribe();
});

it('preserves background running state across React mounting and message events', async () => {
  render(
    <ChatProvider>
      <Consumer />
    </ChatProvider>,
  );
  await act(async () => {
    emit(ChatEvent.ChatChanged, {
      type: ChatChangedType.Start,
      chatId: 'thread-1',
    });
  });
  await waitFor(() => expect(state()?.status).toBe('streaming'));
  getThread.mockResolvedValue({
    ...snapshot,
    messages: [message('background-update')],
  });
  await act(async () => {
    emit(ChatEvent.ChatMessageChanged, { chatId: 'thread-1' });
  });
  await waitFor(() =>
    expect(state().messages).toEqual([message('background-update')]),
  );
  expect(state().status).toBe('streaming');
});

it('sends before the first mount and delivers streaming updates through React subscriptions', async () => {
  let controller!: ReadableStreamDefaultController<UIMessageChunk>;
  transportSend.mockImplementationOnce(
    async () =>
      new ReadableStream<UIMessageChunk>({
        start(value) {
          controller = value;
        },
      }),
  );
  render(
    <ChatProvider>
      <Consumer />
    </ChatProvider>,
  );
  await act(async () => {
    await api.ensureThread('thread-1');
    api.setMessages('thread-1', [message('edited')]);
    api.sendMessage('thread-1', { text: 'next', files: [] });
  });
  await waitFor(() => expect(transportSend).toHaveBeenCalledTimes(1));
  await act(async () => {
    controller.enqueue({ type: 'start', messageId: 'answer' });
    controller.enqueue({ type: 'text-start', id: 'text' });
    controller.enqueue({
      type: 'text-delta',
      id: 'text',
      delta: 'live answer',
    });
  });
  await waitFor(() =>
    expect(state().messages.at(-1)?.parts).toEqual([
      expect.objectContaining({ text: 'live answer' }),
    ]),
  );
  expect(state().status).toBe('streaming');
  await act(async () => {
    controller.enqueue({ type: 'text-end', id: 'text' });
    controller.enqueue({ type: 'finish', finishReason: 'stop' });
    controller.close();
  });
  await waitFor(() => expect(state().status).toBe('ready'));
});

it('resubscribes when a thread is closed and reopened in one React batch', async () => {
  render(
    <ChatProvider>
      <Consumer />
    </ChatProvider>,
  );
  await act(async () => {
    await api.ensureThread('thread-1');
  });
  let controller!: ReadableStreamDefaultController<UIMessageChunk>;
  transportSend.mockImplementationOnce(
    async () =>
      new ReadableStream<UIMessageChunk>({
        start(value) {
          controller = value;
        },
      }),
  );
  await act(async () => {
    api.unregisterThread('thread-1', true);
    await api.ensureThread('thread-1');
    api.sendMessage('thread-1', { text: 'reopened', files: [] });
  });
  await waitFor(() => expect(transportSend).toHaveBeenCalledTimes(1));
  await act(async () => {
    controller.enqueue({ type: 'start', messageId: 'reopened-answer' });
    controller.enqueue({ type: 'text-start', id: 'text' });
    controller.enqueue({ type: 'text-delta', id: 'text', delta: 'still live' });
  });
  await waitFor(() =>
    expect(state().messages.at(-1)?.parts).toEqual([
      expect.objectContaining({ text: 'still live' }),
    ]),
  );
  await act(async () => {
    controller.close();
  });
});

it('keeps one set of IPC listeners through StrictMode effect replay', async () => {
  const view = render(
    <React.StrictMode>
      <ChatProvider>
        <Consumer />
      </ChatProvider>
    </React.StrictMode>,
  );
  expect(listeners.get(ChatEvent.ChatChanged)?.size).toBe(1);
  await act(async () => {
    await api.ensureThread('thread-1');
  });
  expect(state().messages).toEqual([message('saved')]);
  view.unmount();
  expect(listeners.get(ChatEvent.ChatChanged)?.size).toBe(0);
});

it('can replay StrictMode effects with threads already in the store', () => {
  useThreadStore.getState().registerThread('thread-1', snapshot);
  render(
    <React.StrictMode>
      <ChatProvider>
        <Consumer />
      </ChatProvider>
    </React.StrictMode>,
  );
  expect(state().messages).toEqual([message('saved')]);
  expect(listeners.get(ChatEvent.ChatChanged)?.size).toBe(1);
});
