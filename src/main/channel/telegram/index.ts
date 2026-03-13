import { Bot, Context, InlineKeyboard, InputFile } from 'grammy';
import type { BotCommand, Chat, UserFromGetMe } from 'grammy/types';
import fs from 'fs';
import {
  ChannelTestResult,
  SendChannelFileInput,
  SendChannelMessageInput,
  TelegramChannel,
  TelegramChannelConfig,
} from '@/types/channel';
import { appManager } from '../../app';
import { HttpsProxyAgent } from 'https-proxy-agent';
import path from 'path';
import { app } from 'electron';
import { nanoid } from '@/utils/nanoid';
import { Channels } from '@/entities/channels';
import { Repository } from 'typeorm';
import { dbManager } from '@/main/db';
import mastraManager from '@/main/mastra';
import { agentManager } from '@/main/mastra/agents';
import { ThreadState } from '@/types/chat';
import { SpeechToText } from '@/main/tools/audio';
import { toolsManager } from '@/main/tools';
import { ToolType } from '@/types/tool';
import { projectManager } from '@/main/project';
import { renderTelegramHtmlSegments } from '@/utils/telegram-markdown';


export const enum Commands {
  PAIR = 'pair',
  PROJECTS = 'projects',
  NEW = 'new',
  COMPACT = 'compact',
  STOP = 'stop',
  CLEAR = 'clear',
}


type PendingTelegramInput = {
  ctx: Context;
  chatId: string;
  text: string;
  threadId: string;
  model: string;
};

type TelegramStreamResponder = {
  onStart: () => Promise<void>;
  onChunk: (chunk: string) => Promise<void>;
  onEnd: () => Promise<void>;
};

const TELEGRAM_MIN_EDIT_INTERVAL_MS = 2500;
const TELEGRAM_TYPING_INTERVAL_MS = 4000;

function normalizeCommand(command: string): string {
  return command.replace(/^\/+/, '').trim().toLowerCase();
}

function normalizeChatIds(chatIds: string[] | undefined): Set<string> {
  return new Set((chatIds ?? []).map((item) => item.trim()).filter(Boolean));
}

const MAX_PAIRING_FAILURES = 5;

export class TelegramChannelRuntime {
  private bot?: Bot;

  private me?: UserFromGetMe;

  private started = false;

  private readonly allowedChatIds: Set<string>;

  private pairingCode = '';

  private pairingCodeExpiresAt = '';

  private pairingFailureCount = 0;

  private channelRepository: Repository<Channels>;

  private readonly threadMessageQueues: Record<string, PendingTelegramInput[]> = {};

  private readonly threadWorkers = new Set<string>();

  private readonly threadTelegramWrites: Record<string, Promise<void>> = {};

  constructor(
    private readonly channel: TelegramChannel,
    private readonly callbacks: {
      onActivity: (summary: string) => void;
      onError: (error: Error) => void;
      onPairSuccess: (payload: { chatId: string; title?: string }) => Promise<void>;
      onPairingCodeExpired: (payload: { failedAttempts: number }) => Promise<void>;
    },
  ) {
    this.allowedChatIds = normalizeChatIds(channel.config.allowedChatIds);
    this.channelRepository = dbManager.dataSource.getRepository(Channels);
    this.syncChannel(channel);
  }

  public syncChannel(channel: TelegramChannel): void {
    this.channel.name = channel.name;
    this.channel.enabled = channel.enabled;
    this.channel.autoStart = channel.autoStart;
    this.channel.config = { ...channel.config };
    this.pairingCode = '';
    this.pairingCodeExpiresAt = '';
    this.pairingFailureCount = 0;

    this.allowedChatIds.clear();
    for (const chatId of normalizeChatIds(channel.config.allowedChatIds)) {
      this.allowedChatIds.add(chatId);
    }
  }

