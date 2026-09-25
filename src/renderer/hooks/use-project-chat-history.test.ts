import { act, renderHook, waitFor } from '@testing-library/react';
import { useProjectChatHistory } from './use-project-chat-history';

const getThreads = jest.fn();
const page = (ids: string[], hasMore = false) => ({
  items: ids.map((id) => ({ id, title: `Chat ${id}` })),
  hasMore,
});
function deferred() {
  let resolve!: (value: ReturnType<typeof page>) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ReturnType<typeof page>>((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  getThreads.mockReset();
  Object.defineProperty(window, 'electron', {
    configurable: true,
    value: { mastra: { getThreads } },
  });
});

it('appends subsequent pages once, deduplicates moved threads, and stops at the end', async () => {
  const next = deferred();
  getThreads
    .mockResolvedValueOnce(page(['1', '2'], true))
    .mockReturnValueOnce(next.promise);
  const { result } = renderHook(() => useProjectChatHistory('project:A', true));
  await waitFor(() => expect(result.current.threads).toHaveLength(2));
  act(() => {
    result.current.loadMore();
    result.current.loadMore();
  });
  expect(getThreads).toHaveBeenCalledTimes(2);
  expect(getThreads).toHaveBeenLastCalledWith({
    resourceId: 'project:A',
    page: 1,
    size: 20,
  });
  expect(result.current.threads).toHaveLength(2);
  await act(async () => next.resolve(page(['2', '3'])));
  expect(result.current.threads.map((thread) => thread.id)).toEqual([
    '1',
    '2',
    '3',
  ]);
  await act(async () => result.current.loadMore());
  expect(getThreads).toHaveBeenCalledTimes(2);
});

it('retains loaded history after failure and retries the same page', async () => {
  getThreads
    .mockResolvedValueOnce(page(['1'], true))
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValueOnce(page(['2']));
  const { result } = renderHook(() => useProjectChatHistory('project:A', true));
  await waitFor(() => expect(result.current.threads).toHaveLength(1));
  await act(async () => result.current.loadMore());
  expect(result.current.error).toBe('Offline');
  expect(result.current.threads).toHaveLength(1);
  await act(async () => result.current.loadMore());
  expect(getThreads.mock.calls.map(([args]) => args.page)).toEqual([0, 1, 1]);
  expect(result.current.threads).toHaveLength(2);
  expect(result.current.error).toBeNull();
});

it('discards previous project responses without unlocking the current request', async () => {
  const old = deferred();
  const current = deferred();
  getThreads
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(current.promise);
  const { result, rerender } = renderHook(
    ({ resourceId }) => useProjectChatHistory(resourceId, true),
    { initialProps: { resourceId: 'project:A' } },
  );
  rerender({ resourceId: 'project:B' });
  await act(async () => old.resolve(page(['old'], true)));
  expect(result.current.threads).toEqual([]);
  expect(result.current.loading).toBe(true);
  await act(async () => result.current.loadMore());
  expect(getThreads).toHaveBeenCalledTimes(2);
  await act(async () => current.resolve(page(['new'])));
  expect(result.current.threads.map((thread) => thread.id)).toEqual(['new']);
});

it('loads only while open and starts from page zero on reopening', async () => {
  const stale = deferred();
  getThreads
    .mockReturnValueOnce(stale.promise)
    .mockResolvedValueOnce(page(['fresh']));
  const { result, rerender } = renderHook(
    ({ open }) => useProjectChatHistory('project:A', open),
    { initialProps: { open: false } },
  );
  expect(getThreads).not.toHaveBeenCalled();
  rerender({ open: true });
  rerender({ open: false });
  await act(async () => stale.resolve(page(['stale'])));
  expect(result.current.threads).toEqual([]);
  rerender({ open: true });
  await waitFor(() => expect(result.current.threads[0]?.id).toBe('fresh'));
  expect(getThreads.mock.calls.map(([args]) => args.page)).toEqual([0, 0]);
});

it('invalidates an in-flight page when refreshed after a deletion', async () => {
  const stale = deferred();
  getThreads
    .mockResolvedValueOnce(page(['deleted'], true))
    .mockReturnValueOnce(stale.promise)
    .mockResolvedValueOnce(page(['remaining']));
  const { result } = renderHook(() => useProjectChatHistory('project:A', true));
  await waitFor(() => expect(result.current.threads).toHaveLength(1));
  act(() => {
    result.current.loadMore();
  });
  await act(async () => result.current.refresh());
  await act(async () => stale.resolve(page(['stale'])));
  expect(result.current.threads.map((thread) => thread.id)).toEqual([
    'remaining',
  ]);
  expect(getThreads.mock.calls.map(([args]) => args.page)).toEqual([0, 1, 0]);
});
