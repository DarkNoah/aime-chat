import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { Repository } from 'typeorm';
import { app } from 'electron';
import { Channels } from '@/entities/channels';
import {
  ChannelTestResult,
  WeixinChannel,
  WeixinChannelConfig,
  WeixinLoginStartResult,
  WeixinLoginStatusResult,
} from '@/types/channel';
import { dbManager } from '@/main/db';
import mastraManager from '@/main/mastra';
import { agentManager } from '@/main/mastra/agents';
import { appManager } from '@/main/app';
import { projectManager } from '@/main/project';
import { toolsManager } from '@/main/tools';
import { SpeechToText } from '@/main/tools/audio';
import { nanoid } from '@/utils/nanoid';
import { ToolType } from '@/types/tool';
import type { ThreadState } from '@/types/chat';
import increment from 'add-filename-increment';
import {
  DEFAULT_WEIXIN_BASE_URL,
  DEFAULT_WEIXIN_BOT_TYPE,
  DEFAULT_WEIXIN_CDN_BASE_URL,
  generateQRCodeBase64,
  fetchQRCode,
  getConfig,
  getUpdates,
  pollQRStatus,
  sendMessage,
  sendTyping,
} from './api';
import {
  MessageItemType,
  MessageState,
  MessageType,
  TypingStatus,
} from './types';
import type { MessageItem, WeixinMessage } from './types';

const LOGIN_SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_QR_REFRESH_COUNT = 3;

const SESSION_EXPIRED_ERRCODE = -14;
const MAX_CONSECUTIVE_FAILURES = 3;
const BACKOFF_DELAY_MS = 30_000;
const RETRY_DELAY_MS = 2_000;
const SESSION_PAUSE_MS = 60 * 60 * 1000;
const TYPING_REFRESH_INTERVAL_MS = 10_000;

type LoginSession = {
  sessionKey: string;
  qrcode: string;
  qrcodeBase64: string;
  createdAt: number;
  expiresAt: string;
  refreshCount: number;
  status: WeixinLoginStatusResult['status'];
};

type PendingWeixinInput = {
  fromUserId: string;
  threadId: string;
  text: string;
  contextToken?: string;
};

type PreparedInboundMessage = {
  text: string;
  preview: string;
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}

function bodyFromItemList(itemList?: MessageItem[]): string {
  if (!itemList?.length) return '';
  for (const item of itemList) {
    if (item.type === MessageItemType.TEXT && item.text_item?.text != null) {
      const text = String(item.text_item.text);
      const ref = item.ref_msg;
      if (!ref) return text;
      if (ref.message_item && isMediaItem(ref.message_item)) return text;
      const parts: string[] = [];
      if (ref.title) parts.push(ref.title);
      if (ref.message_item) {
        const refBody = bodyFromItemList([ref.message_item]);
        if (refBody) parts.push(refBody);
      }
      if (!parts.length) return text;
      return `[引用: ${parts.join(' | ')}]\n${text}`;
    }
    if (item.type === MessageItemType.VOICE && item.voice_item?.text) {
      return item.voice_item.text;
    }
  }
  return '';
}

function isMediaItem(item: MessageItem): boolean {
  return (
    item.type === MessageItemType.IMAGE ||
    item.type === MessageItemType.VIDEO ||
    item.type === MessageItemType.FILE ||
    item.type === MessageItemType.VOICE
  );
}

function generateClientId(): string {
  return `aime-weixin-${nanoid()}`;
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').trim() || 'file';
}

