/** @jest-environment node */
import { Agent, Dispatcher, ProxyAgent } from 'undici';
import { Readable } from 'stream';
import { HookAgent, HookProxyAgent } from '../hook-agent';
import { requestLogManager } from '../request-logs';

jest.mock('../request-logs', () => ({
  requestLogManager: {
    isEnabled: jest.fn(() => false),
    record: jest.fn(),
  },
}));

async function readBody(body: Dispatcher.DispatchOptions['body']) {
  if (typeof body === 'string') return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe.each([false, true])('request logging enabled: %s', (logging) => {
  describe.each(['direct', 'proxy'] as const)('%s upload transport', (mode) => {
    let agent: HookAgent | HookProxyAgent;
    let dispatch: jest.SpyInstance;

    beforeEach(() => {
      jest.mocked(requestLogManager.isEnabled).mockReturnValue(logging);
      dispatch = jest
        .spyOn(
          mode === 'direct' ? Agent.prototype : ProxyAgent.prototype,
          'dispatch',
        )
        .mockReturnValue(true);
      agent =
        mode === 'direct'
          ? new HookAgent()
          : new HookProxyAgent('http://127.0.0.1:8080');
    });

    afterEach(async () => {
      dispatch.mockRestore();
      await agent.close();
    });

    it('preserves every byte and the length of a real multipart video upload', async () => {
      // Invalid UTF-8 bytes reproduce the corruption of an MP4 moov box size.
      const video = Buffer.from([
        0, 0, 8, 0xd2, 0x6d, 0x6f, 0x6f, 0x76, 0xff, 0x80,
      ]);
      const form = new FormData();
      form.append('key', 'reference.mp4');
      form.append(
        'file',
        new Blob([video], { type: 'video/mp4' }),
        'reference.mp4',
      );
      const request = new Request('https://example.com/upload', {
        method: 'POST',
        body: form,
      });
      const bytes = Buffer.from(await request.arrayBuffer());
      const body = Readable.from([bytes.subarray(0, 50), bytes.subarray(50)]);
      const headers = {
        'content-type': request.headers.get('content-type')!,
        'content-length': String(bytes.length),
        'X-AIME-CHAT-THREAD-ID': 'test-thread',
      };
      agent.dispatch(
        {
          origin: 'https://example.com',
          path: '/upload',
          method: 'POST',
          headers,
          body,
        },
        {},
      );
      const sent = dispatch.mock.calls[0][0] as Dispatcher.DispatchOptions;
      expect(await readBody(sent.body)).toEqual(bytes);
      expect(sent.body).toBe(body);
      expect(sent.headers).toBe(headers);
    });

    it.each(['video/mp4', 'application/octet-stream', undefined])(
      'preserves binary buffers with content type %s',
      async (contentType) => {
        const body = Buffer.from([0, 0xd2, 0xff, 0x80]);
        const headers = {
          ...(contentType ? { 'Content-Type': contentType } : {}),
          'Content-Length': String(body.length),
          'X-AIME-CHAT-THREAD-ID': 'test-thread',
        };
        agent.dispatch(
          {
            origin: 'https://example.com',
            path: '/upload',
            method: 'POST',
            headers,
            body,
          },
          {},
        );
        const sent = dispatch.mock.calls[0][0] as Dispatcher.DispatchOptions;
        expect(sent.body).toBe(body);
        expect(sent.headers).toBe(headers);
      },
    );

    it.each(['Application/JSON; charset=utf-8', 'application/vnd.api+json'])(
      'still rewrites multimodal tool results for %s',
      async (contentType) => {
        const body = JSON.stringify({
          messages: [
            {
              role: 'tool',
              content: JSON.stringify([
                { type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' },
              ]),
            },
          ],
        });
        agent.dispatch(
          {
            origin: 'https://example.com',
            path: '/chat',
            method: 'POST',
            headers: {
              'Content-Type': contentType,
              'Content-Length': String(Buffer.byteLength(body)),
            },
            body,
          },
          {},
        );
        const sent = dispatch.mock.calls[0][0] as Dispatcher.DispatchOptions;
        expect(
          JSON.parse((await readBody(sent.body)).toString()).messages[0]
            .content,
        ).toEqual([
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,aGVsbG8=' },
          },
        ]);
        expect(sent.headers).not.toHaveProperty('Content-Length');
      },
    );
  });
});
