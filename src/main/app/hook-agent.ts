/* eslint-disable max-classes-per-file, lines-between-class-members, no-continue, no-void, func-names, class-methods-use-this, no-plusplus, eqeqeq, @typescript-eslint/no-shadow, no-empty */
import { Agent, Dispatcher, ProxyAgent } from 'undici';
import { Readable } from 'stream';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'zlib';
import { isArray, isObject, isString } from '@/utils/is';
import { requestLogManager } from './request-logs';

const THREAD_ID_HEADER = 'X-AIME-CHAT-THREAD-ID';

class TextCapture {
  private chunks: string[] = [];

  append(value?: string) {
    if (!value) return;
    this.chunks.push(value);
  }

  toString() {
    return this.chunks.join('');
  }
}

interface RequestLogContext {
  threadId: string;
  method: string;
  url: string;
  requestHeaders?: Record<string, unknown>;
  requestBodyCapture: TextCapture;
  startMs: number;
  startTime: string;
  statusCode?: number;
  responseHeaders?: Record<string, unknown>;
  responseChunks: Buffer[];
  completed: boolean;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return Boolean(
    value &&
    typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] ===
    'function',
  );
}

function normalizeHeaders(
  headers?: unknown,
): Record<string, unknown> | undefined {
  if (!headers) return undefined;

  const normalized: Record<string, unknown> = {};

  if (Array.isArray(headers)) {
    for (let i = 0; i < headers.length; i += 2) {
      const key = headers[i];
      if (!key) continue;
      normalized[String(key)] = headers[i + 1];
    }
    return normalized;
  }

  if (typeof headers === 'object' && Symbol.iterator in headers) {
    try {
      for (const [key, value] of headers as Iterable<[string, unknown]>) {
        normalized[String(key)] = value;
      }
      return normalized;
    } catch {
      // fall through to Object.entries below
    }
  }

  for (const [key, value] of Object.entries(headers)) {
    normalized[key] = value;
  }

  return normalized;
}

function getHeader(headers: unknown, name: string) {
  const normalized = normalizeHeaders(headers);
  if (!normalized) return undefined;

  const target = name.toLowerCase();
  const matched = Object.entries(normalized).find(
    ([key]) => key.toLowerCase() === target,
  );
  const value = matched?.[1];

  if (Array.isArray(value)) return value[0]?.toString();
  return value?.toString();
}

function buildUrl(options: Dispatcher.DispatchOptions) {
  const origin =
    typeof options.origin === 'string'
      ? options.origin
      : (options.origin?.toString() ?? '');
  return `${origin}${options.path ?? ''}`;
}

function decodeResponseBody(
  chunks: Buffer[],
  headers?: Record<string, unknown>,
) {
  if (chunks.length === 0) return undefined;

  const raw = Buffer.concat(chunks);
  const encoding = getHeader(headers, 'content-encoding')?.toLowerCase();

  try {
    if (encoding?.includes('br')) {
      return brotliDecompressSync(raw).toString('utf8');
    }
    if (encoding?.includes('gzip')) {
      return gunzipSync(raw).toString('utf8');
    }
    if (encoding?.includes('deflate')) {
      return inflateSync(raw).toString('utf8');
    }
    return raw.toString('utf8');
  } catch {
    return `[unable to decode ${encoding || 'plain'} response body: ${raw.length} bytes]`;
  }
}

function finalizeRequestLog(context: RequestLogContext, error?: Error) {
  if (context.completed) return;
  context.completed = true;

  void requestLogManager.record({
    threadId: context.threadId,
    method: context.method,
    url: context.url,
    requestHeaders: context.requestHeaders,
    requestBody: context.requestBodyCapture.toString(),
    statusCode: context.statusCode,
    responseHeaders: context.responseHeaders,
    responseBody: decodeResponseBody(
      context.responseChunks,
      context.responseHeaders,
    ),
    durationMs: Date.now() - context.startMs,
    error: error?.message,
    startTime: context.startTime,
  });
}