  private async createBot(): Promise<Bot> {
    const token = this.channel.config.token?.trim();
    if (!token) {
      throw new Error('Telegram Bot token is required');
    }

    const proxy = await appManager.getProxy();
    let proxyAgent: HttpsProxyAgent<string> | undefined;
    if (proxy) {
      proxyAgent = new HttpsProxyAgent('http://' + proxy);
    }


    const bot = new Bot(token, {
      client: {
        baseFetchConfig: {
          agent: proxyAgent,
          compress: true,
        },
      },
    });

    bot.catch((error) => {
      const err = error instanceof Error ? error : new Error(String(error));
      this.callbacks.onError(err);
    });

    bot.on('message:text', async (ctx) => {
      const chatId = String(ctx.chat.id);
      const text = ctx.message.text?.trim() ?? '';
      const commandName = this.extractCommand(text);

      if (!this.isChatAllowed(chatId)) {
        const paired = await this.handlePairCommand(ctx, chatId, text);
        if (!paired) {
          this.callbacks.onActivity(`Ignored message from unauthorized chat ${chatId}`);
        }
        return;
      }

      if (commandName) {
        const commands = this.getCommands()?.map(x => x.command) ?? [];
        if (
          commandName === Commands.PAIR &&
          this.allowedChatIds.has(chatId)
        ) {
          await ctx.reply('This chat is already paired. No need to pair again.');
          this.callbacks.onActivity(
            `Ignored duplicate pairing attempt from authorized chat ${chatId}`,
          );
          return;
        } else if (commands.includes(commandName)) {
          await this.executeCommand(commandName, text, ctx)
          return;
        }
      }
      const thread = await this.resolveCurrentThread();
      await this.enqueueThreadMessage({
        ctx,
        chatId,
        text,
        threadId: thread.id,
        model: thread.metadata?.model as string,
      });
      this.callbacks.onActivity(`Received text message from chat ${chatId}`);
    });

    bot.on('message:document', async (ctx) => {
      const chatId = String(ctx.chat.id);
      if (!this.isChatAllowed(chatId)) return;
      const document = ctx.message.document;
      await ctx.reply(
        `Received document: ${document.file_name || document.file_id} (${document.mime_type || 'unknown'})`,
      );
      this.callbacks.onActivity(`Received document from chat ${chatId}`);
    });

    bot.on('message:photo', async (ctx) => {
      const chatId = String(ctx.chat.id);
      if (!this.isChatAllowed(chatId)) return;
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const file = await ctx.api.getFile(photo.file_id);
      if (file.file_path) {
        const url = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const data = Buffer.from(buffer);
        const filePath = path.join(app.getPath('temp'), `${nanoid()}.jpg`);
        fs.writeFileSync(filePath, data);
      }

      this.callbacks.onActivity(`Received photo from chat ${chatId}`);
    });

    bot.on("message:voice", async (ctx) => {
      const voice = ctx.message.voice
      const chatId = String(ctx.chat.id);
      console.log("file_id:", voice.file_id)
      console.log("duration:", voice.duration)
      console.log("mime_type:", voice.mime_type)
      console.log("file_size:", voice.file_size)

      const file = await ctx.api.getFile(voice.file_id)
      console.log("file_path:", file.file_path)

      const url = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
      if (file.file_path) {
        const filePath = path.join(app.getPath('temp'), 'aime-chat-telegram', ...file.file_path.split('/'))
        try {
          const response = await fetch(url);
          const buffer = await response.arrayBuffer();
          const data = Buffer.from(buffer);
          if (!fs.existsSync(path.dirname(filePath))) {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
          }
          await fs.promises.writeFile(filePath, data);
          const speechToText = await toolsManager.buildTool(`${ToolType.BUILD_IN}:${SpeechToText.toolName}`,)
          const result = await (speechToText as SpeechToText).execute({
            source: filePath,
            output_type: 'text',
          });
          if (result.text) {
            console.log("speech to text result:", result.text);
            const thread = await this.resolveCurrentThread();
            await this.enqueueThreadMessage({
              ctx,
              chatId,
              text: result.text,
              threadId: thread.id,
              model: thread.metadata?.model as string,
            });
          }



        } catch (error) {
          console.error("Error downloading voice file:", error);
          ctx.reply("Error downloading voice file: " + error.message);
        } finally {
          if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
          }
        }

      }
      //console.log("download url:", url)

      // await ctx.reply("收到语音了")
    });

