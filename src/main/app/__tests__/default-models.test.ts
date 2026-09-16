/** @jest-environment node */
import { DefaultModelSettings, resolveDefaultModels } from '../default-models';
import type { AppInfo } from '@/types/app';

let saved: Partial<AppInfo['defaultModel']> | undefined;
let settings: DefaultModelSettings;
const read = jest.fn(async () => saved);
const write = jest.fn(async (value) => {
  saved = value;
});

beforeEach(() => {
  jest.clearAllMocks();
  saved = { model: 'chat/original', generateVideoModel: 'video/existing' };
  read.mockImplementation(async () => saved);
  write.mockImplementation(async (value) => {
    saved = value;
  });
  settings = new DefaultModelSettings({ read, write });
});

it('resolves saved overrides, explicit clearing and environment fallbacks consistently', () => {
  const result = resolveDefaultModels(
    { model: 'chat/saved', visionModel: '' },
    {
      DEFAULT_MODEL: 'chat/environment',
      DEFAULT_VISION_MODEL: 'vision/environment',
      DEFAULT_FAST_MODEL: 'fast/environment',
      DEFAULT_GENERATE_VIDEO_MODEL: 'video/environment',
    },
  );
  expect(result).toMatchObject({
    model: 'chat/saved',
    visionModel: '',
    fastModel: 'fast/environment',
    generateVideoModel: 'video/environment',
  });
  expect(result.embeddingModel).toBeUndefined();
});

it('lists effective defaults without persisting anything', async () => {
  expect(await settings.list()).toMatchObject(saved);
  expect(write).not.toHaveBeenCalled();
});

it('merges a partial update with stored settings without freezing environment defaults', async () => {
  const before = process.env.DEFAULT_OCR_MODEL;
  process.env.DEFAULT_OCR_MODEL = 'rapidocr';
  try {
    const result = await settings.set({
      fastModel: ' fast/new ',
      visionModel: '',
    });
    expect(result).toMatchObject({
      model: 'chat/original',
      generateVideoModel: 'video/existing',
      fastModel: 'fast/new',
      visionModel: '',
      ocrModel: 'rapidocr',
    });
    expect(saved).toEqual({
      model: 'chat/original',
      generateVideoModel: 'video/existing',
      fastModel: 'fast/new',
      visionModel: '',
    });
  } finally {
    if (before === undefined) delete process.env.DEFAULT_OCR_MODEL;
    else process.env.DEFAULT_OCR_MODEL = before;
  }
});

it.each([
  undefined,
  null,
  [],
  'model',
  {},
  { unknown: 'value' },
  { fastModel: null },
  { model: 42 },
  { model: { id: 'chat/model' } },
  { model: 'chat/new', visionModel: false },
  JSON.parse('{"__proto__":"bad"}'),
  { constructor: 'bad' },
])('rejects an invalid patch %p before reading or writing', async (patch) => {
  await expect(settings.set(patch)).rejects.toMatchObject({ status: 400 });
  expect(read).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
});

it('preserves both changes when partial updates arrive concurrently', async () => {
  await Promise.all([
    settings.set({ fastModel: 'fast/one' }),
    settings.set({ generateImageModel: 'image/two' }),
  ]);
  expect(saved).toEqual({
    model: 'chat/original',
    generateVideoModel: 'video/existing',
    fastModel: 'fast/one',
    generateImageModel: 'image/two',
  });
});

it('coordinates existing IPC replacement saves with subsequent API patches', async () => {
  await Promise.all([
    settings.replace({ model: 'chat/from-ui', speechModel: 'speech/from-ui' }),
    settings.set({ fastModel: 'fast/from-api' }),
  ]);
  expect(saved).toEqual({
    model: 'chat/from-ui',
    speechModel: 'speech/from-ui',
    fastModel: 'fast/from-api',
  });
});

it('waits for a pending save before listing defaults', async () => {
  let finish: () => void;
  write.mockImplementationOnce(
    (value) =>
      new Promise<void>((resolve) => {
        finish = () => {
          saved = value;
          resolve();
        };
      }),
  );
  const saving = settings.set({ model: 'chat/new' });
  const listing = settings.list();
  await Promise.resolve();
  await Promise.resolve();
  finish();
  await saving;
  expect((await listing).model).toBe('chat/new');
});

it('reports storage errors and allows the next save to proceed', async () => {
  write.mockRejectedValueOnce(new Error('disk full'));
  await expect(settings.set({ model: 'chat/failed' })).rejects.toThrow(
    'disk full',
  );
  expect(saved.model).toBe('chat/original');
  await expect(
    settings.set({ fastModel: 'fast/recovered' }),
  ).resolves.toMatchObject({
    model: 'chat/original',
    fastModel: 'fast/recovered',
  });
});