function wrapHandler(
  handler: Dispatcher.DispatchHandler,
  context: RequestLogContext,
): Dispatcher.DispatchHandler {
  const wrapped = Object.create(handler) as Dispatcher.DispatchHandler;

  if (typeof handler.onResponseStart === 'function') {
    wrapped.onResponseStart = (
      controller,
      statusCode,
      headers,
      statusMessage,
    ) => {
      context.statusCode = statusCode;
      context.responseHeaders = normalizeHeaders(headers);
      return handler.onResponseStart?.call(
        handler,
        controller,
        statusCode,
        headers,
        statusMessage,
      );
    };
  }

  if (typeof handler.onResponseData === 'function') {
    wrapped.onResponseData = (controller, chunk) => {
      context.responseChunks.push(Buffer.from(chunk));
      return handler.onResponseData?.call(handler, controller, chunk);
    };
  }

  if (typeof handler.onResponseEnd === 'function') {
    wrapped.onResponseEnd = (controller, trailers) => {
      try {
        return handler.onResponseEnd?.call(handler, controller, trailers);
      } finally {
        finalizeRequestLog(context);
      }
    };
  }

  if (typeof handler.onResponseError === 'function') {
    wrapped.onResponseError = (controller, error) => {
      try {
        return handler.onResponseError?.call(handler, controller, error);
      } finally {
        finalizeRequestLog(context, error);
      }
    };
  }

  if (typeof handler.onHeaders === 'function') {
    wrapped.onHeaders = (statusCode, headers, resume, statusText) => {
      context.statusCode = statusCode;
      context.responseHeaders = normalizeHeaders(headers);
      return handler.onHeaders?.call(
        handler,
        statusCode,
        headers,
        resume,
        statusText,
      );
    };
  }

  if (typeof handler.onData === 'function') {
    wrapped.onData = (chunk) => {
      context.responseChunks.push(Buffer.from(chunk));
      return handler.onData?.call(handler, chunk);
    };
  }

  if (typeof handler.onComplete === 'function') {
    wrapped.onComplete = (trailers) => {
      try {
        return handler.onComplete?.call(handler, trailers);
      } finally {
        finalizeRequestLog(context);
      }
    };
  }

  if (typeof handler.onError === 'function') {
    wrapped.onError = (error) => {
      try {
        return handler.onError?.call(handler, error);
      } finally {
        finalizeRequestLog(context, error);
      }
    };
  }

  return wrapped;
}

function createRequestLogContext(
  options: Dispatcher.DispatchOptions,
  method: string,
  requestBodyCapture: TextCapture,
) {
  const threadId = getHeader(options.headers, THREAD_ID_HEADER);
  if (!threadId || !requestLogManager.isEnabled()) return undefined;

  return {
    threadId,
    method,
    url: buildUrl(options),
    requestHeaders: normalizeHeaders(options.headers),
    requestBodyCapture,
    startMs: Date.now(),
    startTime: new Date().toISOString(),
    responseChunks: [],
    completed: false,
  } satisfies RequestLogContext;
}

function removeContentLength(headers: Dispatcher.DispatchOptions['headers']) {
  const next = normalizeHeaders(headers) || {};
  delete next['content-length'];
  delete next['Content-Length'];
  return next as Dispatcher.DispatchOptions['headers'];
}

export class HookAgent extends Agent {
  dispatch(
    options: Agent.DispatchOptions,
    handler: Dispatcher.DispatchHandler,
  ) {
    const method = (options.method || 'GET').toUpperCase();
    const shouldLog = Boolean(
      requestLogManager.isEnabled() &&
      getHeader(options.headers, THREAD_ID_HEADER),
    );
    const requestBodyCapture = new TextCapture();

    if (method !== 'GET' && method !== 'HEAD' && options.body) {
      options.body = this.transformBody(
        options.body,
        shouldLog ? requestBodyCapture : undefined,
      );
    }

    const context = shouldLog
      ? createRequestLogContext(options, method, requestBodyCapture)
      : undefined;

    return super.dispatch(
      options,
      context ? wrapHandler(handler, context) : handler,
    );
  }

  protected transformBody(
    body: Dispatcher.DispatchOptions['body'],
    capture?: TextCapture,
  ): Dispatcher.DispatchOptions['body'] {
    if (
      typeof body === 'string' ||
      Buffer.isBuffer(body) ||
      body instanceof Uint8Array
    ) {
      const content = body.toString();
      const modified = this.modifyContent(content);
      capture?.append(modified);
      return modified;
    }

    if (!isAsyncIterable(body)) {
      return body;
    }

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const self = this;
    const generator = async function* () {
      for await (const chunk of body) {
        let text: string | undefined;
        if (typeof chunk === 'string') {
          text = chunk;
        } else if (Buffer.isBuffer(chunk) || chunk instanceof Uint8Array) {
          text = decoder.decode(chunk);
        }

        if (text) {
          const modified = self.modifyContent(text);
          capture?.append(modified);
          yield encoder.encode(modified);
        } else {
          yield chunk;
        }
      }
    };

    return Readable.from(generator());
  }

  protected modifyContent(content: string): string {
    // 默认不修改，子类可以覆盖
    return content;
  }
}

