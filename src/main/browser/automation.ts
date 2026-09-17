/* eslint-disable no-await-in-loop, no-continue -- Browser actions in a thread are intentionally ordered. */
import { threadBrowserManager, ThreadBrowserManager } from './manager';
import { parseBrowserCommands, normalizeBrowserUrl } from './command';
import { runBrowserCli } from './cli';

export { runBrowserCli } from './cli';

export async function executeBrowserCommands(
  input: {
    threadId: string;
    command: string;
    tabId?: string;
    workspace?: string;
    signal?: AbortSignal;
  },
  manager: ThreadBrowserManager = threadBrowserManager,
  cli = runBrowserCli,
): Promise<string> {
  const commands = parseBrowserCommands(input.command);
  return manager.run(
    input.threadId,
    async () => {
      const outputs: string[] = [];
      let targetId = input.tabId;
      manager.requestPreview(input.threadId);
      for (const originalArgs of commands) {
        if (input.signal?.aborted) throw new Error('Browser action cancelled.');
        const args = originalArgs.filter((arg) => arg !== '--json');
        if (args[0] === 'tab') {
          const operation = args[1] ?? 'list';
          if (operation === 'new') {
            if (args.includes('--label'))
              throw new Error(
                'Use the stable tabId returned by tab new; tab labels are not supported.',
              );
            const tab = manager.createCdpTab(
              input.threadId,
              args[2] || 'about:blank',
            );
            manager.registry.select(input.threadId, tab.id, true);
            targetId = tab.id;
            outputs.push(
              JSON.stringify({ tabId: tab.id, url: args[2] || 'about:blank' }),
            );
          } else if (operation === 'close') {
            const tab = manager.ensureAutomationTab(
              input.threadId,
              args[2] ?? targetId,
            );
            manager.closeTab(input.threadId, tab.id);
            outputs.push(JSON.stringify({ tabId: tab.id, closed: true }));
            targetId = undefined;
          } else if (operation !== 'list') {
            manager.registry.select(input.threadId, operation, true);
            targetId = operation;
          }
          outputs.push(JSON.stringify(manager.state(input.threadId)));
          continue;
        }
        if (args[0] === 'close') {
          manager.closeThread(input.threadId);
          outputs.push("Closed this thread's browser tabs.");
          continue;
        }
        const tab = manager.ensureAutomationTab(input.threadId, targetId);
        manager.setRunningTab(input.threadId, tab.id);
        if (['open', 'goto', 'navigate'].includes(args[0]) && args[1])
          normalizeBrowserUrl(args[1]);
        const controller = await manager.controller(input.threadId, tab.id);
        const signal = AbortSignal.any([
          controller.abortSignal,
          ...(input.signal ? [input.signal] : []),
        ]);
        const abort = () => {
          if (manager.registry.threads.get(input.threadId)?.tabs.has(tab.id))
            manager.resetController(input.threadId, tab.id);
        };
        input.signal?.addEventListener('abort', abort, { once: true });
        const connection = [
          '--session',
          controller.session,
          '--config',
          controller.configPath,
        ];
        try {
          const result = await cli(
            [...connection, '--cdp', controller.endpoint, ...originalArgs],
            { cwd: input.workspace, signal },
          );
          outputs.push(`[${tab.id}] ${result.output}`);
          if (result.cancelled) {
            abort();
            outputs.push('Browser action cancelled.');
          }
          if (result.code !== 0 || result.cancelled) break;
        } finally {
          input.signal?.removeEventListener('abort', abort);
          if (
            signal.aborted ||
            tab.value.controllerDirty ||
            !manager.registry.threads.get(input.threadId)?.tabs.has(tab.id)
          ) {
            await cli([...connection, 'close'], { timeout: 3000 }).catch(
              () => undefined,
            );
          }
        }
        targetId = tab.value.controllerDirty
          ? manager.state(input.threadId).automationTabId
          : tab.id;
      }
      return outputs.join('\n').slice(-64000);
    },
    input.signal,
  );
}
