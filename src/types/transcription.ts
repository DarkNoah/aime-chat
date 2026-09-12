import type { TranscriptionModelV2 } from '@ai-sdk/provider';

/** Optional URL transport for providers that can fetch audio themselves. */
export interface UrlTranscriptionModel extends TranscriptionModelV2 {
  canGenerateFromUrl?: (url: string) => boolean;
  doGenerateFromUrl?: (options: {
    url: string;
    abortSignal?: AbortSignal;
  }) => ReturnType<TranscriptionModelV2['doGenerate']>;
}
