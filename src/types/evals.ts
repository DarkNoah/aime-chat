export type EvalScorerKind = 'llm_judge' | 'check';

export type EvalCheckType =
  | 'completeness'
  | 'includes'
  | 'excludes'
  | 'equals'
  | 'matches'
  | 'similarity'
  | 'calledTool'
  | 'didNotCall'
  | 'toolOrder'
  | 'maxToolCalls'
  | 'usedNoTools'
  | 'noToolErrors';

export type EvalOutputFieldType = 'boolean' | 'number' | 'string';

export interface EvalOutputField {
  key: string;
  type: EvalOutputFieldType;
  description?: string;
}

export interface EvalLlmJudgeConfig {
  judgeModelId: string;
  instructions: string;
  analyzePrompt: string;
  outputFields: EvalOutputField[];
  scoreExpression: string;
  reasonPrompt?: string;
}

export interface EvalCheckConfig {
  checkType: EvalCheckType;
  params?: Record<string, unknown>;
}

export type EvalScorerConfig = EvalLlmJudgeConfig | EvalCheckConfig;

export interface EvalScorerInput {
  id?: string;
  name: string;
  description?: string;
  kind: EvalScorerKind;
  config: EvalScorerConfig;
}

export interface EvalScorerInfo extends EvalScorerInput {
  id: string;
  source: 'built_in' | 'custom';
  category: 'quality' | 'safety' | 'deterministic' | 'custom';
  scoreDirection: 'higher' | 'lower';
  createdAt?: string;
  updatedAt?: string;
}

export interface EvalDatasetInput {
  name: string;
  description?: string;
  targetIds?: string[];
  scorerIds?: string[];
}

export interface EvalDatasetItemInput {
  input: unknown;
  groundTruth?: unknown;
  metadata?: Record<string, unknown>;
}

export interface EvalExperimentInput {
  datasetId: string;
  name: string;
  description?: string;
  agentId: string;
  modelId: string;
  scorerIds: string[];
  maxConcurrency?: number;
}

export interface EvalThreadScoreInput {
  threadId: string;
  messageIds?: string[];
  scorerIds: string[];
  judgeModelId?: string;
}

export interface EvalScorerTestInput {
  scorer: EvalScorerInput;
  input: string;
  output: string;
  groundTruth?: string;
}

export interface EvalScorerRunResult {
  scorerId: string;
  score: number | null;
  reason?: string | null;
  error?: string | null;
}

export interface EvalThreadScoreResult {
  threadId: string;
  assistantMessageId: string;
  input: string;
  output: string;
  scores: EvalScorerRunResult[];
}

export interface EvalImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface EvalDatasetExport {
  filename: string;
  mimeType: string;
  content: string;
}

export const EVALS_EXPERIMENT_PROGRESS_EVENT = 'evals:experiment-progress';
