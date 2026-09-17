/* eslint-disable import/no-cycle */
import { KnowledgeBase, KnowledgeBaseItem } from '@/entities/knowledge-base';
import { VectorStoreType } from '@/types/knowledge-base';
import memoryKnowledgeBaseManager from './index';
import { dbManager } from '../db';
import { providersManager } from '../providers';
import { Settings } from '@/entities/settings';
import { createHash } from 'crypto';

export const STATIC_MEMORY_KB_ID = 'static_memory';
export const STATIC_MEMORY_KB_NAME = 'Memory';
export const PROJECT_MEMORY_KB_ID = 'project_memory';
export const PROJECT_MEMORY_KB_NAME = 'Project Memory';

export type MemoryScope =
  | { type: 'global' }
  | { type: 'project'; projectId: string; threadId?: string };

const GLOBAL_SCOPE: MemoryScope = { type: 'global' };
const pendingKnowledgeBases = new Map<
  string,
  Promise<KnowledgeBase | undefined>
>();
const pendingWrites = new Map<string, Promise<KnowledgeBaseItem | undefined>>();

function memoryKBId(scope: MemoryScope): string {
  if (scope.type === 'project' && !scope.projectId) {
    throw new Error('Project memory requires a project chat thread.');
  }
  return scope.type === 'project' ? PROJECT_MEMORY_KB_ID : STATIC_MEMORY_KB_ID;
}

function memoryItems(scope: MemoryScope) {
  const query = dbManager.dataSource
    .getRepository(KnowledgeBaseItem)
    .createQueryBuilder('item')
    .where('item.knowledgeBaseId = :kbId', { kbId: memoryKBId(scope) });
  if (scope.type === 'project') {
    query.andWhere("json_extract(item.metadata, '$.projectId') = :projectId", {
      projectId: scope.projectId,
    });
  }
  return query;
}
export const INDEX_DOC_NAME = 'index.md';
export const LOG_DOC_NAME = 'log.md';

export type MemoryRole = 'index' | 'log' | 'page' | 'daily' | 'timeline';

const formatTimestamp = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

async function getDefaultKnowledgeBaseModels(): Promise<{
  embedding?: string;
  reranker?: string;
}> {
  const settings = await dbManager.dataSource
    .getRepository(Settings)
    .findOne({ where: { id: 'defaultModel' } });
  const defaultModel = {
    embeddingModel: process.env.DEFAULT_EMBEDDING_MODEL,
    rerankerModel: process.env.DEFAULT_RERANKER_MODEL,
    ...(settings?.value ?? {}),
  };

  return {
    embedding: defaultModel.embeddingModel?.trim() || undefined,
    reranker: defaultModel.rerankerModel?.trim() || undefined,
  };
}

async function pickDefaultEmbedding(
  configuredModel?: string,
): Promise<string | undefined> {
  try {
    if (configuredModel) {
      return configuredModel;
    }

    const providers = await providersManager.getAvailableEmbeddingModels();
    for (const p of providers) {
      if (p.models && p.models.length > 0) {
        return p.models[0].id;
      }
    }
  } catch (err) {
    console.error('[static-memory] pickDefaultEmbedding failed', err);
  }
  return undefined;
}

export async function getMemoryKB(
  scope: MemoryScope = GLOBAL_SCOPE,
): Promise<KnowledgeBase | undefined> {
  const repo = dbManager.dataSource.getRepository(KnowledgeBase);
  return (
    (await repo.findOne({ where: { id: memoryKBId(scope) } })) ?? undefined
  );
}

export async function getMemoryItemByName(
  name: string,
  scope: MemoryScope = GLOBAL_SCOPE,
): Promise<KnowledgeBaseItem | undefined> {
  return (
    (await memoryItems(scope)
      .andWhere('item.name = :name', { name })
      .getOne()) ?? undefined
  );
}

export async function getProjectMemoryItemByRun(
  projectId: string,
  threadId: string,
  runId: string,
): Promise<KnowledgeBaseItem | undefined> {
  return (
    (await memoryItems({ type: 'project', projectId })
      .andWhere("json_extract(item.metadata, '$.role') = 'timeline'")
      .andWhere("json_extract(item.metadata, '$.threadId') = :threadId", {
        threadId,
      })
      .andWhere("json_extract(item.metadata, '$.runId') = :runId", { runId })
      .getOne()) ?? undefined
  );
}

export async function getMemoryItemById(
  id: string,
  scope: MemoryScope = GLOBAL_SCOPE,
) {
  return (
    (await memoryItems(scope).andWhere('item.id = :id', { id }).getOne()) ??
    undefined
  );
}

const initialIndex = () => `# Wiki Index

This is the auto-maintained index of the global memory wiki.
The Cultivation agent updates this file whenever new pages are created.

## Pages

(no pages yet)
`;

const initialLog = () => `# Log

Append-only timeline of memory updates.
`;

