/* eslint-disable class-methods-use-this, no-continue, no-await-in-loop, no-void, no-console, import/no-cycle */
import { parse } from 'csv-parse/sync';
import fs from 'fs/promises';
import { BrowserWindow } from 'electron';
import { Repository } from 'typeorm';
import { getTextContentFromMastraDBMessage } from '@mastra/evals/scorers/utils';
import { RequestContext } from '@mastra/core/request-context';
import { AgentExecutionOptions } from '@mastra/core/agent';
import { OpenAIChatLanguageModelOptions } from '@ai-sdk/openai';
import { EvalScorer } from '@/entities/eval-scorers';
import { BaseManager } from '@/main/BaseManager';
import { appManager } from '@/main/app';
import { dbManager } from '@/main/db';
import { channel } from '@/main/ipc/IpcController';
import mastraManager from '@/main/mastra';
import { agentManager } from '@/main/mastra/agents';
import { nanoid } from '@/utils/nanoid';
import { ChatRequestContext } from '@/types/chat';
import { EvalsChannel } from '@/types/ipc-channel';
import {
  EvalDatasetExport,
  EvalDatasetInput,
  EvalDatasetItemInput,
  EvalExperimentInput,
  EvalImportResult,
  EvalScorerInput,
  EvalScorerRunResult,
  EvalScorerTestInput,
  EvalThreadScoreInput,
  EvalThreadScoreResult,
} from '@/types/evals';
import { ScorerRegistry } from './scorer-registry';

const jsonCell = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const csvCell = (value: unknown) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
};

const toObject = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

class EvalsManager extends BaseManager {
  private repository!: Repository<EvalScorer>;

  private registry!: ScorerRegistry;

  async init() {
    this.repository = dbManager.dataSource.getRepository(EvalScorer);
    this.registry = new ScorerRegistry(mastraManager.mastra, this.repository);
    await this.registry.init();
    console.log('EvalsManager initialized');
  }

  @channel(EvalsChannel.ListDatasets)
  async listDatasets(input?: {
    page?: number;
    perPage?: number;
    name?: string;
  }) {
    return mastraManager.mastra.datasets.list({
      page: input?.page ?? 0,
      perPage: input?.perPage ?? 20,
      filters: {
        targetType: 'agent',
        ...(input?.name ? { name: input.name } : {}),
      },
    });
  }

  @channel(EvalsChannel.GetDataset)
  async getDataset(id: string) {
    const dataset = await mastraManager.mastra.datasets.get({ id });
    return dataset.getDetails();
  }

  @channel(EvalsChannel.CreateDataset)
  async createDataset(input: EvalDatasetInput) {
    const dataset = await mastraManager.mastra.datasets.create({
      name: input.name.trim(),
      description: input.description?.trim(),
      targetType: 'agent',
      targetIds: input.targetIds,
      scorerIds: input.scorerIds,
    });
    return dataset.getDetails();
  }

  @channel(EvalsChannel.UpdateDataset)
  async updateDataset({ id, ...input }: EvalDatasetInput & { id: string }) {
    const dataset = await mastraManager.mastra.datasets.get({ id });
    return dataset.update({
      name: input.name.trim(),
      description: input.description?.trim(),
      targetType: 'agent',
      targetIds: input.targetIds,
      scorerIds: input.scorerIds,
    });
  }

  @channel(EvalsChannel.DeleteDataset)
  async deleteDataset(id: string) {
    await mastraManager.mastra.datasets.delete({ id });
  }

  @channel(EvalsChannel.ListDatasetItems)
  async listDatasetItems(input: {
    datasetId: string;
    page?: number;
    perPage?: number;
    search?: string;
  }) {
    const dataset = await mastraManager.mastra.datasets.get({
      id: input.datasetId,
    });
    return dataset.listItems({
      page: input.page ?? 0,
      perPage: input.perPage ?? 50,
      search: input.search,
    });
  }

  @channel(EvalsChannel.AddDatasetItems)
  async addDatasetItems(input: {
    datasetId: string;
    items: EvalDatasetItemInput[];
  }) {
    const dataset = await mastraManager.mastra.datasets.get({
      id: input.datasetId,
    });
    return dataset.addItems({ items: input.items });
  }

  @channel(EvalsChannel.UpdateDatasetItem)
  async updateDatasetItem(input: {
    datasetId: string;
    itemId: string;
    item: Partial<EvalDatasetItemInput>;
  }) {
    const dataset = await mastraManager.mastra.datasets.get({
      id: input.datasetId,
    });
    return dataset.updateItem({
      itemId: input.itemId,
      ...input.item,
    });
  }