export class HookProxyAgent extends ProxyAgent {
  dispatch(
    options: Agent.DispatchOptions,
    handler: Dispatcher.DispatchHandler,
  ) {
    const method = (options.method || 'GET').toUpperCase();
    const shouldLog = Boolean(
      requestLogManager.isEnabled() &&
      getHeader(options.headers, THREAD_ID_HEADER),
    );
    const requestBodyCapture = new TextCapture();

    if (method === 'POST' && options.body) {
      options.body = this.transformBody(
        options.body,
        shouldLog ? requestBodyCapture : undefined,
      );

      // 删除 Content-Length，HTTP 会自动使用 chunked 编码
      options.headers = removeContentLength(options.headers);
    }

    const context = shouldLog
      ? createRequestLogContext(options, method, requestBodyCapture)
      : undefined;

    return super.dispatch(
      options,
      context ? wrapHandler(handler, context) : handler,
    );
  }

  private transformBody(
    body: Dispatcher.DispatchOptions['body'],
    capture?: TextCapture,
  ): Dispatcher.DispatchOptions['body'] {
    if (
      typeof body === 'string' ||
      Buffer.isBuffer(body) ||
      body instanceof Uint8Array
    ) {
      const content = body.toString();
      const modified = this.modifyContent(content);
      capture?.append(modified);
      return modified;
    }

    if (!isAsyncIterable(body)) {
      return body;
    }

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const self = this;
    const generator = async function* () {
      for await (const chunk of body) {
        let text: string | undefined;
        if (typeof chunk === 'string') {
          text = chunk;
        } else if (Buffer.isBuffer(chunk) || chunk instanceof Uint8Array) {
          text = decoder.decode(chunk);
        }

        if (text) {
          const modified = self.modifyContent(text);
          capture?.append(modified);
          yield encoder.encode(modified);
        } else {
          yield chunk;
        }
      }
    };

    return Readable.from(generator());
  }

  protected modifyContent(content: string): string {
    let jsonObject = null;
    try {
      jsonObject = JSON.parse(content);
      if (jsonObject.messages) {
        for (let i = 0; i < jsonObject.messages.length; i++) {
          const message = jsonObject.messages[i];
          if (
            message.role == 'tool' &&
            isString(message.content) &&
            (message.content.startsWith('{') &&
              message.content.endsWith('}') || (message.content.startsWith('[') && message.content.endsWith(']')))
          ) {
            try {
              const content = JSON.parse(message.content);
              if (
                isArray(content) &&
                content?.length > 0 &&
                content?.find(
                  (x) =>
                    (x.type == 'image-data' || x.type == 'video-data') &&
                    x.data
                )
              ) {
                const newContent = [];
                for (const part of content) {
                  if (part.type == 'image-data' && part.data) {
                    newContent.push({
                      type: 'image_url',
                      image_url: {
                        url: part.data.startsWith('data:')
                          ? part.data
                          : `data:${part.mediaType || part.mimeType || 'image/jpeg'};base64,${part.data}`,
                      },
                    });
                  } else if (
                    part.type == 'video-data' &&
                    part.data
                  ) {
                    newContent.push({
                      type: 'video_url',
                      video_url: {
                        url: part.data.startsWith('data:')
                          ? part.data
                          : `data:${part.mediaType || part.mimeType};base64,${part.data}`,
                      },
                    });
                  } else {
                    newContent.push(part);
                  }
                }
                jsonObject.messages[i].content = newContent;
              } else if (
                isObject(content) &&
                'result' in content &&
                content.result &&
                isArray(content.result)
              ) {
                const newContent = [];
                for (const part of content.result) {
                  if (part.type == 'image' && part.data && part.mimeType) {
                    newContent.push({
                      type: 'image_url',
                      image_url: {
                        url: part.data.startsWith('data:')
                          ? part.data
                          : `data:${part.mimeType};base64,${part.data}`,
                      },
                    });
                  } else if (
                    part.type == 'video' &&
                    part.data &&
                    part.mimeType
                  ) {
                    newContent.push({
                      type: 'video_url',
                      video_url: {
                        url: part.data.startsWith('data:')
                          ? part.data
                          : `data:${part.mimeType};base64,${part.data}`,
                      },
                    });
                  } else if (part.type == 'text' && part.text) {
                    newContent.push({ type: 'text', text: part.text });
                  } else {
                    newContent.push(part);
                  }
                }
                jsonObject.messages[i].content = newContent;
              } else {
                continue;
              }
            } catch {
              continue;
            }
          }
        }
        // console.log(JSON.stringify(jsonObject));

        return JSON.stringify(jsonObject);
      }

      // if ("input" in jsonObject && Array.isArray(jsonObject.input) && jsonObject.input.length > 0) {

      //   jsonObject.input = jsonObject.input.filter(x=>x.type != 'item_reference' || (x.type == 'item_reference' && !x?.id?.startsWith('rs_')))

      // }
    } catch { }
    return content;
  }
}
