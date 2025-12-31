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
      modelId: z.string(),
      maxChunkSize: z
        .number()
        .optional()
        .default(32 * 1000),
    }),
    uiSchema: {
      modelId: {
        'ui:widget': 'modelSelector',
        'ui:title': t('common.model'),
      },
      maxChunkSize: {
        'ui:title': t('common.max_chunk_size'),
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
        'ui:title': t('common.model_name'),
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
