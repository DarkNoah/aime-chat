import { UIMessage } from '@ai-sdk/react';
import {
  HttpChatTransport,
  ChatTransport,
  ChatRequestOptions,
  UIMessageChunk,
  FinishReason,
  ProviderMetadata,
  JSONValue,
  HttpChatTransportInitOptions,
} from 'ai';
import {
  EventSourceMessage,
  lazySchema,
  parseJsonEventStream,
  ParseResult,
  zodSchema,
} from '@ai-sdk/provider-utils';

import z from 'zod';
import { ChatChangedType, ChatEvent } from '@/types/chat';

export const jsonValueSchema: z.ZodType<JSONValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.string(),
    z.number(),
    z.boolean(),
    z.record(z.string(), jsonValueSchema.optional()),
    z.array(jsonValueSchema),
  ]),
);
export const providerMetadataSchema: z.ZodType<ProviderMetadata> = z.record(
  z.string(),
  z.record(z.string(), jsonValueSchema.optional()),
);

export const uiMessageChunkSchema = lazySchema(() =>
  zodSchema(
    z.union([
      z.strictObject({
        type: z.literal('text-start'),
        id: z.string(),
        providerMetadata: providerMetadataSchema.optional(),
      }),
      z.strictObject({
        type: z.literal('text-delta'),
        id: z.string(),
        delta: z.string(),
        providerMetadata: providerMetadataSchema.optional(),
      }),
      z.strictObject({
        type: z.literal('text-end'),
        id: z.string(),
        providerMetadata: providerMetadataSchema.optional(),
      }),
      z.strictObject({
        type: z.literal('error'),
        errorText: z.string(),
      }),
      z.strictObject({
        type: z.literal('tool-input-start'),
        toolCallId: z.string(),
        toolName: z.string(),
        providerExecuted: z.boolean().optional(),
        dynamic: z.boolean().optional(),
        title: z.string().optional(),
      }),
      z.strictObject({
        type: z.literal('tool-input-delta'),
        toolCallId: z.string(),
        inputTextDelta: z.string(),
      }),
      z.strictObject({
        type: z.literal('tool-input-available'),
        toolCallId: z.string(),
        toolName: z.string(),
        input: z.unknown(),
        providerExecuted: z.boolean().optional(),
        providerMetadata: providerMetadataSchema.optional(),
        dynamic: z.boolean().optional(),
        title: z.string().optional(),
      }),
      z.strictObject({
        type: z.literal('tool-input-error'),
        toolCallId: z.string(),
        toolName: z.string(),
        input: z.unknown(),
        providerExecuted: z.boolean().optional(),
        providerMetadata: providerMetadataSchema.optional(),
        dynamic: z.boolean().optional(),
        errorText: z.string(),
        title: z.string().optional(),
      }),
      z.strictObject({
        type: z.literal('tool-approval-requested'),
        runId: z.string(),
        toolName: z.string(),
        toolCallId: z.string(),
      }),
      z.strictObject({
        type: z.literal('tool-output-available'),
        toolCallId: z.string(),
        output: z.unknown(),
        providerExecuted: z.boolean().optional(),
        dynamic: z.boolean().optional(),
        preliminary: z.boolean().optional(),
      }),
      z.strictObject({
        type: z.literal('tool-output-error'),
        toolCallId: z.string(),
        errorText: z.string(),
        providerExecuted: z.boolean().optional(),
        dynamic: z.boolean().optional(),
      }),
      z.strictObject({
        type: z.literal('tool-output-denied'),
        toolCallId: z.string(),
      }),
      z.strictObject({
        type: z.literal('tool-call-approval'),
        toolCallId: z.string(),
      }),

      z.strictObject({
        type: z.literal('reasoning-start'),
        id: z.string(),
        providerMetadata: providerMetadataSchema.optional(),
      }),
      z.strictObject({
        type: z.literal('reasoning-delta'),
        id: z.string(),
        delta: z.string(),
        providerMetadata: providerMetadataSchema.optional(),
      }),
      z.strictObject({
        type: z.literal('reasoning-end'),
        id: z.string(),
        providerMetadata: providerMetadataSchema.optional(),
      }),
      z.strictObject({
        type: z.literal('source-url'),
        sourceId: z.string(),
        url: z.string(),
        title: z.string().optional(),
        providerMetadata: providerMetadataSchema.optional(),
      }),
      z.strictObject({
        type: z.literal('source-document'),
        sourceId: z.string(),
        mediaType: z.string(),
        title: z.string(),
        filename: z.string().optional(),
        providerMetadata: providerMetadataSchema.optional(),
      }),
      z.strictObject({
        type: z.literal('file'),
        url: z.string(),
        mediaType: z.string(),
        providerMetadata: providerMetadataSchema.optional(),
      }),
      z.strictObject({
        type: z.custom<`data-${string}`>(
          (value): value is `data-${string}` =>
            typeof value === 'string' && value.startsWith('data-'),
          { message: 'Type must start with "data-"' },
        ),
        id: z.string().optional(),
        data: z.unknown(),
        transient: z.boolean().optional(),
      }),
      z.strictObject({
        type: z.literal('start-step'),
      }),
      z.strictObject({
        type: z.literal('finish-step'),
      }),
      z.strictObject({
        type: z.literal('start'),
        messageId: z.string().optional(),
        messageMetadata: z.unknown().optional(),
      }),
      z.strictObject({
        type: z.literal('finish'),
        finishReason: z
          .enum([
            'stop',
            'length',
            'content-filter',
            'tool-calls',
            'error',
            'other',
            'unknown',
          ] as const satisfies readonly FinishReason[])
          .optional(),
        messageMetadata: z.unknown().optional(),
      }),
      z.strictObject({
        type: z.literal('abort'),
      }),
      z.strictObject({
        type: z.literal('message-metadata'),
        messageMetadata: z.unknown(),
      }),
    ]),
  ),
);

