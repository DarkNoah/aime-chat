import { randomBytes } from 'crypto';
import { app } from 'electron';
import type {
  BaseInfo,
  GetConfigResp,
  GetUpdatesReq,
  GetUpdatesResp,
  GetUploadUrlReq,
  GetUploadUrlResp,
  SendMessageReq,
  SendTypingReq,
  WeixinQrCodeResponse,
  WeixinQrStatusResponse,
} from './types';
import { fetch, Agent } from 'undici';

export const DEFAULT_WEIXIN_BASE_URL = 'https://ilinkai.weixin.qq.com';
export const DEFAULT_WEIXIN_CDN_BASE_URL = 'https://novac2c.cdn.weixin.qq.com/c2c';
export const DEFAULT_WEIXIN_BOT_TYPE = '3';

const DEFAULT_LONG_POLL_TIMEOUT_MS = 35_000;
const DEFAULT_API_TIMEOUT_MS = 15_000;
const DEFAULT_CONFIG_TIMEOUT_MS = 10_000;

export type WeixinApiOptions = {
  baseUrl: string;
  token?: string;
  timeoutMs?: number;
  routeTag?: string;
};

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

function buildBaseInfo(): BaseInfo {
  try {
    return {
      channel_version: '2.0.1',
    };
  } catch {
    return { channel_version: 'unknown' };
  }
}

function randomWechatUin(): string {
  const uint32 = randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), 'utf-8').toString('base64');
}

function resolveRouteTag(routeTag?: string): string | undefined {
  const resolved =
    routeTag?.trim() ||
    process.env.WEIXIN_SK_ROUTE_TAG?.trim() ||
    process.env.SKRouteTag?.trim();
  return resolved || undefined;
}

function buildHeaders(opts: {
  token?: string;
  body?: string;
  routeTag?: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    AuthorizationType: 'ilink_bot_token',
    'X-WECHAT-UIN': randomWechatUin(),
  };

  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = String(Buffer.byteLength(opts.body, 'utf-8'));
  }

  if (opts.token?.trim()) {
    headers.Authorization = `Bearer ${opts.token.trim()}`;
  }

  const routeTag = resolveRouteTag(opts.routeTag);
  if (routeTag) {
    headers.SKRouteTag = routeTag;
  }

  return headers;
}

async function apiFetch(params: {
  baseUrl: string;
  endpoint: string;
  body: string;
  token?: string;
  timeoutMs: number;
  routeTag?: string;
  abortSignal?: AbortSignal;
}): Promise<string> {
  const base = ensureTrailingSlash(params.baseUrl);
  const url = new URL(params.endpoint, base);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  const onAbort = () => controller.abort();
  params.abortSignal?.addEventListener('abort', onAbort, { once: true });

  try {
    const headers = buildHeaders({
      token: params.token,
      body: params.body,
      routeTag: params.routeTag,
    })
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body: params.body,
      signal: controller.signal,
      dispatcher: new Agent()
    });
    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`${params.endpoint} ${response.status}: ${rawText}`);
    }
    return rawText;
  } finally {
    clearTimeout(timer);
    params.abortSignal?.removeEventListener('abort', onAbort);
  }
}

