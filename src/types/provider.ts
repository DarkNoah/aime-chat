export interface Provider {
  id: string;
  name: string;
  icon?: string;
  type?: ProviderType | string | undefined;
  models?: ProviderModel[];
  hasChatModel?: boolean;
}

export interface ProviderModel {
  id: string;
  name: string;
  providerType?: ProviderType | string;
  isActive: boolean;
  isCustom?: boolean;
  limit?: {
    context?: number;
    output?: number;
  };
  modalities?: {
    input: string[];
    output: string[];
  };
  reasoning?: boolean;
  tool_call?: boolean;
  structured_output?: boolean;
  last_updated?: string;
  release_date?: string;
  cost?: {
    input?: number;
    output?: number;
    cache_read?: number;
  };
}

export type CreateProvider = {
  name: string;
  icon?: string;
  type: string;
  isActive?: boolean;
  apiBase?: string;
  apiKey?: string;
  config?: any;
};
export type UpdateProvider = Omit<CreateProvider, 'type'>;

export enum ProviderType {
  OLLAMA = 'ollama',
  OPENAI = 'openai',
  TONGYI = 'tongyi',
  // ZHIPU = 'zhipu',
  GROQ = 'groq',
  ANTHROPIC = 'anthropic',
  TOGETHERAI = 'togetherai',
  GOOGLE = 'google',
  OPENROUTER = 'openrouter',
  SILICONFLOW = 'siliconflow',
  DEEPSEEK = 'deepseek',
  ZHIPUAI = 'zhipuai',
  LMSTUDIO = 'lmstudio',
  AZURE_OPENAI = 'azure_openai',
  VOLCANOENGINE = 'volcanoengine',
  MINIMAX = 'minimax',
  REPLICATE = 'replicate',
  ELEVENLABS = 'elevenlabs',
  MOONSHOT = 'moonshotai',
  MOONSHOTCN = 'moonshotai-cn',
  MODELSCOPE = 'modelscope',
  GATEWAY = 'gateway',
  LOCAL = 'local',
  BRAVE_SEARCH = 'brave-search',
  JINA_AI = 'jina-ai',
  TAVILY = 'tavily',
  SERPAPI = 'serpapi',
  MINERU = 'mineru',
}

export enum ModelType {
  LLM = 'llm',
  EMBEDDING = 'embedding',
  RERANKER = 'reranker',
  IMAGE_GENERATION = 'image_generation',
  VIDEO_GENERATION = 'video_generation',
  STT = 'stt',
  TTS = 'tts',
}

export enum ProviderTag {
  EMBEDDING = 'embedding',
  RERANKER = 'reranker',
  WEB_SEARCH = 'web_search',
  WEB_READER = 'web_reader',
  IMAGE_GENERATION = 'image_generation',
  OCR = 'ocr',
}

export interface ProviderCredits {
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
}

export interface ProviderTypeList {
  groupId: string;
  providers: { id: string; name: string }[];
}