    bot.on("message:audio", async (ctx) => {
      const voice = ctx.message.voice

      console.log("file_id:", voice.file_id)
      console.log("duration:", voice.duration)
      console.log("mime_type:", voice.mime_type)
      console.log("file_size:", voice.file_size)

      const file = await ctx.api.getFile(voice.file_id)
      console.log("file_path:", file.file_path)

      const url = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
      console.log("download url:", url)

      await ctx.reply("收到语音了")
    });



    bot.callbackQuery("status", async (ctx) => {
      await ctx.answerCallbackQuery()
      await ctx.reply("当前状态正常")
    })




    return bot;
  }


  private async resolveCurrentThread(): Promise<ThreadState> {
    const appInfo = await appManager.getInfo();
    const config = await this.getChannelConfig();
    if (!config.currentThreadId) {
      const agentId = appInfo.defaultAgent;
      const agent = await agentManager.getAgent(agentId);
      const threadEntity = await mastraManager.createThread({
        agentId: agent.id,
        model: agent.defaultModelId || appInfo.defaultModel?.model as string,
        subAgents: agent.subAgents,
        tools: agent.tools,
      });
      config.currentThreadId = threadEntity.id;
      const channelEntity = await this.channelRepository.findOneBy({ id: this.channel.id });
      if (!channelEntity) {
        throw new Error('Channel not found');
      }
      channelEntity.config = { ...config, currentThreadId: threadEntity.id };
      await this.channelRepository.save(channelEntity);
    }

    return mastraManager.getThread(config.currentThreadId, true);
  }

  private async enqueueThreadMessage(input: PendingTelegramInput): Promise<void> {
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

  private async processThreadMessage(input: PendingTelegramInput): Promise<void> {
    const responder = this.createTelegramStreamResponder(input.ctx, input.threadId);

    try {
      const appInfo = await appManager.getInfo();
      const thread = await this.resolveCurrentThread();
      const tools = thread?.metadata?.tools as string[] ?? [];
      const subAgents = thread?.metadata?.subAgents as string[] ?? [];
      const model = thread?.metadata?.model as string ?? '';
      const agentId = thread?.metadata?.agentId as string ?? '';
      const result = await mastraManager.chat(undefined, {
        chatId: input.threadId,
        model: input.model,
        agentId: agentId,
        messages: [{
          id: nanoid(),
          parts: [{
            type: 'text',
            text: input.text,
          }],
          role: 'user',
        }],
        requireToolApproval: false,
        tools,
        subAgents,
      }, {
        onStart: responder.onStart,
        onChunk: responder.onChunk,
        onEnd: responder.onEnd,
      });

      if (!result.success) {
        await this.enqueueTelegramWrite(input.threadId, async () => {
          await input.ctx.reply(`Error: ${result.error}`);
        });
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await this.enqueueTelegramWrite(input.threadId, async () => {
        await input.ctx.reply(`Error: ${err.message}`);
      });
      this.callbacks.onError(err);
    }
  }

  private createTelegramStreamResponder(ctx: Context, threadId: string): TelegramStreamResponder {
    const messageIds: number[] = [];
    let fullText = '';
    let renderedSegments: string[] = [];
    let streamStarted = false;
    let lastTypingAt = 0;
    let flushTimer: ReturnType<typeof setTimeout> | undefined;

    const flush = async () => {
      const nextSegments = await renderTelegramHtmlSegments(fullText, {
        tableMode: 'code'
      });
      if (nextSegments.length === 0) {
        return;
      }

      await this.enqueueTelegramWrite(threadId, async () => {
        for (const [index, segment] of nextSegments.entries()) {
          if (!messageIds[index]) {
            const message = await ctx.reply(segment, { parse_mode: "HTML" });
            messageIds[index] = message.message_id;
            continue;
          }

          if (renderedSegments[index] === segment) {
            continue;
          }

          await this.safeEditMessageText(ctx, messageIds[index], segment);
        }

        renderedSegments = nextSegments;
      });
    };

    const scheduleFlush = () => {
      if (flushTimer) {
        return;
      }

      flushTimer = setTimeout(() => {
        flushTimer = undefined;
        void flush();
      }, TELEGRAM_MIN_EDIT_INTERVAL_MS);
    };

    return {
      onStart: async () => {
        streamStarted = true;
      },
      onChunk: async (chunk: string) => {
        if (!streamStarted) {
          streamStarted = true;
        }
        fullText += chunk;

        const now = Date.now();
        if (now - lastTypingAt >= TELEGRAM_TYPING_INTERVAL_MS) {
          lastTypingAt = now;
          await this.enqueueTelegramWrite(threadId, async () => {
            await ctx.api.sendChatAction(ctx.chat.id, 'typing');
          });
        }

        scheduleFlush();
      },
      onEnd: async () => {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = undefined;
        }
        await flush();
      },
    };
  }

  private async enqueueTelegramWrite(threadId: string, operation: () => Promise<void>): Promise<void> {
    const previous = this.threadTelegramWrites[threadId] ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(operation);

    this.threadTelegramWrites[threadId] = next
      .catch(() => undefined)
      .then(() => {
        if (this.threadTelegramWrites[threadId] === next) {
          delete this.threadTelegramWrites[threadId];
        }
      });

    await next;
  }

  private async safeEditMessageText(ctx: Context, messageId: number, text: string): Promise<void> {
    try {
      await ctx.api.editMessageText(ctx.chat.id, messageId, text, { parse_mode: "HTML" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('message is not modified')) {
        return;
      }

      const retryAfterMatch = message.match(/retry after (\d+)/i);
      if (retryAfterMatch) {
        const retryAfterSeconds = Number(retryAfterMatch[1]);
        if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
          await this.sleep((retryAfterSeconds * 1000) + 100);
          await ctx.api.editMessageText(ctx.chat.id, messageId, text, { parse_mode: "HTML" });
          return;
        }
      }

      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private extractCommand(text: string): string | null {
    if (!text.startsWith('/')) return null;
    const raw = text.slice(1).split(/\s+/)[0] ?? '';
    return normalizeCommand(raw.split('@')[0] ?? '');
  }

  private hasActivePairingCode(): boolean {
    return Boolean(this.pairingCode.trim()) && !this.isPairingCodeExpired();
  }

  private isChatAllowed(chatId: string): boolean {
    if (this.allowedChatIds.has(chatId)) {
      return true;
    }

    if (this.allowedChatIds.size > 0) {
      return false;
    }

    return !this.hasActivePairingCode();
  }


  private isPairingCodeExpired(): boolean {
    const expiresAt = this.pairingCodeExpiresAt?.trim();
    if (!expiresAt) return true;
    const time = new Date(expiresAt).getTime();
    return Number.isNaN(time) || time <= Date.now();
  }

  private getCommandArgument(text: string): string {
    return text.split(/\s+/).slice(1).join(' ').trim();
  }

  private getChatTitle(chat: Chat): string | undefined {
    if ('title' in chat && chat.title) return chat.title;
    if ('username' in chat && chat.username) return chat.username;
    if ('first_name' in chat) {
      return [chat.first_name, 'last_name' in chat ? chat.last_name : '']
        .filter(Boolean)
        .join(' ') || undefined;
    }
    return undefined;
  }

  private async handlePairCommand(ctx: Context, chatId: string, text: string): Promise<boolean> {
    const commandName = this.extractCommand(text);
    if (commandName !== Commands.PAIR) {
      return false;
    }

    const code = this.getCommandArgument(text).toUpperCase();
    const expectedCode = this.pairingCode.trim().toUpperCase();
    if (!expectedCode) {
      await ctx.reply('Pairing is not enabled. Generate a new pairing code from settings first.');
      this.callbacks.onActivity(`Rejected pairing for chat ${chatId}: no active pairing code`);
      return true;
    }

    if (!code) {
      await ctx.reply(`Usage: /${Commands.PAIR} <code>`);
      this.callbacks.onActivity(`Rejected pairing for chat ${chatId}: missing code`);
      return true;
    }

    if (this.isPairingCodeExpired()) {
      await ctx.reply('This pairing code has expired. Generate a new one from settings.');
      this.callbacks.onActivity(`Rejected pairing for chat ${chatId}: code expired`);
      return true;
    }

    if (code !== expectedCode) {
      const failedAttempts = this.incrementPairingFailureCount();
      if (failedAttempts >= MAX_PAIRING_FAILURES) {
        this.clearPairingCode();
        await ctx.reply(
          'Pairing failed too many times. This pairing code is now invalid. Please generate a new one from settings.',
        );
        await this.callbacks.onPairingCodeExpired({ failedAttempts });
        this.callbacks.onActivity(
          `Rejected pairing for chat ${chatId}: invalid code, pairing expired after ${failedAttempts} failures`,
        );
        return true;
      }

      await ctx.reply(
        `Invalid pairing code. Please check the code and try again. Failed attempts: ${failedAttempts}/${MAX_PAIRING_FAILURES}.`,
      );
      this.callbacks.onActivity(
        `Rejected pairing for chat ${chatId}: invalid code (${failedAttempts} failed attempts)`,
      );
      return true;
    }

    this.pairingFailureCount = 0;
    await this.callbacks.onPairSuccess({
      chatId,
      title: this.getChatTitle(ctx.chat),
    });
    this.clearPairingCode();
    this.allowedChatIds.add(chatId);
    await ctx.reply(`Pairing complete. Chat ${chatId} is now authorized for ${this.channel.name}.`);
    this.callbacks.onActivity(`Paired chat ${chatId}`);
    return true;
  }

  private async ensureBot(): Promise<Bot> {
    if (!this.bot) {
      this.bot = await this.createBot();
    }
    return this.bot;
  }

  private async loadMe(bot: Bot): Promise<UserFromGetMe> {
    if (!this.me) {
      this.me = await bot.api.getMe();
    }
    return this.me;
  }

  public async start(): Promise<UserFromGetMe> {
    if (this.started) {
      const bot = await this.ensureBot();
      return this.loadMe(bot);
    }

    const bot = await this.ensureBot();
    const me = await this.loadMe(bot);
    await bot.api.setMyCommands(
      this.getCommands().map((item) => ({
        command: item.command,
        description: item.description,
      })),
    );
    await this.setCommandCallbackQueryHandler(bot);

    return new Promise<UserFromGetMe>((resolve, reject) => {
      let resolved = false;

      void bot
        .start({
          onStart: () => {
            this.started = true;
            this.callbacks.onActivity(
              `Telegram polling started for @${me.username || me.first_name}`,
            );
            resolved = true;
            resolve(me);
          },
        })
        .catch((error) => {
          const err = error instanceof Error ? error : new Error(String(error));
          this.started = false;
          if (!resolved) {
            reject(err);
            return;
          }
          this.callbacks.onError(err);
        });
    });
  }

  public async stop(): Promise<void> {
    if (!this.bot || !this.started) return;
    this.bot.stop();
    this.started = false;
    this.callbacks.onActivity(`Telegram polling stopped for ${this.channel.name}`);
  }

  public async testConnection(): Promise<ChannelTestResult> {
    const bot = await this.ensureBot();
    const me = await this.loadMe(bot);
    return {
      ok: true,
      message: `Connected to @${me.username || me.first_name}`,
      info: {
        username: me.username,
        firstName: me.first_name,
        botId: me.id,
      },
    };
  }
  // public getCommands(): BotCommand[] {
  //   return [
  //     { command: this.getPairCommand(), description: 'Pair this chat with aime-chat.' },
  //     { command: 'projects', description: 'List all projects.' },
  //   ];
  // }

  public async getChannelConfig(): Promise<TelegramChannelConfig> {
    const channelEntity = await this.channelRepository.findOneBy({ id: this.channel.id });
    if (!channelEntity) {
      throw new Error('Channel not found');
    }
    return channelEntity.config as TelegramChannelConfig;
  }

  public getBotInfo(): {
    username?: string;
    firstName?: string;
    botId?: number;
    pairingCode?: string;
    pairingCodeExpiresAt?: string;
    pairCommand?: string;
  } {
    return {
      username: this.me?.username,
      firstName: this.me?.first_name,
      botId: this.me?.id,
      pairingCode: this.pairingCode || undefined,
      pairingCodeExpiresAt: this.pairingCodeExpiresAt || undefined,
      pairCommand: Commands.PAIR,
    };
  }

  private incrementPairingFailureCount(): number {
    this.pairingFailureCount += 1;
    return this.pairingFailureCount;
  }

  public setPairingCode(code: string, expiresAt: string): void {
    this.pairingCode = code.trim();
    this.pairingCodeExpiresAt = expiresAt.trim();
    this.pairingFailureCount = 0;
  }

  public clearPairingCode(): void {
    this.pairingCode = '';
    this.pairingCodeExpiresAt = '';
    this.pairingFailureCount = 0;
  }


  getCommands = (): BotCommand[] => {
    return [
      { command: Commands.PAIR, description: 'Pair this chat with aime-chat.' },
      { command: Commands.PROJECTS, description: 'List all projects.' },
      { command: Commands.NEW, description: 'Start a new session.' },
      { command: Commands.COMPACT, description: 'Compact the current session.' },
      { command: Commands.STOP, description: 'Stop current session.' },
      { command: Commands.CLEAR, description: 'Clear current session.' },

    ];
  };


  executeCommand = async (command: string, text: string, ctx: Context) => {
    const appInfo = await appManager.getInfo();
    switch (command) {
      case Commands.PROJECTS:
        const projects = await projectManager.getList({ page: 0, size: 10 });
        const items = projects.items.map(x => ({
          text: x.title,
          id: `focus:project:${x.id}`,
        }));
        let keyboard = new InlineKeyboard();
        for (const item of items) {
          keyboard = keyboard.text(item.text, item.id).row();
        }

        await ctx.reply("Select a project on focus:", {
          reply_markup: keyboard,
        })
        return;
      case Commands.NEW:
        const agentId = appInfo.defaultAgent;
        const agent = await agentManager.getAgent(agentId);
        const threadEntity = await mastraManager.createThread({
          agentId: agent.id,
          model: agent.defaultModelId || appInfo.defaultModel?.model as string,
          subAgents: agent.subAgents,
          tools: agent.tools,
        });
        const config = await this.getChannelConfig();
        config.currentThreadId = threadEntity.id;
        const channelEntity = await this.channelRepository.findOneBy({ id: this.channel.id });
        if (!channelEntity) {
          throw new Error('Channel not found');
        }
        channelEntity.config = { ...config, currentThreadId: threadEntity.id };
        await this.channelRepository.save(channelEntity);
        return;
    }
  };

  setCommandCallbackQueryHandler = (bot: Bot) => {
    bot.callbackQuery(/^focus:project:[A-Za-z0-9]+$/, async (ctx) => {
      await ctx.answerCallbackQuery()
      const projectId = ctx.callbackQuery.data.split(":")[2];
      const project = await projectManager.getProject(projectId);
      if (!project) {
        await ctx.reply("项目不存在")
        return;
      }
      await ctx.reply(`项目 ${project.title} 已选择`)
    });
    return bot;
  }

}
