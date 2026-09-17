import type { LocalModelItem } from '@/types/local-model';

const qwenFiles = [
  'config.json',
  'tokenizer_config.json',
  'vocab.json',
  'merges.txt',
  'preprocessor_config.json',
];
const tokenizerFiles = (directory: string) => [
  `${directory}/config.json`,
  `${directory}/preprocessor_config.json`,
  `${directory}/model.safetensors`,
];

function model(
  repo: string,
  mlx: boolean,
  requiredFiles: string[],
  extra: Partial<LocalModelItem> = {},
): LocalModelItem {
  const sources = [
    { source: 'huggingface', url: `https://huggingface.co/${repo}` },
    { source: 'modelscope', url: `https://modelscope.cn/models/${repo}` },
  ];
  return {
    id: repo,
    name: repo.split('/').pop(),
    repo,
    library: mlx ? 'mlx' : 'pytorch',
    requiredFiles,
    download: sources,
    ...extra,
  };
}

export function getAudioModelCatalog(
  type: 'tts' | 'stt',
  platform: string = process.platform,
): LocalModelItem[] {
  const mlx = platform === 'darwin';
  const org = mlx ? 'mlx-community' : 'Qwen';
  if (type === 'stt') {
    const aligner = `${org}/Qwen3-ForcedAligner-0.6B${mlx ? '-8bit' : ''}`;
    return [
      ...['1.7B', '0.6B'].map((size) =>
        model(`${org}/Qwen3-ASR-${size}${mlx ? '-bf16' : ''}`, mlx, qwenFiles, {
          dependencies: [aligner],
        }),
      ),
      model(aligner, mlx, qwenFiles, { selectable: false }),
    ];
  }
  const variants = [
    ['1.7B', 'CustomVoice'],
    ['1.7B', 'VoiceDesign'],
    ['1.7B', 'Base'],
    ['0.6B', 'CustomVoice'],
    ['0.6B', 'Base'],
  ];
  return [
    ...variants.map(([size, variant]) =>
      model(
        `${org}/Qwen3-TTS-12Hz-${size}-${variant}${mlx ? '-bf16' : ''}`,
        mlx,
        [...qwenFiles, ...tokenizerFiles('speech_tokenizer')],
        { speechModelId: `${org}/Qwen3-TTS-${size}` },
      ),
    ),
    ...(mlx ? ['8bit', '4bit', 'bf16'] : ['']).map((suffix) =>
      model(
        mlx ? `mlx-community/VoxCPM2-${suffix}` : 'openbmb/VoxCPM2',
        mlx,
        [
          'config.json',
          'tokenizer.json',
          'tokenizer_config.json',
          ...(mlx ? [] : ['audiovae.pth', 'tokenization_voxcpm2.py']),
        ],
        mlx
          ? {}
          : {
              download: [
                {
                  source: 'huggingface',
                  url: 'https://huggingface.co/openbmb/VoxCPM2',
                },
                {
                  source: 'modelscope',
                  repo: 'OpenBMB/VoxCPM2',
                  url: 'https://modelscope.cn/models/OpenBMB/VoxCPM2',
                },
              ],
            },
      ),
    ),
    ...(mlx ? ['-4bit', '-8bit', ''] : ['']).map((suffix) =>
      model(
        mlx
          ? `mlx-community/Breeze-TTS-2-mlx${suffix}`
          : 'BreezeBlue/Breeze-TTS-2',
        mlx,
        [
          'config.json',
          'tokenizer.json',
          'tokenizer_config.json',
          ...tokenizerFiles('audio_tokenizer'),
        ],
      ),
    ),
  ];
}

export function resolveSpeechModelId(
  id: string,
  options: {
    voice?: string;
    instruct?: string;
    ref_audio?: string;
    ref_text?: string;
  },
  platform: string = process.platform,
) {
  if (!/qwen3-tts/i.test(id)) return id;
  let variant = 'CustomVoice';
  if (!options.voice && options.instruct) variant = 'VoiceDesign';
  else if (!options.voice && (options.ref_audio || options.ref_text))
    variant = 'Base';
  if (/12hz/i.test(id)) {
    if (!id.includes(`-${variant}`)) {
      throw new Error(
        `The supplied voice parameters require Qwen ${variant}; select or download that variant in Settings > Local Models.`,
      );
    }
    return id;
  }
  const match = /Qwen3-TTS-(1\.7B|0\.6B)$/i.exec(id);
  if (!match) return id;
  const size = match[1].toUpperCase();
  if (variant === 'VoiceDesign' && size === '0.6B') {
    throw new Error(
      'Qwen voice design requires the 1.7B VoiceDesign model. Download it in Settings > Local Models.',
    );
  }
  return `${platform === 'darwin' ? 'mlx-community' : 'Qwen'}/Qwen3-TTS-12Hz-${size}-${variant}${platform === 'darwin' ? '-bf16' : ''}`;
}
