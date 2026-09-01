export interface DatasetRecord {
  id: string;
  name: string;
  description?: string;
  version: number;
  targetIds?: string[] | null;
  scorerIds?: string[] | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface DatasetItem {
  id: string;
  input: unknown;
  groundTruth?: unknown;
  metadata?: Record<string, unknown>;
  datasetVersion: number;
}

export interface Experiment {
  id: string;
  name?: string;
  description?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalItems: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
  metadata?: {
    agentId?: string;
    modelId?: string;
    scorerIds?: string[];
  };
  startedAt?: string | Date | null;
  completedAt?: string | Date | null;
  createdAt: string | Date;
}

export interface StoredScore {
  id: string;
  scorerId: string;
  score: number;
  reason?: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  createdAt: string | Date;
}

export interface ExperimentResult {
  id: string;
  itemId: string;
  input: unknown;
  output: unknown;
  groundTruth?: unknown;
  error?: { message: string } | null;
  startedAt: string | Date;
  completedAt: string | Date;
  scores: StoredScore[];
}

export const displayValue = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '—';
  return JSON.stringify(value, null, 2);
};

export const shortDate = (value?: string | Date | null) =>
  value ? new Date(value).toLocaleString() : '—';
