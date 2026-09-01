import type {
  ChatMessageInjectionMode,
  PendingChatMessageInput,
} from '@/types/chat';

export type QueuedChatMessageSource =
  | 'user'
  | 'background-bash'
  | 'background-agent';

export type QueuedChatMessage = PendingChatMessageInput & {
  source: QueuedChatMessageSource;
  injectionMode: ChatMessageInjectionMode;
  trigger?: string;
  notifyConsumed?: boolean;
};

export type ChatMessageQueueEnqueueStatus = 'queued' | 'updated' | 'duplicate';

export function resolveChatMessageInjectionMode(
  input: Pick<PendingChatMessageInput, 'injectionMode' | 'immediate'>,
  fallback: ChatMessageInjectionMode = 'after-session',
): ChatMessageInjectionMode {
  if (input.injectionMode) return input.injectionMode;
  if (input.immediate !== undefined) {
    return input.immediate ? 'immediate' : 'after-session';
  }
  return fallback;
}

export class ChatMessageQueue {
  private queues = new Map<string, Map<string, QueuedChatMessage>>();

  private suspendedThreads = new Set<string>();

  enqueue(
    input: QueuedChatMessage,
    options: { updateExisting?: boolean } = {},
  ): ChatMessageQueueEnqueueStatus {
    const queue =
      this.queues.get(input.chatId) ?? new Map<string, QueuedChatMessage>();
    const existing = queue.get(input.id);

    if (existing && options.updateExisting === false) {
      return 'duplicate';
    }

    queue.set(input.id, existing ? { ...existing, ...input } : input);
    this.queues.set(input.chatId, queue);
    return existing ? 'updated' : 'queued';
  }

  get(chatId: string, id: string): QueuedChatMessage | undefined {
    return this.queues.get(chatId)?.get(id);
  }

  remove(chatId: string, id: string): QueuedChatMessage | undefined {
    const queue = this.queues.get(chatId);
    if (!queue) return undefined;

    const item = queue.get(id);
    queue.delete(id);
    if (queue.size === 0) {
      this.queues.delete(chatId);
    }
    return item;
  }

  takeNext(
    chatId: string,
    injectionModes: ChatMessageInjectionMode[] = ['immediate', 'after-session'],
  ): QueuedChatMessage | undefined {
    const queue = this.queues.get(chatId);
    if (!queue) return undefined;

    for (const injectionMode of injectionModes) {
      for (const [id, item] of queue) {
        if (item.injectionMode !== injectionMode) continue;
        queue.delete(id);
        if (queue.size === 0) {
          this.queues.delete(chatId);
        }
        return item;
      }
    }

    return undefined;
  }

  takeNextBatch(
    chatId: string,
    injectionModes: ChatMessageInjectionMode[] = ['immediate', 'after-session'],
  ): QueuedChatMessage[] {
    const first = this.takeNext(chatId, injectionModes);
    if (!first) return [];
    if (first.source === 'user') return [first];

    return [
      first,
      ...this.takeLeadingBackground(first.chatId, first.injectionMode),
    ];
  }

  private takeLeadingBackground(
    chatId: string,
    injectionMode: ChatMessageInjectionMode,
  ): QueuedChatMessage[] {
    const queue = this.queues.get(chatId);
    if (!queue) return [];

    const items: QueuedChatMessage[] = [];
    for (const [id, item] of queue) {
      if (item.injectionMode !== injectionMode) continue;
      if (item.source === 'user') break;
      items.push(item);
      queue.delete(id);
    }
    if (queue.size === 0) {
      this.queues.delete(chatId);
    }
    return items;
  }

  clear(chatId: string): QueuedChatMessage[] {
    const items = Array.from(this.queues.get(chatId)?.values() ?? []);
    this.queues.delete(chatId);
    this.suspendedThreads.delete(chatId);
    return items;
  }

  setSuspended(chatId: string, suspended: boolean) {
    if (suspended) {
      this.suspendedThreads.add(chatId);
    } else {
      this.suspendedThreads.delete(chatId);
    }
  }

  canStart(chatId: string, running: boolean) {
    return (
      !running &&
      !this.suspendedThreads.has(chatId) &&
      (this.queues.get(chatId)?.size ?? 0) > 0
    );
  }

  size(chatId: string) {
    return this.queues.get(chatId)?.size ?? 0;
  }
}
