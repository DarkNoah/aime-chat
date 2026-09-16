import type { Server } from 'http';
import type { AppProxy } from '@/types/app';
import type { Providers } from '@/entities/providers';

/** Diagnostic URLs must never expose userinfo, query values or fragments. */
export function redactDiagnosticUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '[invalid URL]';
    url.username = '';
    url.password = '';
    for (const key of [...url.searchParams.keys()]) {
      url.searchParams.set(key, '[redacted]');
    }
    url.hash = '';
    return url.toString();
  } catch {
    return '[invalid URL]';
  }
}

export function buildHealthReport(input: {
  version: string;
  server?: Pick<Server, 'listening' | 'address'>;
  proxy?: AppProxy;
  insecureTls: boolean;
}) {
  const address = input.server?.address();
  const listening = input.server?.listening === true;
  const proxy = input.proxy;
  return {
    service: 'aime-chat',
    status: listening ? 'ok' : 'unavailable',
    version: input.version,
    checkedAt: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    platform: process.platform,
    apiServer: {
      status: listening ? 'running' : 'stopped',
      host: typeof address === 'object' ? (address?.address ?? null) : null,
      port: typeof address === 'object' ? (address?.port ?? null) : null,
    },
    // appProxy is the applied snapshot, including the last resolved system proxy.
    proxy: {
      mode: proxy?.mode ?? 'noproxy',
      host: proxy?.host ?? null,
      port: Number.isInteger(proxy?.port) ? proxy.port : null,
    },
    insecureTls: input.insecureTls,
  };
}

export function describeProvider(provider: Providers, defaultApiBase?: string) {
  const models = Array.isArray(provider.models) ? provider.models : [];
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    isActive: provider.isActive === true,
    apiBase: redactDiagnosticUrl(provider.apiBase || defaultApiBase),
    apiBaseSource: provider.apiBase
      ? 'configured'
      : defaultApiBase
        ? 'default'
        : 'unknown',
    modelCount: models.length,
    activeModels: models
      .filter(
        (model) => model?.isActive === true && typeof model.id === 'string',
      )
      .map((model) => ({
        id: model.id,
        name: model.name || model.id,
        providerModelId: `${provider.id}/${model.id}`,
      })),
  };
}
