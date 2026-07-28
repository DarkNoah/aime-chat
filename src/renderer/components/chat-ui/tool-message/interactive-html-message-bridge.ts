export type InteractiveHtmlMessageListener = (event: MessageEvent) => void;

const listeners = new Set<InteractiveHtmlMessageListener>();
let isListening = false;

const dispatchMessage = (event: MessageEvent) => {
  listeners.forEach((listener) => listener(event));
};

export const subscribeToInteractiveHtmlMessages = (
  listener: InteractiveHtmlMessageListener,
) => {
  listeners.add(listener);

  if (!isListening) {
    window.addEventListener('message', dispatchMessage);
    isListening = true;
  }

  return () => {
    listeners.delete(listener);
    if (isListening && listeners.size === 0) {
      window.removeEventListener('message', dispatchMessage);
      isListening = false;
    }
  };
};
