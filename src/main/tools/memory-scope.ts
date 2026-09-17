import type { ToolExecutionContext } from '@mastra/core/tools';
import type { MemoryScope } from '@/main/knowledge-base/static-memory';

import type { RequestContext } from '@mastra/core/request-context';
import type { ChatRequestContext } from '@/types/chat';

export type MemoryType = 'global' | 'project';

/** Scope is derived from trusted execution context, never from model-supplied IDs. */
export async function resolveMemoryScope(
  type: MemoryType | undefined,
  context?: ToolExecutionContext,
): Promise<MemoryScope> {
  if (type === 'global') return { type: 'global' };
  const requestContext = context?.requestContext as
    | RequestContext<ChatRequestContext>
    | undefined;
  const threadId = (requestContext?.get('threadId') ??
    context?.agent?.threadId) as string | undefined;
  let resourceId = (requestContext?.get('resourceId') ??
    context?.agent?.resourceId) as string | undefined;
  let projectId = requestContext?.get('projectId') as string | undefined;
  if (!resourceId && !projectId && threadId && context?.mastra) {
    const memory = await context.mastra.getStorage()?.getStore('memory');
    const thread = await memory?.getThreadById({ threadId });
    resourceId = thread?.resourceId;
  }
  // An explicit non-project resource is authoritative over a stale projectId.
  if (resourceId) {
    projectId = resourceId.startsWith('project:')
      ? resourceId.slice('project:'.length)
      : undefined;
  }
  if (projectId) return { type: 'project', projectId, threadId };
  if (type === 'project')
    throw new Error('Project memory requires a project chat thread.');
  return { type: 'global' };
}
