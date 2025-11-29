import { t } from 'i18next';
import z from 'zod';

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
};

export enum ToolEvent {
  ToolUpdated = 'tool:tool-updated',
  ToolListUpdated = 'tool:tool-list-updated',
}
export const ToolConfig = {
  WebSearch: {
    configSchema: z.strictObject({
      providerId: z.string(),
      numResults: z.number().optional().default(20),
    }),
    uiSchema: {
      providerId: {
        'ui:widget': 'providerSelector',
        'ui:title': t('common.provider'),
      },
      numResults: {
        'ui:title': t('common.num_results'),
      },
    },
  },
  Extract: {
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
        'ui:title': t('common.model_name'),
      },
    },
  },
};

export enum ToolTags {
  CODE = 'code',
  WORK = 'work',
  VISION = 'vision',
}
