import { Providers } from '@/entities/providers';
import { BaseProvider, RerankModel } from './base-provider';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { ProviderCredits, ProviderTag, ProviderType } from '@/types/provider';
import {
    EmbeddingModelV2,
    ImageModelV2,
    ImageModelV2CallOptions,
    ImageModelV2CallWarning,
    ImageModelV2ProviderMetadata,
    LanguageModelV2,
    SpeechModelV2,
    SpeechModelV2CallOptions,
    SpeechModelV2CallWarning,
    TranscriptionModelV2,
    TranscriptionModelV2CallOptions,
} from '@ai-sdk/provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createZhipu } from 'zhipu-ai-provider';
import { isString } from '@/utils/is';

export class MiniMaxRerankModel implements RerankModel {
    modelId: string;
    providerEntity: Providers;
    readonly provider: string = 'zhipuai';

    constructor({ modelId, provider }: { modelId: string; provider: Providers }) {
        this.providerEntity = provider;
        this.modelId = modelId;
    }

    async doRerank({
        query,
        documents,
        options,
    }: {
        query: string;
        documents: string[];
        options?: {
            top_k?: number;
            return_documents?: boolean;
        };
    }): Promise<{ index: number; score: number; document: string }[]> {
        const res = await fetch('https://open.bigmodel.cn/api/paas/v4/rerank', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.providerEntity.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.modelId || 'rerank',
                query: query,
                top_n: options?.top_k || 10,
                documents: documents,
            }),
        });

        const data = await res.json();

        return data.results
            .map((res, i) => ({
                index: res.index,
                score: res.relevance_score,
                document: options?.return_documents ? documents[res.index] : undefined,
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, options?.top_k || 10);
    }
}

export class MiniMaxImageModel implements ImageModelV2 {
    specificationVersion: 'v2' = 'v2';
    provider: string = 'zhipuai';
    modelId: string;
    providerEntity: Providers;

    constructor({ modelId, provider }: { modelId: string; provider: Providers }) {
        this.providerEntity = provider;
        this.modelId = modelId;
    }

    maxImagesPerCall:
        | number
        | ((options: {
            modelId: string;
        }) => PromiseLike<number | undefined> | number | undefined) = 1;
    async doGenerate(options: ImageModelV2CallOptions): Promise<{
        images: Array<string> | Array<Uint8Array>;
        warnings: Array<ImageModelV2CallWarning>;
        providerMetadata?: ImageModelV2ProviderMetadata;
        response: {
            timestamp: Date;
            modelId: string;
            headers: Record<string, string> | undefined;
        };
    }> {
        const _options = {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.providerEntity.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.modelId,
                prompt: options.prompt,
                size: options?.size || '1024x1024',
                quality: 'standard',
                watermark_enabled: false,
            }),
        };

        const res = await fetch(
            'https://open.bigmodel.cn/api/paas/v4/images/generations',
            { ..._options, signal: options.abortSignal },
        );
        const data = await res.json();
        if (data.error) {
            throw new Error(data.error.message);
        }
        return {
            images: data.data.map((x) => x.url),
            warnings: [],
            providerMetadata: undefined,
            response: {
                timestamp: new Date(),
                modelId: this.modelId,
                headers: undefined,
            },
        };
    }
}


export class MiniMaxTranscriptionModel implements TranscriptionModelV2 {
    specificationVersion: 'v2';
    provider: string = 'zhipuai';
    modelId: string;
    providerEntity: Providers;

    constructor({ modelId, provider }: { modelId: string; provider: Providers }) {
        this.providerEntity = provider;
        this.modelId = modelId;
    }


    async doGenerate(options: TranscriptionModelV2CallOptions): Promise<{ text: string; segments: Array<{ text: string; startSecond: number; endSecond: number; }>; language: string | undefined; durationInSeconds: number | undefined; warnings: Array<TranscriptionModelV2CallWarning>; request?: { body?: string; }; response: { timestamp: Date; modelId: string; headers?: SharedV2Headers; body?: unknown; }; providerMetadata?: Record<string, Record<string, JSONValue>>; }> {
        let audio: Uint8Array<ArrayBufferLike>;
        if (isString(options.audio)) {
            audio = Buffer.from(options.audio, 'base64');
        } else {
            audio = options.audio
        }

        const form = new FormData();
        form.append('model', 'glm-asr-2512');
        form.append('stream', 'false');
        form.append('file', new Blob([audio], { type: options.mediaType }), 'audio.wav');


        const res = await fetch('https://open.bigmodel.cn/api/paas/v4/audio/transcriptions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.providerEntity.apiKey}`,
            },
            body: form,
            signal: options.abortSignal,
        });
        const data = await res.json();
        if (data.error) {
            throw new Error(data.error.message);
        }
        return {
            text: result.text,
            segments: result.result.items.map(item => {
                return {
                    text: item.text,
                    startSecond: item.start,
                    endSecond: item.end,
                }
            }),
            language: result.result.language,
            durationInSeconds: result.result.duration,
            warnings: [],
            response: {
                timestamp: new Date(),
                modelId: this.modelId,
                headers: options.headers,
                body: result,
            },
        };
    }

}