export class IpcChatTransport implements ChatTransport<UIMessage> {
  mode: 'agent' | 'workflow' = 'agent';

  constructor(mode: 'agent' | 'workflow' = 'agent') {
    this.mode = mode;
  }

  async sendMessages(
    options: {
      /** The type of message submission - either new message or regeneration */
      trigger: 'submit-message' | 'regenerate-message';
      /** Unique identifier for the chat session */
      chatId: string;
      /** ID of the message to regenerate, or undefined for new messages */
      messageId: string | undefined;
      /** Array of UI messages representing the conversation history */
      messages: UIMessage[];
      /** Signal to abort the request if needed */
      abortSignal: AbortSignal | undefined;
      body: any;
    } & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    // 发送 IPC 消息，开始聊天
    if (this.mode === 'agent') {
      window.electron.mastra.chat({
        messages: options.messages,
        messageId: options.messageId,
        trigger: options.trigger,
        chatId: options.chatId,
        ...options.body,
      });
    } else if (this.mode === 'workflow') {
      window.electron.mastra.chatWorkflow({
        messages: options.messages,
        messageId: options.messageId,
        trigger: options.trigger,
        chatId: options.chatId,
        ...options.body,
      });
    }

    const ts = new TransformStream<
      UIMessageChunk,
      Uint8Array<ArrayBufferLike>
    >();
    // const writer = ts.writable.getWriter();
    const channel = `chat:event:${options.chatId}`;
    let isClosed = false;
    const encoder = new TextEncoder();
    const mode = this.mode;

    // 创建流来接收 IPC 事件
    const stream = new ReadableStream<Uint8Array<ArrayBufferLike>>({
      async start(controller) {
        const clearup = () => {
          window.electron.ipcRenderer.removeListener(channel, handleEvent);
        };

        const handleEvent = (event: {
          type: ChatEvent;
          data: string | any;
        }) => {
          if (isClosed) return;
          if (event.type === ChatEvent.ChatChunk) {
            let chunk = JSON.parse(event.data);
            let chunkUint8Array;

            if (mode == 'workflow') {
              if (
                chunk.type === 'workflow-step-output' &&
                chunk.from == 'USER'
              ) {
                chunkUint8Array = encoder.encode(
                  `data: ${JSON.stringify(chunk.payload.output)}\n\n`,
                );
              }
            } else {
              // console.log(chunk);
              chunkUint8Array = encoder.encode(
                `data: ${JSON.stringify(chunk)}\n\n`,
              );
            }
            if (chunkUint8Array) {
              controller.enqueue(chunkUint8Array);
            }
            if (chunk.type == 'abort') {
              isClosed = true;
              controller.close();
              clearup();
            }
          } else if (event.type === ChatEvent.ChatChanged) {
            const { type, chatId } = event.data;
            if (type === ChatChangedType.Finish) {
              isClosed = true;
              controller.close();
              clearup();
            } else if (type === ChatChangedType.Start) {
            }

            return;
          } else if (event.type === ChatEvent.ChatError) {
            clearup();
            isClosed = true;
            controller.error(new Error(event.data as string));
            // controller.close();
            clearup();
            return;
          } else if (event.type === ChatEvent.ChatUsage) {
            const chunk = {
              type: 'data-usage',
              data: event.data,
            };
            const chunkUint8Array = encoder.encode(
              `data: ${JSON.stringify(chunk)}\n\n`,
            );
            controller.enqueue(chunkUint8Array);
            return;
          } else if (event.type === ChatEvent.ChatStepFinish) {
            const chunk = {
              type: 'data-step-finish',
              data: event.data,
            };
            const chunkUint8Array = encoder.encode(
              `data: ${JSON.stringify(chunk)}\n\n`,
            );
            controller.enqueue(chunkUint8Array);
          }
        };

        window.electron.ipcRenderer.on(channel, handleEvent);
      },

      cancel() {
        // 流被取消时（例如组件卸载）
        console.log('Stream was canceled');
        isClosed = true;
        // 注意：这里无法访问 start 中的变量，实际清理在 start 的 cleanup 中完成
      },
    });

    if (options.abortSignal) {
      const abortListener = () => {
        console.log('chatAbort', options.chatId);
        window.electron.mastra.chatAbort(options.chatId);
      };
      options.abortSignal.addEventListener('abort', abortListener, {
        once: true,
      });
    }
    return this.processResponseStream(stream);
  }

  async reconnectToStream(
    options: { chatId: string } & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    // IPC 方案不支持重连
    debugger;
    return null;
  }

  protected processResponseStream(
    stream: ReadableStream<Uint8Array<ArrayBufferLike>>,
  ): ReadableStream<UIMessageChunk> {
    return parseJsonEventStream({
      stream,
      schema: uiMessageChunkSchema,
    }).pipeThrough(
      new TransformStream<ParseResult<UIMessageChunk>, UIMessageChunk>({
        async transform(chunk, controller) {
          if (!chunk.success) {
            throw chunk.error;
          }
          controller.enqueue(chunk.value);
        },
      }),
    );
  }
}
