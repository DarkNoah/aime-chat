import { RequestLog } from '@/entities/request-logs';
import { RequestLogChannel } from '@/types/ipc-channel';
import { Settings } from '@/entities/settings';
import { Repository } from 'typeorm';
import { BaseManager } from '../BaseManager';
import { dbManager } from '../db';
import { channel } from '../ipc/IpcController';

const REQUEST_LOG_SETTING_ID = 'requestLog';
const MAX_BODY_LENGTH = 512 * 1024;

export interface RequestLogRecordInput {
  threadId: string;
  method: string;
  url: string;
  requestHeaders?: Record<string, unknown>;
  requestBody?: string;
  statusCode?: number;
  responseHeaders?: Record<string, unknown>;
  responseBody?: string;
  durationMs?: number;
  error?: string;
  startTime: string;
}

interface RequestLogListParams {
  page?: number;
  size?: number;
}

function truncate(value?: string) {
  if (!value || value.length <= MAX_BODY_LENGTH) return value;
  return `${value.slice(0, MAX_BODY_LENGTH)}\n[truncated: ${
    value.length - MAX_BODY_LENGTH
  } chars]`;
}

// 超过该长度且符合 base64 字符集的字符串才会被裁剪,避免误伤普通短文本
const BASE64_MIN_LENGTH = 300;
const BASE64_KEEP_CHARS = 100;
const BASE64_PATTERN = /^(?:data:[\w.+-]+\/[\w.+-]+;base64,)?[A-Za-z0-9+/\r\n]+={0,2}$/;

function clipBase64(value: string) {
  return `${value.slice(0, BASE64_KEEP_CHARS)}...[base64 truncated: ${
    value.length - BASE64_KEEP_CHARS * 2
  } chars]...${value.slice(-BASE64_KEEP_CHARS)}`;
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.length > BASE64_MIN_LENGTH && BASE64_PATTERN.test(value)) {
      return clipBase64(value);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = sanitizeValue(item);
    }
    return result;
  }
  return value;
}

function sanitizeBase64InJson(value?: string) {
  if (!value) return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    return JSON.stringify(sanitizeValue(JSON.parse(trimmed)));
  } catch {
    return value;
  }
}

class RequestLogManager extends BaseManager {
  private repository: Repository<RequestLog>;

  private settingsRepository: Repository<Settings>;

  private enabled = false;

  public async init() {
    this.repository = dbManager.dataSource.getRepository(RequestLog);
    this.settingsRepository = dbManager.dataSource.getRepository(Settings);

    const setting = await this.settingsRepository.findOne({
      where: { id: REQUEST_LOG_SETTING_ID },
    });
    this.enabled = Boolean(setting?.value?.enabled);
  }

  public isEnabled() {
    return this.enabled;
  }

  public async record(input: RequestLogRecordInput) {
    if (!this.enabled || !input.threadId || !this.repository) return;

    try {
      await this.repository.save(
        new RequestLog({
          thread_id: input.threadId,
          method: input.method,
          url: input.url,
          request_headers: input.requestHeaders,
          request_body: sanitizeBase64InJson(input.requestBody),
          status_code: input.statusCode,
          response_headers: input.responseHeaders,
          response_body: truncate(sanitizeBase64InJson(input.responseBody)),
          duration_ms: input.durationMs,
          error: truncate(input.error),
          start_time: input.startTime,
        }),
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[RequestLogManager] Failed to save request log', error);
    }
  }

  @channel(RequestLogChannel.GetList)
  public async getList(params: RequestLogListParams = {}) {
    const page = Math.max(0, params.page ?? 0);
    const size = Math.min(100, Math.max(1, params.size ?? 50));
    const [items, total] = await this.repository.findAndCount({
      order: {
        start_time: 'DESC',
      },
      skip: page * size,
      take: size,
    });

    return {
      items,
      total,
      page,
      size,
    };
  }

  @channel(RequestLogChannel.GetDetail)
  public async getDetail(id: string) {
    return this.repository.findOne({ where: { id } });
  }

  @channel(RequestLogChannel.Clear)
  public async clear() {
    await this.repository.clear();
  }

  @channel(RequestLogChannel.SetEnabled)
  public async setEnabled(enabled: boolean) {
    this.enabled = enabled;
    await this.settingsRepository.upsert(
      new Settings(REQUEST_LOG_SETTING_ID, { enabled }),
      ['id'],
    );
    return this.enabled;
  }

  @channel(RequestLogChannel.GetEnabled)
  public async getEnabled() {
    return this.enabled;
  }
}

export const requestLogManager = new RequestLogManager();
