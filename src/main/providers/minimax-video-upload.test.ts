/** @jest-environment node */
import { MiniMaxVideoModel } from './minimax-video-model';

const model = () =>
  new MiniMaxVideoModel({
    modelId: 'MiniMax-H3',
    apiBase: 'https://gateway.example/minimax/v2',
    apiKey: 'test-key',
  });
const input = {
  data: Buffer.from('media'),
  fileName: 'frame.png',
  mimeType: 'image/png',
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });

describe('MiniMax uploads and cancellation', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn();
  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('uploads a video input as multipart via v1 and returns an mm_file reference', async () => {
    mockFetch.mockResolvedValue(
      json({
        file: { file_id: '123456789012345678' },
        base_resp: { status_code: 0 },
      }),
    );
    await expect(model().uploadMedia(input)).resolves.toBe(
      'mm_file://123456789012345678',
    );
    const [url, request] = mockFetch.mock.calls[0];
    expect(url).toBe('https://gateway.example/minimax/v1/files/upload');
    expect(request.headers.Authorization).toBe('Bearer test-key');
    expect(request.headers['Content-Type']).toBeUndefined();
    expect(request.body.get('purpose')).toBe('video_generation_input');
    expect(await request.body.get('file').text()).toBe('media');
    expect(request.body.get('file').name).toBe('frame.png');
  });

  it('preserves a numeric int64 file ID without precision loss', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        '{"file":{"file_id":123456789012345678},"base_resp":{"status_code":0}}',
      ),
    );
    await expect(model().uploadMedia(input)).resolves.toBe(
      'mm_file://123456789012345678',
    );
  });

  it.each([
    [{ file: {} }, 'missing file_id'],
    [
      { base_resp: { status_code: 2013, status_msg: 'Invalid media' } },
      'Invalid media',
    ],
  ])('reports failed or malformed uploads', async (data, message) => {
    mockFetch.mockResolvedValue(json(data));
    await expect(model().uploadMedia(input)).rejects.toThrow(message);
  });

  it('rejects invalid media and honors abort before uploading', async () => {
    await expect(
      model().uploadMedia({ ...input, mimeType: 'image/bmp' }),
    ).rejects.toThrow('Invalid');
    const controller = new AbortController();
    controller.abort();
    await expect(
      model().uploadMedia({ ...input, abortSignal: controller.signal }),
    ).rejects.toThrow();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rechecks queued state and sends DELETE to the V2 cancellation endpoint', async () => {
    mockFetch
      .mockResolvedValueOnce(json({ task: { id: 'task-1', status: 'queued' } }))
      .mockResolvedValueOnce(
        json({ task_id: 'task-1', action: 'cancelled', status: 'cancelled' }),
      );
    await expect(model().cancelTask('task-1')).resolves.toEqual({
      cancelled: true,
    });
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://gateway.example/minimax/v2/query/video_generation/task-1',
    );
    expect(mockFetch.mock.calls[1][0]).toBe(
      'https://gateway.example/minimax/v2/video_generation/task-1',
    );
    expect(mockFetch.mock.calls[1][1]).toMatchObject({
      method: 'DELETE',
      headers: { Authorization: 'Bearer test-key' },
    });
  });

  it.each(['running', 'succeeded', 'failed'])(
    'does not DELETE %s tasks',
    async (status) => {
      mockFetch.mockResolvedValue(
        json({
          task: {
            id: 'task-1',
            status,
            content: { url: 'https://example.com/video.mp4' },
          },
        }),
      );
      await expect(model().cancelTask('task-1')).resolves.toEqual({
        cancelled: false,
        message: expect.stringContaining(status),
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    },
  );

  it('recognizes already cancelled tasks without DELETE', async () => {
    mockFetch.mockResolvedValue(
      json({ task: { id: 'task-1', status: 'cancelled' } }),
    );
    await expect(model().cancelTask('task-1')).resolves.toEqual({
      cancelled: true,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not report deletion caused by a state race as a successful cancellation', async () => {
    mockFetch
      .mockResolvedValueOnce(json({ task: { id: 'task-1', status: 'queued' } }))
      .mockResolvedValueOnce(
        json({ task_id: 'task-1', action: 'deleted', status: 'deleted' }),
      );
    await expect(model().cancelTask('task-1')).rejects.toThrow(
      'did not confirm cancellation',
    );
  });
});
