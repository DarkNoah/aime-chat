import type { ChatStatus } from 'ai';

type ChatInputSubmitState = {
  disabled: boolean;
  showSecondaryStop: boolean;
  status?: ChatStatus;
};

export function getChatInputSubmitState(
  status: ChatStatus | undefined,
  hasPendingInput: boolean,
): ChatInputSubmitState {
  if (status === 'streaming') {
    return {
      disabled: false,
      showSecondaryStop: hasPendingInput,
      status: hasPendingInput ? 'ready' : 'streaming',
    };
  }

  if (status === 'submitted' && hasPendingInput) {
    return {
      disabled: false,
      showSecondaryStop: false,
      status: 'ready',
    };
  }

  return {
    disabled: !hasPendingInput,
    showSecondaryStop: false,
    status: status === 'error' ? 'ready' : status,
  };
}
