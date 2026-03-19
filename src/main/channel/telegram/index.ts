import { Bot, Context, InlineKeyboard, InputFile, Keyboard } from 'grammy';
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
import { DEFAULT_RESOURCE_ID, ThreadState } from '@/types/chat';
import { SpeechToText } from '@/main/tools/audio';
import { toolsManager } from '@/main/tools';
import { ToolType } from '@/types/tool';
import { projectManager } from '@/main/project';
import { markdownToTelegramChunks } from '@/utils/telegram-markdown';
import { getToolMessageDescription } from '@/utils/tool-message';
import { Message } from '@/main/tools/common/message';
import { Project } from '@/types/project';
import { LanguageModelUsage } from 'ai';
import { models } from '@elevenlabs/elevenlabs-js/api';
import { providersManager } from '@/main/providers';
import { createHash } from 'crypto';
import increment from 'add-filename-increment'
import { AskUserQuestion, QuestionItemSchema } from '@/main/tools/common/ask-user-question';
import z from 'zod';

export const enum Commands {
  PAIR = 'pair',
  PROJECTS = 'projects',
  AGENTS = 'agents',
  NEW = 'new',
  COMPACT = 'compact',
  STOP = 'stop',
  CLEAR = 'clear',
  STATUS = 'status',
  SETMODEL = 'set_model',
  SETAGENT = 'set_agent',
  SETTOOLS = 'set_tools',
  SETSKILLS = 'set_skills',
  SETSUBAGENTS = 'set_subagents',
  SESSIONS = 'sessions',
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
  onToolCall: (toolCall: {
    toolName: string;
    toolCallId: string;
    input: any;
  }) => Promise<void>;
  onToolCallUpdate: (toolCallUpdate: {
    toolCallId: string;
    output: any;
  }, status: "pending" | "completed" | "failed") => Promise<void>;
};

type TelegramCommandContext = {
  appInfo: Awaited<ReturnType<typeof appManager.getInfo>>;
  config: TelegramChannelConfig;
  currentProjectId?: string;
  currentThreadId?: string;
  project?: Project;
  thread?: ThreadState;
};

type TelegramSelectableModel = {
  id: string;
  text: string;
};

type TelegramAvailableTool = {
  id: string;
  name: string;
  isToolkit: boolean;
  tools?: {
    id: string;
    name: string;
  }[];
};

type PendingAskQuestion = {
  id: string;
  threadId: string;
  chatId: number;
  toolCallId: string;
  runId: string;
  questions: z.infer<typeof QuestionItemSchema>[];
  /** questionIndex -> set of selected option indices */
  selections: Map<number, Set<number>>;
  /** questionIndex -> telegram message id */
  messageIds: Map<number, number>;
  ctx: Context;
  model: string;
  agentId: string;
  tools: string[];
  subAgents: string[];
};

