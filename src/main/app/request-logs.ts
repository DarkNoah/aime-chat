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
          request_body: input.requestBody,
          status_code: input.statusCode,
          response_headers: input.responseHeaders,
          response_body: truncate(input.responseBody),
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
