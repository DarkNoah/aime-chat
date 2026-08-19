const ptcExecutionAbortSignals = new Map<string, AbortSignal>();

export interface PtcExecutionAbortScope {
  signal: AbortSignal;
  close: (reason?: unknown) => void;
}

/**
 * Bridges the lifecycle of a CodeExecution process to MCP tool handlers running
 * in the Electron main process. The Python MCP client includes executionId in
 * request metadata, allowing the handler to recover this signal.
 */
export function createPtcExecutionAbortScope(
  executionId: string,
  upstreamSignal?: AbortSignal,
): PtcExecutionAbortScope {
  const controller = new AbortController();

  const forwardUpstreamAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort(upstreamSignal?.reason);
    }
  };

  if (upstreamSignal?.aborted) {
    forwardUpstreamAbort();
  } else {
    upstreamSignal?.addEventListener('abort', forwardUpstreamAbort, {
      once: true,
    });
  }

  ptcExecutionAbortSignals.set(executionId, controller.signal);

  return {
    signal: controller.signal,
    close: (reason = new Error('CodeExecution ended')) => {
      if (!controller.signal.aborted) {
        controller.abort(reason);
      }
      upstreamSignal?.removeEventListener('abort', forwardUpstreamAbort);
      if (ptcExecutionAbortSignals.get(executionId) === controller.signal) {
        ptcExecutionAbortSignals.delete(executionId);
      }
    },
  };
}

export function getPtcExecutionAbortSignal(
  executionId?: string,
): AbortSignal | undefined {
  if (!executionId) return undefined;
  return ptcExecutionAbortSignals.get(executionId);
}

export function combineAbortSignals(
  ...signals: Array<AbortSignal | undefined>
): AbortSignal | undefined {
  const availableSignals = signals.filter(
    (signal): signal is AbortSignal => signal !== undefined,
  );
  if (availableSignals.length === 0) return undefined;
  if (availableSignals.length === 1) return availableSignals[0];

  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(availableSignals);
  }

  // Jest's jsdom and older Electron runtimes may not expose AbortSignal.any.
  const controller = new AbortController();
  const abortCombinedSignal = (event: Event) => {
    const source = event.target as AbortSignal;
    controller.abort(source.reason);
    availableSignals.forEach((signal) => {
      signal.removeEventListener('abort', abortCombinedSignal);
    });
  };

  const alreadyAborted = availableSignals.find((signal) => signal.aborted);
  if (alreadyAborted) {
    controller.abort(alreadyAborted.reason);
    return controller.signal;
  }

  availableSignals.forEach((signal) => {
    signal.addEventListener('abort', abortCombinedSignal, { once: true });
  });
  return controller.signal;
}
