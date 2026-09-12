import type { Providers } from '@/entities/providers';
import type { MusicModel } from './base-provider';

export class MiniMaxMusicModel implements MusicModel {
  readonly provider = 'minimax';

  readonly modelId: string;

  private readonly apiBase: string;

  private readonly apiKey: string;

  constructor({
    modelId,
    provider,
    apiBase,
  }: {
    modelId: string;
    provider: Providers;
    apiBase: string;
  }) {
    this.modelId = modelId;
    this.apiKey = provider.apiKey;
    this.apiBase = `${apiBase.replace(/\/+$/, '').replace(/\/v[12]$/, '')}/v1`;
  }

  async doGenerate(
    options: Parameters<MusicModel['doGenerate']>[0],
  ): Promise<string> {
    if (!['music-3.0', 'music-2.6'].includes(this.modelId))
      throw new Error(
        'Select MiniMax music-3.0 or music-2.6 in the music tool configuration',
      );
    if (!this.apiKey?.trim()) throw new Error('MiniMax API key is not set');
    const prompt = options.prompt?.trim();
    const lyrics = options.lyrics?.trim();
    if (!prompt || Array.from(prompt).length > 2000)
      throw new Error('Music prompt must contain 1–2000 characters');
    if (lyrics && Array.from(lyrics).length > 3500)
      throw new Error('Music lyrics must not exceed 3500 characters');
    const instrumental = options.is_instrumental ?? false;
    const format = options.format ?? 'mp3';
    if (!['mp3', 'wav', 'pcm'].includes(format))
      throw new Error('Unsupported music audio format');
    const sampleRate = options.sample_rate ?? 44100;
    if (![16000, 24000, 32000, 44100].includes(sampleRate))
      throw new Error('Unsupported music sample rate');
    options.abortSignal?.throwIfAborted();
    const response = await fetch(`${this.apiBase}/music_generation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.modelId,
        prompt,
        ...(lyrics ? { lyrics } : {}),
        stream: false,
        output_format: 'url',
        is_instrumental: instrumental,
        lyrics_optimizer: !instrumental && !lyrics,
        audio_setting: { sample_rate: sampleRate, format },
      }),
      signal: options.abortSignal
        ? AbortSignal.any([options.abortSignal, AbortSignal.timeout(600_000)])
        : AbortSignal.timeout(600_000),
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(
        `MiniMax music API returned an invalid response (HTTP ${response.status})`,
      );
    }
    if (!response.ok || data?.error || data?.base_resp?.status_code)
      throw new Error(
        data?.error?.message ||
          data?.base_resp?.status_msg ||
          data?.message ||
          `MiniMax music generation failed (HTTP ${response.status})`,
      );
    if (
      data?.data?.status !== 2 ||
      typeof data.data.audio !== 'string' ||
      !/^https?:\/\//i.test(data.data.audio)
    )
      throw new Error(
        'MiniMax music response does not contain a completed audio URL',
      );
    return data.data.audio;
  }
}