const TELEGRAM_MIN_EDIT_INTERVAL_MS = 2500;
const TELEGRAM_TYPING_INTERVAL_MS = 4000;
const TELEGRAM_TOOLS_PAGE_SIZE = 8;
const TELEGRAM_PROJECTS_PAGE_SIZE = 8;
const TELEGRAM_BUTTON_TEXT_LIMIT = 18;

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

  private readonly pendingAskQuestions = new Map<string, PendingAskQuestion>();

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
      const fileId = document.file_id
      const file = await ctx.api.getFile(fileId)

      const url = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
      if (file.file_path) {
        const config = await this.getChannelConfig();
        const projectId = config.currentProjectId;
        const threadId = config.currentThreadId;
        let project: Project | undefined;
        let thread: ThreadState | undefined;
        if (projectId) {
          project = await projectManager.getProject(projectId);
        }

        thread = await this.resolveCurrentThread();
        const workspacePath = project?.path || thread?.metadata?.workspace as string || '';
        let filePath = path.join(workspacePath, ...(path.dirname(file.file_path).replaceAll('\\', '/')).split('/'), document.file_name);
        try {
          if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
            ctx.reply("Error: File path is a directory: " + filePath);
            return;
          }
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile() && fs.statSync(filePath).size > 0) {
            filePath = increment(filePath, { platform: 'win32', fs: true, });
          }

          await mastraManager.saveMessages(threadId, [{
            id: nanoid(),
            role: 'user',
            threadId: threadId,
            resourceId: thread?.resourceId || DEFAULT_RESOURCE_ID,
            type: 'v2',
            createdAt: new Date(),
            content: {
              format: 2,
              parts: [{
                type: 'text',
                text: `<system-reminder>The user sent you a file via Telegram. The file is saved to '${filePath}'</system-reminder>`,
              }],
            },
          }])
          const response = await fetch(url);
          const buffer = await response.arrayBuffer();
          const data = Buffer.from(buffer);
          if (!fs.existsSync(path.dirname(filePath))) {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
          }
          await fs.promises.writeFile(filePath, data);
          await ctx.reply(
            `Received document: saved to '${filePath}'`,
          );
        } catch (error) {
          console.error("Error downloading voice file:", error);
          ctx.reply("Error downloading file: " + error.message);
        } finally {

        }
      } else {
        await ctx.reply("Error downloading document file: " + file.file_path);
      }
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
      const voice = ctx.message.voice;
      const chatId = String(ctx.chat.id);
      if (!this.isChatAllowed(chatId)) return;
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
      const voice = ctx.message.voice;
      const chatId = String(ctx.chat.id);
      if (!this.isChatAllowed(chatId)) return;

      console.log("file_id:", voice.file_id)
      console.log("duration:", voice.duration)
      console.log("mime_type:", voice.mime_type)
      console.log("file_size:", voice.file_size);
      const fileId = voice.file_id
      const file = await ctx.api.getFile(fileId)

      if (file.file_path) {
        const config = await this.getChannelConfig();
        const projectId = config.currentProjectId;
        const threadId = config.currentThreadId;
        let project: Project | undefined;
        let thread: ThreadState | undefined;
        if (projectId) {
          project = await projectManager.getProject(projectId);
        }

        thread = await this.resolveCurrentThread();
        const workspacePath = project?.path || thread?.metadata?.workspace as string || '';
        let filePath = path.join(workspacePath, ...(path.dirname(file.file_path).replaceAll('\\', '/')).split('/'), voice.file_id);
        try {
          if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
            ctx.reply("Error: File path is a directory: " + filePath);
            return;
          }
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile() && fs.statSync(filePath).size > 0) {
            filePath = increment(filePath, { platform: 'win32', fs: true, });
          }

          await mastraManager.saveMessages(threadId, [{
            id: nanoid(),
            role: 'user',
            threadId: threadId,
            resourceId: thread?.resourceId || DEFAULT_RESOURCE_ID,
            type: 'v2',
            createdAt: new Date(),
            content: {
              format: 2,
              parts: [{
                type: 'text',
                text: `<system-reminder>The user sent you a file via Telegram. The file is saved to '${filePath}'</system-reminder>`,
              }],
            },
          }])
          const response = await fetch(url);
          const buffer = await response.arrayBuffer();
          const data = Buffer.from(buffer);
          if (!fs.existsSync(path.dirname(filePath))) {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
          }
          await fs.promises.writeFile(filePath, data);
          await ctx.reply(
            `Received document: saved to '${filePath}'`,
          );
        } catch (error) {
          console.error("Error downloading voice file:", error);
          ctx.reply("Error downloading file: " + error.message);
        } finally {

        }
      } else {
        await ctx.reply("Error downloading document file: " + file.file_path);
      }
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
    const projectId = config.currentProjectId;
    if (!config.currentThreadId) {
      const agentId = appInfo.defaultAgent;
      const agent = await agentManager.getAgent(agentId);
      const threadEntity = await mastraManager.createThread({
        agentId: agent.id,
        resourceId: projectId ? `project:${projectId}` : undefined,
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
      const config = await this.getChannelConfig();
      const thread = await this.resolveCurrentThread();
      let projectId = config?.currentProjectId;
      let project;
      if (projectId) {
        project = await projectManager.getProject(projectId);
      }
      const tools = project?.defaultTools || thread?.metadata?.tools as string[] || [];
      const subAgents = project?.defaultSubAgents || thread?.metadata?.subAgents as string[] || [];
      const model = project?.defaultModelId || thread?.metadata?.model as string || '';
      const agentId = project?.defaultAgentId || thread?.metadata?.agentId as string || '';
      const result = await mastraManager.chat(undefined, {
        chatId: input.threadId,
        model: model,
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
        onToolCall: responder.onToolCall,
        onToolCallUpdate: responder.onToolCallUpdate,
      });

      if (!result.success) {
        await this.enqueueTelegramWrite(input.threadId, async () => {
          await input.ctx.reply(`Error: ${result.error}`);
        });
      }
      if (result.status == "suspended") {
        await this.handleSuspendedAskQuestions(result, input.ctx, input.threadId, {
          model,
          agentId,
          tools,
          subAgents,
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
    type ActiveTelegramMessage = {
      messageIds: number[];
      fullText: string;
      renderedSegments: string[];
      finalizedTextLength: number;
      flushTimer?: ReturnType<typeof setTimeout>;
      started: boolean;
      ended: boolean;
    };

    let activeMessage: ActiveTelegramMessage | undefined;
    let lastTypingAt = 0;
    let toolsMsg: any[] = [];

    const createActiveMessage = (): ActiveTelegramMessage => ({
      messageIds: [],
      fullText: '',
      renderedSegments: [],
      finalizedTextLength: 0,
      flushTimer: undefined,
      started: false,
      ended: false,
    });

    const ensureActiveMessage = () => {
      if (!activeMessage || activeMessage.ended) {
        activeMessage = createActiveMessage();
      }

      return activeMessage;
    };

    const ensureLiveMessage = async (messageState: ActiveTelegramMessage) => {
      const liveIndex = messageState.messageIds.length;
      if (messageState.messageIds[liveIndex]) {
        return;
      }

      const message = await ctx.reply('...');
      messageState.messageIds[liveIndex] = message.message_id;
      messageState.renderedSegments[liveIndex] = '...';
    };

    const flush = async (messageState: ActiveTelegramMessage) => {
      const remainingText = messageState.fullText.slice(messageState.finalizedTextLength);
      const nextChunks = markdownToTelegramChunks(remainingText, 4000, {
        tableMode: 'code'
      });
      if (nextChunks.length === 0) {
        return;
      }

      await this.enqueueTelegramWrite(threadId, async () => {
        const frozenChunks = nextChunks.slice(0, -1);
        const baseIndex = messageState.messageIds.length > 0 ? messageState.messageIds.length - 1 : 0;

        for (const [index, chunk] of frozenChunks.entries()) {
          const absoluteIndex = baseIndex + index;
          if (!messageState.messageIds[absoluteIndex]) {
            const message = await ctx.reply(chunk.html, { parse_mode: "HTML" });
            messageState.messageIds[absoluteIndex] = message.message_id;
          } else if (messageState.renderedSegments[absoluteIndex] !== chunk.html) {
            await this.safeEditMessageText(ctx, messageState.messageIds[absoluteIndex], chunk.html);
          }

          messageState.renderedSegments[absoluteIndex] = chunk.html;
          messageState.finalizedTextLength += chunk.text.length;
        }

        const liveChunk = nextChunks[nextChunks.length - 1];
        const liveIndex = baseIndex + frozenChunks.length;
        if (!messageState.messageIds[liveIndex]) {
          const message = await ctx.reply(liveChunk.html, { parse_mode: "HTML" });
          messageState.messageIds[liveIndex] = message.message_id;
        } else if (messageState.renderedSegments[liveIndex] !== liveChunk.html) {
          await this.safeEditMessageText(ctx, messageState.messageIds[liveIndex], liveChunk.html);
        }

        messageState.renderedSegments[liveIndex] = liveChunk.html;
      });
    };

    const scheduleFlush = (messageState: ActiveTelegramMessage) => {
      if (messageState.flushTimer) {
        return;
      }

      messageState.flushTimer = setTimeout(() => {
        messageState.flushTimer = undefined;
        void flush(messageState);
      }, TELEGRAM_MIN_EDIT_INTERVAL_MS);
    };

    return {
      onStart: async () => {



        const messageState = ensureActiveMessage();
        if (messageState.started && !messageState.ended) {
          return;
        }

        messageState.started = true;
        await this.enqueueTelegramWrite(threadId, async () => {
          await ensureLiveMessage(messageState);
        });
      },
      onChunk: async (chunk: string) => {
        const messageState = ensureActiveMessage();
        if (!messageState.started) {
          messageState.started = true;
          await this.enqueueTelegramWrite(threadId, async () => {
            await ensureLiveMessage(messageState);
          });
        }

        messageState.fullText += chunk;

        const now = Date.now();
        if (now - lastTypingAt >= TELEGRAM_TYPING_INTERVAL_MS) {
          lastTypingAt = now;
          await this.enqueueTelegramWrite(threadId, async () => {
            await ctx.api.sendChatAction(ctx.chat.id, 'typing');
          });
        }

        scheduleFlush(messageState);
      },
      onEnd: async () => {
        const messageState = activeMessage;
        if (!messageState || messageState.ended) {
          return;
        }

        if (messageState.flushTimer) {
          clearTimeout(messageState.flushTimer);
          messageState.flushTimer = undefined;
        }
        await flush(messageState);
        messageState.ended = true;
        activeMessage = undefined;
      },
      onToolCall: async (toolCall) => {
        const description = getToolMessageDescription(toolCall.toolName, toolCall.input);
        const msg = await ctx.reply(`🛠️ ${toolCall.toolName}: ${description ?? ''}`);
        toolsMsg.push({
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          description: description,
          messageId: msg.message_id,
          input: toolCall.input,
        });
      },
      onToolCallUpdate: async (toolCallUpdate, status) => {
        const toolMsg = toolsMsg.find(x => x.toolCallId === toolCallUpdate.toolCallId);
        if (toolMsg) {
          const icon = status === "pending" ? "🛠️" : status === "completed" ? "✅" : "❌";
          await this.safeEditMessageText(ctx, toolMsg.messageId, `${icon} ${toolMsg.toolName}: ${toolMsg.description ?? ''}`);
          if (status === "completed" && toolMsg.toolName == Message.toolName) {
            if (toolMsg.input.event == "files_preview") {
              const files = JSON.parse(toolMsg.input.data).files;
              for (const file of files) {
                const info = await appManager.getFileInfo(file);
                if (info && info.isExist) {
                  if (info.isFile) {
                    await ctx.api.sendDocument(ctx.chat.id, new InputFile(info.path))
                  }
                }
              }
            }
          }
          toolsMsg = toolsMsg.filter(x => x.toolCallId !== toolCallUpdate.toolCallId);
        }
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
          drop_pending_updates: true,
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

  public async saveChannelConfig(config: TelegramChannelConfig): Promise<void> {
    const channelEntity = await this.channelRepository.findOneBy({ id: this.channel.id });
    if (!channelEntity) {
      throw new Error('Channel not found');
    }
    channelEntity.config = config;
    await this.channelRepository.save(channelEntity);
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

  private buildAskQuestionKeyboard(
    pendingId: string,
    qIdx: number,
    question: z.infer<typeof QuestionItemSchema>,
    selected: Set<number>,
  ): InlineKeyboard {
    let keyboard = new InlineKeyboard();
    for (let oIdx = 0; oIdx < question.options.length; oIdx++) {
      const opt = question.options[oIdx];
      const isSelected = selected.has(oIdx);
      const label = question.multiSelect
        ? `${isSelected ? '✅ ' : '⬜ '}${opt.label}`
        : opt.label;
      keyboard = keyboard.text(label, `aq:${pendingId}:${qIdx}:${oIdx}`).row();
    }
    if (question.multiSelect) {
      keyboard = keyboard.text('✓ 确认选择', `aq:${pendingId}:${qIdx}:d`).row();
    }
    return keyboard;
  }

  private async handleSuspendedAskQuestions(
    result: { runId?: string; messages?: any[] },
    ctx: Context,
    threadId: string,
    opts: { model: string; agentId: string; tools: string[]; subAgents: string[] },
  ): Promise<void> {
    if (!result.runId || !result.messages?.length) return;

    const lastMsg = result.messages[result.messages.length - 1];
    const suspendedDatas = lastMsg.content.parts.filter(
      (x: any) => x.type === 'tool-invocation' && x.toolInvocation.toolName === AskUserQuestion.toolName,
    );

    for (const data of suspendedDatas) {
      const { args, toolCallId } = data.toolInvocation;
      const { questions = <z.infer<typeof QuestionItemSchema>[]>[] } = args as { questions: z.infer<typeof QuestionItemSchema>[] };
      if (questions.length === 0) continue;

      const pendingId = nanoid(6);
      const pending: PendingAskQuestion = {
        id: pendingId,
        threadId,
        chatId: ctx.chat.id,
        toolCallId,
        runId: result.runId,
        questions,
        selections: new Map(),
        messageIds: new Map(),
        ctx,
        model: opts.model,
        agentId: opts.agentId,
        tools: opts.tools,
        subAgents: opts.subAgents,
      };
      this.pendingAskQuestions.set(pendingId, pending);

      await this.enqueueTelegramWrite(threadId, async () => {
        for (let qIdx = 0; qIdx < questions.length; qIdx++) {
          const q = questions[qIdx];
          pending.selections.set(qIdx, new Set());
          const keyboard = this.buildAskQuestionKeyboard(pendingId, qIdx, q, new Set());
          const prefix = q.multiSelect ? '☑️' : '🔘';
          const msg = await ctx.reply(
            `${prefix} *${q.header}*\n${q.question}`,
            { reply_markup: keyboard, parse_mode: 'Markdown' },
          );
          pending.messageIds.set(qIdx, msg.message_id);
        }
      });
    }
  }

  private async resumeAfterAskQuestion(pending: PendingAskQuestion): Promise<void> {
    this.pendingAskQuestions.delete(pending.id);

    const answers = pending.questions.map((q, qIdx) => {
      const sel = pending.selections.get(qIdx) ?? new Set<number>();
      const selectedLabels = [...sel].map(i => q.options[i]?.label).filter(Boolean);
      return {
        question: q.question,
        answer: selectedLabels.join(', '),
      };
    });

    const responder = this.createTelegramStreamResponder(pending.ctx, pending.threadId);

    try {
      const result = await mastraManager.chat(undefined, {
        chatId: pending.threadId,
        model: pending.model,
        agentId: pending.agentId,
        runId: pending.runId,
        toolCallId: pending.toolCallId,
        resumeData: { answers },
        messages: [],
        requireToolApproval: false,
        tools: pending.tools,
        subAgents: pending.subAgents,
      }, {
        onStart: responder.onStart,
        onChunk: responder.onChunk,
        onEnd: responder.onEnd,
        onToolCall: responder.onToolCall,
        onToolCallUpdate: responder.onToolCallUpdate,
      });

      if (!result.success) {
        await this.enqueueTelegramWrite(pending.threadId, async () => {
          await pending.ctx.reply(`Error: ${result.error}`);
        });
      }

      if (result.status === 'suspended') {
        await this.handleSuspendedAskQuestions(result, pending.ctx, pending.threadId, {
          model: pending.model,
          agentId: pending.agentId,
          tools: pending.tools,
          subAgents: pending.subAgents,
        });
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await this.enqueueTelegramWrite(pending.threadId, async () => {
        await pending.ctx.reply(`Error: ${err.message}`);
      });
      this.callbacks.onError(err);
    }
  }

  getCommands = (): BotCommand[] => {
    return [
      { command: Commands.PAIR, description: 'Pair this chat with aime-chat.' },
      { command: Commands.PROJECTS, description: 'List all projects.' },
      { command: Commands.AGENTS, description: 'List all agents.' },
      { command: Commands.NEW, description: 'Start a new session.' },
      { command: Commands.COMPACT, description: 'Compact the current session.' },
      { command: Commands.STOP, description: 'Stop current session.' },
      { command: Commands.CLEAR, description: 'Clear current session.' },
      { command: Commands.STATUS, description: 'Show current session status.' },
      { command: Commands.SESSIONS, description: 'List sessions.' },
      { command: Commands.SETMODEL, description: 'Set the model for the current session.' },
      { command: Commands.SETAGENT, description: 'Set the agent for the current session.' },
      { command: Commands.SETTOOLS, description: 'Set the tools for the current session.' },
      { command: Commands.SETSKILLS, description: 'Set the skills for the current session.' },
      { command: Commands.SETSUBAGENTS, description: 'Set the sub-agents for the current session.' }
    ];
  };

  private encodeTelegramToken(id: string) {
    return createHash('sha256').update(id).digest('base64url').slice(0, 16);
  }

  private async getCurrentToolSelection(project?: Project, thread?: ThreadState): Promise<string[]> {
    const appInfo = await appManager.getInfo();
    const agentId = project?.defaultAgentId || thread?.metadata?.agentId as string || appInfo.defaultAgent;
    const agent = await agentManager.getAgent(agentId);
    return [...new Set(project?.defaultTools || thread?.metadata?.tools as string[] || agent?.tools || [])];
  }

  private async buildCommandContext(currentThreadId?: string): Promise<TelegramCommandContext> {
    const appInfo = await appManager.getInfo();
    const config = await this.getChannelConfig();
    const { currentProjectId } = config;
    const resolvedThreadId = currentThreadId ?? config.currentThreadId;
    const project = currentProjectId ? await projectManager.getProject(currentProjectId) : undefined;
    const thread = resolvedThreadId ? await this.resolveCurrentThread() : undefined;

    return {
      appInfo,
      config,
      currentProjectId,
      currentThreadId: resolvedThreadId,
      project,
      thread,
    };
  }

  private async getAvailableModels(): Promise<TelegramSelectableModel[]> {
    const providers = await providersManager.getAvailableLanguageModels();
    return providers.flatMap((provider) => provider.models.map((model) => ({
      text: `${provider.name}/${model.name}`,
      id: model.id,
    })));
  }

  private async getAvailableTools(toolType: ToolType): Promise<TelegramAvailableTool[]> {
    const tools = await toolsManager.getAvailableTools({
      isActive: true,
    });

    const availableTools = (tools[toolType] || []).map((item) => ({
      id: item.id,
      name: item.name,
      isToolkit: item.isToolkit,
      tools: item.tools?.map((tool) => ({
        id: tool.id,
        name: tool.name,
      })),
    }));

    const _tools = [];

    for (const item of availableTools) {
      if (item.isToolkit) {
        _tools.push(...item.tools);
      } else {
        _tools.push(item);
      }
    }

    return _tools;
  }

  private formatToolList(title: string, values: string[], mapper?: (value: string) => string) {
    const items = values.length > 0
      ? values.map((value) => ` - ${mapper ? mapper(value) : value}`).join('\n')
      : '(none)';
    return `${title}: \n${items}`;
  }

  private async buildStatusMessage(commandContext: TelegramCommandContext): Promise<string> {
    const { appInfo, currentThreadId, project, thread } = commandContext;
    const output = [
      `Project Id: ${project?.id || 'N/A'}`,
      `Project Title: ${project?.title || 'N/A'}`,
    ];

    if (!currentThreadId || !thread) {
      return output.join('\n');
    }

    const totalTokens = (thread.metadata?.usage as LanguageModelUsage)?.totalTokens;
    const maxTokens = thread.metadata?.maxTokens as number | undefined;
    const usageRate = totalTokens && maxTokens ? (totalTokens / maxTokens) * 100 : 0;
    const modelId = project?.defaultModelId || thread.metadata?.model as string || appInfo.defaultModel?.model as string;
    const provider = modelId ? await providersManager.getProvider(modelId.split('/')[0]) : undefined;
    const agentId = project?.defaultAgentId || thread.metadata?.agentId as string || appInfo.defaultAgent;
    const agent = await agentManager.getAgent(agentId);
    const tools = [...new Set(project?.defaultTools || thread.metadata?.tools as string[] || agent.tools || [])];
    const subAgents = [...new Set(project?.defaultSubAgents || thread.metadata?.subAgents as string[] || agent.subAgents || [])];

    output.push(`Thread Id: ${currentThreadId}`);
    output.push(`Thread Title: ${thread.title}`);
    output.push(`Workspace: ${project?.path || thread.metadata?.workspace as string || 'N/A'}`);
    output.push(`Status: ${thread.status}`);
    output.push(`Model: ${provider ? provider.name : ''}/${modelId?.split('/')?.slice(1).join('/') || 'N/A'}`);
    output.push(`Usage: ${totalTokens || 'N/A'} ${maxTokens ? `(${usageRate.toFixed(2)}%)` : ''}`);
    output.push(`Agent: ${agentId}`);
    output.push(this.formatToolList('Tools', tools.filter((value) => value.startsWith(ToolType.BUILD_IN)), (value) => value.slice(value.indexOf(':') + 1)));
    output.push(this.formatToolList('Skills', tools.filter((value) => value.startsWith(ToolType.SKILL)), (value) => value.slice(value.indexOf(':') + 1)));
    output.push(this.formatToolList('MCP', tools.filter((value) => value.startsWith(ToolType.MCP)), (value) => value.slice(value.indexOf(':') + 1)));
    output.push(this.formatToolList('Sub Agents', subAgents));

    return output.join('\n');
  }

  private async updateCurrentThreadMetadata(threadId: string, updater: (metadata: Record<string, any>) => Record<string, any>) {
    const thread = await mastraManager.getThread(threadId, true);
    const metadata = updater({ ...(thread.metadata || {}) });
    await mastraManager.updateThread(threadId, {
      id: thread.id,
      resourceId: thread.resourceId,
      title: thread.title,
      metadata,
      updatedAt: new Date(),
      createdAt: thread.createdAt,
    });
    return thread;
  }

  private async updateModelSelection(config: TelegramChannelConfig, modelId: string): Promise<void> {
    if (config.currentProjectId) {
      const project = await projectManager.getProject(config.currentProjectId);
      project.defaultModelId = modelId;
      await projectManager.projectsRepository.save(project);
      return;
    }

    if (config.currentThreadId) {
      await this.updateCurrentThreadMetadata(config.currentThreadId, (metadata) => ({
        ...metadata,
        model: modelId,
      }));
    }
  }

  private async updateToolSelection(toolType: ToolType, config: TelegramChannelConfig, nextTools: string[]): Promise<void> {

    if (config.currentProjectId) {
      const project = await projectManager.getProject(config.currentProjectId);
      project.defaultTools = [...new Set([...nextTools, ...project.defaultTools.filter(x => !x.startsWith(toolType + ":"))])];
      await projectManager.projectsRepository.save(project);
      return;
    }

    if (config.currentThreadId) {
      await this.updateCurrentThreadMetadata(config.currentThreadId, (metadata) => ({
        ...metadata,
        tools: [...new Set([...nextTools, ...(metadata.tools as string[] || []).filter(x => !x.startsWith(toolType + ":"))])],
      }));
    }
  }

  private formatTelegramButtonText(text: string, prefix = '') {
    const maxLength = Math.max(1, TELEGRAM_BUTTON_TEXT_LIMIT - prefix.length);
    const trimmed = text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
    return `${prefix}${trimmed}`;
  }

  private buildProjectsKeyboard(
    projects: { id: string; title: string }[],
    currentProjectId: string | undefined,
    page: number,
  ) {
    const totalPages = Math.max(1, Math.ceil(projects.length / TELEGRAM_PROJECTS_PAGE_SIZE));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);
    const start = safePage * TELEGRAM_PROJECTS_PAGE_SIZE;
    const pageItems = projects.slice(start, start + TELEGRAM_PROJECTS_PAGE_SIZE);

    let keyboard = new InlineKeyboard();
    for (const item of pageItems) {
      const isSelected = currentProjectId === item.id;
      keyboard = keyboard.text(
        this.formatTelegramButtonText(item.title, isSelected ? '✅ ' : ''),
        `toggle:project:${item.id}`,
      ).row();
    }

    if (totalPages > 1) {
      if (safePage > 0) {
        keyboard = keyboard.text('⬅️ Prev', `page:projects:${safePage - 1}`);
      }
      keyboard = keyboard.text(`${safePage + 1}/${totalPages}`, 'page:projects:noop');
      if (safePage < totalPages - 1) {
        keyboard = keyboard.text('Next ➡️', `page:projects:${safePage + 1}`);
      }
    }

    return { keyboard, safePage, totalPages, pageItems };
  }

  private renderProjectsMessage(
    projects: { id: string; title: string }[],
    currentProjectId: string | undefined,
    page: number,
  ) {
    const { keyboard, safePage, totalPages, pageItems } = this.buildProjectsKeyboard(projects, currentProjectId, page);
    const text = [
      '📁 Select a project on focus:',
      `Page: ${safePage + 1}/${totalPages}`,
      pageItems.length === 0 ? 'No projects found.' : 'Tap a project to switch the current focus.',
    ].join('\n');

    return { text, keyboard };
  }

  private buildToolsKeyboard(
    toolType: ToolType,
    availableTools: { id: string; name: string }[],
    selectedTools: string[],
    page: number,
  ) {
    const totalPages = Math.max(1, Math.ceil(availableTools.length / TELEGRAM_TOOLS_PAGE_SIZE));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);
    const start = safePage * TELEGRAM_TOOLS_PAGE_SIZE;
    const pageItems = availableTools.slice(start, start + TELEGRAM_TOOLS_PAGE_SIZE);
    const selectedSet = new Set(selectedTools);

    let keyboard = new InlineKeyboard();
    for (const item of pageItems) {
      const token = this.encodeTelegramToken(item.id);
      const label = this.formatTelegramButtonText(item.name, selectedSet.has(item.id) ? '✅ ' : '');
      keyboard = keyboard.text(label, `toggle:${toolType.toLowerCase()}:${token}:${safePage}`).row();
    }

    if (totalPages > 1) {
      if (safePage > 0) {
        keyboard = keyboard.text('⬅️ Prev', `page:${toolType.toLowerCase()}:${safePage - 1}`);
      }
      keyboard = keyboard.text(`${safePage + 1}/${totalPages}`, `page:${toolType.toLowerCase()}:noop`);
      if (safePage < totalPages - 1) {
        keyboard = keyboard.text('Next ➡️', `page:${toolType.toLowerCase()}:${safePage + 1}`);
      }
    }

    return { keyboard, safePage, totalPages, pageItems };
  }

  private renderToolsMessage(
    toolType: ToolType,
    availableTools: { id: string; name: string }[],
    selectedTools: string[],
    page: number,
  ) {
    const { keyboard, safePage, totalPages, pageItems } = this.buildToolsKeyboard(toolType, availableTools, selectedTools, page);
    const text = [
      '🧰 Select tools for the current session:',
      `Selected: ${selectedTools.length}`,
      `Page: ${safePage + 1}/${totalPages}`,
      pageItems.length === 0 ? 'No tools found.' : 'Tap a tool to enable or disable it.',
    ].join('\n');

    return { text, keyboard };
  }


  executeCommand = async (command: string, text: string, ctx: Context) => {
    const arg = text.startsWith(`/${command} `) ? text.slice(command.length + 1).trim() : undefined;
    const commandContext = await this.buildCommandContext();
    const { appInfo, config, currentProjectId, currentThreadId, project, thread } = commandContext;

    switch (command) {
      case Commands.PROJECTS: {
        const projects = await projectManager.getList({ page: 0, size: 100, filter: arg });
        const items = projects.items.map((item) => ({
          id: item.id,
          title: item.title,
        }));

        if (items.length === 0) {
          await ctx.reply('No projects found.');
          return;
        }

        const { text, keyboard } = this.renderProjectsMessage(items, currentProjectId, 0);
        await ctx.reply(text, {
          reply_markup: keyboard,
        });
        return;
      }
      case Commands.STATUS: {
        const statusMessage = await this.buildStatusMessage(commandContext);
        await ctx.reply(statusMessage, {
          parse_mode: 'Markdown',
        });
        return;
      }
      case Commands.NEW: {
        const agentId = project?.defaultAgentId || appInfo.defaultAgent;
        const agent = await agentManager.getAgent(agentId);
        const threadEntity = await mastraManager.createThread({
          agentId,
          model: project?.defaultModelId || agent.defaultModelId || appInfo.defaultModel?.model as string,
          subAgents: project?.defaultSubAgents || agent.subAgents,
          tools: project?.defaultTools || agent.tools,
          resourceId: currentProjectId ? `project:${currentProjectId}` : undefined,
        });
        config.currentThreadId = threadEntity.id;
        await this.saveChannelConfig(config);
        await ctx.reply('✅ New session has been started.');
        return;
      }
      case Commands.CLEAR:
        if (config.currentThreadId) {
          await mastraManager.clearMessages(config.currentThreadId);
          await ctx.reply('🧹 Current session has been cleared.', {
            reply_markup: { remove_keyboard: true },
          });
        } else {
          await ctx.reply('⚠️ Session does not exist.');
        }
        return;
      case Commands.STOP:
        await mastraManager.chatAbort(config.currentThreadId);
        await ctx.reply('⏹️ Current session has been stopped.');
        return;
      case Commands.COMPACT: {
        const tools = thread?.metadata?.tools as string[] ?? [];
        const subAgents = thread?.metadata?.subAgents as string[] ?? [];
        const model = thread?.metadata?.model as string ?? '';
        await ctx.reply('🗜️ Compacting current session...');
        const result = await mastraManager.chat(undefined, {
          chatId: config.currentThreadId as string,
          model,
          tools,
          subAgents,
          requireToolApproval: false,
          messages: [
            {
              id: nanoid(),
              parts: [{
                type: 'text',
                text: '/compact',
              }],
              role: 'user',
            },
          ],
        });
        if (result.success) {
          await ctx.editMessageText('✅ Current session has been compacted.');
        } else {
          await ctx.editMessageText(`❌ Error: ${result.error}`);
        }
        return;
      }
      case Commands.SETMODEL: {
        const models = await this.getAvailableModels();

        if (models.length === 0) {
          await ctx.reply('No models found.');
          return;
        }

        const currentModel = project?.defaultModelId || thread?.metadata?.model as string || appInfo.defaultModel?.model as string;
        let keyboard = new InlineKeyboard();
        for (const item of models) {
          const token = this.encodeTelegramToken(item.id);
          keyboard = keyboard.text(currentModel === item.id ? `✅ ${item.text}` : item.text, `toggle:model:${token}`).row();
        }

        await ctx.reply('📁 Select a model for the current session:', {
          reply_markup: keyboard,
        });
        return;
      }
      case Commands.SETAGENT: {
        const agents = await agentManager.getList();
        if (agents.length === 0) {
          await ctx.reply('No agents found.');
          return;
        }
        const currentAgent = project?.defaultAgentId || thread?.metadata?.agentId as string || appInfo.defaultAgent;
        let keyboard = new InlineKeyboard();
        for (const item of agents.filter((agentItem) => !agentItem.isHidden)) {
          keyboard = keyboard.text(currentAgent === item.id ? `✅ ${item.name}` : item.name, `toggle:agent:${item.id}`).row();
        }
        await ctx.reply('🤖 Select an agent for the current session:', {
          reply_markup: keyboard,
        });
        return;
      }
      case Commands.SETTOOLS: {
        const availableTools = await this.getAvailableTools(ToolType.BUILD_IN);

        if (availableTools.length === 0) {
          await ctx.reply('No tools found.');
          return;
        }

        const selectedTools = (await this.getCurrentToolSelection(project, thread)).filter(x => x.startsWith(ToolType.BUILD_IN));
        const { text, keyboard } = this.renderToolsMessage(ToolType.BUILD_IN, availableTools, selectedTools, 0);

        await ctx.reply(text, {
          reply_markup: keyboard,
        });
        return;
      }
      case Commands.SETSKILLS: {
        const availableTools = await this.getAvailableTools(ToolType.SKILL);

        if (availableTools.length === 0) {
          await ctx.reply('No tools found.');
          return;
        }

        const selectedTools = (await this.getCurrentToolSelection(project, thread)).filter(x => x.startsWith(ToolType.SKILL));
        const { text, keyboard } = this.renderToolsMessage(ToolType.SKILL, availableTools, selectedTools, 0);

        await ctx.reply(text, {
          reply_markup: keyboard,
        });
        return;
      }
    }
  };

  setCommandCallbackQueryHandler = (bot: Bot) => {
    bot.callbackQuery(/^toggle:project:[A-Za-z0-9]+$/, async (ctx) => {
      await ctx.answerCallbackQuery()
      const projectId = ctx.callbackQuery.data.split(":")[2];
      const project = await projectManager.getProject(projectId);
      const appInfo = await appManager.getInfo();
      const config = await this.getChannelConfig();
      if (!project) {
        await ctx.reply("Project not found.")
        return;
      }
      config.currentProjectId = projectId;
      const threads = await mastraManager.getThreads({ resourceId: `project:${projectId}` });
      let thread;
      if (threads.items.length == 0) {
        const agentEntity = await agentManager.getAgent(project.defaultAgentId);
        // const agent = await agentManager.buildAgent(agentEntity.id);
        thread = await mastraManager.createThread({
          resourceId: `project:${projectId}`,
          agentId: agentEntity.id,
          model: project.defaultAgentId || agentEntity.defaultModelId || appInfo.defaultModel?.model as string,
          tools: agentEntity.tools,
          subAgents: agentEntity.subAgents,
        });
        config.currentThreadId = thread.id;
      } else {
        thread = threads.items[0];
        config.currentThreadId = thread.id;
      }
      await this.saveChannelConfig(config);
      await ctx.reply(`${project.title} has been selected.
Working directory : ${project.path}
Default agent: ${thread.metadata?.agentId}
Default model: ${thread.metadata?.model?.split('/').slice(1).join('/') as string}
`)
    });

    bot.callbackQuery(/^page:projects:(noop|\d+)$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      const value = ctx.callbackQuery.data.split(':')[2];
      if (value === 'noop') {
        return;
      }

      const config = await this.getChannelConfig();
      const projects = await projectManager.getList({ page: 0, size: 100, filter: undefined });
      const items = projects.items.map((item) => ({
        id: item.id,
        title: item.title,
      }));
      const { text, keyboard } = this.renderProjectsMessage(items, config.currentProjectId, Number(value));

      await ctx.editMessageText(text, {
        reply_markup: keyboard,
      });
    });

    bot.callbackQuery(/^toggle:agent:[A-Za-z0-9]+$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      const agentId = ctx.callbackQuery.data.split(":")[2];
      const agent = await agentManager.getAgent(agentId);
      const config = await this.getChannelConfig();
      if (!agent) {
        await ctx.reply("Agent not found.");
        return;
      }
      if (config.currentProjectId) {
        const project = await projectManager.getProject(config.currentProjectId);
        project.defaultAgentId = agentId;
        project.defaultTools = agent.tools;
        project.defaultSubAgents = agent.subAgents;
        await projectManager.projectsRepository.save(project);
      } else {
        const thread = await mastraManager.getThread(config.currentThreadId, true);
        thread.metadata.agentId = agentId;
        await mastraManager.updateThread(config.currentThreadId, {
          id: thread.id,
          resourceId: thread.resourceId,
          title: thread.title,
          metadata: {
            ...thread.metadata,
            agentId: agentId,
            tools: thread.metadata.tools,
            subAgents: thread.metadata.subAgents,
          },
          updatedAt: new Date(),
          createdAt: thread.createdAt,
        });
      }
      await ctx.reply(`${agent.name} has been selected.`);
      return;
    });

    bot.callbackQuery(/^toggle:model:[A-Za-z0-9/]+$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      const token = ctx.callbackQuery.data.split(':')[2];
      const models = await this.getAvailableModels();
      const model = models.find((item) => this.encodeTelegramToken(item.id) === token);
      if (!model) {
        await ctx.reply('Model not found.');
        return;
      }
      const config = await this.getChannelConfig();
      await this.updateModelSelection(config, model.id);
      await ctx.reply(`${model.text} has been selected.`);
    });

    bot.callbackQuery(/^page:build-in:(noop|\d+)$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      const value = ctx.callbackQuery.data.split(':')[2];
      if (value === 'noop') {
        return;
      }

      const commandContext = await this.buildCommandContext();
      const availableTools = await this.getAvailableTools(ToolType.BUILD_IN);
      const selectedTools = (await this.getCurrentToolSelection(commandContext.project, commandContext.thread)).filter(x => x.startsWith(ToolType.BUILD_IN));
      const { text, keyboard } = this.renderToolsMessage(ToolType.BUILD_IN, availableTools, selectedTools, Number(value));

      await ctx.editMessageText(text, {
        reply_markup: keyboard,
      });
    });

    bot.callbackQuery(/^toggle:build-in:[A-Za-z0-9_-]+:\d+$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      const [, , token, pageValue] = ctx.callbackQuery.data.split(':');
      const page = Number(pageValue);
      const commandContext = await this.buildCommandContext();
      const availableTools = await this.getAvailableTools(ToolType.BUILD_IN);
      const tool = availableTools.find((item) => this.encodeTelegramToken(item.id) === token);

      if (!tool) {
        await ctx.reply('Tool not found.');
        return;
      }

      const currentTools = (await this.getCurrentToolSelection(commandContext.project, commandContext.thread)).filter(x => x.startsWith(ToolType.BUILD_IN));
      const nextTools = currentTools.includes(tool.id)
        ? currentTools.filter((item) => item !== tool.id)
        : [...currentTools, tool.id];

      await this.updateToolSelection(ToolType.BUILD_IN, commandContext.config, nextTools);

      const { text, keyboard } = this.renderToolsMessage(ToolType.BUILD_IN, availableTools, nextTools, page);
      await ctx.editMessageText(text, {
        reply_markup: keyboard,
      });
    });

    bot.callbackQuery(/^page:skill:(noop|\d+)$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      const value = ctx.callbackQuery.data.split(':')[2];
      if (value === 'noop') {
        return;
      }
      const commandContext = await this.buildCommandContext();
      const availableSkills = await this.getAvailableTools(ToolType.SKILL);
      const selectedTools = (await this.getCurrentToolSelection(commandContext.project, commandContext.thread)).filter(x => x.startsWith(ToolType.SKILL));
      const { text, keyboard } = this.renderToolsMessage(ToolType.SKILL, availableSkills, selectedTools, Number(value));

      await ctx.editMessageText(text, {
        reply_markup: keyboard,
      });
    });

    bot.callbackQuery(/^toggle:skill:[A-Za-z0-9_-]+:\d+$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      const [, , token, pageValue] = ctx.callbackQuery.data.split(':');
      const page = Number(pageValue);
      const commandContext = await this.buildCommandContext();
      const availableTools = await this.getAvailableTools(ToolType.SKILL);
      const tool = availableTools.find((item) => this.encodeTelegramToken(item.id) === token);

      if (!tool) {
        await ctx.reply('Skill not found.');
        return;
      }

      const currentTools = (await this.getCurrentToolSelection(commandContext.project, commandContext.thread)).filter(x => x.startsWith(ToolType.SKILL));
      const nextTools = currentTools.includes(tool.id)
        ? currentTools.filter((item) => item !== tool.id)
        : [...currentTools, tool.id];

      await this.updateToolSelection(ToolType.BUILD_IN, commandContext.config, nextTools);

      const { text, keyboard } = this.renderToolsMessage(ToolType.SKILL, availableTools, nextTools, page);
      await ctx.editMessageText(text, {
        reply_markup: keyboard,
      });
    });

    bot.callbackQuery(/^aq:[A-Za-z0-9_-]+:\d+:\d+$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      const [, pendingId, qIdxStr, oIdxStr] = ctx.callbackQuery.data.split(':');
      const qIdx = Number(qIdxStr);
      const oIdx = Number(oIdxStr);
      const pending = this.pendingAskQuestions.get(pendingId);
      if (!pending) return;

      const question = pending.questions[qIdx];
      if (!question) return;

      const selected = pending.selections.get(qIdx) ?? new Set<number>();

      if (question.multiSelect) {
        if (selected.has(oIdx)) {
          selected.delete(oIdx);
        } else {
          selected.add(oIdx);
        }
        pending.selections.set(qIdx, selected);

        const keyboard = this.buildAskQuestionKeyboard(pendingId, qIdx, question, selected);
        await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
      } else {
        selected.clear();
        selected.add(oIdx);
        pending.selections.set(qIdx, selected);

        const selectedLabel = question.options[oIdx]?.label ?? '';
        await ctx.editMessageText(
          `🔘 *${question.header}*\n${question.question}\n\n✅ ${selectedLabel}`,
          { parse_mode: 'Markdown' },
        );

        const allAnswered = pending.questions.every(
          (_, i) => (pending.selections.get(i)?.size ?? 0) > 0,
        );
        if (allAnswered) {
          await this.resumeAfterAskQuestion(pending);
        }
      }
    });

    bot.callbackQuery(/^aq:[A-Za-z0-9_-]+:\d+:d$/, async (ctx) => {
      const [, pendingId, qIdxStr] = ctx.callbackQuery.data.split(':');
      const qIdx = Number(qIdxStr);
      const pending = this.pendingAskQuestions.get(pendingId);
      if (!pending) {
        await ctx.answerCallbackQuery();
        return;
      }

      const question = pending.questions[qIdx];
      if (!question) {
        await ctx.answerCallbackQuery();
        return;
      }

      const selected = pending.selections.get(qIdx) ?? new Set<number>();
      if (selected.size === 0) {
        await ctx.answerCallbackQuery({ text: '请至少选择一项', show_alert: true });
        return;
      }
      await ctx.answerCallbackQuery();

      const selectedLabels = [...selected]
        .map(i => question.options[i]?.label)
        .filter(Boolean);
      await ctx.editMessageText(
        `☑️ *${question.header}*\n${question.question}\n\n✅ ${selectedLabels.join(', ')}`,
        { parse_mode: 'Markdown' },
      );

      const allAnswered = pending.questions.every(
        (_, i) => (pending.selections.get(i)?.size ?? 0) > 0,
      );
      if (allAnswered) {
        await this.resumeAfterAskQuestion(pending);
      }
    });

    return bot;
  }



}