async function ensureSystemPage(
  name: string,
  role: MemoryRole,
  fallback: string,
) {
  const existing = await getMemoryItemByName(name);
  if (existing) return existing;
  const key = JSON.stringify([STATIC_MEMORY_KB_ID, '', name]);
  return memoryKnowledgeBaseManager.saveMemoryTextItem({
    id: `memory-${createHash('sha256').update(key).digest('hex')}`,
    kbId: STATIC_MEMORY_KB_ID,
    name,
    content: fallback,
    metadata: { role },
  });
}

export async function getOrCreateMemoryKB(
  scope: MemoryScope = GLOBAL_SCOPE,
): Promise<KnowledgeBase | undefined> {
  const id = memoryKBId(scope);
  const existing = await getMemoryKB(scope);
  const pending = pendingKnowledgeBases.get(id);
  if (pending) return pending;
  if (existing) return existing;

  const creating = (async () => {
    const defaultModels = await getDefaultKnowledgeBaseModels();
    const embedding = await pickDefaultEmbedding(defaultModels.embedding);
    // Project timelines must remain writable without an embedding provider.
    // The knowledge base then uses its existing BM25-only pipeline.
    if (!embedding && scope.type === 'global') return undefined;
    const projectMemory = scope.type === 'project';
    const kb = await memoryKnowledgeBaseManager.createKnowledgeBase({
      id,
      name: projectMemory ? PROJECT_MEMORY_KB_NAME : STATIC_MEMORY_KB_NAME,
      description: projectMemory
        ? 'Project memories and completed task summaries, isolated by project.'
        : 'Global memory wiki maintained by the Cultivation agent.',
      vectorStoreType: VectorStoreType.LibSQL,
      vectorStoreConfig: projectMemory
        ? {
            extendColumns: [
              { name: 'projectId', columnType: 'text' },
              { name: 'threadId', columnType: 'text' },
            ],
          }
        : undefined,
      embedding,
      reranker: defaultModels.reranker,
      static: true,
    });
    if (!projectMemory) {
      await ensureSystemPage(INDEX_DOC_NAME, 'index', initialIndex());
      await ensureSystemPage(LOG_DOC_NAME, 'log', initialLog());
    }
    return kb;
  })();
  pendingKnowledgeBases.set(id, creating);
  try {
    return await creating;
  } finally {
    pendingKnowledgeBases.delete(id);
  }
}

export type MemoryPageOptions = {
  offset?: number;
  limit?: number;
  role?: MemoryRole;
  excludeThreadId?: string;
};

export async function listMemoryPage(
  scope: MemoryScope = GLOBAL_SCOPE,
  options: MemoryPageOptions = {},
) {
  const limit = Math.min(100, Math.max(1, Math.floor(options.limit ?? 20)));
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const query = memoryItems(scope).andWhere(
    'item.name NOT IN (:...systemPages)',
    { systemPages: [INDEX_DOC_NAME, LOG_DOC_NAME] },
  );
  if (options.role) {
    query.andWhere("json_extract(item.metadata, '$.role') = :role", {
      role: options.role,
    });
  }
  if (options.excludeThreadId) {
    query.andWhere(
      "(json_extract(item.metadata, '$.threadId') IS NULL OR json_extract(item.metadata, '$.threadId') != :excludeThreadId)",
      { excludeThreadId: options.excludeThreadId },
    );
  }
  query
    .orderBy(
      options.role === 'timeline'
        ? "json_extract(item.metadata, '$.startedAt')"
        : 'item.updatedAt',
      'DESC',
    )
    .addOrderBy('item.id', 'DESC');
  const [items, total] = await query.skip(offset).take(limit).getManyAndCount();
  return {
    items,
    total,
    offset,
    limit,
    hasMore: offset + items.length < total,
  };
}

// Retain the unpaginated helper for existing internal callers.
export async function listMemoryPages(
  scope: MemoryScope = GLOBAL_SCOPE,
): Promise<KnowledgeBaseItem[]> {
  return memoryItems(scope)
    .andWhere('item.name NOT IN (:...systemPages)', {
      systemPages: [INDEX_DOC_NAME, LOG_DOC_NAME],
    })
    .orderBy('item.updatedAt', 'DESC')
    .addOrderBy('item.id', 'DESC')
    .getMany();
}

