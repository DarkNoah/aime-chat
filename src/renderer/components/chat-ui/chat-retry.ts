import type { UIMessage } from 'ai';
import type { ThreadState } from '@/types/chat';

const isSystemReminderPart = (part: UIMessage['parts'][number]) =>
  part.type === 'text' && part.text.trim().startsWith('<system-reminder>');

const getLastResponsePart = (message: UIMessage) => {
  for (let index = message.parts.length - 1; index >= 0; index -= 1) {
    const part = message.parts[index];
    if (
      !isSystemReminderPart(part) &&
      (part.type === 'text' ||
        part.type === 'reasoning' ||
        part.type.startsWith('tool-'))
    ) {
      return part;
    }
  }
  return undefined;
};

const hasPendingToolInteraction = (message: UIMessage, part: any) => {
  if (!part?.type?.startsWith('tool-') || !part.toolCallId) {
    return false;
  }

  const matchesToolCall = (value: any) => value?.toolCallId === part.toolCallId;
  const metadata = message.metadata as any;

  return (
    message.parts.some(
      (messagePart: any) =>
        (messagePart.type === 'data-tool-call-approval' ||
          messagePart.type === 'data-tool-call-suspended') &&
        matchesToolCall(messagePart.data),
    ) ||
    Object.values(metadata?.pendingToolApprovals ?? {}).some(matchesToolCall) ||
    Object.values(metadata?.suspendedTools ?? {}).some(matchesToolCall)
  );
};

export const shouldShowManualRetry = (
  messages: UIMessage[] | undefined,
  status: ThreadState['status'] | undefined,
) => {
  if (status !== 'ready' && status !== 'error') {
    return false;
  }

  const visibleMessages =
    messages?.filter(
      (message) =>
        (message.metadata as any)?.systemReminder !== true &&
        !(
          message.parts.length > 0 && message.parts.every(isSystemReminderPart)
        ),
    ) ?? [];
  const lastMessage = visibleMessages[visibleMessages.length - 1];
  if (!lastMessage) {
    return false;
  }
  if (lastMessage.role === 'user') {
    return true;
  }
  if (lastMessage.role !== 'assistant') {
    return false;
  }

  const lastPart = getLastResponsePart(lastMessage);
  if (
    lastPart?.type === 'text' &&
    typeof lastPart.text === 'string' &&
    lastPart.text.trim()
  ) {
    return false;
  }

  return !hasPendingToolInteraction(lastMessage, lastPart);
};
