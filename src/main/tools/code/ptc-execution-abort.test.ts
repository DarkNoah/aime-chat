import {
  combineAbortSignals,
  createPtcExecutionAbortScope,
  getPtcExecutionAbortSignal,
} from './ptc-execution-abort';

describe('PTC execution abort signals', () => {
  it('forwards the upstream CodeExecution abort and unregisters on close', () => {
    const upstream = new AbortController();
    const scope = createPtcExecutionAbortScope(
      'upstream-abort',
      upstream.signal,
    );

    expect(getPtcExecutionAbortSignal('upstream-abort')).toBe(scope.signal);

    const reason = new Error('cancelled by user');
    upstream.abort(reason);

    expect(scope.signal.aborted).toBe(true);
    expect(scope.signal.reason).toBe(reason);

    scope.close();
    expect(getPtcExecutionAbortSignal('upstream-abort')).toBeUndefined();
  });

  it('aborts MCP work when CodeExecution ends unexpectedly', () => {
    const scope = createPtcExecutionAbortScope('execution-ended');
    const request = new AbortController();
    const combined = combineAbortSignals(request.signal, scope.signal);

    scope.close();

    expect(combined?.aborted).toBe(true);
    expect(getPtcExecutionAbortSignal('execution-ended')).toBeUndefined();
  });

  it('combines an MCP request cancellation with the execution lifecycle', () => {
    const execution = new AbortController();
    const request = new AbortController();
    const combined = combineAbortSignals(request.signal, execution.signal);

    request.abort('MCP request cancelled');

    expect(combined?.aborted).toBe(true);
    expect(combined?.reason).toBe('MCP request cancelled');
  });
});
