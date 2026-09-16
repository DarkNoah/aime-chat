/** @jest-environment node */
import {
  buildHealthReport,
  describeProvider,
  redactDiagnosticUrl,
} from './diagnostics';

it('reports the actual listening address and only the applied proxy fields', () => {
  const report = buildHealthReport({
    version: '1.2.3',
    server: {
      listening: true,
      address: () => ({ address: '127.0.0.1', port: 43210, family: 'IPv4' }),
    },
    proxy: {
      mode: 'custom',
      host: '127.0.0.1',
      port: 7890,
      user: 'secret-user',
      password: 'secret-password',
    } as any,
    insecureTls: false,
  });
  expect(report).toMatchObject({
    service: 'aime-chat',
    status: 'ok',
    version: '1.2.3',
    apiServer: { status: 'running', host: '127.0.0.1', port: 43210 },
    proxy: { mode: 'custom', host: '127.0.0.1', port: 7890 },
  });
  expect(report.uptimeSeconds).toBeGreaterThanOrEqual(0);
  expect(Number.isNaN(Date.parse(report.checkedAt))).toBe(false);
  expect(JSON.stringify(report)).not.toContain('secret');
});

it('reports a stopped server without inventing a listening port', () => {
  expect(buildHealthReport({ version: '1', insecureTls: true })).toMatchObject({
    status: 'unavailable',
    apiServer: { status: 'stopped', host: null, port: null },
    proxy: { mode: 'noproxy', host: null, port: null },
    insecureTls: true,
  });
});

it('preserves the distinction between unresolved system proxy and direct mode', () => {
  expect(
    buildHealthReport({
      version: '1',
      insecureTls: false,
      proxy: { mode: 'system' },
    }).proxy,
  ).toEqual({ mode: 'system', host: null, port: null });
});

it('redacts credentials, all repeated query values and fragments from diagnostic URLs', () => {
  const result = redactDiagnosticUrl(
    'https://secret-user:secret-pass@api.example/v1?key=secret-one&key=secret-two&custom=secret-three#secret-four',
  );
  const url = new URL(result);
  expect(url.username).toBe('');
  expect(url.password).toBe('');
  expect(url.pathname).toBe('/v1');
  expect([...url.searchParams.values()]).toEqual(['[redacted]', '[redacted]']);
  expect(url.hash).toBe('');
  expect(result).not.toContain('secret');
});

it.each(['not-a-url:secret', 'file:///secret', 'javascript:secret'])(
  'does not echo invalid URL %s',
  (url) => {
    expect(redactDiagnosticUrl(url)).toBe('[invalid URL]');
  },
);

it('includes disabled providers and their configured active models without secret fields', () => {
  const result = describeProvider({
    id: 'provider-id',
    name: 'Test',
    type: 'openai',
    isActive: false,
    apiBase: 'https://secret:secret@api.example/v1?token=secret',
    apiKey: 'secret',
    config: { authorization: 'secret' },
    models: [
      { id: 'vendor/model', name: 'Active', isActive: true, apiKey: 'secret' },
      { id: 'off', name: 'Inactive', isActive: false },
      null,
    ],
  });
  expect(result).toMatchObject({
    isActive: false,
    apiBaseSource: 'configured',
    modelCount: 3,
    activeModels: [
      {
        id: 'vendor/model',
        name: 'Active',
        providerModelId: 'provider-id/vendor/model',
      },
    ],
  });
  expect(JSON.stringify(result)).not.toContain('secret');
  expect(result).not.toHaveProperty('apiKey');
  expect(result).not.toHaveProperty('config');
});

it('labels fallback and unresolved API bases and tolerates missing model configuration', () => {
  const provider = { id: 'p', name: 'P', type: 'openai', isActive: true };
  expect(describeProvider(provider, 'https://api.example/v1')).toMatchObject({
    apiBase: 'https://api.example/v1',
    apiBaseSource: 'default',
    activeModels: [],
  });
  expect(describeProvider(provider)).toMatchObject({
    apiBase: null,
    apiBaseSource: 'unknown',
  });
});
