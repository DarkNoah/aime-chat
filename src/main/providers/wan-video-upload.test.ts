/** @jest-environment node */
import { WanVideoModel } from './wan-video-model';

const base = 'https://workspace.ap-southeast-1.maas.aliyuncs.com/api/v1';
const createModel = () =>
  new WanVideoModel({
    apiBase: base,
    apiKey: 'test-key',
    modelId: 'wan3.0-video-prime',
  });
const policy = {
  upload_host: 'https://temporary.oss-ap-southeast-1.aliyuncs.com',
  upload_dir: 'dashscope-instant/account/session',
  oss_access_key_id: 'upload-access-key',
  signature: 'signed',
  policy: 'policy-value',
  x_oss_object_acl: 'private',
  x_oss_forbid_overwrite: 'true',
  max_file_size_mb: 100,
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status });
const uploadInput = {
  data: Buffer.from('video-bytes'),
  fileName: 'clip.mp4',
  mimeType: 'video/mp4',
};

describe('Wan temporary media upload', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn();
  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('uses the workspace/model policy, uploads multipart with file last, then resolves OSS on generation', async () => {
    mockFetch
      .mockResolvedValueOnce(json({ data: policy }))
      .mockResolvedValueOnce(new Response(''))
      .mockResolvedValueOnce(
        json({ output: { task_id: 'task-1', task_status: 'PENDING' } }),
      );
    const model = createModel();
    const url = await model.uploadMedia(uploadInput);
    expect(mockFetch.mock.calls[0][0]).toBe(
      `${base}/uploads?action=getPolicy&model=wan3.0-video-prime`,
    );
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer test-key',
    );
    const [host, upload] = mockFetch.mock.calls[1];
    expect(host).toBe(`${policy.upload_host}/`);
    expect(upload.headers).toBeUndefined();
    expect(upload.redirect).toBe('error');
    const form = upload.body as FormData;
    expect(Array.from(form.keys()).at(-1)).toBe('file');
    expect(form.get('OSSAccessKeyId')).toBe(policy.oss_access_key_id);
    expect(form.get('Signature')).toBe(policy.signature);
    expect(form.get('policy')).toBe(policy.policy);
    expect(form.get('x-oss-object-acl')).toBe('private');
    expect(form.get('x-oss-forbid-overwrite')).toBe('true');
    expect(form.get('success_action_status')).toBe('200');
    expect(form.get('x-oss-content-type')).toBe('video/mp4');
    expect(await (form.get('file') as Blob).text()).toBe('video-bytes');
    expect(url).toBe(`oss://${form.get('key')}`);
    expect(url).toMatch(
      /^oss:\/\/dashscope-instant\/account\/session\/[\da-f-]+-clip.mp4$/,
    );
    await model.doGenerate({ prompt: 'Move', referenceVideos: [url] });
    const request = mockFetch.mock.calls[2][1];
    expect(request.headers['X-DashScope-OssResourceResolve']).toBe('enable');
    expect(JSON.parse(request.body).input.media).toEqual([
      { type: 'reference_video', url },
    ]);
  });

  it('does not add the OSS resolver for ordinary URLs', async () => {
    mockFetch.mockResolvedValue(
      json({ output: { task_id: 'task-1', task_status: 'PENDING' } }),
    );
    await createModel().doGenerate({
      prompt: 'Move',
      referenceVideos: ['https://example.com/video.mp4'],
    });
    expect(
      mockFetch.mock.calls[0][1].headers['X-DashScope-OssResourceResolve'],
    ).toBeUndefined();
  });

  it('uses unique keys for equal file names', async () => {
    mockFetch.mockImplementation(async (url: string) =>
      url.includes('/uploads?') ? json({ data: policy }) : new Response(''),
    );
    const model = createModel();
    const first = await model.uploadMedia(uploadInput);
    const second = await model.uploadMedia(uploadInput);
    expect(first).not.toBe(second);
  });

  it.each([
    [{ ...policy, max_file_size_mb: 0.000001 }, 'size limit'],
    [{ ...policy, signature: undefined }, 'incomplete'],
    [{ ...policy, upload_host: 'http://example.com' }, 'upload host'],
  ])(
    'rejects invalid policy before posting the file',
    async (data, message) => {
      mockFetch.mockResolvedValue(json({ data }));
      await expect(createModel().uploadMedia(uploadInput)).rejects.toThrow(
        message,
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    },
  );

  it('reports upload failure without returning an OSS URL', async () => {
    mockFetch
      .mockResolvedValueOnce(json({ data: policy }))
      .mockResolvedValueOnce(new Response('expired', { status: 403 }));
    await expect(createModel().uploadMedia(uploadInput)).rejects.toThrow(
      'HTTP 403',
    );
  });

  it('aborts before posting a file when cancellation occurs during policy retrieval', async () => {
    const controller = new AbortController();
    mockFetch.mockImplementationOnce(async () => {
      controller.abort();
      return json({ data: policy });
    });
    await expect(
      createModel().uploadMedia({
        ...uploadInput,
        abortSignal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('propagates cancellation to the upload request', async () => {
    const controller = new AbortController();
    mockFetch
      .mockResolvedValueOnce(json({ data: policy }))
      .mockImplementationOnce(async (_url, request) => {
        controller.abort();
        request.signal.throwIfAborted();
      });
    await expect(
      createModel().uploadMedia({
        ...uploadInput,
        abortSignal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('rejects unsupported or empty files before requesting a policy', async () => {
    await expect(
      createModel().uploadMedia({ ...uploadInput, data: Buffer.alloc(0) }),
    ).rejects.toThrow('Invalid');
    await expect(
      createModel().uploadMedia({ ...uploadInput, mimeType: 'video/avi' }),
    ).rejects.toThrow('Invalid');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
