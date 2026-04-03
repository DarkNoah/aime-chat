import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { Channels } from '@/entities/channels';
import {
  ChannelConfig,
  ChannelEvent,
  ChannelInfo,
  ChannelPairedEventPayload,
  ChannelPairingCodeResult,
  ChannelPairingExpiredEventPayload,
  ChannelStatus,
  SaveChannelInput,
  SaveTelegramChannelInput,
  SaveWeixinChannelInput,
  TelegramChannel,
  WeixinChannel,
  WeixinLoginStartResult,
  WeixinLoginStatusResult,
} from '@/types/channel';
import { ChannelChannel } from '@/types/ipc-channel';
import { dbManager } from '../db';
import { BaseManager } from '../BaseManager';
import { channel } from '../ipc/IpcController';
import { TelegramChannelRuntime } from './telegram';
import { appManager } from '../app';
import { WeixinChannelRuntime } from './weixin';

const MASKED_TOKEN = '********';
const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;

type RuntimeMetadata = {
  username?: string;
  firstName?: string;
  botId?: number;
  pairingCode?: string;
  pairingCodeExpiresAt?: string;
  pairCommand?: string;
  accountId?: string;
  userId?: string;
  baseUrl?: string;
  loginStatus?: WeixinLoginStatusResult['status'];
};

type RuntimeState = {
  status: ChannelStatus;
  runtime?: TelegramChannelRuntime | WeixinChannelRuntime;
  errorMessage?: string;
  lastEventAt?: string;
  lastEventSummary?: string;
  metadata?: RuntimeMetadata;
};

function sanitizeChannel(channelItem: ChannelConfig, runtime?: RuntimeState): ChannelInfo {
  const token =
    channelItem.type === 'telegram'
      ? channelItem.config.token?.trim()
      : channelItem.config.botToken?.trim();

  return {
    ...channelItem,
    status: runtime?.status ?? 'stopped',
    errorMessage: runtime?.errorMessage,
    lastEventAt: runtime?.lastEventAt,
    lastEventSummary: runtime?.lastEventSummary,
    metadata: runtime?.metadata ?? runtime?.runtime?.getBotInfo(),
    pairingCode: runtime?.metadata?.pairingCode,
    pairingCodeExpiresAt: runtime?.metadata?.pairingCodeExpiresAt,
    pairCommand: runtime?.metadata?.pairCommand,
    config: {
      ...channelItem.config,
      ...(channelItem.type === 'telegram'
        ? { token: token ? MASKED_TOKEN : '' }
        : { botToken: token ? MASKED_TOKEN : '' }),
      hasToken: Boolean(token),
    },
  };
}

function normalizeTextArray(values?: string[]): string[] {
  return [...new Set((values ?? []).map((item) => item.trim()).filter(Boolean))];
}

function createPairingCode(): string {
  return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
}

class ChannelManager extends BaseManager {
  private channelsRepository!: Repository<Channels>;

  private runtimeMap = new Map<string, RuntimeState>();

