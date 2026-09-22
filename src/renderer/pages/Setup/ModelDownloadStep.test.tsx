import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import React from 'react';
import toast from 'react-hot-toast';
import ModelDownloadStep from './ModelDownloadStep';
import { resolveSetupModels, startSetupDownloads } from './model-download';
import { useLocalModelStore } from '@/renderer/store/use-local-model-store';
import { getAudioModelCatalog } from '@/main/local-model/audio-models';
import modelCatalog from '@/main/local-model/models.json';
import type { SetupModelCatalog } from './model-download';
import type { TFunction } from 'i18next';

const getAppInfo = jest.fn().mockResolvedValue({});
jest.mock('@/renderer/hooks/use-global', () => ({
  useGlobal: () => ({ getAppInfo }),
}));

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { loading: jest.fn(), success: jest.fn(), error: jest.fn() },
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (key === 'setup.download_models.set_default_label')
        return `default ${values?.name}`;
      if (key === 'setup.download_models.select_model')
        return `select ${values?.name}`;
      if (key === 'setup.download_models.download_and_continue')
        return `download ${values?.count}`;
      return key;
    },
  }),
}));

const catalog = (platform = 'darwin'): SetupModelCatalog =>
  ({
    ...JSON.parse(JSON.stringify(modelCatalog)),
    tts: getAudioModelCatalog('tts', platform),
    stt: getAudioModelCatalog('stt', platform),
  }) as SetupModelCatalog;
const getList = jest.fn();
const downloadModel = jest.fn();
const getRuntimeInfo = jest.fn();
const installRuntime = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  useLocalModelStore.setState({ downloadingIds: new Set() });
  getList.mockResolvedValue(catalog());
  downloadModel.mockResolvedValue({ isDownloaded: true });
  getRuntimeInfo.mockResolvedValue({
    uv: { installed: true, status: 'installed' },
  });
  installRuntime.mockResolvedValue({ installed: true, status: 'installed' });
  Object.defineProperty(window, 'electron', {
    configurable: true,
    value: {
      localModel: { getList, downloadModel },
      app: { getRuntimeInfo, installRuntime },
    },
  });
});

it('shows all five models with only the two text models selected, without starting downloads', async () => {
  render(<ModelDownloadStep onNext={jest.fn()} />);
  await screen.findByRole('button', { name: 'download 2' });
  expect(screen.getAllByRole('checkbox', { name: /^select / })).toHaveLength(5);
  expect(screen.getByRole('checkbox', { name: 'select bge-m3' })).toBeChecked();
  expect(
    screen.getByRole('checkbox', { name: 'select bge-reranker-base' }),
  ).toBeChecked();
  for (const name of ['clip-vit-base-patch16', 'VoxCPM2-8bit', 'Qwen3-ASR'])
    expect(
      screen.getByRole('checkbox', { name: `select ${name}` }),
    ).not.toBeChecked();
  expect(downloadModel).not.toHaveBeenCalled();
});

it('downloads only selected missing models and continues while downloads are pending', async () => {
  let finish!: (value: unknown) => void;
  downloadModel.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const onNext = jest.fn();
  render(<ModelDownloadStep onNext={onNext} />);
  await screen.findByRole('button', { name: 'download 2' });
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'select bge-reranker-base' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'download 1' }));
  expect(onNext).toHaveBeenCalledTimes(1);
  await waitFor(() =>
    expect(downloadModel).toHaveBeenCalledWith({
      modelId: 'bge-m3',
      type: 'embedding',
      source: 'modelscope',
      setAsDefault: true,
    }),
  );
  expect(downloadModel).toHaveBeenCalledTimes(1);
  expect(useLocalModelStore.getState().downloadingIds.has('bge-m3')).toBe(true);
  await act(async () => {
    finish({ isDownloaded: true });
  });
  expect(useLocalModelStore.getState().downloadingIds.size).toBe(0);
});

it('allows skipping or continuing with nothing selected without downloads or UV installation', async () => {
  const onNext = jest.fn();
  const onSkip = jest.fn();
  render(<ModelDownloadStep onNext={onNext} onSkip={onSkip} />);
  await screen.findByRole('button', { name: 'download 2' });
  fireEvent.click(screen.getByRole('button', { name: 'common.skip' }));
  expect(onSkip).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('checkbox', { name: 'select bge-m3' }));
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'select bge-reranker-base' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'common.next' }));
  expect(onNext).toHaveBeenCalledTimes(1);
  expect(downloadModel).not.toHaveBeenCalled();
  expect(installRuntime).not.toHaveBeenCalled();
});

it('disables already downloaded, downloading and deleting models', async () => {
  const data = catalog();
  data.embedding![0].isDownloaded = true;
  data.reranker = data.reranker!.map((model) =>
    model.id === 'bge-reranker-base'
      ? { ...model, status: 'downloading' }
      : model,
  );
  data.clip = data.clip!.map((model) => ({ ...model, status: 'deleting' }));
  getList.mockResolvedValue(data);
  render(<ModelDownloadStep onNext={jest.fn()} />);
  await screen.findByText('setup.download_models.downloaded');
  for (const name of ['bge-m3', 'bge-reranker-base', 'clip-vit-base-patch16'])
    expect(
      screen.getByRole('checkbox', { name: `select ${name}` }),
    ).toBeDisabled();
  expect(screen.getByRole('button', { name: 'common.next' })).toBeEnabled();
});

