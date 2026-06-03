const QWEN_AUDIO_TORCH_VERSION = '2.5.1';

export function buildQwenAudioPyprojectToml({
  isWindows,
  hasGPU,
}: {
  isWindows: boolean;
  hasGPU: boolean;
}) {
  if (isWindows && hasGPU) {
    return `[project]
name = "qwen-audio-runtime"
version = "0.1.0"
description = "Qwen audio runtime"
readme = "README.md"
requires-python = ">=3.12"
dependencies = [
    "qwen-asr",
    "qwen-tts>=0.1.1",
    "voxcpm",
    "torch==${QWEN_AUDIO_TORCH_VERSION}",
    "torchaudio==${QWEN_AUDIO_TORCH_VERSION}",
]

[tool.uv]
extra-index-url = [
    "https://pypi.org/simple",
]
override-dependencies = ["transformers==4.57.6"]

[tool.uv.sources]
torch = [
    { index = "torch-gpu", marker = "platform_system == 'Windows'" },
]
torchaudio = [
    { index = "torch-gpu", marker = "platform_system == 'Windows'" },
]

[[tool.uv.index]]
name = "torch-gpu"
url = "https://download.pytorch.org/whl/cu121"
explicit = true
`;
  }

  return `[project]
name = "qwen-audio-runtime"
version = "0.1.0"
description = "Qwen audio runtime"
readme = "README.md"
requires-python = ">=3.12"
dependencies = [
    "voxcpm",
    "qwen-asr",
    "qwen-tts>=0.1.1",
]

[tool.uv]
override-dependencies = ["transformers==4.57.6"]
`;
}

export function qwenAudioHealthCheckScript(isWindows: boolean) {
  if (isWindows) {
    return [
      'from importlib import metadata',
      'import torch, torchaudio',
      'import qwen_tts, voxcpm',
      "print(metadata.version('qwen-asr'))",
    ].join('; ');
  }

  return "from importlib import metadata; import mlx_audio; print(metadata.version('mlx-audio'))";
}
