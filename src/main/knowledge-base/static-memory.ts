import { KnowledgeBase, KnowledgeBaseItem } from '@/entities/knowledge-base';
import {
  KnowledgeBaseItemState,
  KnowledgeBaseSourceType,
  VectorStoreType,
} from '@/types/knowledge-base';
import knowledgeBaseManager from './index';
import { dbManager } from '../db';
import { providersManager } from '../providers';

export const STATIC_MEMORY_KB_ID = 'static_memory';
export const STATIC_MEMORY_KB_NAME = 'Memory';
export const INDEX_DOC_NAME = 'index.md';
export const LOG_DOC_NAME = 'log.md';

export type MemoryRole = 'index' | 'log' | 'page' | 'daily';

const formatTimestamp = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

async function pickDefaultEmbedding(): Promise<string | undefined> {
  try {
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

export async function getMemoryKB(): Promise<KnowledgeBase | undefined> {
  const repo = dbManager.dataSource.getRepository(KnowledgeBase);
  return (await repo.findOne({ where: { id: STATIC_MEMORY_KB_ID } })) ?? undefined;
}

export async function getOrCreateMemoryKB(): Promise<KnowledgeBase | undefined> {
  let kb = await getMemoryKB();
  if (kb) return kb;

  const embedding = await pickDefaultEmbedding();
  if (!embedding) {
    console.log(
      '[static-memory] No default embedding model configured; skip creating static memory KB.',
    );
    return undefined;
  }

  try {
    kb = await knowledgeBaseManager.createKnowledgeBase({
      id: STATIC_MEMORY_KB_ID,
      name: STATIC_MEMORY_KB_NAME,
      description: 'Global memory wiki maintained by the Cultivation agent.',
      vectorStoreType: VectorStoreType.LibSQL,
      embedding,
      static: true,
    } as any);
  } catch (err) {
    console.error('[static-memory] createKnowledgeBase failed', err);
    return undefined;
  }

  await ensureSystemPage(INDEX_DOC_NAME, 'index', initialIndex());
  await ensureSystemPage(LOG_DOC_NAME, 'log', initialLog());

  return kb;
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

async function ensureSystemPage(name: string, role: MemoryRole, fallback: string) {
  const existing = await getMemoryItemByName(name);
  if (existing) return existing;
  return upsertMemoryItem({ name, role, content: fallback, mode: 'replace' });
}

export async function getMemoryItemByName(name: string): Promise<KnowledgeBaseItem | undefined> {
  const repo = dbManager.dataSource.getRepository(KnowledgeBaseItem);
  return (
    (await repo.findOne({ where: { knowledgeBaseId: STATIC_MEMORY_KB_ID, name } })) ?? undefined
  );
}

export async function listMemoryPages(): Promise<KnowledgeBaseItem[]> {
  const repo = dbManager.dataSource.getRepository(KnowledgeBaseItem);
  const items = await repo.find({
    where: { knowledgeBaseId: STATIC_MEMORY_KB_ID },
    order: { updatedAt: 'DESC' as any },
  });
  return items.filter((x) => x.name !== INDEX_DOC_NAME && x.name !== LOG_DOC_NAME);
}

/**
 * Upsert a memory item (index, log, or topic page).
 * - mode 'replace' (default): rewrite content entirely
 * - mode 'append': append to existing content (or create if missing)
 *
 * Internally we delete the existing item (its vector rows are removed by FK)
 * and re-import via the standard text source pipeline so embeddings stay fresh.
 */
export async function upsertMemoryItem(opts: {
  name: string;
  content: string;
  role: MemoryRole;
  mode?: 'replace' | 'append';
}): Promise<KnowledgeBaseItem | undefined> {
  const { name, content, role, mode = 'replace' } = opts;
  const kb = await getOrCreateMemoryKB();
  if (!kb) return undefined;

  let nextContent = content;
  const existing = await getMemoryItemByName(name);
  if (existing && mode === 'append') {
    const oldContent = existing.content ?? '';
    nextContent = oldContent.endsWith('\n')
      ? `${oldContent}${content}`
      : `${oldContent}\n${content}`;
  }

  if (existing) {
    try {
      await knowledgeBaseManager.deleteKnowledgeBaseItem(existing.id);
    } catch (err) {
      console.error('[static-memory] deleteKnowledgeBaseItem failed', err);
    }
  }

  await knowledgeBaseManager.importSource({
    kbId: STATIC_MEMORY_KB_ID,
    type: KnowledgeBaseSourceType.Text,
    source: { content: nextContent, name, role },
  });

  // wait briefly for the background task to materialize the item, then reload.
  // The caller can also fetch by name later; we just return the freshly resolved item.
  for (let i = 0; i < 20; i++) {
    const item = await getMemoryItemByName(name);
    if (item && item.state === KnowledgeBaseItemState.Completed) {
      // patch the meta so name/role are stored consistently
      const repo = dbManager.dataSource.getRepository(KnowledgeBaseItem);
      const meta = (item.metadata as any) ?? {};
      if (meta.role !== role || item.name !== name) {
        item.name = name;
        item.metadata = { ...meta, role };
        await repo.save(item);
      }
      return item;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return await getMemoryItemByName(name);
}

export async function appendToLog(entry: string): Promise<void> {
  const ts = formatTimestamp(new Date());
  const block = `\n## [${ts}]\n\n${entry}\n`;
  await upsertMemoryItem({
    name: LOG_DOC_NAME,
    role: 'log',
    content: block,
    mode: 'append',
  });
}

export async function searchMemory(query: string, top_k: number = 8) {
  const kb = await getOrCreateMemoryKB();
  if (!kb) return { query, embedding: '', results: [] };
  return await knowledgeBaseManager.searchKnowledgeBase(
    STATIC_MEMORY_KB_ID,
    query,
    'text',
    undefined,
    top_k,
  );
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