it.each(['darwin', 'win32', 'linux'])(
  'resolves every requested model against the real %s catalog',
  (platform) => {
    const models = resolveSetupModels(catalog(platform));
    expect(models.every(({ model }) => Boolean(model))).toBe(true);
    const tts = models.find(({ key }) => key === 'tts')!.model!;
    expect(tts.id).toBe(
      platform === 'darwin' ? 'mlx-community/VoxCPM2-8bit' : 'openbmb/VoxCPM2',
    );
    const stt = models.find(({ key }) => key === 'stt')!.model!;
    expect(stt.dependencies).toHaveLength(1);
  },
);

it('shows a retryable load error and keeps skip available', async () => {
  getList.mockRejectedValueOnce(new Error('offline'));
  render(<ModelDownloadStep onNext={jest.fn()} onSkip={jest.fn()} />);
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'common.skip' })).toBeEnabled();
  fireEvent.click(
    screen.getByRole('button', { name: 'setup.download_models.retry' }),
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'download 2' })).toBeEnabled(),
  );
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('waits for existing UV installation and deduplicates repeated download requests', async () => {
  jest.useFakeTimers();
  getRuntimeInfo.mockResolvedValueOnce({ uv: { status: 'installing' } });
  const downloads = [
    {
      key: 'embedding' as const,
      model: { id: 'bge-m3', download: [{ source: 'modelscope', url: '' }] },
    },
  ];
  const t = ((key: string) => key) as TFunction;
  try {
    const pending = startSetupDownloads(downloads, t);
    await startSetupDownloads(downloads, t);
    expect(downloadModel).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1500);
    await pending;
    expect(downloadModel).toHaveBeenCalledTimes(1);
    expect(installRuntime).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

it('installs missing UV and clears the shared state on download failure so it can retry', async () => {
  getRuntimeInfo.mockResolvedValue({
    uv: { installed: false, status: 'not_installed' },
  });
  downloadModel.mockRejectedValueOnce(new Error('network'));
  const downloads = [
    {
      key: 'embedding' as const,
      model: { id: 'bge-m3', download: [{ source: 'modelscope', url: '' }] },
    },
  ];
  const t = ((key: string) => key) as TFunction;
  await startSetupDownloads(downloads, t);
  expect(installRuntime).toHaveBeenCalledWith('uv');
  expect(toast.error).toHaveBeenCalled();
  expect(useLocalModelStore.getState().downloadingIds.size).toBe(0);
  await startSetupDownloads(downloads, t);
  expect(downloadModel).toHaveBeenCalledTimes(2);
});

it('offers per-model default choices and makes BGE and CLIP defaults mutually exclusive', async () => {
  render(<ModelDownloadStep onNext={jest.fn()} />);
  await screen.findByRole('button', { name: 'download 2' });
  const bge = screen.getByRole('checkbox', { name: 'default bge-m3' });
  const clip = screen.getByRole('checkbox', {
    name: 'default clip-vit-base-patch16',
  });
  expect(bge).toBeChecked();
  expect(
    screen.getByRole('checkbox', { name: 'default bge-reranker-base' }),
  ).toBeChecked();
  expect(clip).toBeDisabled();
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'select clip-vit-base-patch16' }),
  );
  fireEvent.click(clip);
  expect(clip).toBeChecked();
  expect(bge).not.toBeChecked();
  fireEvent.click(bge);
  expect(clip).not.toBeChecked();
  expect(bge).toBeChecked();
});

it('passes independent default choices to the download API and refreshes defaults only after success', async () => {
  render(<ModelDownloadStep onNext={jest.fn()} />);
  await screen.findByRole('button', { name: 'download 2' });
  fireEvent.click(screen.getByRole('checkbox', { name: 'default bge-m3' }));
  fireEvent.click(screen.getByRole('button', { name: 'download 2' }));
  await waitFor(() => expect(getAppInfo).toHaveBeenCalledTimes(1));
  expect(downloadModel).toHaveBeenCalledWith({
    modelId: 'bge-m3',
    type: 'embedding',
    source: 'modelscope',
    setAsDefault: false,
  });
  expect(downloadModel).toHaveBeenCalledWith({
    modelId: 'bge-reranker-base',
    type: 'reranker',
    source: 'modelscope',
    setAsDefault: true,
  });
});

it('does not refresh defaults when the download or default save fails', async () => {
  downloadModel.mockRejectedValue(new Error('failed'));
  const refresh = jest.fn();
  await startSetupDownloads(
    [
      {
        key: 'embedding',
        model: { id: 'bge-m3', download: [{ source: 'modelscope', url: '' }] },
        setAsDefault: true,
      },
    ],
    ((key: string) => key) as TFunction,
    refresh,
  );
  expect(refresh).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith(
    'setup.download_models.default_failed',
    expect.anything(),
  );
});