  @channel(EvalsChannel.DeleteDatasetItem)
  async deleteDatasetItem(input: { datasetId: string; itemId: string }) {
    const dataset = await mastraManager.mastra.datasets.get({
      id: input.datasetId,
    });
    await dataset.deleteItem({ itemId: input.itemId });
  }

  @channel(EvalsChannel.ImportDataset)
  async importDataset(input: {
    datasetId: string;
    format: 'csv' | 'jsonl';
    content: string;
  }): Promise<EvalImportResult> {
    const result: EvalImportResult = { imported: 0, skipped: 0, errors: [] };
    let items: EvalDatasetItemInput[] = [];

    if (input.format === 'csv') {
      const rows = parse(input.content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Array<Record<string, string>>;
      items = rows.flatMap((row, index) => {
        if (!row.input) {
          result.skipped += 1;
          result.errors.push(`Row ${index + 2}: input is required`);
          return [];
        }
        return [
          {
            input: jsonCell(row.input),
            groundTruth: row.groundTruth
              ? jsonCell(row.groundTruth)
              : undefined,
            metadata: row.metadata
              ? toObject(jsonCell(row.metadata))
              : undefined,
          },
        ];
      });
    } else {
      items = input.content.split(/\r?\n/).flatMap((line, index) => {
        if (!line.trim()) return [];
        try {
          const parsed = JSON.parse(line) as EvalDatasetItemInput;
          if (parsed.input === undefined) throw new Error('input is required');
          return [parsed];
        } catch (error) {
          result.skipped += 1;
          result.errors.push(
            `Line ${index + 1}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return [];
        }
      });
    }

    if (items.length) {
      const dataset = await mastraManager.mastra.datasets.get({
        id: input.datasetId,
      });
      await dataset.addItems({ items });
      result.imported = items.length;
    }
    return result;
  }

  @channel(EvalsChannel.ExportDataset)
  async exportDataset(input: {
    datasetId: string;
    format: 'csv' | 'jsonl';
  }): Promise<EvalDatasetExport> {
    const dataset = await mastraManager.mastra.datasets.get({
      id: input.datasetId,
    });
    const details = await dataset.getDetails();
    const page = await dataset.listItems({ page: 0, perPage: 10000 });
    const items = Array.isArray(page) ? page : page.items;

    if (input.format === 'jsonl') {
      return {
        filename: `${details.name}.jsonl`,
        mimeType: 'application/x-ndjson',
        content: items
          .map(({ input: itemInput, groundTruth, metadata }) =>
            JSON.stringify({ input: itemInput, groundTruth, metadata }),
          )
          .join('\n'),
      };
    }

    return {
      filename: `${details.name}.csv`,
      mimeType: 'text/csv',
      content: [
        'input,groundTruth,metadata',
        ...items.map((item) =>
          [
            csvCell(item.input),
            csvCell(item.groundTruth),
            csvCell(item.metadata),
          ].join(','),
        ),
      ].join('\n'),
    };
  }

  @channel(EvalsChannel.SaveDatasetExport)
  async saveDatasetExport(input: { filePath: string; content: string }) {
    await fs.writeFile(input.filePath, input.content, 'utf8');
  }

  @channel(EvalsChannel.StartExperiment)
  async startExperiment(input: EvalExperimentInput) {
    const dataset = await mastraManager.mastra.datasets.get({
      id: input.datasetId,
    });
    const [scorers, agentConfig, appInfo] = await Promise.all([
      Promise.all(
        input.scorerIds.map((id) => this.registry.get(id, input.modelId)),
      ),
      agentManager.getAgent(input.agentId),
      appManager.getInfo(),
    ]);
    const experimentResourceId = `evals:${input.datasetId}`;
    const pending = await dataset.startExperimentAsync({
      name: input.name.trim(),
      description: input.description?.trim(),
      scorers,
      maxConcurrency: Math.max(1, Math.min(input.maxConcurrency || 3, 8)),
      metadata: {
        agentId: input.agentId,
        modelId: input.modelId,
        scorerIds: input.scorerIds,
      },
      task: async ({ input: itemInput, signal }) => {
        const evaluationThreadId = `evals:${input.datasetId}:${nanoid()}`;
        const requestContext = new RequestContext<ChatRequestContext>();
        requestContext.set('model', input.modelId);
        requestContext.set('agentId', input.agentId);
        requestContext.set('tools', agentConfig.tools || []);
        requestContext.set('subAgents', agentConfig.subAgents || []);
        requestContext.set('threadId', evaluationThreadId);
        requestContext.set('resourceId', experimentResourceId);
        requestContext.set('think', true);

        const agent = await agentManager.buildAgent(input.agentId, {
          modelId: input.modelId,
          tools: agentConfig.tools,
          subAgents: agentConfig.subAgents,
          requestContext,
          maxRetries: 3,
        });
        const executionOptions: AgentExecutionOptions<undefined> = {
          includeRawChunks: false,
          modelSettings: {
            headers: {
              'X-AIME-CHAT-THREAD-ID': evaluationThreadId,
            },
          },
          providerOptions: {
            openai: {
              store: false,
              reasoningEffort: appInfo.defaultThink ?? undefined,
              reasoningSummary: 'auto',
            } as OpenAIChatLanguageModelOptions,
          },
          requestContext,
          maxSteps: 100,
          abortSignal: signal,
          savePerStep: true,
        };
        const prompt =
          typeof itemInput === 'string'
            ? itemInput
            : JSON.stringify(itemInput, null, 2);
        const result = await agent.generate(prompt, executionOptions);
        if (result.error) {
          throw new Error(
            result.error instanceof Error
              ? result.error.message
              : String(result.error),
          );
        }
        return result.text;
      },
    });

    this.sendProgress({
      experimentId: pending.experimentId,
      datasetId: input.datasetId,
      status: 'pending',
      totalItems: pending.totalItems,
    });
    this.watchExperiment(input.datasetId, pending.experimentId);
    return pending;
  }

  @channel(EvalsChannel.ListExperiments)
  async listExperiments(input: {
    datasetId: string;
    page?: number;
    perPage?: number;
  }) {
    const dataset = await mastraManager.mastra.datasets.get({
      id: input.datasetId,
    });
    return dataset.listExperiments({
      page: input.page ?? 0,
      perPage: input.perPage ?? 20,
    });
  }

  @channel(EvalsChannel.GetExperiment)
  async getExperiment(input: { datasetId: string; experimentId: string }) {
    const dataset = await mastraManager.mastra.datasets.get({
      id: input.datasetId,
    });
    const [experiment, page, scorePage] = await Promise.all([
      dataset.getExperiment({ experimentId: input.experimentId }),
      dataset.listExperimentResults({
        experimentId: input.experimentId,
        page: 0,
        perPage: 10000,
      }),
      this.getScoresStore().then((store) =>
        store.listScoresByRunId({
          runId: input.experimentId,
          pagination: { page: 0, perPage: false },
        }),
      ),
    ]);
    const scoresByItem = new Map<string, typeof scorePage.scores>();
    for (const score of scorePage.scores) {
      const current = scoresByItem.get(score.entityId) || [];
      current.push(score);
      scoresByItem.set(score.entityId, current);
    }
    const scoreSummary = scorePage.scores.reduce<
      Record<string, { total: number; count: number; average: number }>
    >((summary, score) => {
      const current = summary[score.scorerId] || {
        total: 0,
        count: 0,
        average: 0,
      };
      current.total += score.score;
      current.count += 1;
      current.average = current.total / current.count;
      summary[score.scorerId] = current;
      return summary;
    }, {});
    return {
      experiment,
      results: page.results.map((result) => ({
        ...result,
        scores: scoresByItem.get(result.itemId) || [],
      })),
      scoreSummary,
    };
  }

  @channel(EvalsChannel.CompareExperiments)
  async compareExperiments(input: {
    experimentIds: string[];
    baselineId?: string;
  }) {
    return mastraManager.mastra.datasets.compareExperiments(input);
  }

  @channel(EvalsChannel.ListScorers)
  async listScorers() {
    return this.registry.list();
  }

  @channel(EvalsChannel.SaveScorer)
  async saveScorer(input: EvalScorerInput) {
    return this.registry.save(input);
  }

  @channel(EvalsChannel.DeleteScorer)
  async deleteScorer(id: string) {
    await this.registry.delete(id);
  }

  @channel(EvalsChannel.TestScorer)
  async testScorer(input: EvalScorerTestInput): Promise<EvalScorerRunResult> {
    const scorer = await this.registry.createTemporary(input.scorer);
    try {
      const result = await scorer.run({
        input: input.input,
        output: input.output,
        groundTruth: input.groundTruth,
      });
      return {
        scorerId: scorer.id,
        score: typeof result.score === 'number' ? result.score : null,
        reason: typeof result.reason === 'string' ? result.reason : null,
      };
    } catch (error) {
      return {
        scorerId: scorer.id,
        score: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @channel(EvalsChannel.ScoreThread)
  async scoreThread(
    input: EvalThreadScoreInput,
  ): Promise<EvalThreadScoreResult[]> {
    const scorers = await Promise.all(
      input.scorerIds.map((id) => this.registry.get(id, input.judgeModelId)),
    );
    const messagesResult = await mastraManager.getThreadMessages({
      threadId: input.threadId,
      perPage: false,
    });
    const selectedIds = input.messageIds?.length
      ? new Set(input.messageIds)
      : null;
    const messages = messagesResult.mastraDBMessages;
    const results: EvalThreadScoreResult[] = [];
    const runId = `thread-score-${nanoid()}`;

    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];
      if (
        message.role !== 'assistant' ||
        (selectedIds && !selectedIds.has(message.id))
      ) {
        continue;
      }
      const output = getTextContentFromMastraDBMessage(message);
      if (!output.trim()) continue;
      let userIndex = index - 1;
      while (userIndex >= 0 && messages[userIndex].role !== 'user') {
        userIndex -= 1;
      }
      const prompt =
        userIndex >= 0
          ? getTextContentFromMastraDBMessage(messages[userIndex])
          : '';
      const scores = await Promise.all(
        scorers.map(async (scorer): Promise<EvalScorerRunResult> => {
          try {
            const scoreResult = await scorer.run({
              input: prompt,
              output,
              scoreSource: 'experiment',
            });
            await this.saveThreadScore({
              scorer,
              scoreResult,
              runId,
              threadId: input.threadId,
              assistantMessageId: message.id,
              prompt,
              output,
            });
            return {
              scorerId: scorer.id,
              score:
                typeof scoreResult.score === 'number'
                  ? scoreResult.score
                  : null,
              reason:
                typeof scoreResult.reason === 'string'
                  ? scoreResult.reason
                  : null,
            };
          } catch (error) {
            return {
              scorerId: scorer.id,
              score: null,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }),
      );
      results.push({
        threadId: input.threadId,
        assistantMessageId: message.id,
        input: prompt,
        output,
        scores,
      });
    }
    return results;
  }

  @channel(EvalsChannel.ListThreadScores)
  async listThreadScores(input: {
    threadId: string;
    page?: number;
    perPage?: number;
  }) {
    const store = await this.getScoresStore();
    return store.listScoresByEntityId({
      entityId: input.threadId,
      entityType: 'agent',
      pagination: {
        page: input.page ?? 0,
        perPage: input.perPage ?? 100,
      },
    });
  }

  private async watchExperiment(datasetId: string, experimentId: string) {
    const dataset = await mastraManager.mastra.datasets.get({ id: datasetId });
    const poll = async () => {
      const experiment = await dataset.getExperiment({ experimentId });
      if (!experiment) return;
      this.sendProgress({ ...experiment, experimentId });
      if (experiment.status === 'pending' || experiment.status === 'running') {
        setTimeout(() => void poll(), 1000);
      }
    };
    setTimeout(() => void poll(), 300);
  }

  private sendProgress(payload: Record<string, unknown>) {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(EvalsChannel.ExperimentProgress, payload);
    }
  }

  private async getScoresStore() {
    const storage = mastraManager.mastra.getStorage();
    const store = await storage?.getStore('scores');
    if (!store) throw new Error('Scores storage is not configured');
    return store;
  }

  private async saveThreadScore({
    scorer,
    scoreResult,
    runId,
    threadId,
    assistantMessageId,
    prompt,
    output,
  }: {
    scorer: any;
    scoreResult: any;
    runId: string;
    threadId: string;
    assistantMessageId: string;
    prompt: string;
    output: string;
  }) {
    if (typeof scoreResult.score !== 'number') {
      throw new Error(`Scorer ${scorer.id} did not return a numeric score`);
    }
    const store = await this.getScoresStore();
    await store.saveScore({
      scorerId: scorer.id,
      score: scoreResult.score,
      reason: scoreResult.reason,
      input: prompt,
      output,
      entityType: 'agent',
      entityId: threadId,
      source: 'TEST',
      runId,
      threadId,
      metadata: { assistantMessageId },
      scorer: {
        id: scorer.id,
        name: scorer.name,
        description: scorer.description,
        hasJudge: Boolean(scorer.judge),
      },
      entity: {
        id: threadId,
        name: 'Conversation',
      },
      preprocessStepResult: toObject(scoreResult.preprocessStepResult),
      analyzeStepResult: toObject(scoreResult.analyzeStepResult),
      analyzePrompt: scoreResult.analyzePrompt,
      generateScorePrompt: scoreResult.generateScorePrompt,
      generateReasonPrompt: scoreResult.generateReasonPrompt,
    });
  }
}

export const evalsManager = new EvalsManager();
