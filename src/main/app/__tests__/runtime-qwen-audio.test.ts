import TOML from '@iarna/toml';

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => 'C:\\Users\\test\\AppData\\Roaming\\aime-chat'),
  },
}));

jest.mock('..', () => ({
  appManager: {
    toast: jest.fn(),
  },
}));

jest.mock('../../utils/shell', () => ({
  runCommand: jest.fn(),
}));

jest.mock('../../utils', () => ({
  getAssetPath: jest.fn((...parts: string[]) => parts.join('/')),
}));

jest.mock('../logger', () => ({
  appLog: {
    write: jest.fn(),
  },
}));

import { buildQwenAudioPyprojectToml } from '../qwen-audio-runtime';

describe('qwen audio runtime pyproject', () => {
  it('pins Windows GPU torch packages to matching cu121 builds', () => {
    const toml = buildQwenAudioPyprojectToml({ isWindows: true, hasGPU: true });
    const data = TOML.parse(toml) as any;

    expect(data.project.dependencies).toEqual(
      expect.arrayContaining([
        'torch==2.5.1',
        'torchaudio==2.5.1',
        'qwen-asr',
        'qwen-tts>=0.1.1',
        'voxcpm',
      ]),
    );
    expect(data.tool.uv.sources.torch).toEqual([
      { index: 'torch-gpu', marker: "platform_system == 'Windows'" },
    ]);
    expect(data.tool.uv.sources.torchaudio).toEqual([
      { index: 'torch-gpu', marker: "platform_system == 'Windows'" },
    ]);
    expect(data.tool.uv['override-dependencies']).toContain(
      'transformers==4.57.6',
    );
  });
});
