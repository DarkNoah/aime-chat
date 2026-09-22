import type { LocalModelItem, LocalModelType } from '@/types/local-model';
import { useLocalModelStore } from '@/renderer/store/use-local-model-store';
import type { TFunction } from 'i18next';
import toast from 'react-hot-toast';

export type SetupModelKey = 'embedding' | 'reranker' | 'clip' | 'tts' | 'stt';
export type SetupModelCatalog = Partial<
  Record<LocalModelType, LocalModelItem[]>
>;

export const SETUP_MODELS: {
  key: SetupModelKey;
  label: string;
  ids: string[];
  selected: boolean;
}[] = [
  { key: 'embedding', label: 'bge-m3', ids: ['bge-m3'], selected: true },
  {
    key: 'reranker',
    label: 'bge-reranker-base',
    ids: ['bge-reranker-base'],
    selected: true,
  },
  {
    key: 'clip',
    label: 'clip-vit-base-patch16',
    ids: ['clip-vit-base-patch16'],
    selected: false,
  },
  {
    key: 'tts',
    label: 'VoxCPM2-8bit',
    ids: ['mlx-community/VoxCPM2-8bit', 'openbmb/VoxCPM2'],
    selected: false,
  },
  {
    key: 'stt',
    label: 'Qwen3-ASR',
    ids: ['mlx-community/Qwen3-ASR-1.7B-bf16', 'Qwen/Qwen3-ASR-1.7B'],
    selected: false,
  },
];

export function resolveSetupModels(catalog: SetupModelCatalog) {
  return SETUP_MODELS.map((definition) => ({
    ...definition,
    model: definition.ids
      .map((id) => catalog[definition.key]?.find((item) => item.id === id))
      .find(Boolean),
  }));
}

export type SetupDownload = {
  key: SetupModelKey;
  model: LocalModelItem;
  setAsDefault?: boolean;
};

let uvReady: Promise<void> | undefined;

async function ensureDownloadRuntime() {
  let info = await window.electron.app.getRuntimeInfo();
  while (info.uv?.status === 'installing') {
    // The preceding setup step can still be installing UV in the background.
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, 1500);
    });
    // eslint-disable-next-line no-await-in-loop
    info = await window.electron.app.getRuntimeInfo();
  }
  if (info.uv?.status === 'installed' && info.uv.installed) return;
  const installed = await window.electron.app.installRuntime('uv');
  if (!installed?.installed) throw new Error('UV installation failed');
}

export function startSetupDownloads(
  downloads: SetupDownload[],
  t: TFunction,
  refreshDefaults?: () => Promise<unknown>,
) {
  const store = useLocalModelStore.getState();
  const pending = downloads.filter(({ model }) =>
    store.startDownload(model.id),
  );
  if (pending.length === 0) return Promise.resolve();

  // Share runtime preparation across repeated visits to the setup step.
  if (!uvReady) {
    uvReady = ensureDownloadRuntime().finally(() => {
      uvReady = undefined;
    });
  }
  const ready = uvReady;
  return Promise.all(
    pending.map(async ({ key, model, setAsDefault }) => {
      const name = model.name || model.id;
      const id = `setup-model-${model.id}`;
      toast.loading(t('setup.download_models.download_progress', { name }), {
        id,
      });
      try {
        await ready;
        const source =
          model.download?.find((item) => item.source === 'modelscope')
            ?.source || model.download?.[0]?.source;
        if (!source) throw new Error('No download source available');
        await window.electron.localModel.downloadModel({
          modelId: model.id,
          type: key,
          source,
          setAsDefault,
        });
        if (setAsDefault) await refreshDefaults?.().catch(() => undefined);
        toast.success(
          t(
            setAsDefault
              ? 'setup.download_models.default_success'
              : 'setup.download_models.download_success',
            { name },
          ),
          {
            id,
          },
        );
      } catch {
        toast.error(
          t(
            setAsDefault
              ? 'setup.download_models.default_failed'
              : 'setup.download_models.download_failed',
            { name },
          ),
          {
            id,
            duration: 6000,
          },
        );
      } finally {
        store.finishDownload(model.id);
      }
    }),
  ).then(() => undefined);
}
