import type { UIMessage } from 'ai';
import type { ChatMessageInjectionMode } from '@/types/chat';
import {
  ChatMessageQueue,
  resolveChatMessageInjectionMode,
  type QueuedChatMessage,
  type QueuedChatMessageSource,
} from '../chat-message-queue';

function queuedMessage(
  id: string,
  injectionMode: ChatMessageInjectionMode,
  source: QueuedChatMessageSource = 'user',
  patch: Partial<QueuedChatMessage> = {},
): QueuedChatMessage {
  return {
    id,
    chatId: 'thread-1',
    source,
    injectionMode,
    message: {
      id,
      role: 'user',
      parts: [{ type: 'text', text: id }],
    } as UIMessage,
    ...patch,
  };
}

describe('ChatMessageQueue', () => {
  it('resolves the new mode and keeps the legacy immediate flag compatible', () => {
    expect(resolveChatMessageInjectionMode({})).toBe('after-session');
    expect(resolveChatMessageInjectionMode({ immediate: true })).toBe(
      'immediate',
    );
    expect(resolveChatMessageInjectionMode({ immediate: false })).toBe(
      'after-session',
    );
    expect(
      resolveChatMessageInjectionMode({
        injectionMode: 'after-session',
        immediate: true,
      }),
    ).toBe('after-session');
    expect(resolveChatMessageInjectionMode({}, 'immediate')).toBe('immediate');
  });

  it('keeps FIFO order within each priority and isolates threads', () => {
    const queue = new ChatMessageQueue();
    queue.enqueue(queuedMessage('after-1', 'after-session'));
    queue.enqueue(
      queuedMessage('other-thread', 'immediate', 'user', {
        chatId: 'thread-2',
      }),
    );
    queue.enqueue(queuedMessage('bash-1', 'immediate', 'background-bash'));
    queue.enqueue(queuedMessage('user-1', 'immediate'));
    queue.enqueue(queuedMessage('agent-1', 'immediate', 'background-agent'));

    expect(queue.takeNext('thread-1')?.id).toBe('bash-1');
    expect(queue.takeNext('thread-1')?.id).toBe('user-1');
    expect(queue.takeNext('thread-1')?.id).toBe('agent-1');
    expect(queue.takeNext('thread-1')?.id).toBe('after-1');
    expect(queue.takeNext('thread-2')?.id).toBe('other-thread');
  });

  it('upserts user messages without moving their queue position', () => {
    const queue = new ChatMessageQueue();
    queue.enqueue(queuedMessage('first', 'after-session'));
    queue.enqueue(queuedMessage('second', 'after-session'));

    expect(
      queue.enqueue(
        queuedMessage('first', 'immediate', 'user', { immediate: true }),
      ),
    ).toBe('updated');
    expect(queue.size('thread-1')).toBe(2);
    expect(queue.takeNext('thread-1', ['immediate'])?.id).toBe('first');
    expect(queue.takeNext('thread-1', ['after-session'])?.id).toBe('second');
  });

  it('deduplicates internal completion messages', () => {
    const queue = new ChatMessageQueue();
    const item = queuedMessage(
      'background-bash:bash-1',
      'immediate',
      'background-bash',
    );

    expect(queue.enqueue(item, { updateExisting: false })).toBe('queued');
    expect(queue.enqueue(item, { updateExisting: false })).toBe('duplicate');
    expect(queue.size('thread-1')).toBe(1);
  });

  it('batches adjacent background injections without crossing a user message', () => {
    const queue = new ChatMessageQueue();
    queue.enqueue(queuedMessage('after-1', 'after-session'));
    queue.enqueue(queuedMessage('bash-1', 'immediate', 'background-bash'));
    queue.enqueue(queuedMessage('agent-1', 'immediate', 'background-agent'));
    queue.enqueue(queuedMessage('user-1', 'immediate'));
    queue.enqueue(queuedMessage('bash-2', 'immediate', 'background-bash'));

    expect(queue.takeNextBatch('thread-1').map((item) => item.id)).toEqual([
      'bash-1',
      'agent-1',
    ]);
    expect(queue.takeNextBatch('thread-1').map((item) => item.id)).toEqual([
      'user-1',
    ]);
    expect(queue.takeNextBatch('thread-1').map((item) => item.id)).toEqual([
      'bash-2',
    ]);
    expect(queue.takeNext('thread-1')?.id).toBe('after-1');
  });

  it('drains immediate background completions before after-session user messages', () => {
    const queue = new ChatMessageQueue();
    queue.enqueue(
      queuedMessage('bash-immediate', 'immediate', 'background-bash'),
    );
    queue.enqueue(
      queuedMessage('agent-immediate', 'immediate', 'background-agent'),
    );
    queue.enqueue(queuedMessage('user-after', 'after-session'));

    expect(
      queue.takeNextBatch('thread-1', ['immediate']).map((item) => item.id),
    ).toEqual(['bash-immediate', 'agent-immediate']);
    expect(queue.takeNext('thread-1', ['after-session'])?.id).toBe(
      'user-after',
    );
  });

  it('blocks idle starts while suspended and clears all thread state', () => {
    const queue = new ChatMessageQueue();
    queue.enqueue(queuedMessage('after-1', 'after-session'));

    expect(queue.canStart('thread-1', true)).toBe(false);
    queue.setSuspended('thread-1', true);
    expect(queue.canStart('thread-1', false)).toBe(false);
    expect(queue.clear('thread-1').map((item) => item.id)).toEqual(['after-1']);
    expect(queue.canStart('thread-1', false)).toBe(false);

    queue.enqueue(queuedMessage('after-2', 'after-session'));
    expect(queue.canStart('thread-1', false)).toBe(true);
  });

  it('removes a single message and drops an empty per-thread queue', () => {
    const queue = new ChatMessageQueue();
    queue.enqueue(queuedMessage('after-1', 'after-session'));

    expect(queue.remove('thread-1', 'after-1')?.id).toBe('after-1');
    expect(queue.remove('thread-1', 'missing')).toBeUndefined();
    expect(queue.size('thread-1')).toBe(0);
  });
});
