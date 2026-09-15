import { Chat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import type { ChatSubmitOptions, ThreadState } from '@/types/chat';
import type { PromptInputMessage } from '../components/ai-elements/prompt-input';
import { IpcChatTransport } from '../pages/chat/ipc-chat-transport';
import { useThreadStore } from '../store/use-thread-store';

type Session = { chat: Chat<UIMessage>; syncFromSdk: boolean; key: number };
type ThreadRuntime = {
  initialization?: Promise<ThreadState>;
  session?: Session;
  queue: Promise<void>;
  lifecycle: number;
  messagesVersion: number;
  running?: boolean;
};

type RuntimeEvents = {
  onData: (threadId: string, data: any) => void;
  onFinish: (threadId: string, event: any) => void;
  onThreadChanged: (threadId: string, event: any) => void;
  onError: (error: Error) => void;
};

// Data and SDK sessions live independently of React's render/commit timing.
export class ChatRuntime {
  private threads = new Map<string, ThreadRuntime>();

  private active = true;

  private nextSessionKey = 0;

  private events: RuntimeEvents;

  constructor(events: RuntimeEvents) {
    this.events = events;
  }

  setActive(active: boolean) {
    this.active = active;
  }

  private runtime(threadId: string) {
    if (!threadId) throw new Error('缺少线程 ID');
    let runtime = this.threads.get(threadId);
    if (!runtime) {
      runtime = { queue: Promise.resolve(), lifecycle: 0, messagesVersion: 0 };
      this.threads.set(threadId, runtime);
    }
    return runtime;
  }

  private isCurrent(threadId: string, runtime: ThreadRuntime) {
    return this.active && this.threads.get(threadId) === runtime;
  }

  private assertCurrent(threadId: string, runtime: ThreadRuntime) {
    if (!this.isCurrent(threadId, runtime)) {
      const error = new Error('线程已关闭');
      error.name = 'AbortError';
      throw error;
    }
  }

  reportError = (error: unknown) => {
    if (!this.active || (error instanceof Error && error.name === 'AbortError'))
      return;
    this.events.onError(
      error instanceof Error ? error : new Error(String(error)),
    );
  };

  private applySnapshot(
    threadId: string,
    runtime: ThreadRuntime,
    thread: ThreadState,
    messagesVersion: number,
  ) {
    this.assertCurrent(threadId, runtime);
    const store = useThreadStore.getState();
    const current = store.threadStates[threadId];
    const applyMessages =
      !current || runtime.messagesVersion === messagesVersion;
    let status = current?.status ?? thread.status;
    if (runtime.running === true) status = 'streaming';
    else if (runtime.running === false)
      status = current?.error ? 'error' : 'ready';
    const snapshot = {
      ...thread,
      messages: applyMessages
        ? (thread.messages ?? [])
        : (current?.messages ?? []),
      status,
      error: current?.error,
    };
    if (current) store.updateThreadState(threadId, snapshot);
    else store.registerThread(threadId, snapshot);
    if (applyMessages && runtime.session)
      runtime.session.chat.messages = snapshot.messages;
    return useThreadStore.getState().threadStates[threadId];
  }

  ensureThread = async (
    threadId: string,
    keep = true,
  ): Promise<ThreadState> => {
    const runtime = this.runtime(threadId);
    this.assertCurrent(threadId, runtime);
    const store = useThreadStore.getState();
    if (keep) store.keepThread(threadId);
    const current = store.threadStates[threadId];
    if (current) return current;
    if (!runtime.initialization) {
      const version = runtime.messagesVersion;
      runtime.initialization = window.electron.mastra
        .getThread(threadId)
        .then((thread) =>
          this.applySnapshot(threadId, runtime, thread, version),
        )
        .finally(() => {
          runtime.initialization = undefined;
        });
    }
    try {
      return await runtime.initialization;
    } catch (error) {
      if (
        this.isCurrent(threadId, runtime) &&
        !useThreadStore.getState().threadStates[threadId]
      ) {
        useThreadStore.getState().unkeepThread(threadId);
      }
      throw error;
    }
  };

  getSession = (threadId: string): Chat<UIMessage> => {
    const runtime = this.runtime(threadId);
    if (!runtime.session) {
      const thread = useThreadStore.getState().threadStates[threadId];
      if (!thread) throw new Error(`线程 ${threadId} 数据尚未加载`);
      const chat = new Chat<UIMessage>({
        id: threadId,
        messages: thread.messages ?? [],
        transport: new IpcChatTransport(),
        onData: (data) => {
          if (!this.isCurrent(threadId, runtime)) return;
          this.events.onData(threadId, data);
          if (data.type === 'data-thread-changed') {
            this.threadChanged(threadId, data.data).catch(this.reportError);
          }
        },
        onError: (error) => {
          if (!this.isCurrent(threadId, runtime)) return;
          useThreadStore
            .getState()
            .updateThreadState(threadId, { error, status: 'error' });
          this.reportError(error);
        },
      });
      this.nextSessionKey += 1;
      runtime.session = { chat, syncFromSdk: false, key: this.nextSessionKey };
    }
    return runtime.session.chat;
  };

  getSessionKey = (threadId: string) =>
    this.threads.get(threadId)?.session?.key;

  ensureSession = async (threadId: string) => {
    const runtime = this.runtime(threadId);
    await this.ensureThread(threadId);
    this.assertCurrent(threadId, runtime);
    return this.getSession(threadId);
  };

  // Read the current SDK instance, not a possibly stale render's snapshot.
  syncSession = (threadId: string, chat: Chat<UIMessage>) => {
    const runtime = this.threads.get(threadId);
    if (
      !runtime ||
      !this.isCurrent(threadId, runtime) ||
      runtime.session?.chat !== chat ||
      !runtime.session.syncFromSdk
    )
      return;
    const store = useThreadStore.getState();
    const thread = store.threadStates[threadId];
    if (!thread) return;
    let status = runtime.running ? 'streaming' : chat.status;
    if (chat.error) status = 'error';
    if (
      thread.messages === chat.messages &&
      thread.status === status &&
      thread.error === chat.error
    )
      return;
    if (thread.messages !== chat.messages) runtime.messagesVersion += 1;
    store.updateThreadState(threadId, {
      messages: chat.messages,
      status,
      error: chat.error,
    });
  };

  sendMessage = async (
    threadId: string,
    message: PromptInputMessage | undefined,
    options?: ChatSubmitOptions,
  ) => {
    const runtime = this.runtime(threadId);
    const chat = await this.ensureSession(threadId);
    this.assertCurrent(threadId, runtime);
    const thread = useThreadStore.getState().threadStates[threadId];
    if (
      chat.status === 'submitted' ||
      chat.status === 'streaming' ||
      runtime.running ||
      thread.status === 'submitted' ||
      thread.status === 'streaming'
    ) {
      throw new Error('线程仍在运行，请等待完成或先停止');
    }
    runtime.lifecycle += 1;
    runtime.messagesVersion += 1;
    runtime.running = undefined;
    runtime.session.syncFromSdk = true;
    // A closing stream may still have buffered SDK writes after Finish.
    chat.messages =
      useThreadStore.getState().threadStates[threadId].messages ?? [];
    useThreadStore
      .getState()
      .updateThreadState(threadId, { status: 'submitted', error: undefined });
    try {
      await chat.sendMessage(
        message
          ? {
              text: message.text || 'Sent with attachments',
              files: message.files,
            }
          : undefined,
        { body: options, headers: {}, metadata: {} },
      );
    } finally {
      this.syncSession(threadId, chat);
    }
  };

  setMessages = async (threadId: string, messages: UIMessage[]) => {
    const runtime = this.runtime(threadId);
    runtime.messagesVersion += 1;
    const version = runtime.messagesVersion;
    if (!useThreadStore.getState().threadStates[threadId])
      await this.ensureThread(threadId, false);
    this.assertCurrent(threadId, runtime);
    if (runtime.messagesVersion !== version) return;
    useThreadStore.getState().updateMessages(threadId, messages ?? []);
    if (runtime.session) runtime.session.chat.messages = messages ?? [];
  };

  stop = async (threadId: string) => {
    const chat = this.threads.get(threadId)?.session?.chat;
    if (chat?.status === 'submitted' || chat?.status === 'streaming')
      await chat.stop();
    else await window.electron.mastra.chatAbort(threadId);
  };

  clearError = (threadId: string) => {
    const runtime = this.threads.get(threadId);
    runtime?.session?.chat.clearError();
    const store = useThreadStore.getState();
    const thread = store.threadStates[threadId];
    let status: ThreadState['status'] =
      thread?.status === 'error' ? 'ready' : thread?.status;
    if (runtime?.running) status = 'streaming';
    if (thread)
      store.updateThreadState(threadId, {
        error: undefined,
        status,
      });
  };

  clearMessages = async (threadId: string) => {
    const runtime = this.runtime(threadId);
    await this.ensureThread(threadId, false);
    this.assertCurrent(threadId, runtime);
    await window.electron.mastra.clearMessages(threadId);
    this.assertCurrent(threadId, runtime);
    await this.setMessages(threadId, []);
    this.clearError(threadId);
  };

  unregisterThread = (threadId: string, skipKeep = false) => {
    const store = useThreadStore.getState();
    if (skipKeep) store.unkeepThread(threadId);
    else if (store.threadKeepList.includes(threadId)) return;
    const thread = store.threadStates[threadId];
    if (
      this.threads.get(threadId)?.running ||
      thread?.status === 'submitted' ||
      thread?.status === 'streaming'
    )
      return;
    this.threads.delete(threadId);
    store.unkeepThread(threadId);
    store.removeThread(threadId);
  };

  private enqueue(
    threadId: string,
    operation: (runtime: ThreadRuntime) => Promise<void>,
  ) {
    const runtime = this.runtime(threadId);
    const result = runtime.queue.then(async () => {
      if (this.isCurrent(threadId, runtime)) return operation(runtime);
      return undefined;
    });
    // A failed refresh must not prevent subsequent lifecycle events from running.
    runtime.queue = result.catch(() => {});
    return result;
  }

  private async refreshSnapshot(threadId: string, runtime: ThreadRuntime) {
    if (!useThreadStore.getState().threadStates[threadId])
      return this.ensureThread(threadId, false);
    const version = runtime.messagesVersion;
    const thread = await window.electron.mastra.getThread(threadId);
    return this.applySnapshot(threadId, runtime, thread, version);
  }

  started = (threadId: string) => {
    const runtime = this.runtime(threadId);
    runtime.lifecycle += 1;
    runtime.messagesVersion += 1;
    runtime.running = true;
    useThreadStore
      .getState()
      .updateThreadState(threadId, { status: 'streaming', error: undefined });
    return this.enqueue(threadId, async () => {
      await this.ensureThread(threadId, false);
    });
  };

  finished = (threadId: string, event: any) => {
    const runtime = this.runtime(threadId);
    runtime.lifecycle += 1;
    runtime.messagesVersion += 1;
    const { lifecycle } = runtime;
    runtime.running = false;
    // The persisted final snapshot takes ownership from a closing local stream.
    if (runtime.session) runtime.session.syncFromSdk = false;
    return this.enqueue(threadId, async () => {
      if (runtime.lifecycle !== lifecycle) return;
      try {
        await this.refreshSnapshot(threadId, runtime);
      } finally {
        if (
          runtime.lifecycle === lifecycle &&
          this.isCurrent(threadId, runtime)
        ) {
          const store = useThreadStore.getState();
          store.updateStatus(
            threadId,
            store.threadStates[threadId]?.error ? 'error' : 'ready',
          );
          this.events.onFinish(threadId, event);
          this.unregisterThread(threadId);
        }
      }
    });
  };

  messagesChanged = (threadId: string) =>
    this.enqueue(threadId, async (runtime) => {
      await this.refreshSnapshot(threadId, runtime);
    });

  threadChanged = (threadId: string, event: any) =>
    this.enqueue(threadId, async (runtime) => {
      await this.ensureThread(threadId, false);
      const thread = await window.electron.mastra.getThread(threadId, true);
      this.assertCurrent(threadId, runtime);
      useThreadStore
        .getState()
        .updateThreadMeatadata(threadId, thread.metadata ?? {});
      this.events.onThreadChanged(threadId, event);
    });

  titleChanged = (threadId: string, title: string) =>
    this.enqueue(threadId, async (runtime) => {
      await this.ensureThread(threadId, false);
      this.assertCurrent(threadId, runtime);
      useThreadStore.getState().updateThreadState(threadId, { title });
    });
}
