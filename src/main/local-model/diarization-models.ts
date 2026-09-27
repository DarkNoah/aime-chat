import type { LocalModelItem } from '@/types/local-model';

export const DIARIZATION_MODEL_ID = 'pyannote/speaker-diarization-community-1';

export const diarizationModels: LocalModelItem[] = [
  {
    id: DIARIZATION_MODEL_ID,
    name: 'Pyannote Community-1',
    repo: DIARIZATION_MODEL_ID,
    library: 'pyannote',
    requiredFiles: [
      'config.yaml',
      'segmentation/pytorch_model.bin',
      'embedding/pytorch_model.bin',
      'plda/plda.npz',
      'plda/xvec_transform.npz',
    ],
    download: [
      {
        source: 'modelscope',
        url: `https://modelscope.cn/models/${DIARIZATION_MODEL_ID}`,
      },
      {
        source: 'huggingface',
        url: `https://huggingface.co/${DIARIZATION_MODEL_ID}`,
      },
    ],
  },
];