  async init(): Promise<void> {
    this.channelsRepository = dbManager.dataSource.getRepository(Channels);
    const channelItems = await this.getChannels();

    for (const channelItem of channelItems) {
      const shouldAutoStart =
        channelItem.enabled &&
        channelItem.autoStart &&
        ((channelItem.type === 'telegram' && Boolean(channelItem.config.token?.trim())) ||
          (channelItem.type === 'weixin' && Boolean(channelItem.config.botToken?.trim())));

      if (!shouldAutoStart) {
        continue;
      }

      try {
        await this.start(channelItem.id);
      } catch (error) {
        this.updateRuntimeState(channelItem.id, {
          status: 'error',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async getChannels(): Promise<ChannelConfig[]> {
    return (await this.channelsRepository.find()) as ChannelConfig[];
  }

  private async saveChannelRecord(channelItem: ChannelConfig): Promise<void> {
    await this.channelsRepository.upsert(channelItem as Partial<Channels>, ['id']);
  }

  private updateRuntimeState(channelId: string, partial: Partial<RuntimeState>): RuntimeState {
    const current = this.runtimeMap.get(channelId) ?? { status: 'stopped' as ChannelStatus };
    const next: RuntimeState = {
      ...current,
      ...partial,
    };
    this.runtimeMap.set(channelId, next);
    return next;
  }

  private createTelegramRuntime(channelItem: TelegramChannel): TelegramChannelRuntime {
    return new TelegramChannelRuntime(channelItem, {
      onActivity: (summary) => {
        this.updateRuntimeState(channelItem.id, {
          lastEventAt: new Date().toISOString(),
          lastEventSummary: summary,
          errorMessage: undefined,
          metadata: this.runtimeMap.get(channelItem.id)?.runtime?.getBotInfo(),
        });
      },
      onError: (error) => {
        this.updateRuntimeState(channelItem.id, {
          status: 'error',
          errorMessage: error.message,
          lastEventAt: new Date().toISOString(),
          lastEventSummary: error.message,
        });
      },
      onPairSuccess: async (payload) => {
        await this.handlePairSuccess(channelItem.id, payload);
      },
      onPairingCodeExpired: async (payload) => {
        await this.handlePairingCodeExpired(channelItem.id, payload);
      },
    });
  }

  private createWeixinRuntime(channelItem: WeixinChannel): WeixinChannelRuntime {
    return new WeixinChannelRuntime(channelItem, {
      onActivity: (summary) => {
        this.updateRuntimeState(channelItem.id, {
          lastEventAt: new Date().toISOString(),
          lastEventSummary: summary,
          errorMessage: undefined,
          metadata: this.runtimeMap.get(channelItem.id)?.runtime?.getBotInfo(),
        });
      },
      onError: (error) => {
        this.updateRuntimeState(channelItem.id, {
          status: 'error',
          errorMessage: error.message,
          lastEventAt: new Date().toISOString(),
          lastEventSummary: error.message,
        });
      },
    });
  }

  private getOrCreateTelegramRuntime(channelItem: TelegramChannel): TelegramChannelRuntime {
    const runtimeState = this.runtimeMap.get(channelItem.id);
    if (runtimeState?.runtime instanceof TelegramChannelRuntime) {
      return runtimeState.runtime;
    }

    const runtime = this.createTelegramRuntime(channelItem);
    this.updateRuntimeState(channelItem.id, { runtime });
    return runtime;
  }

  private getOrCreateWeixinRuntime(channelItem: WeixinChannel): WeixinChannelRuntime {
    const runtimeState = this.runtimeMap.get(channelItem.id);
    if (runtimeState?.runtime instanceof WeixinChannelRuntime) {
      return runtimeState.runtime;
    }

    const runtime = this.createWeixinRuntime(channelItem);
    this.updateRuntimeState(channelItem.id, { runtime });
    return runtime;
  }

  private async resolveChannel(channelId: string): Promise<ChannelConfig> {
    const channelItem = (await this.channelsRepository.findOneBy({ id: channelId })) as
      | ChannelConfig
      | null;
    if (!channelItem) {
      throw new Error('Channel not found');
    }
    return channelItem;
  }

  private async resolveTelegramChannel(channelId: string): Promise<TelegramChannel> {
    const channelItem = await this.resolveChannel(channelId);
    if (channelItem.type !== 'telegram') {
      throw new Error(`Unsupported channel type: ${channelItem.type}`);
    }
    return channelItem;
  }

  private async resolveWeixinChannel(channelId: string): Promise<WeixinChannel> {
    const channelItem = await this.resolveChannel(channelId);
    if (channelItem.type !== 'weixin') {
      throw new Error(`Unsupported channel type: ${channelItem.type}`);
    }
    return channelItem;
  }

  private async updateTelegramChannel(
    channelId: string,
    updater: (channelItem: TelegramChannel) => TelegramChannel,
  ): Promise<TelegramChannel> {
    const current = (await this.channelsRepository.findOneBy({ id: channelId })) as ChannelConfig | null;
    if (!current) {
      throw new Error('Channel not found');
    }
    if (current.type !== 'telegram') {
      throw new Error(`Unsupported channel type: ${current.type}`);
    }

    const nextChannel = updater(current);
    await this.saveChannelRecord(nextChannel);
    return nextChannel;
  }

  private syncRuntimeChannel(channelItem: ChannelConfig): void {
    const runtimeState = this.runtimeMap.get(channelItem.id);
    if (channelItem.type === 'telegram' && runtimeState?.runtime instanceof TelegramChannelRuntime) {
      runtimeState.runtime.syncChannel(channelItem);
    }
    if (channelItem.type === 'weixin' && runtimeState?.runtime instanceof WeixinChannelRuntime) {
      runtimeState.runtime.syncChannel(channelItem);
    }
    if (runtimeState?.runtime) {
      this.updateRuntimeState(channelItem.id, { metadata: runtimeState.runtime.getBotInfo() });
    }
  }

  private async handlePairingCodeExpired(
    channelId: string,
    payload: { failedAttempts: number },
  ): Promise<ChannelInfo> {
    const channelItem = await this.resolveTelegramChannel(channelId);
    const runtime = this.getOrCreateTelegramRuntime(channelItem);

    runtime.clearPairingCode();
    this.updateRuntimeState(channelId, {
      metadata: runtime.getBotInfo(),
      lastEventAt: new Date().toISOString(),
      lastEventSummary: `Pairing code expired after ${payload.failedAttempts} failed attempts for ${channelItem.name}`,
      errorMessage: undefined,
    });

    const eventPayload: ChannelPairingExpiredEventPayload = {
      channelId,
      channelName: channelItem.name,
      failedAttempts: payload.failedAttempts,
    };
    await appManager.sendEvent(ChannelEvent.PairingExpired, eventPayload);

    return sanitizeChannel(channelItem, this.runtimeMap.get(channelId));
  }

  private async handlePairSuccess(
    channelId: string,
    payload: { chatId: string; title?: string },
  ): Promise<TelegramChannel> {
    const nextChannel = await this.updateTelegramChannel(channelId, (channelItem) => {
      const allowedChatIds = normalizeTextArray([
        ...(channelItem.config.allowedChatIds ?? []),
        payload.chatId,
      ]);

      return {
        ...channelItem,
        config: {
          ...channelItem.config,
          allowedChatIds,
          defaultChatId: channelItem.config.defaultChatId?.trim() || payload.chatId,
        },
      };
    });

    this.syncRuntimeChannel(nextChannel);
    this.updateRuntimeState(channelId, {
      lastEventAt: new Date().toISOString(),
      lastEventSummary: `Paired chat ${payload.chatId}${payload.title ? ` (${payload.title})` : ''}`,
      errorMessage: undefined,
    });

    const eventPayload: ChannelPairedEventPayload = {
      channelId,
      channelName: nextChannel.name,
      chatId: payload.chatId,
      title: payload.title,
      defaultChatId: nextChannel.config.defaultChatId,
    };
    await appManager.sendEvent(ChannelEvent.Paired, eventPayload);

    return nextChannel;
  }

  private mergeTelegramChannel(
    existing: TelegramChannel | undefined,
    input: SaveTelegramChannelInput,
  ): TelegramChannel {
    const token = input.config.token?.trim();
    const previousToken = existing?.config.token?.trim();

    return {
      id: existing?.id ?? input.id ?? randomUUID(),
      type: 'telegram',
      name: input.name.trim(),
      enabled: Boolean(input.enabled),
      autoStart: Boolean(input.autoStart),
      config: {
        token:
          token && token !== MASKED_TOKEN
            ? token
            : previousToken || '',
        defaultChatId: input.config.defaultChatId?.trim() || '',
        allowedChatIds: normalizeTextArray(input.config.allowedChatIds),
        currentThreadId: existing?.config.currentThreadId?.trim() || '',
        currentProjectId: existing?.config.currentProjectId?.trim() || '',
      },
    };
  }

  private mergeWeixinChannel(
    existing: WeixinChannel | undefined,
    input: SaveWeixinChannelInput,
  ): WeixinChannel {
    const botToken = input.config.botToken?.trim();
    const previousToken = existing?.config.botToken?.trim();
    const nextProjectId = input.config.currentProjectId?.trim() || '';
    const previousProjectId = existing?.config.currentProjectId?.trim() || '';
    const shouldResetThread = nextProjectId !== previousProjectId;

    return {
      id: existing?.id ?? input.id ?? randomUUID(),
      type: 'weixin',
      name: input.name.trim(),
      enabled: Boolean(input.enabled),
      autoStart: Boolean(input.autoStart),
      config: {
        botToken:
          botToken && botToken !== MASKED_TOKEN
            ? botToken
            : previousToken || '',
        accountId: input.config.accountId?.trim() || existing?.config.accountId?.trim() || '',
        baseUrl: input.config.baseUrl?.trim() || existing?.config.baseUrl?.trim() || '',
        cdnBaseUrl: input.config.cdnBaseUrl?.trim() || existing?.config.cdnBaseUrl?.trim() || '',
        routeTag:
          input.config.routeTag?.trim() ||
          existing?.config.routeTag?.trim() ||
          '',
        loginUserId:
          input.config.loginUserId?.trim() || existing?.config.loginUserId?.trim() || '',
        getUpdatesBuf: existing?.config.getUpdatesBuf ?? '',
        currentProjectId: nextProjectId,
        currentThreadId: shouldResetThread
          ? ''
          : existing?.config.currentThreadId?.trim() || '',
      },
    };
  }

  @channel(ChannelChannel.GetList)
  public async getList(): Promise<ChannelInfo[]> {
    const channelItems = await this.getChannels();
    return channelItems.map((item) => sanitizeChannel(item, this.runtimeMap.get(item.id)));
  }

  @channel(ChannelChannel.Get)
  public async get(channelId: string): Promise<ChannelInfo> {
    const channelItem = await this.resolveChannel(channelId);
    return sanitizeChannel(channelItem, this.runtimeMap.get(channelId));
  }

  @channel(ChannelChannel.Save)
  public async save(input: SaveChannelInput): Promise<ChannelInfo> {
    if (!input.name?.trim()) {
      throw new Error('Channel name is required');
    }

    const existing = input.id
      ? ((await this.channelsRepository.findOneBy({ id: input.id })) as ChannelConfig | null) ?? undefined
      : undefined;

    const nextChannel =
      input.type === 'telegram'
        ? this.mergeTelegramChannel(
            existing?.type === 'telegram' ? existing : undefined,
            input,
          )
        : this.mergeWeixinChannel(
            existing?.type === 'weixin' ? existing : undefined,
            input,
          );

    if (nextChannel.type === 'telegram' && !nextChannel.config.token) {
      throw new Error('Telegram Bot token is required');
    }

    await this.saveChannelRecord(nextChannel);

    const runtime = this.runtimeMap.get(nextChannel.id);
    if (runtime?.runtime) {
      await this.restart(nextChannel.id);
    }

    return sanitizeChannel(nextChannel, this.runtimeMap.get(nextChannel.id));
  }

  @channel(ChannelChannel.Delete)
  public async delete(channelId: string): Promise<void> {
    await this.stop(channelId).catch(() => undefined);
    this.runtimeMap.delete(channelId);
    await this.channelsRepository.delete({ id: channelId });
  }

  @channel(ChannelChannel.Start)
  public async start(channelId: string): Promise<ChannelInfo> {
    const channelItem = await this.resolveChannel(channelId);
    const current = this.runtimeMap.get(channelId);
    if (current?.status === 'running' && current.runtime) {
      return sanitizeChannel(channelItem, current);
    }

    this.updateRuntimeState(channelId, {
      status: 'starting',
      errorMessage: undefined,
    });

    const runtime =
      channelItem.type === 'telegram'
        ? this.createTelegramRuntime(channelItem)
        : this.createWeixinRuntime(channelItem);
    this.updateRuntimeState(channelId, { runtime });

    try {
      await runtime.start();
      this.updateRuntimeState(channelId, {
        status: 'running',
        errorMessage: undefined,
        lastEventAt: new Date().toISOString(),
        metadata: runtime.getBotInfo(),
      });
    } catch (error) {
      this.updateRuntimeState(channelId, {
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return sanitizeChannel(channelItem, this.runtimeMap.get(channelId));
  }

  @channel(ChannelChannel.Stop)
  public async stop(channelId: string): Promise<ChannelInfo> {
    const channelItem = await this.resolveChannel(channelId);
    const runtimeState = this.runtimeMap.get(channelId);
    if (!runtimeState?.runtime) {
      this.updateRuntimeState(channelId, { status: 'stopped', errorMessage: undefined });
      return sanitizeChannel(channelItem, this.runtimeMap.get(channelId));
    }

    this.updateRuntimeState(channelId, { status: 'stopping' });
    await runtimeState.runtime.stop();
    this.updateRuntimeState(channelId, {
      status: 'stopped',
      errorMessage: undefined,
      runtime: undefined,
      metadata: undefined,
      lastEventAt: new Date().toISOString(),
    });

    return sanitizeChannel(channelItem, this.runtimeMap.get(channelId));
  }

  @channel(ChannelChannel.Restart)
  public async restart(channelId: string): Promise<ChannelInfo> {
    await this.stop(channelId).catch(() => undefined);
    return this.start(channelId);
  }

  @channel(ChannelChannel.TestConnection)
  public async testConnection(channelId: string) {
    const channelItem = await this.resolveChannel(channelId);
    const runtime =
      this.runtimeMap.get(channelId)?.runtime ??
      (channelItem.type === 'telegram'
        ? this.createTelegramRuntime(channelItem)
        : this.createWeixinRuntime(channelItem));

    const result = await runtime.testConnection();
    this.updateRuntimeState(channelId, {
      lastEventAt: new Date().toISOString(),
      lastEventSummary: result.message,
      errorMessage: undefined,
      metadata: runtime.getBotInfo(),
    });
    return result;
  }

  @channel(ChannelChannel.GeneratePairingCode)
  public async generatePairingCode(channelId: string): Promise<ChannelPairingCodeResult> {
    const code = createPairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS).toISOString();
    const nextChannel = await this.resolveTelegramChannel(channelId);
    const runtime = this.getOrCreateTelegramRuntime(nextChannel);

    runtime.setPairingCode(code, expiresAt);
    this.updateRuntimeState(channelId, { metadata: runtime.getBotInfo() });
    this.updateRuntimeState(channelId, {
      lastEventAt: new Date().toISOString(),
      lastEventSummary: `Generated pairing code for ${nextChannel.name}`,
      errorMessage: undefined,
    });

    return {
      code,
      expiresAt,
      command: 'pair',
      message: `Send /pair ${code} in Telegram to pair this channel.`,
    };
  }

  @channel(ChannelChannel.ClearPairingCode)
  public async clearPairingCode(channelId: string): Promise<ChannelInfo> {
    const channelItem = await this.resolveTelegramChannel(channelId);
    const runtime = this.getOrCreateTelegramRuntime(channelItem);

    runtime.clearPairingCode();
    this.updateRuntimeState(channelId, {
      metadata: runtime.getBotInfo(),
      lastEventAt: new Date().toISOString(),
      lastEventSummary: `Cleared pairing code for ${channelItem.name}`,
      errorMessage: undefined,
    });

    return sanitizeChannel(channelItem, this.runtimeMap.get(channelId));
  }

  @channel(ChannelChannel.WeixinStartLogin)
  public async weixinStartLogin(channelId: string): Promise<WeixinLoginStartResult> {
    const channelItem = await this.resolveWeixinChannel(channelId);
    const runtime = this.getOrCreateWeixinRuntime(channelItem);

    const result = await runtime.startLogin();
    this.updateRuntimeState(channelId, {
      metadata: runtime.getBotInfo(),
      lastEventAt: new Date().toISOString(),
      lastEventSummary: `Generated Weixin QR code for ${channelItem.name}`,
      errorMessage: undefined,
    });
    return result;
  }

  @channel(ChannelChannel.WeixinCheckLoginStatus)
  public async weixinCheckLoginStatus(
    channelId: string,
    sessionKey?: string,
  ): Promise<WeixinLoginStatusResult> {
    const channelItem = await this.resolveWeixinChannel(channelId);
    const runtime = this.getOrCreateWeixinRuntime(channelItem);

    const result = await runtime.checkLoginStatus(sessionKey);
    this.updateRuntimeState(channelId, {
      metadata: runtime.getBotInfo(),
      lastEventAt: new Date().toISOString(),
      lastEventSummary: result.message,
      errorMessage: undefined,
    });

    if (result.status === 'confirmed') {
      this.start(channelId).catch((err) => {
        this.updateRuntimeState(channelId, {
          status: 'error',
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      });
    }

    return result;
  }

  @channel(ChannelChannel.WeixinCancelLogin)
  public async weixinCancelLogin(channelId: string): Promise<WeixinLoginStatusResult> {
    const channelItem = await this.resolveWeixinChannel(channelId);
    const runtime = this.getOrCreateWeixinRuntime(channelItem);

    const result = runtime.cancelLogin();
    this.updateRuntimeState(channelId, {
      metadata: runtime.getBotInfo(),
      lastEventAt: new Date().toISOString(),
      lastEventSummary: result.message,
      errorMessage: undefined,
    });
    return result;
  }
}

export const channelManager = new ChannelManager();
