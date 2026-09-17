export interface OwnedTab<T> {
  id: string;
  targetId: string;
  value: T;
}

interface BrowserThread<T> {
  tabs: Map<string, OwnedTab<T>>;
  nextTab: number;
  selectedTabId?: string;
  automationTabId?: string;
}

/** Page ownership and action ordering are independent of shared cookies/storage. */
export class BrowserRegistry<T> {
  readonly threads = new Map<string, BrowserThread<T>>();

  private queues = new Map<string, Promise<unknown>>();

  thread(threadId: string) {
    if (!threadId?.trim())
      throw new Error('A chat thread is required for browser actions.');
    let thread = this.threads.get(threadId);
    if (!thread) {
      thread = { tabs: new Map(), nextTab: 1 };
      this.threads.set(threadId, thread);
    }
    return thread;
  }

  add(threadId: string, targetId: string, value: T) {
    const thread = this.thread(threadId);
    const tab = { id: `t${thread.nextTab}`, targetId, value };
    thread.nextTab += 1;
    thread.tabs.set(tab.id, tab);
    thread.selectedTabId = tab.id;
    // A closed automation target stays closed until explicitly selected/replaced.
    if (!thread.automationTabId) thread.automationTabId = tab.id;
    return tab;
  }

  get(threadId: string, tabId?: string) {
    const thread = this.thread(threadId);
    const id = tabId ?? thread.automationTabId;
    const tab = id ? thread.tabs.get(id) : undefined;
    if (!tab)
      throw new Error(
        `Browser tab ${id ?? '(none)'} is closed or does not belong to this thread. Use tab list, tab new, or tab <id>.`,
      );
    return tab;
  }

  select(threadId: string, tabId: string, automation = false) {
    this.get(threadId, tabId);
    const thread = this.thread(threadId);
    thread.selectedTabId = tabId;
    if (automation) thread.automationTabId = tabId;
  }

  remove(threadId: string, tabId: string) {
    const thread = this.thread(threadId);
    const tab = this.get(threadId, tabId);
    thread.tabs.delete(tabId);
    if (thread.selectedTabId === tabId) {
      thread.selectedTabId = [...thread.tabs.keys()].at(-1);
    }
    return tab;
  }

  async run<R>(
    threadId: string,
    action: () => Promise<R>,
    signal?: AbortSignal,
  ): Promise<R> {
    this.thread(threadId);
    const previous = this.queues.get(threadId) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(() => {
        if (signal?.aborted) throw new Error('Browser action cancelled.');
        return action();
      });
    this.queues.set(threadId, current);
    try {
      return await current;
    } finally {
      if (this.queues.get(threadId) === current) this.queues.delete(threadId);
    }
  }
}
