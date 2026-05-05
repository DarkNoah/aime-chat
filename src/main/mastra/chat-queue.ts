import type {
  ChatInput,
  ChatQueuedMessage,
  ChatQueueState,
} from '@/types/chat';

export type QueuedChatMessage = ChatQueuedMessage & {
  input: ChatInput;
};

function getMessagePreview(input: ChatInput) {
  const message = input.messages[input.messages.length - 1];
  const text = message?.parts
    ?.filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();

  if (text) {
    return text.length > 120 ? `${text.slice(0, 117)}...` : text;
  }

  const attachmentCount =
    message?.parts?.filter((part) => part.type === 'file').length ?? 0;
  return attachmentCount > 0 ? 'Sent with attachments' : 'Queued message';
}

function getAttachmentCount(input: ChatInput) {
  const message = input.messages[input.messages.length - 1];
  return message?.parts?.filter((part) => part.type === 'file').length ?? 0;
}

export class ChatQueueManager {
  private items: QueuedChatMessage[] = [];

  private sendNextRequested = false;

  constructor(private readonly chatId = '') {}

  private createId() {
    return `queue_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  }

  enqueue(input: ChatInput): QueuedChatMessage {
    const message = input.messages[input.messages.length - 1];
    const item: QueuedChatMessage = {
      id: this.createId(),
      chatId: input.chatId,
      createdAt: new Date().toISOString(),
      preview: getMessagePreview(input),
      attachmentCount: getAttachmentCount(input),
      sendNext: false,
      input: {
        ...input,
        messages: message ? [message] : [],
      },
    };
    this.items.push(item);
    return item;
  }

  dequeue(): QueuedChatMessage | undefined {
    const item = this.items.shift();
    this.sendNextRequested = false;
    return item;
  }

  requestSendNext(itemId?: string) {
    const head = this.items[0];
    if (!head) return false;
    if (itemId && head.id !== itemId) return false;
    this.sendNextRequested = true;
    return true;
  }

  remove(itemId: string) {
    const index = this.items.findIndex((item) => item.id === itemId);
    if (index < 0) return false;
    this.items.splice(index, 1);
    if (index === 0) {
      this.sendNextRequested = false;
    }
    return true;
  }

  shouldSendNext() {
    return this.sendNextRequested && this.items.length > 0;
  }

  hasItems() {
    return this.items.length > 0;
  }

  getState(): ChatQueueState {
    return {
      chatId: this.items[0]?.chatId ?? this.chatId,
      sendNextRequested: this.sendNextRequested,
      items: this.items.map(({ input, ...item }, index) => ({
        ...item,
        sendNext: index === 0 && this.sendNextRequested,
      })),
    };
  }
}
