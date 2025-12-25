import mitt from 'mitt';

// export type RendererEvents = {
//   [`chat:onData:${string}`]: { data: unknown };
//   [`chat:onFinish:${string}`]: { event: unknown };
// };

export const eventBus = mitt();