export class MiniMaxSpeechModel implements SpeechModelV2 {
    specificationVersion: 'v2';
    provider: string = 'zhipuai';
    modelId: string;
    providerEntity: Providers;

    constructor({ modelId, provider }: { modelId: string; provider: Providers }) {
        this.providerEntity = provider;
        this.modelId = modelId;
    }

    async doGenerate(options: SpeechModelV2CallOptions): Promise<{ audio: Uint8Array; warnings: Array<SpeechModelV2CallWarning>; request?: { body?: string; }; response: { timestamp: Date; modelId: string; headers?: SharedV2Headers; body?: unknown; }; providerMetadata?: Record<string, Record<string, JSONValue>>; }> {
        const providerOptions = (options.providerOptions?.zhipuai ?? {}) as {
            voice?: string;
            speed?: number;
            volume?: number;
            response_format?: 'wav' | 'pcm';
            watermark_enabled?: boolean;
        };

        const body = {
            model: this.modelId || 'glm-tts',
            input: options.text,
            voice: providerOptions?.voice || 'tongtong',
            response_format: providerOptions?.response_format || 'wav',
            speed: providerOptions?.speed,
            volume: providerOptions?.volume,
            watermark_enabled: providerOptions?.watermark_enabled || false,
        };

        const res = await fetch('https://open.bigmodel.cn/api/paas/v4/audio/speech', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + this.providerEntity.apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: options.abortSignal,
        });

        if (!res.ok) {
            let errorMessage = 'ZhipuAI speech generation failed with status ' + res.status;
            try {
                const errorData = await res.json();
                errorMessage = errorData?.error?.message || errorData?.message || errorMessage;
            } catch {
                // ignore non-json errors
            }
            throw new Error(errorMessage);
        }

        const audioBuffer = await res.arrayBuffer();

        return {
            audio: new Uint8Array(audioBuffer),
            warnings: [],
            request: {
                body: JSON.stringify(body),
            },
            response: {
                timestamp: new Date(),
                modelId: this.modelId,
                headers: Object.fromEntries(res.headers.entries()),
            },
            providerMetadata: {
                "zhipuai": {
                    "sampleRate": 24000,
                    "duration": audioBuffer.byteLength / 24000,
                }
            }
        };
    }
}

export class MiniMaxProvider extends BaseProvider {
    name: string = 'minimax';
    type: ProviderType = ProviderType.MINIMAX;
    description: string;
    defaultApiBase?: string = 'https://api.minimax.io/v1';

    openaiClient?: OpenAI;

    tags: ProviderTag[] = [];

    constructor(provider: Providers) {
        super({ provider });
        //this.provider = provider;
        this.openaiClient = new OpenAI({
            baseURL: this.provider.apiBase || this.defaultApiBase,
            apiKey: this.provider.apiKey,
        });
    }

    languageModel(modelId: string): LanguageModelV2 {
        return {
            url: this.provider.apiBase || this.defaultApiBase,
            id: `zhipuai/${modelId}` as `${string}/${string}`,
            apiKey: this.provider.apiKey,
        };
    }

    async getLanguageModelList(): Promise<{ name: string; id: string }[]> {
        return [
            { id: 'MiniMax-M2.5', name: 'MiniMax-M2.5' },
        ];
    }
    async getEmbeddingModelList(): Promise<{ name: string; id: string }[]> {
        return [

        ];
    }

    async getRerankModelList(): Promise<{ name: string; id: string }[]> {
        return [];
    }
    async getTranscriptionModelList(): Promise<{ name: string; id: string }[]> {
        return [];
    }
    async getSpeechModelList(): Promise<{ name: string; id: string }[]> {
        return [];
    }

    async getImageGenerationList(): Promise<{ name: string; id: string }[]> {
        return [];
    }

    getCredits(): Promise<ProviderCredits | undefined> {
        return undefined;
    }
    textEmbeddingModel(modelId: string): EmbeddingModelV2<string> {
        return undefined;
    }
    imageModel(modelId: string): ImageModelV2 {
        return undefined;
    }
    transcriptionModel?(modelId: string): TranscriptionModelV2 {
        return undefined;
    }
    speechModel?(modelId: string): SpeechModelV2 {
        return undefined;
    }
    rerankModel?(modelId: string): RerankModel {
        return undefined;
    }
}