/** Persist the item and its metadata before returning; index through the KB pipeline. */
export async function upsertMemoryItem(opts: {
  id?: string;
  name: string;
  content: string;
  role: MemoryRole;
  mode?: 'replace' | 'append';
  scope?: MemoryScope;
  metadata?: Record<string, unknown>;
}): Promise<KnowledgeBaseItem | undefined> {
  const { name, content, role, mode = 'replace', scope = GLOBAL_SCOPE } = opts;
  const kbId = memoryKBId(scope);
  const key = JSON.stringify([
    kbId,
    scope.type === 'project' ? scope.projectId : '',
    opts.id ? { id: opts.id } : name,
  ]);
  const previous = pendingWrites.get(key);
  const writing = (async () => {
    await previous?.catch(() => undefined);
    const kb = await getOrCreateMemoryKB(scope);
    if (!kb) return undefined;
    const existing = opts.id
      ? await getMemoryItemById(opts.id, scope)
      : await getMemoryItemByName(name, scope);
    if (
      opts.id &&
      !existing &&
      (await dbManager.dataSource
        .getRepository(KnowledgeBaseItem)
        .findOneBy({ id: opts.id }))
    ) {
      throw new Error('Memory item belongs to another scope');
    }
    const oldContent = existing?.content ?? '';
    const nextContent =
      existing && mode === 'append'
        ? `${oldContent}${oldContent.endsWith('\n') ? '' : '\n'}${content}`
        : content;
    const provenance =
      scope.type === 'project'
        ? {
            projectId: scope.projectId,
            threadId: scope.threadId ?? existing?.metadata?.threadId,
          }
        : {};
    const metadata = {
      ...existing?.metadata,
      ...opts.metadata,
      ...provenance,
      role,
    };
    const extendData = scope.type === 'project' ? provenance : undefined;
    return memoryKnowledgeBaseManager.saveMemoryTextItem({
      id:
        existing?.id ??
        opts.id ??
        `memory-${createHash('sha256').update(key).digest('hex')}`,
      kbId,
      name,
      content: nextContent,
      metadata,
      extendData,
    });
  })();
  pendingWrites.set(key, writing);
  try {
    return await writing;
  } finally {
    if (pendingWrites.get(key) === writing) pendingWrites.delete(key);
  }
}

export async function deleteProjectMemory(
  projectId?: string,
  threadId?: string,
): Promise<void> {
  if (!projectId && !threadId) throw new Error('Project or thread is required');
  const query = dbManager.dataSource
    .getRepository(KnowledgeBaseItem)
    .createQueryBuilder('item')
    .where('item.knowledgeBaseId = :kbId', { kbId: PROJECT_MEMORY_KB_ID });
  if (projectId)
    query.andWhere("json_extract(item.metadata, '$.projectId') = :projectId", {
      projectId,
    });
  if (threadId) {
    query.andWhere("json_extract(item.metadata, '$.threadId') = :threadId", {
      threadId,
    });
  }
  const items = await query.getMany();
  await Promise.all(
    items.map((item) =>
      memoryKnowledgeBaseManager.deleteKnowledgeBaseItem(item.id),
    ),
  );
}

export async function appendToLog(
  entry: string,
  scope: MemoryScope = GLOBAL_SCOPE,
): Promise<void> {
  const ts = formatTimestamp(new Date());
  const block = `\n## [${ts}]\n\n${entry}\n`;
  await upsertMemoryItem({
    name: LOG_DOC_NAME,
    role: 'log',
    scope,
    content: block,
    mode: 'append',
  });
}

export async function searchMemory(
  query: string,
  topK: number = 8,
  scope: MemoryScope = GLOBAL_SCOPE,
) {
  const kb = await getOrCreateMemoryKB(scope);
  if (!kb) return { query, embedding: '', results: [] };
  return memoryKnowledgeBaseManager.searchKnowledgeBase(
    memoryKBId(scope),
    query,
    'text',
    scope.type === 'project'
      ? `"projectId" = '${scope.projectId.replace(/'/g, "''")}'`
      : undefined,
    topK,
  );
}

/**
 * Current project's ten most recent timeline titles from other threads,
 * ordered by task start time.
 */
export async function buildProjectTimelineDigest(
  projectId: string,
  currentThreadId?: string,
): Promise<string | undefined> {
  if (!projectId) return undefined;
  const { items } = await listMemoryPage(
    { type: 'project', projectId },
    {
      offset: 0,
      limit: 10,
      role: 'timeline',
      excludeThreadId: currentThreadId,
    },
  );
  if (items.length === 0) return undefined;
  return items
    .map((item, index) => `${index + 1}. ${JSON.stringify(item.name)}`)
    .join('\n');
}

/**
 * Build a compact context digest to inject in chat:
 * - full index.md
 * - tail of log.md (last N lines)
 */
export async function buildContextDigest(opts?: {
  logTailLines?: number;
}): Promise<string | undefined> {
  const kb = await getMemoryKB();
  if (!kb) return undefined;

  const tail = opts?.logTailLines ?? 30;
  const indexItem = await getMemoryItemByName(INDEX_DOC_NAME);
  const logItem = await getMemoryItemByName(LOG_DOC_NAME);

  const sections: string[] = [];
  if (indexItem?.content?.trim()) {
    sections.push(`### ${INDEX_DOC_NAME}\n\n${indexItem.content.trim()}`);
  }
  if (logItem?.content?.trim()) {
    const lines = logItem.content.split('\n');
    const lastLines = lines.slice(-tail).join('\n').trim();
    if (lastLines) {
      sections.push(`### ${LOG_DOC_NAME} (recent)\n\n${lastLines}`);
    }
  }
  if (sections.length === 0) return undefined;
  return sections.join('\n\n');
}