function splitTextIntoChunks(text: string, maxLength = 1500): string[] {
  const normalized = text.trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining.length > maxLength) {
    const candidates = [
      remaining.lastIndexOf('\n\n', maxLength),
      remaining.lastIndexOf('\n', maxLength),
      remaining.lastIndexOf(' ', maxLength),
    ];
    let splitAt = Math.max(...candidates);
    if (splitAt < Math.floor(maxLength * 0.6)) {
      splitAt = maxLength;
    }

    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

function getItemKindLabel(item: MessageItem): string | undefined {
  switch (item.type) {
    case MessageItemType.IMAGE:
      return 'image';
    case MessageItemType.VOICE:
      return 'voice message';
    case MessageItemType.FILE:
      return 'file';
    case MessageItemType.VIDEO:
      return 'video';
    default:
      return undefined;
  }
}

function getDefaultExtension(item: MessageItem): string {
  switch (item.type) {
    case MessageItemType.IMAGE:
      return '.jpg';
    case MessageItemType.VOICE:
      return '.ogg';
    case MessageItemType.VIDEO:
      return '.mp4';
    default:
      return '.bin';
  }
}

export class WeixinChannelRuntime {
  private started = false;

  private channelRepository: Repository<Channels>;

  private loginSession?: LoginSession;

  private abortController?: AbortController;

  private contextTokens = new Map<string, string>();

  private typingTickets = new Map<string, string>();

  private readonly threadMessageQueues: Record<string, PendingWeixinInput[]> = {};

  private readonly threadWorkers = new Set<string>();

  constructor(
    private readonly channel: WeixinChannel,
    private readonly callbacks: {
      onActivity: (summary: string) => void;
      onError: (error: Error) => void;
    },
  ) {
    this.channelRepository = dbManager.dataSource.getRepository(Channels);
    this.syncChannel(channel);
  }

  public syncChannel(channel: WeixinChannel): void {
    this.channel.name = channel.name;
    this.channel.enabled = channel.enabled;
    this.channel.autoStart = channel.autoStart;
    this.channel.config = { ...channel.config };
  }

  public async start(): Promise<{ accountId?: string }> {
    if (this.started) {
      return this.getAccountInfo();
    }

    const loginStateError = this.getLoginStateError();
    if (loginStateError) {
      throw new Error(loginStateError);
    }

    this.started = true;
    this.abortController = new AbortController();
    this.callbacks.onActivity(
      `Weixin channel started for ${this.channel.name}`,
    );

    this.startPollLoop();

    return this.getAccountInfo();
  }

  public async stop(): Promise<void> {
    this.started = false;
    this.abortController?.abort();
    this.abortController = undefined;
    this.callbacks.onActivity(
      `Weixin channel stopped for ${this.channel.name}`,
    );
  }

  public async testConnection(): Promise<ChannelTestResult> {
    const loginStateError = this.getLoginStateError();
    if (loginStateError) {
      return {
        ok: false,
        message: loginStateError,
      };
    }

    return {
      ok: true,
      message: `Connected to ${this.channel.config.accountId || this.channel.name}`,
      info: {
        accountId: this.channel.config.accountId,
        userId: this.channel.config.loginUserId,
        baseUrl: this.resolveBaseUrl(),
      },
    };
  }

  public getBotInfo(): {
    accountId?: string;
    userId?: string;
    baseUrl?: string;
    loginStatus?: WeixinLoginStatusResult['status'];
  } {
    return {
      accountId: this.channel.config.accountId,
      userId: this.channel.config.loginUserId,
      baseUrl: this.resolveBaseUrl(),
      loginStatus: this.loginSession?.status ?? 'idle',
    };
  }

  public getAccountInfo(): {
    accountId?: string;
    userId?: string;
    baseUrl?: string;
  } {
    return {
      accountId: this.channel.config.accountId,
      userId: this.channel.config.loginUserId,
      baseUrl: this.resolveBaseUrl(),
    };
  }

  public async getChannelConfig(): Promise<WeixinChannelConfig> {
    const channelEntity = await this.channelRepository.findOneBy({
      id: this.channel.id,
    });
    if (!channelEntity) {
      throw new Error('Channel not found');
    }
    return (channelEntity.config ?? {}) as WeixinChannelConfig;
  }

  public async saveChannelConfig(config: WeixinChannelConfig): Promise<void> {
    const channelEntity = await this.channelRepository.findOneBy({
      id: this.channel.id,
    });
    if (!channelEntity) {
      throw new Error('Channel not found');
    }
    channelEntity.config = config;
    await this.channelRepository.save(channelEntity);
    this.channel.config = { ...config };
  }

  // ---------------------------------------------------------------------------
  // QR login
  // ---------------------------------------------------------------------------

  public async startLogin(): Promise<WeixinLoginStartResult> {
    try {
      const result = await fetchQRCode({
        baseUrl: this.resolveBaseUrl(),
        botType: DEFAULT_WEIXIN_BOT_TYPE,
        routeTag: this.resolveRouteTag(),
      });

      const qrcodeBase64 = await generateQRCodeBase64(
        result.qrcode_img_content,
      );

      this.loginSession = {
        sessionKey: randomUUID(),
        qrcode: result.qrcode,
        qrcodeBase64,
        createdAt: Date.now(),
        expiresAt: new Date(Date.now() + LOGIN_SESSION_TTL_MS).toISOString(),
        refreshCount: 0,
        status: 'wait',
      };

      this.callbacks.onActivity(
        `Weixin QR code generated for ${this.channel.name}`,
      );

      return {
        sessionKey: this.loginSession.sessionKey,
        qrcodeBase64: this.loginSession.qrcodeBase64,
        expiresAt: this.loginSession.expiresAt,
        message: 'Use WeChat to scan the QR code and finish login.',
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.callbacks.onError(err);
      throw err;
    }
  }

  public async checkLoginStatus(
    sessionKey?: string,
  ): Promise<WeixinLoginStatusResult> {
    if (!this.loginSession) {
      return {
        status: 'idle',
        message: 'No active Weixin login session.',
      };
    }

    if (sessionKey && sessionKey !== this.loginSession.sessionKey) {
      return {
        status: 'idle',
        message: 'Weixin login session mismatch.',
      };
    }

    if (Date.now() - this.loginSession.createdAt >= LOGIN_SESSION_TTL_MS) {
      return this.handleExpiredLogin(
        'Login QR code expired. Please restart login.',
      );
    }

    try {
      const result = await pollQRStatus({
        baseUrl: this.resolveBaseUrl(),
        qrcode: this.loginSession.qrcode,
        routeTag: this.resolveRouteTag(),
      });

      if (result.status === 'confirmed') {
        if (!result.ilink_bot_id) {
          throw new Error('Weixin login confirmed without ilink_bot_id.');
        }

        const nextConfig: WeixinChannelConfig = {
          ...this.channel.config,
          botToken: result.bot_token?.trim() || this.channel.config.botToken,
          accountId: result.ilink_bot_id,
          baseUrl: result.baseurl?.trim() || this.resolveBaseUrl(),
          cdnBaseUrl:
            this.channel.config.cdnBaseUrl?.trim() ||
            DEFAULT_WEIXIN_CDN_BASE_URL,
          getUpdatesBuf: '',
          routeTag: this.resolveRouteTag(),
          loginUserId:
            result.ilink_user_id?.trim() || this.channel.config.loginUserId,
        };

        this.resetSessionState();
        await this.saveChannelConfig(nextConfig);
        this.loginSession = undefined;
        this.restartPollLoopAfterLogin();
        this.callbacks.onActivity(
          `Weixin login confirmed for ${nextConfig.accountId}`,
        );

        return {
          status: 'confirmed',
          connected: true,
          message: 'Weixin login confirmed.',
          accountId: nextConfig.accountId,
          userId: nextConfig.loginUserId,
          baseUrl: nextConfig.baseUrl,
        };
      }

      if (result.status === 'expired') {
        return await this.refreshExpiredQr();
      }

      this.loginSession.status = result.status;
      this.callbacks.onActivity(
        result.status === 'scaned'
          ? `Weixin QR scanned for ${this.channel.name}`
          : `Waiting for Weixin QR scan for ${this.channel.name}`,
      );

      return {
        sessionKey: this.loginSession.sessionKey,
        status: result.status,
        qrcodeBase64: this.loginSession.qrcodeBase64,
        expiresAt: this.loginSession.expiresAt,
        message:
          result.status === 'scaned'
            ? 'QR code scanned. Confirm on WeChat.'
            : 'Waiting for QR code scan.',
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.callbacks.onError(err);
      throw err;
    }
  }

  public cancelLogin(): WeixinLoginStatusResult {
    if (!this.loginSession) {
      return {
        status: 'idle',
        message: 'No active Weixin login session.',
      };
    }

    const { sessionKey } = this.loginSession;
    this.loginSession = undefined;
    this.callbacks.onActivity(
      `Weixin login cancelled for ${this.channel.name}`,
    );

    return {
      sessionKey,
      status: 'cancelled',
      message: 'Weixin login cancelled.',
    };
  }

  // ---------------------------------------------------------------------------
  // Long-poll loop
  // ---------------------------------------------------------------------------

  private async runPollLoop(): Promise<void> {
    const signal = this.abortController?.signal;
    const config = await this.getChannelConfig();
    let getUpdatesBuf = config.getUpdatesBuf ?? '';
    let nextTimeoutMs = 35_000;
    let consecutiveFailures = 0;

    this.callbacks.onActivity(
      `[weixin] monitor started (${this.resolveBaseUrl()}, account=${this.channel.config.accountId})`,
    );

    while (this.started && !signal?.aborted) {
      try {
        const resp = await getUpdates({
          baseUrl: this.resolveBaseUrl(),
          token: this.channel.config.botToken,
          get_updates_buf: getUpdatesBuf,
          timeoutMs: nextTimeoutMs,
          routeTag: this.resolveRouteTag(),
          abortSignal: signal,
        });

        if (
          resp.longpolling_timeout_ms != null &&
          resp.longpolling_timeout_ms > 0
        ) {
          nextTimeoutMs = resp.longpolling_timeout_ms;
        }

        const isApiError =
          (resp.ret !== undefined && resp.ret !== 0) ||
          (resp.errcode !== undefined && resp.errcode !== 0);

        if (isApiError) {
          const isSessionExpired =
            resp.errcode === SESSION_EXPIRED_ERRCODE ||
            resp.ret === SESSION_EXPIRED_ERRCODE;

          if (isSessionExpired) {
            this.callbacks.onActivity(
              `[weixin] session expired, pausing for ${Math.ceil(SESSION_PAUSE_MS / 60_000)} min`,
            );
            consecutiveFailures = 0;
            await sleep(SESSION_PAUSE_MS, signal);
            continue;
          }

          consecutiveFailures += 1;
          this.callbacks.onActivity(
            `[weixin] getUpdates failed: ret=${resp.ret} errcode=${resp.errcode} errmsg=${resp.errmsg ?? ''} (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`,
          );
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            consecutiveFailures = 0;
            await sleep(BACKOFF_DELAY_MS, signal);
          } else {
            await sleep(RETRY_DELAY_MS, signal);
          }
          continue;
        }

        consecutiveFailures = 0;

        if (resp.get_updates_buf != null && resp.get_updates_buf !== '') {
          getUpdatesBuf = resp.get_updates_buf;
          this.persistGetUpdatesBuf(getUpdatesBuf).catch(() => { });
        }

        const msgs = resp.msgs ?? [];
        for (const msg of msgs) {
          this.processInboundMessage(msg).catch((err) => {
            this.callbacks.onError(
              err instanceof Error ? err : new Error(String(err)),
            );
          });
        }
      } catch (err) {
        console.error(err);
        if (signal?.aborted) return;
        consecutiveFailures += 1;
        this.callbacks.onError(
          err instanceof Error ? err : new Error(String(err)),
        );
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          consecutiveFailures = 0;
          await sleep(BACKOFF_DELAY_MS, signal);
        } else {
          await sleep(RETRY_DELAY_MS, signal);
        }
      }
    }
  }

  private async persistGetUpdatesBuf(buf: string): Promise<void> {
    try {
      const config = await this.getChannelConfig();
      config.getUpdatesBuf = buf;
      await this.saveChannelConfig(config);
    } catch {
      // best-effort persistence
    }
  }

  private getLoginStateError(
    config: WeixinChannelConfig = this.channel.config,
  ): string | undefined {
    if (!config.botToken?.trim()) {
      return 'Weixin bot token is required. Please complete login first.';
    }

    if (!config.accountId?.trim()) {
      return 'Weixin account id is missing. Please reconnect login.';
    }

    if (!config.loginUserId?.trim()) {
      return 'Weixin login user id is missing. Please reconnect login.';
    }

    return undefined;
  }

  private startPollLoop(): void {
    this.runPollLoop().catch((err) => {
      if (this.started) {
        this.callbacks.onError(
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    });
  }

  private resetSessionState(): void {
    this.contextTokens.clear();
    this.typingTickets.clear();
  }

  private restartPollLoopAfterLogin(): void {
    if (!this.started) return;

    this.abortController?.abort();
    this.abortController = new AbortController();
    this.startPollLoop();
    this.callbacks.onActivity(
      `[weixin] poll loop reset after login refresh for ${this.channel.name}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Inbound message processing
  // ---------------------------------------------------------------------------

  private async processInboundMessage(msg: WeixinMessage): Promise<void> {
    const fromUserId = msg.from_user_id ?? '';
    if (!fromUserId) return;

    const isUserMessage =
      msg.message_type == null || msg.message_type === MessageType.USER;
    if (!isUserMessage) {
      this.callbacks.onActivity(
        `[weixin] skipping non-user message from=${fromUserId} type=${msg.message_type ?? 'unknown'}`,
      );
      return;
    }

    const isFinishedMessage =
      msg.message_state == null || msg.message_state === MessageState.FINISH;
    if (!isFinishedMessage) {
      this.callbacks.onActivity(
        `[weixin] skipping unfinished message from=${fromUserId} state=${msg.message_state ?? 'unknown'}`,
      );
      return;
    }

    // if (
    //   fromUserId === this.channel.config.accountId ||
    //   fromUserId === this.channel.config.loginUserId
    // ) {
    //   this.callbacks.onActivity(
    //     `[weixin] skipping self message from=${fromUserId}`,
    //   );
    //   return;
    // }

    if (msg.context_token) {
      this.contextTokens.set(fromUserId, msg.context_token);
    }

    const thread = await this.resolveCurrentThread();
    const prepared = await this.prepareInboundMessage(msg, fromUserId, thread);
    if (!prepared.text) {
      this.callbacks.onActivity(
        `[weixin] skipping inbound from=${fromUserId}: no supported content`,
      );
      return;
    }

    this.callbacks.onActivity(
      `[weixin] inbound from=${fromUserId} text=${prepared.preview.slice(0, 60)}`,
    );

    await this.enqueueThreadMessage({
      fromUserId,
      threadId: thread.id,
      text: prepared.text,
      contextToken: msg.context_token,
    });
  }

  // ---------------------------------------------------------------------------
  // Send reply
  // ---------------------------------------------------------------------------

  private async sendTextReply(
    to: string,
    text: string,
    contextToken?: string,
  ): Promise<void> {
    const token = contextToken || this.contextTokens.get(to);
    if (!token) {
      this.callbacks.onActivity(
        `[weixin] skipping reply to ${to}: no context_token`,
      );
      return;
    }

    const chunks = splitTextIntoChunks(text);
    for (const chunk of chunks) {
      await sendMessage({
        baseUrl: this.resolveBaseUrl(),
        token: this.channel.config.botToken,
        routeTag: this.resolveRouteTag(),
        body: {
          msg: {
            from_user_id: '',
            to_user_id: to,
            client_id: generateClientId(),
            message_type: MessageType.BOT,
            message_state: MessageState.FINISH,
            item_list: [
              { type: MessageItemType.TEXT, text_item: { text: chunk } },
            ],
            context_token: token,
          },
        },
      });
    }

    this.callbacks.onActivity(
      `[weixin] replied to=${to} len=${text.length}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Thread resolution (mirrors Telegram pattern)
  // ---------------------------------------------------------------------------

  private async resolveCurrentThread() {
    const appInfo = await appManager.getInfo();
    const config = await this.getChannelConfig();

    if (!config.currentThreadId) {
      const agentId = appInfo.defaultAgent;
      const agent = await agentManager.getAgent(agentId);
      const threadEntity = await mastraManager.createThread({
        agentId: agent.id,
        resourceId: config.currentProjectId
          ? `project:${config.currentProjectId}`
          : undefined,
        model:
          agent.defaultModelId ||
          (appInfo.defaultModel?.model as string),
        subAgents: agent.subAgents,
        tools: agent.tools,
      });
      config.currentThreadId = threadEntity.id;
      await this.saveChannelConfig(config);
    }

    return mastraManager.getThread(config.currentThreadId, true);
  }

  private async enqueueThreadMessage(input: PendingWeixinInput): Promise<void> {
    const queue = this.threadMessageQueues[input.threadId] ?? [];
    queue.push(input);
    this.threadMessageQueues[input.threadId] = queue;

    if (this.threadWorkers.has(input.threadId)) {
      return;
    }

    this.threadWorkers.add(input.threadId);
    try {
      await this.drainThreadQueue(input.threadId);
    } finally {
      this.threadWorkers.delete(input.threadId);
      if ((this.threadMessageQueues[input.threadId] ?? []).length === 0) {
        delete this.threadMessageQueues[input.threadId];
      }
    }
  }

  private async drainThreadQueue(threadId: string): Promise<void> {
    while ((this.threadMessageQueues[threadId] ?? []).length > 0) {
      const nextInput = this.threadMessageQueues[threadId]?.shift();
      if (!nextInput) {
        continue;
      }

      await this.processThreadMessage(nextInput);
    }
  }

  private async processThreadMessage(input: PendingWeixinInput): Promise<void> {
    const typingTicket = await this.resolveTypingTicket(
      input.fromUserId,
      input.contextToken,
    );

    let typingTimer: ReturnType<typeof setInterval> | undefined;
    const startTyping = () => {
      if (!typingTicket) return;
      sendTyping({
        baseUrl: this.resolveBaseUrl(),
        token: this.channel.config.botToken,
        routeTag: this.resolveRouteTag(),
        body: {
          ilink_user_id: input.fromUserId,
          typing_ticket: typingTicket,
          status: TypingStatus.TYPING,
        },
      }).catch(() => {});
    };

    if (typingTicket) {
      startTyping();
      typingTimer = setInterval(startTyping, TYPING_REFRESH_INTERVAL_MS);
    }

    let outputText = '';

    try {
      const appInfo = await appManager.getInfo();
      const config = await this.getChannelConfig();
      const thread = await mastraManager.getThread(input.threadId, true);
      const project = config.currentProjectId
        ? await projectManager.getProject(config.currentProjectId)
        : undefined;
      const tools = project?.defaultTools || (thread.metadata?.tools as string[]) || [];
      const subAgents =
        project?.defaultSubAgents || (thread.metadata?.subAgents as string[]) || [];
      const model =
        project?.defaultModelId ||
        (thread.metadata?.model as string) ||
        '';
      const agentId =
        project?.defaultAgentId ||
        (thread.metadata?.agentId as string) ||
        appInfo.defaultAgent;

      const result = await mastraManager.chat(
        undefined,
        {
          chatId: input.threadId,
          model,
          agentId,
          messages: [
            {
              id: nanoid(),
              parts: [
                {
                  type: 'text',
                  text: input.text,
                },
              ],
              role: 'user',
            },
          ],
          requireToolApproval: false,
          tools,
          subAgents,
        },
        {
          onStart: async () => {},
          onChunk: async (chunk: string) => {
            outputText += chunk;
          },
          onEnd: async () => {},
          onToolCall: async (toolCall) => {
            this.callbacks.onActivity(
              `[weixin] tool started: ${toolCall.toolName}`,
            );
          },
          onToolCallUpdate: async (toolCallUpdate, status) => {
            this.callbacks.onActivity(
              `[weixin] tool ${status}: ${toolCallUpdate.toolCallId}`,
            );
          },
        },
      );

      if (!result.success) {
        await this.sendTextReply(
          input.fromUserId,
          `⚠️ 处理消息失败：${result.error}`,
          input.contextToken,
        );
        return;
      }

      if (result.status === 'suspended') {
        await this.sendTextReply(
          input.fromUserId,
          '当前微信通道暂不支持继续交互式提问，请在桌面端继续。',
          input.contextToken,
        );
        return;
      }

      if (outputText.trim()) {
        await this.sendTextReply(
          input.fromUserId,
          outputText.trim(),
          input.contextToken,
        );
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : JSON.stringify(err);
      await this.sendTextReply(
        input.fromUserId,
        `⚠️ 处理消息失败：${errMsg}`,
        input.contextToken,
      ).catch(() => {});
      this.callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (typingTimer) clearInterval(typingTimer);
      if (typingTicket) {
        sendTyping({
          baseUrl: this.resolveBaseUrl(),
          token: this.channel.config.botToken,
          routeTag: this.resolveRouteTag(),
          body: {
            ilink_user_id: input.fromUserId,
            typing_ticket: typingTicket,
            status: TypingStatus.CANCEL,
          },
        }).catch(() => {});
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Typing ticket cache (via getConfig)
  // ---------------------------------------------------------------------------

  private async resolveTypingTicket(
    userId: string,
    contextToken?: string,
  ): Promise<string | undefined> {
    const cached = this.typingTickets.get(userId);
    if (cached) return cached;

    try {
      const resp = await getConfig({
        baseUrl: this.resolveBaseUrl(),
        token: this.channel.config.botToken,
        ilinkUserId: userId,
        contextToken,
        routeTag: this.resolveRouteTag(),
      });
      if (resp.ret === 0 && resp.typing_ticket) {
        this.typingTickets.set(userId, resp.typing_ticket);
        return resp.typing_ticket;
      }
    } catch {
      // non-critical
    }
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async prepareInboundMessage(
    msg: WeixinMessage,
    fromUserId: string,
    thread: ThreadState,
  ): Promise<PreparedInboundMessage> {
    const reminders: string[] = [];
    const userTexts: string[] = [];
    const workspaceRoot = await this.resolveWorkspaceRoot(thread);

    for (const item of msg.item_list ?? []) {
      if (item.type === MessageItemType.TEXT) {
        const text = bodyFromItemList([item]).trim();
        if (text) {
          userTexts.push(text);
        }
        continue;
      }

      if (item.type === MessageItemType.VOICE && item.voice_item?.text?.trim()) {
        userTexts.push(item.voice_item.text.trim());
      }

      if (!isMediaItem(item)) {
        continue;
      }

      const media = await this.downloadInboundMedia(
        item,
        fromUserId,
        msg.message_id,
        workspaceRoot,
      );

      const kindLabel = getItemKindLabel(item) || 'attachment';
      if (media?.filePath) {
        reminders.push(
          `<system-reminder>The user sent you a ${kindLabel} via Weixin. The file is saved to '${media.filePath}'.</system-reminder>`,
        );
      } else {
        reminders.push(
          `<system-reminder>The user sent you a ${kindLabel} via Weixin, but the file could not be downloaded locally.</system-reminder>`,
        );
      }

      if (media?.transcription?.trim()) {
        userTexts.push(media.transcription.trim());
      }
    }

    const text = [...reminders, ...userTexts].filter(Boolean).join('\n\n').trim();
    const preview =
      userTexts.join(' ').trim() ||
      reminders.join(' ').replace(/<[^>]+>/g, '').trim() ||
      '[media]';

    return { text, preview };
  }

  private async resolveWorkspaceRoot(thread: ThreadState): Promise<string> {
    const config = await this.getChannelConfig();
    let projectPath: string | undefined;
    if (config.currentProjectId) {
      try {
        projectPath = (await projectManager.getProject(config.currentProjectId))?.path;
      } catch {
        projectPath = undefined;
      }
    }
    const threadWorkspace = (thread.metadata?.workspace as string | undefined)?.trim();
    const workspaceRoot = projectPath?.trim() || threadWorkspace;

    if (workspaceRoot) {
      return workspaceRoot;
    }

    return path.join(app.getPath('temp'), 'aime-chat-weixin');
  }

  private resolveCdnBaseUrl(): string {
    return this.channel.config.cdnBaseUrl?.trim() || DEFAULT_WEIXIN_CDN_BASE_URL;
  }

  private resolveMediaUrls(item: MessageItem): string[] {
    const directUrls: string[] = [];
    const encryptParams: string[] = [];
    const bases = [...new Set([this.resolveCdnBaseUrl(), this.resolveBaseUrl()])];
    const addDirect = (value?: string) => {
      const trimmed = value?.trim();
      if (!trimmed) return;
      if (/^https?:\/\//i.test(trimmed)) {
        directUrls.push(trimmed);
        return;
      }

      for (const base of bases) {
        try {
          directUrls.push(new URL(trimmed, ensureTrailingSlash(base)).toString());
        } catch {
          // ignore invalid url candidate
        }
      }
    };
    const addMedia = (value?: { encrypt_query_param?: string }) => {
      const trimmed = value?.encrypt_query_param?.trim();
      if (!trimmed) return;
      encryptParams.push(trimmed);
    };

    if (item.type === MessageItemType.IMAGE) {
      addDirect(item.image_item?.url);
      addMedia(item.image_item?.media);
      addMedia(item.image_item?.thumb_media);
    }
    if (item.type === MessageItemType.VOICE) {
      addMedia(item.voice_item?.media);
    }
    if (item.type === MessageItemType.FILE) {
      addMedia(item.file_item?.media);
    }
    if (item.type === MessageItemType.VIDEO) {
      addMedia(item.video_item?.media);
      addMedia(item.video_item?.thumb_media);
    }

    const urls = new Set<string>(directUrls);
    for (const param of encryptParams) {
      if (/^https?:\/\//i.test(param)) {
        urls.add(param);
        continue;
      }

      for (const base of bases) {
        const normalizedBase = base.replace(/\/$/, '');
        if (param.startsWith('/')) {
          urls.add(`${normalizedBase}${param}`);
        } else if (param.startsWith('?')) {
          urls.add(`${normalizedBase}${param}`);
        } else {
          urls.add(`${normalizedBase}?${param.replace(/^\?/, '')}`);
          urls.add(`${ensureTrailingSlash(normalizedBase)}${param.replace(/^\//, '')}`);
        }
      }
    }

    return [...urls];
  }

  private async fetchMediaBuffer(item: MessageItem): Promise<Buffer | undefined> {
    const urls = this.resolveMediaUrls(item);
    let lastError: Error | undefined;
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          headers: {
            ...(this.channel.config.botToken?.trim()
              ? { Authorization: `Bearer ${this.channel.config.botToken.trim()}` }
              : {}),
            ...(this.resolveRouteTag()
              ? { SKRouteTag: this.resolveRouteTag() as string }
              : {}),
          },
        });
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > 0) {
          return buffer;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    if (lastError) {
      this.callbacks.onActivity(
        `[weixin] media download failed: ${lastError.message}`,
      );
    }
    return undefined;
  }

  private async downloadInboundMedia(
    item: MessageItem,
    fromUserId: string,
    messageId: number | undefined,
    workspaceRoot: string,
  ): Promise<{ filePath?: string; transcription?: string }> {
    const kindLabel = getItemKindLabel(item);
    if (!kindLabel) {
      return {};
    }

    const buffer = await this.fetchMediaBuffer(item);
    if (!buffer) {
      return {};
    }

    const { fileTypeFromBuffer } = await import('file-type');
    const detectedType = await fileTypeFromBuffer(buffer).catch(() => undefined);
    const detectedExt = detectedType?.ext ? `.${detectedType.ext}` : '';
    const fallbackExt = getDefaultExtension(item);
    const fileNameFromPayload =
      item.type === MessageItemType.FILE
        ? item.file_item?.file_name?.trim()
        : undefined;
    const targetDir = path.join(
      workspaceRoot,
      '.aime-chat',
      'channels',
      'weixin',
      sanitizeFileName(this.channel.config.accountId || this.channel.id),
      sanitizeFileName(fromUserId),
    );

    await fs.promises.mkdir(targetDir, { recursive: true });

    const originalExt =
      fileNameFromPayload && path.extname(fileNameFromPayload)
        ? path.extname(fileNameFromPayload)
        : '';
    const baseName = fileNameFromPayload
      ? sanitizeFileName(path.basename(fileNameFromPayload, originalExt))
      : `${messageId || Date.now()}-${kindLabel.replace(/\s+/g, '-')}`;
    let filePath = path.join(
      targetDir,
      `${baseName}${originalExt || detectedExt || fallbackExt}`,
    );

    if (
      fs.existsSync(filePath) &&
      fs.statSync(filePath).isFile() &&
      fs.statSync(filePath).size > 0
    ) {
      filePath = increment(filePath, { platform: 'win32', fs: true });
    }

    await fs.promises.writeFile(filePath, buffer);

    let transcription: string | undefined;
    if (
      item.type === MessageItemType.VOICE &&
      !item.voice_item?.text?.trim()
    ) {
      transcription = await this.transcribeAudio(filePath);
    }

    return { filePath, transcription };
  }

  private async transcribeAudio(filePath: string): Promise<string | undefined> {
    try {
      const speechToText = (await toolsManager.buildTool(
        `${ToolType.BUILD_IN}:${SpeechToText.toolName}`,
      )) as unknown as SpeechToText;
      const result = await speechToText.execute({
        source: filePath,
        output_type: 'text',
      });
      if (typeof result === 'string') {
        return result.trim() || undefined;
      }
      return result?.text?.trim() || undefined;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.callbacks.onActivity(
        `[weixin] speech-to-text failed: ${err.message}`,
      );
      return undefined;
    }
  }

  private resolveBaseUrl(): string {
    return this.channel.config.baseUrl?.trim() || DEFAULT_WEIXIN_BASE_URL;
  }

  private resolveRouteTag(): string | undefined {
    return this.channel.config.routeTag?.trim() || undefined;
  }

  private async refreshExpiredQr(): Promise<WeixinLoginStatusResult> {
    if (!this.loginSession) {
      return {
        status: 'idle',
        message: 'No active Weixin login session.',
      };
    }

    if (this.loginSession.refreshCount + 1 >= MAX_QR_REFRESH_COUNT) {
      return this.handleExpiredLogin(
        'Login timed out: QR code expired too many times.',
      );
    }

    const nextQr = await fetchQRCode({
      baseUrl: this.resolveBaseUrl(),
      botType: DEFAULT_WEIXIN_BOT_TYPE,
      routeTag: this.resolveRouteTag(),
    });

    const qrcodeBase64 = await generateQRCodeBase64(
      nextQr.qrcode_img_content,
    );

    this.loginSession = {
      ...this.loginSession,
      qrcode: nextQr.qrcode,
      qrcodeBase64,
      createdAt: Date.now(),
      expiresAt: new Date(Date.now() + LOGIN_SESSION_TTL_MS).toISOString(),
      refreshCount: this.loginSession.refreshCount + 1,
      status: 'wait',
    };

    this.callbacks.onActivity(
      `Weixin QR refreshed for ${this.channel.name}`,
    );

    return {
      sessionKey: this.loginSession.sessionKey,
      status: 'wait',
      qrcodeBase64: this.loginSession.qrcodeBase64,
      expiresAt: this.loginSession.expiresAt,
      message: 'QR code expired and has been refreshed.',
    };
  }

  private handleExpiredLogin(message: string): WeixinLoginStatusResult {
    const sessionKey = this.loginSession?.sessionKey;
    this.loginSession = undefined;
    return {
      sessionKey,
      status: 'expired',
      message,
    };
  }
}
