import { t } from 'i18next';
import z from 'zod';
import { ModelType, ProviderTag } from './provider';

export enum ToolType {
  MCP = 'mcp',
  BUILD_IN = 'build-in',
  SKILL = 'skill',
}

export type Tool = {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  isToolkit: boolean;
  type: ToolType;
  version?: string;
  tools?: {
    id: string;
    name: string;
    description: string;
    inputSchema?: any;
  }[];
};

export type AvailableTool = {
  id: string;
  name: string;
  description: string;
  tools?: AvailableTool[];
};

export enum ToolEvent {
  ToolUpdated = 'tool:tool-updated',
  ToolListUpdated = 'tool:tool-list-updated',
}
export const ToolConfig = {
  Bash: {
    configSchema: z.strictObject({
      env: z.string().optional(),
    }),
    uiSchema: {
      env: {
        'ui:widget': 'textarea',
        'ui:title': t('common.env'),
      },
    },
  },
  Read: {
    configSchema: z.strictObject({
      forcePDFOcr: z.boolean().optional().default(true),
      forceWordOcr: z.boolean().optional().default(true),
    }),
    uiSchema: {
      forcePDFOcr: {
        'ui:title': t('common.force_pdf_ocr'),
      },
      forceWordOcr: {
        'ui:title': t('common.force_word_ocr'),
      },
    },
  },
  SpeechToText: {
    configSchema: z.strictObject({
      modelId: z.string(),
    }),
    uiSchema: {
      modelId: {
        'ui:widget': 'modelSelector',
        'ui:title': t('common.model'),
        'ui:options': {
          type: ModelType.STT,
        },
      },
    },
  },
  TextToSpeech: {
    configSchema: z.strictObject({
      modelId: z.string(),
    }),
    uiSchema: {
      modelId: {
        'ui:widget': 'modelSelector',
        'ui:title': t('common.model'),
        'ui:options': {
          type: ModelType.TTS,
        },
      },
    },
  },
  CodeExecution: {
    configSchema: z.strictObject({
      ptcOpen: z.boolean().optional().default(true),
    }),
    uiSchema: {
      ptcOpen: {
        'ui:title': t('common.ptc_open'),
      },
    },
  },
  ReadBinaryFile: {
    configSchema: z.strictObject({
      mode: z.enum(['auto', 'system', 'paddleocr']).optional().default('auto'),
      forcePDFOcr: z.boolean().optional().default(false),
    }),
    uiSchema: {
      mode: {
        'ui:title': t('common.mode'),
      },
      forcePDFOcr: {
        'ui:title': t('common.force_pdf_ocr'),
      },
    },
  },
  ToolToolkit: {
    configSchema: z.strictObject({
      method: z.enum(['auto', 'bm25', 'regex', 'embeddings', 'hybrid']),
      modelId: z.string(),
      numResults: z.number().optional().default(5),
    }),
    uiSchema: {
      modelId: {
        'ui:widget': 'modelSelector',
        'ui:title': t('common.provider'),
      },
      method: {
        'ui:title': t('common.method'),
      },
      numResults: {
        'ui:title': t('common.num_results'),
      },
    },
  },
  WebSearch: {
    configSchema: z.strictObject({
      providerId: z.string(),
      numResults: z.number().optional().default(20),
    }),
    uiSchema: {
      providerId: {
        'ui:widget': 'providerSelector',
        'ui:title': t('common.provider'),
        'ui:options': {
          type: ProviderTag.WEB_SEARCH,
        },
      },
      numResults: {
        'ui:title': t('common.num_results'),
      },
    },
  },
  WebFetch: {
    configSchema: z.strictObject({
      providerId: z.string(),
    }),
    uiSchema: {
      providerId: {
        'ui:widget': 'providerSelector',
        'ui:title': t('common.provider'),
        'ui:options': {
          type: ProviderTag.WEB_READER,
        },
      },
    },
  },
  Extract: {
    configSchema: z.strictObject({
      modelId: z.string().optional(),
      maxChunkSize: z
        .number()
        .optional()
        .default(32 * 1000),
    }),
    uiSchema: {
      modelId: {
        'ui:widget': 'modelSelector',
        'ui:title': t('common.model'),
        'ui:options': {
          clearable: true,
        },
      },
      maxChunkSize: {
        'ui:title': t('common.max_chunk_size'),
      },
    },
  },
  Translation: {
    configSchema: z.strictObject({
      modelId: z.string(),
    }),
    uiSchema: {
      modelId: {
        'ui:widget': 'modelSelector',
        'ui:title': t('common.model'),
      },
    },
  },
  Vision: {
    configSchema: z.strictObject({
      modelId: z.string(),
    }),
    uiSchema: {
      modelId: {
        'ui:widget': 'modelSelector',
        'ui:title': t('common.model'),
      },
    },
  },
  RemoveBackground: {
    configSchema: z.strictObject({
      modelName: z.enum(['rmbg-1.4', 'rmbg-2.0']),
    }),
    uiSchema: {
      modelName: {
        'ui:title': t('common.model'),
      },
    },
  },
  GenerateVideo: {
    configSchema: z.strictObject({
      modelId: z.string(),
    }),
    uiSchema: {
      modelId: {
        'ui:widget': 'modelSelector',
        'ui:title': t('common.model'),
        'ui:options': {
          type: ModelType.VIDEO_GENERATION,
        },
      },
    },
  },
  GenerateImage: {
    configSchema: z.strictObject({
      modelId: z.string(),
    }),
    uiSchema: {
      modelId: {
        'ui:widget': 'modelSelector',
        'ui:title': t('common.model'),
        'ui:options': {
          type: ModelType.IMAGE_GENERATION,
        },
      },
    },
  },
  EditImage: {
    configSchema: z.strictObject({
      modelId: z.string(),
    }),
    uiSchema: {
      modelId: {
        'ui:widget': 'modelSelector',
        'ui:title': t('common.model'),
        'ui:options': {
          type: ModelType.IMAGE_GENERATION,
        },
      },
    },
  },
};

export enum ToolTags {
  CODE = 'code',
  WORK = 'work',
  VISION = 'vision',
}