export async function fetchQRCode(params: {
  baseUrl?: string;
  botType?: string;
  routeTag?: string;
}): Promise<WeixinQrCodeResponse> {
  const base = ensureTrailingSlash(params.baseUrl ?? DEFAULT_WEIXIN_BASE_URL);
  const botType = params.botType ?? DEFAULT_WEIXIN_BOT_TYPE;
  const url = new URL(`ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(botType)}`, base);
  const headers: Record<string, string> = {};
  const routeTag = resolveRouteTag(params.routeTag);
  if (routeTag) {
    headers.SKRouteTag = routeTag;
  }
  const response = await fetch(url.toString(), { headers, dispatcher: new Agent() });
  if (!response.ok) {
    throw new Error(`Failed to fetch QR code: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as WeixinQrCodeResponse;
}

export async function generateQRCodeBase64(text: string): Promise<string> {
  const QRCode = await import('qrcode');
  return QRCode.toDataURL(text, { width: 400, margin: 2 });
}

export async function pollQRStatus(params: {
  baseUrl?: string;
  qrcode: string;
  timeoutMs?: number;
  routeTag?: string;
}): Promise<WeixinQrStatusResponse> {
  const base = ensureTrailingSlash(params.baseUrl ?? DEFAULT_WEIXIN_BASE_URL);
  const url = new URL(
    `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(params.qrcode)}`,
    base,
  );
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    params.timeoutMs ?? DEFAULT_LONG_POLL_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'iLink-App-ClientVersion': '1',
        ...(resolveRouteTag(params.routeTag)
          ? { SKRouteTag: resolveRouteTag(params.routeTag)! }
          : {}),
      },
      signal: controller.signal,
      dispatcher: new Agent()
    });
    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`Failed to poll QR status: ${response.status} ${response.statusText}`);
    }
    return JSON.parse(rawText) as WeixinQrStatusResponse;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { status: 'wait' };
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function getUpdates(
  params: GetUpdatesReq &
    WeixinApiOptions & {
      abortSignal?: AbortSignal;
    },
): Promise<GetUpdatesResp> {
  const timeout = params.timeoutMs ?? DEFAULT_LONG_POLL_TIMEOUT_MS;

  try {
    const rawText = await apiFetch({
      baseUrl: params.baseUrl,
      endpoint: 'ilink/bot/getupdates',
      body: JSON.stringify({
        get_updates_buf: params.get_updates_buf ?? '',
        base_info: buildBaseInfo(),
      }),
      token: params.token,
      timeoutMs: timeout,
      routeTag: params.routeTag,
      abortSignal: params.abortSignal,
    });
    return JSON.parse(rawText) as GetUpdatesResp;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ret: 0, msgs: [], get_updates_buf: params.get_updates_buf };
    }
    throw error;
  }
}

export async function sendMessage(
  params: WeixinApiOptions & {
    body: SendMessageReq;
  },
): Promise<void> {
  await apiFetch({
    baseUrl: params.baseUrl,
    endpoint: 'ilink/bot/sendmessage',
    body: JSON.stringify({
      ...params.body,
      base_info: buildBaseInfo(),
    }),
    token: params.token,
    timeoutMs: params.timeoutMs ?? DEFAULT_API_TIMEOUT_MS,
    routeTag: params.routeTag,
  });
}

export async function getUploadUrl(
  params: WeixinApiOptions & GetUploadUrlReq,
): Promise<GetUploadUrlResp> {
  const rawText = await apiFetch({
    baseUrl: params.baseUrl,
    endpoint: 'ilink/bot/getuploadurl',
    body: JSON.stringify({
      filekey: params.filekey,
      media_type: params.media_type,
      to_user_id: params.to_user_id,
      rawsize: params.rawsize,
      rawfilemd5: params.rawfilemd5,
      filesize: params.filesize,
      thumb_rawsize: params.thumb_rawsize,
      thumb_rawfilemd5: params.thumb_rawfilemd5,
      thumb_filesize: params.thumb_filesize,
      no_need_thumb: params.no_need_thumb,
      aeskey: params.aeskey,
      base_info: buildBaseInfo(),
    }),
    token: params.token,
    timeoutMs: params.timeoutMs ?? DEFAULT_API_TIMEOUT_MS,
    routeTag: params.routeTag,
  });

  return JSON.parse(rawText) as GetUploadUrlResp;
}

export async function getConfig(
  params: WeixinApiOptions & {
    ilinkUserId: string;
    contextToken?: string;
  },
): Promise<GetConfigResp> {
  const rawText = await apiFetch({
    baseUrl: params.baseUrl,
    endpoint: 'ilink/bot/getconfig',
    body: JSON.stringify({
      ilink_user_id: params.ilinkUserId,
      context_token: params.contextToken,
      base_info: buildBaseInfo(),
    }),
    token: params.token,
    timeoutMs: params.timeoutMs ?? DEFAULT_CONFIG_TIMEOUT_MS,
    routeTag: params.routeTag,
  });

  return JSON.parse(rawText) as GetConfigResp;
}

export async function sendTyping(
  params: WeixinApiOptions & {
    body: SendTypingReq;
  },
): Promise<void> {
  await apiFetch({
    baseUrl: params.baseUrl,
    endpoint: 'ilink/bot/sendtyping',
    body: JSON.stringify({
      ...params.body,
      base_info: buildBaseInfo(),
    }),
    token: params.token,
    timeoutMs: params.timeoutMs ?? DEFAULT_CONFIG_TIMEOUT_MS,
    routeTag: params.routeTag,
  });
}
