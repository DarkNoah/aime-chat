import { ChatQueueManager } from './chat-queue';
import type { ChatInput } from '@/types/chat';

const createInput = (text: string): ChatInput =>
  ({
    chatId: 'thread-1',
    model: 'provider/model',
    messages: [
      {
        id: `message-${text}`,
        role: 'user',
        parts: [{ type: 'text', text }],
      },
    ],
    requireToolApproval: false,
  }) as ChatInput;

describe('ChatQueueManager', () => {
  it('dequeues queued messages in FIFO order', () => {
    const queue = new ChatQueueManager();

    const first = queue.enqueue(createInput('first'));
    const second = queue.enqueue(createInput('second'));

    expect(queue.getState()).toMatchObject({
      sendNextRequested: false,
      items: [
        { id: first.id, preview: 'first' },
        { id: second.id, preview: 'second' },
      ],
    });
    expect(queue.dequeue()?.id).toBe(first.id);
    expect(queue.dequeue()?.id).toBe(second.id);
    expect(queue.dequeue()).toBeUndefined();
  });

  it('marks only the queue head for immediate send', () => {
    const queue = new ChatQueueManager();
    const first = queue.enqueue(createInput('first'));
    const second = queue.enqueue(createInput('second'));

    expect(queue.requestSendNext(first.id)).toBe(true);
    expect(queue.requestSendNext(second.id)).toBe(false);
    expect(queue.getState().items).toMatchObject([
      { id: first.id, sendNext: true },
      { id: second.id, sendNext: false },
    ]);
  });

  it('clears immediate-send state when the head is removed', () => {
    const queue = new ChatQueueManager();
    const first = queue.enqueue(createInput('first'));
    const second = queue.enqueue(createInput('second'));
    queue.requestSendNext(first.id);

    expect(queue.remove(first.id)).toBe(true);

    expect(queue.getState()).toMatchObject({
      sendNextRequested: false,
      items: [{ id: second.id, sendNext: false }],
    });
  });
});
