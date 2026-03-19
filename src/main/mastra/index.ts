import { Mastra } from '@mastra/core';
import { getStorage, getVectorStore } from './storage';
import { BaseManager } from '../BaseManager';
import express, { Response, Request } from 'express';
import { appManager } from '../app';
import {
  ChatStatus,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  LanguageModelUsage,
  ModelMessage,
  PrepareStepResult,
  StepResult,
  SystemModelMessage,
  TextPart,
  UIDataTypes,
  UIMessage,
  UITools,
  UserModelMessage,
} from 'ai';
import type {
  LanguageModelV2,
  LanguageModelV2Usage,
  SharedV2ProviderOptions,
} from '@ai-sdk/provider';
import { xai, type XaiProviderOptions } from '@ai-sdk/xai';
import { deepseek, type DeepSeekChatOptions } from '@ai-sdk/deepseek';
import { openai, type OpenAIChatLanguageModelOptions } from '@ai-sdk/openai';
import { google, type GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
// import { toAISdkV5Messages } from '@mastra/ai-sdk';

import { toAISdkFormat, toAISdkStream } from '@mastra/ai-sdk';
// import { RuntimeContext } from '@mastra/core';
import { RequestContext } from '@mastra/core/request-context';
import { providersManager } from '../providers';
import { channel } from '../ipc/IpcController';
import { PaginationInfo } from '@/types/common';
import { MastraChannel } from '@/types/ipc-channel';
import {
  AgentExecutionOptions,
  convertMessages,
  MastraDBMessage,
  MastraLanguageModel,
  MastraMessageContentV2,
  UIMessageWithMetadata,
} from '@mastra/core/agent';
import {
  ChatCallbackEvent,
  ChatChangedType,
  ChatEvent,
  ChatInput,
  ChatRequestContext,
  ChatSlashCommandConfig,
  ChatTask,
  ChatThread,
  ChatTodo,
  DEFAULT_RESOURCE_ID,
  DEFAULT_TITLE,
  ThreadEvent,
  ThreadState,
} from '@/types/chat';
import { nanoid } from '@/utils/nanoid';
import { IpcMainEvent } from 'electron';
import { isObject, isString } from '@/utils/is';
import { toolsManager } from '../tools';
import { ToolType } from '@/types/tool';
import {
  convertMastraChunkToAISDKv5,
  MastraModelOutput,
  //MastraModelOutput,
  WorkflowRunOutput,
} from '@mastra/core/stream';
import { chatWorkflow, claudeCodeWorkflow } from './workflow';
import { StorageThreadType } from '@mastra/core/memory';
import tokenCounter, { countTokens } from '@/main/utils/tokenCounter';
import {
  convertToCoreMessages,
  convertToInstructionContent,
  toAISdkV5Messages,
} from '../utils/convertToCoreMessages';
import compressAgent from './agents/compress-agent';
import { skillManager } from '../tools/common/skill';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { agentManager } from './agents';
import { projectManager } from '../project';
import { Projects } from '@/entities/projects';
import path from 'path';
import fs from 'fs';
import BaseTool, { BaseToolParams } from '../tools/base-tool';
import zodToJsonSchema from 'zod-to-json-schema';
import { getLastMessageIndex } from '../utils/messageUtils';
import { MastraThreadsUsage } from '@/entities/mastra-threads-usage';
import { Repository } from 'typeorm';
import { dbManager } from '../db';
const modelsData = require('../../../assets/models.json');
import { costFromUsage, getTokenCosts } from 'tokenlens';
import bashManager from '../tools/file-system/bash';
import { DefaultAgent } from './agents/default-agent';
import { Agents } from '@/entities/agents';
import { Project } from '@/types/project';
import { TodoWrite } from '../tools/common/todo-write';
import { TaskCreate, TaskList } from '../tools/common/task';
import { MemoryWrite } from '../tools/memory/memory';
import { formatCodeWithLineNumbers } from '../utils/format';
import { getSkills } from '../utils/skills';
import { Agent } from '@/types/agent';
import { WorkflowRunStatus } from '@mastra/core/workflows';


class MastraManager extends BaseManager {
  app: express.Application;
  public httpServer?: ReturnType<express.Application['listen']>;
  mastra: Mastra;
  mastraThreadsUsageRepository: Repository<MastraThreadsUsage>;
  agentsRepository: Repository<Agents>;
  threadChats: (ChatThread & { controller: AbortController })[] = [];

  statefulTransport?: StreamableHTTPServerTransport;
  constructor() {
    super();

    this.app = express();
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ limit: '50mb', extended: true }));

    this.app.use((err, req, res, next) => {
      console.error(err.stack);

      res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error',
      });
    });

    this.mastra = new Mastra({
      agents: {},
      workflows: { claudeCodeWorkflow, chatWorkflow },
      // agents: {
      //   agent,
      //   courseOutlineAgent,
      //   GeneralAgent,
      //   DeepResearchAgent,
      //   GenerateCourseAgent,
      //   famousPersonAgent,
      //   gameAgent,
      // },
      // workflows: { testWorkflow, headsUpWorkflow },
      storage: getStorage(),

      // telemetry: {
      //   enabled: false,
      // },
      // observability: {
      //   // configs: {
      //   //   langsmith: {
      //   //     serviceName: "my-service",
      //   //     exporters: [
      //   //       new LangSmithExporter({
      //   //         apiKey: process.env.LANGSMITH_API_KEY,
      //   //       }),
      //   //     ],
      //   //   },
      //   // },
      // },
      // server: {
      //   port: 8080,
      //   host: '0.0.0.0',
      // },
    });
  }

  async init() {
    this.mastraThreadsUsageRepository =
      dbManager.dataSource.getRepository(MastraThreadsUsage);
    this.agentsRepository = dbManager.dataSource.getRepository(Agents);
    this.statefulTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => nanoid(),
    });

    this.app.get('/auth/callback', async (req, res) => {
      const { code } = req.query;
    });
    this.app.post('/mcp', async (req, res) => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      res.on('close', () => {
        transport.close();
      });

      await toolsManager.mcpServer.connect(transport);

      await transport?.handleRequest(req, res, req.body);
    });
    const { apiServer } = await appManager.getInfo();
    if (apiServer?.enabled) {
      await this.start(apiServer.port);
    }
  }

  public async start(port: number) {
    if (this.httpServer?.listening) return;
    try {
      this.httpServer = this.app.listen(port, '127.0.0.1', () => {
        console.log(`Mastra HTTP Server running on port ${port}`);
      });
    } catch {
      appManager.toast('AIME HTTP Server start failed', { type: 'error' });
    }
  }

  public async restart() {
    await this.close();
    const { apiServer } = await appManager.getInfo();
    if (apiServer?.enabled) {
      await this.start(apiServer.port);
    }
  }

  public async close() {
    if (this.httpServer?.listening) {
      this.httpServer?.close();
      console.log('Mastra HTTP Server closed');
    }
  }

  @channel(MastraChannel.GetThreads)
  public async getThreads({
    page = 0,
    size = 20,
    resourceId = DEFAULT_RESOURCE_ID,
  }: {
    page?: number;
    size?: number;
    resourceId?: string;
  }): Promise<PaginationInfo<StorageThreadType>> {
    const storage = this.mastra.getStorage();
    const memory = await storage.getStore('memory');

    const threads = await memory?.listThreads({
      page: page ?? 0,
      perPage: size || false,
      filter: {
        resourceId: resourceId,
      },
      orderBy: { field: 'updatedAt', direction: 'DESC' },
    });
    return {
      total: threads.total,
      items: threads.threads,
      page: page,
      size: size,
      hasMore: threads.hasMore,
    };
  }

  @channel(MastraChannel.GetThread)
  public async getThread(id: string, onlyThread: boolean = false): Promise<ThreadState> {
    const storage = this.mastra.getStorage();
    const memoryStore = await storage.getStore('memory');
    const appInfo = await appManager.getInfo();
    const thread = await memoryStore?.getThreadById({ threadId: id });
    if (thread.resourceId?.startsWith('project:')) {
      const projectId = thread.resourceId.split(':')[1];
      const project = await projectManager.getProject(projectId);
      thread.metadata = {
        ...(thread.metadata || {}),
        agentId: project?.defaultAgentId || appInfo.defaultAgent,
        model: project?.defaultModelId || appInfo.defaultModel?.model as string,
      }
    }

    // const memory = new Memory({
    //   storage: storage,
    //   options: {
    //     generateTitle: false,
    //     semanticRecall: false,
    //     workingMemory: {
    //       enabled: false,
    //     },
    //     lastMessages: false,
    //   },
    //   vector: getVectorStore(),
    // });
    // const messagesDb = await memory.recall({ threadId: id, resourceId: '123' });

    if (onlyThread) {
      return {
        ...thread,
        status: this.threadChats.find((x) => x.id == id) ? 'streaming' : 'ready',
      };
    }

    const messages = await memoryStore.listMessages({
      threadId: id,
      resourceId: thread?.resourceId || DEFAULT_RESOURCE_ID,
      // format: 'v2',
    });

    const historyMessages = await memoryStore.listMessages({
      threadId: id,
      resourceId: `${thread?.resourceId || DEFAULT_RESOURCE_ID}.history`,
      perPage: 1,

      // format: 'v2',
    });


    // const _messages = convertMessages(messages.messages || []).to('AIV5.UI');

    return {
      ...thread,
      messages: toAISdkV5Messages(messages.messages),
      historyMessagesCount: historyMessages?.total ?? 0,
      // mastraDBMessages: messages.messages,
      status: this.threadChats.find((x) => x.id == id) ? 'streaming' : 'ready',
    };
  }

  @channel(MastraChannel.GetThreadMessages)
  public async getThreadMessages({
    threadId,
    resourceId,
    perPage = 40,
    page = 0,
  }: {
    threadId: string;
    resourceId?: string;
    perPage?: number | false;
    /**
     * Zero-indexed page number for pagination.
     * Defaults to 0 if not specified.
     */
    page?: number;
  }): Promise<{
    total: number;
    hasMore: boolean;
    page: number;
    perPage: number | false;
    messages: UIMessage[];
    mastraDBMessages: MastraDBMessage[];
  }> {
    const storage = this.mastra.getStorage();
    const memoryStore = await storage.getStore('memory');
    const thread = await memoryStore?.getThreadById({ threadId: threadId });
    const messages = await memoryStore.listMessages({
      threadId,
      resourceId: resourceId || thread?.resourceId || DEFAULT_RESOURCE_ID,
      perPage,
      page,
    });
    return {
      total: messages.total,
      hasMore: messages.hasMore,
      page: messages.page,
      perPage: messages.perPage,
      messages: toAISdkV5Messages(messages.messages),
      mastraDBMessages: messages.messages,
    };
  }

  @channel(MastraChannel.CreateThread)
  public async createThread(options?: {
    tools?: string[];
    subAgents?: string[];
    model?: string;
    resourceId?: string;
    agentId?: string;
  }): Promise<StorageThreadType> {
    const storage = this.mastra.getStorage();
    const memoryStore = await storage.getStore('memory');
    let projectId;
    let project;
    let agent: Agent | undefined;
    if (options?.resourceId?.startsWith('project:')) {
      projectId = options.resourceId.split(':')[1];
      project = await projectManager.getProject(projectId);
    }
    const appInfo = await appManager.getInfo();
    const agentId = options?.agentId || project?.defaultAgentId || appInfo.defaultAgent;
    if (agentId) {
      agent = await agentManager.getAgent(agentId);
    }
    const thread = await memoryStore.saveThread({
      thread: {
        id: nanoid(),
        title: DEFAULT_TITLE,
        resourceId: options?.resourceId ?? DEFAULT_RESOURCE_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          ...(options || {}),
          agentId,
          model: options?.model || project?.defaultModelId || agent?.defaultModelId || appInfo.defaultModel?.model as string,
        },
      },
    });
    await appManager.sendEvent(ThreadEvent.ThreadCreated, thread);
    return thread;
  }

  @channel(MastraChannel.UpdateThread)
  public async updateThread(
    id: string,
    data: StorageThreadType,
  ): Promise<StorageThreadType> {
    const storage = this.mastra.getStorage();
    const appInfo = await appManager.getInfo();
    const memoryStore = await storage.getStore('memory');
    // let thread = await this.getThread(id);


    const tools = [...new Set(data?.metadata?.tools as string[] || [])];
    const subAgents = [...new Set(data?.metadata?.subAgents as string[] || [])];


    let thread = await memoryStore.getThreadById({ threadId: id });
    const oldTitle = thread.title || DEFAULT_TITLE;
    thread = await memoryStore.updateThread({
      id: id,
      title: data?.title || DEFAULT_TITLE,
      metadata: { ...(data?.metadata || {}), tools, subAgents },

    });


    if (thread.resourceId.startsWith('project:')) {
      const projectId = thread.resourceId.split(':')[1];
      const project = await projectManager.projectsRepository.findOne({
        where: { id: projectId },
      });
      if (project) {
        project.defaultAgentId = data.metadata?.agentId as string || appInfo.defaultAgent;
        const agent = await agentManager.getAgent(project.defaultAgentId);
        project.defaultModelId = data.metadata?.model as string || agent?.defaultModelId || appInfo.defaultModel?.model as string;
        project.defaultTools = [...new Set(data.metadata?.tools as string[] || [])];
        project.defaultSubAgents = [...new Set(data.metadata?.subAgents as string[] || [])];
        await projectManager.projectsRepository.save(project);
      }
    } else {

    }

    if (oldTitle !== data.title) {
      appManager.sendEvent(ChatEvent.ChatChanged, {
        data: {
          type: ChatChangedType.TitleUpdated,
          chatId: id,
          title: data.title,
        },
      });
    }
    return thread;
  }

  @channel(MastraChannel.DeleteThread)
  public async deleteThread(id: string): Promise<void> {
    const storage = this.mastra.getStorage();
    const memoryStore = await storage.getStore('memory');
    const thread = await memoryStore.getThreadById({ threadId: id });
    await memoryStore.deleteThread({ threadId: id });
    const workspace = thread.metadata?.workspace as string;
    if (workspace) {
      if (fs.existsSync(workspace) && fs.statSync(workspace).isDirectory()) {
        const entries = fs.readdirSync(workspace, { withFileTypes: true });
        const files = entries.filter((e) => e.isFile()).length;
        const dirs = entries.filter((e) => e.isDirectory()).length;
        if (files === 0 && dirs === 0) {
          fs.rmdirSync(workspace, { recursive: true });
        }
      }
    }
  }

  @channel(MastraChannel.ClearMessages)
  public async clearMessages(id: string): Promise<void> {
    const storage = this.mastra.getStorage();
    const memoryStore = await storage.getStore('memory');
    const messages = await memoryStore.listMessages({ threadId: id });
    await memoryStore.deleteMessages(messages.messages.map((x) => x.id));
    const thread = await memoryStore.getThreadById({ threadId: id });
    await memoryStore.updateThread({
      id: id,
      title: thread.title,
      metadata: {
        ...(thread.metadata || {}),
        tasks: [],
        todos: [],
        skillsLoaded: [],
        usage: {},
      },
    });
    appManager.sendEvent(ChatEvent.ChatThreadChanged, {
      data: { chatId: id, resourceId: thread.resourceId || DEFAULT_RESOURCE_ID },
    });
    appManager.sendEvent(ChatEvent.ChatMessageChanged, {
      data: { chatId: id, resourceId: thread.resourceId || DEFAULT_RESOURCE_ID },
    });
  }

  @channel(MastraChannel.Chat, { mode: 'on' })
  public async chat(event: IpcMainEvent, data: ChatInput, callback?: ChatCallbackEvent): Promise<{
    success: boolean;
    aborted?: boolean;
    status?: WorkflowRunStatus;
    error?: string | undefined;
    runId?: string;
    messages?: MastraDBMessage[];
  }> {
    let {
      agentId,
      messageId,
      trigger,
      projectId,
      messages: uiMessages,
      webSearch,
      think,
      tools = [],
      subAgents = [],
      runId,
      chatId,
      options,
      requireToolApproval,
      approved,
      toolCallId,
      resumeData,
    } = data;
    let { model } = data;
    console.log('Chat Input', data);
    const storage = this.mastra.getStorage();

    let resourceId = DEFAULT_RESOURCE_ID;
    const memoryStore = await storage.getStore('memory');
    let currentThread = await memoryStore.getThreadById({ threadId: chatId });

    let project: Project | undefined;
    if (!projectId) {
      projectId = currentThread?.resourceId?.startsWith('project:') ? currentThread.resourceId.split(':')[1] : undefined;
    }
    if (projectId) {
      project = await projectManager.getProject(projectId);
      if (project) {
        resourceId = `project:${project?.id}`;
      }
    }
    const appInfo = await appManager.getInfo();



    // for (const uiMessage of uiMessages) {
    //   delete uiMessage.id;
    // }
    const fastModel = appInfo?.defaultModel?.fastModel;
    const fastLanguageModel = (await providersManager.getLanguageModel(
      fastModel || model,
    )) as LanguageModelV2;

    const inputMessage = uiMessages[uiMessages.length - 1];

    if (!model) {
      const _agentId = agentId ?? DefaultAgent.agentName;
      const agentEntity = await this.agentsRepository.findOne({
        where: { id: _agentId },
      });
      model =
        agentEntity?.defaultModelId ||
        (await appManager.getInfo())?.defaultModel?.model;
    }

    const provider = await providersManager.get(model.split('/')[0]);
    if (!provider) {
      throw new Error('Provider not found');
    }

    const { providerId, modelId, providerType, modelInfo } =
      await providersManager.getModelInfo(model);

    let stream: MastraModelOutput<unknown>;
    let agent: Agent;
    try {
      // const info = modelsData[provider.type]?.models[_modeId] || {};
      const workspace =
        project?.path ?? path.join(appInfo.userData, 'threads', chatId);

      fs.mkdirSync(workspace, { recursive: true });

      currentThread = await memoryStore.updateThread({
        id: chatId,
        title: currentThread.title,
        metadata: {
          ...(currentThread.metadata || {}),
          tools: tools,
          subAgents,
          agentId: agentId,
          model: model,
          modelId: `${providerType}:${modelId}`,
          requireToolApproval,
          workspace,
          think,
        },
      });
      appManager.sendEvent(`chat:event:${chatId}`, {
        type: ChatEvent.ChatThreadChanged,
        data: {},
      });
      const todos: ChatTodo[] =
        (currentThread.metadata?.todos as ChatTodo[]) || [];
      const tasks: ChatTask[] =
        (currentThread.metadata?.tasks as ChatTask[]) || [];
      const skillsLoaded: string[] =
        (currentThread.metadata?.skillsLoaded as string[]) || [];
      const fileLastReadTime: Record<string, number> =
        (currentThread.metadata?.fileLastReadTime as Record<string, number>) || {};
      const usage: LanguageModelUsage =
        currentThread.metadata?.usage as LanguageModelUsage ?? {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          reasoningTokens: 0,
          cachedInputTokens: 0,
        };
      const requestContext = new RequestContext<ChatRequestContext>();
      requestContext.set('skillsLoaded', skillsLoaded);
      requestContext.set('model', model);
      requestContext.set('threadId', chatId);
      requestContext.set('tools', tools);
      requestContext.set('subAgents', subAgents);
      requestContext.set('agentId', agentId);
      requestContext.set('projectId', project?.id);
      requestContext.set('resourceId', resourceId);
      requestContext.set('workspace', workspace);
      requestContext.set('think', think);
      requestContext.set('todos', todos);
      requestContext.set('tasks', tasks);
      requestContext.set('fileLastReadTime', fileLastReadTime);
      requestContext.set('compressedMessage', undefined);
      requestContext.set(
        'maxContextSize',
        modelInfo?.limit?.context ?? 64 * 1000,
      );
      requestContext.set('usage', usage);



      agent = await agentManager.buildAgent(agentId, {
        modelId: model,
        tools: tools,
        subAgents: subAgents,
        requestContext,
      });
      // const thread = await this.mastra.getStorage().getThreadById({ threadId });

      // const messages = convertToModelMessages(uiMessages);
      // const recentMessage = agent.getMostRecentUserMessage(uiMessages);
      const controller = new AbortController();
      const signal = controller.signal;

      const historyMessages = await memoryStore.listMessages({
        threadId: chatId,
        resourceId: resourceId,
      });

      const historyMessagesAISdkV5 = toAISdkV5Messages(
        historyMessages.messages,
      );

      // historyMessages.messages;
      const input = [...historyMessagesAISdkV5, inputMessage];

      const messages = convertToModelMessages(historyMessagesAISdkV5);

      // inputMessage.metadata = {
      //   createdAt: new Date(),
      // };

      const providerOptions: AgentExecutionOptions['providerOptions'] = {
        zhipuai: {
          thinking: {
            type: think ? 'enabled' : 'disabled',
          },
        },
        openai: {
          store: true,
          reasoningEffort: think ? appInfo.defaultThink : undefined,
          include: [
            'reasoning.encrypted_content',
            ...(webSearch ? ['web_search_call.action.sources'] : []),
          ],
        } as OpenAIChatLanguageModelOptions,
        deepseek: {
          thinking: {
            type: think ? 'enabled' : 'disabled',
          },
        } as DeepSeekChatOptions,
        google: {
          thinkingConfig: {
            thinkingLevel: think ? appInfo.defaultThink : undefined,
            includeThoughts: true,
          },
        } as GoogleGenerativeAIProviderOptions,
        xai: {
          reasoningEffort: think ? (appInfo.defaultThink == 'low' ? 'low' : 'high') : undefined
        } as XaiProviderOptions,
      };
      let streamOptions: AgentExecutionOptions<undefined> = {
        includeRawChunks: false,
        structuredOutput: undefined,
        runId: runId,
        providerOptions: providerOptions,
        modelSettings: options?.modelSettings,
        requestContext: requestContext,
        context: convertToModelMessages(historyMessagesAISdkV5),
        maxSteps: 1,
        memory: {
          thread: {
            id: chatId,
          },
          resource: resourceId,
          options: {
            readOnly: false,
            lastMessages: false,
          },
          // readOnly: false,
        },
        abortSignal: signal,
        savePerStep: true,
        onAbort: (event) => {
          const { steps } = event;
          console.log('Stream aborted after', steps.length, 'steps');
        },
        onIterationComplete: ({ iteration, toolCalls, text }) => {
          console.log('onIterationComplete', iteration, toolCalls, text);
        },
        onFinish: async (event) => {
          const { steps, usage, response, reasoning } = event;
          // const reasoningText = await stream.reasoningText;
          console.log('Stream finished after', steps.length, 'steps');
          console.log('stream usage:', usage);
        },

        onStepFinish: async (event) => {
          //storage.saveMessages();
          const { usage, response, text, reasoning } = event;

          const maxContextSize = requestContext.get('maxContextSize');
          await callback?.onUsage?.(usage, maxContextSize);
          requestContext.set('usage' as never, usage as never);
          const usageRate = (usage?.totalTokens / maxContextSize) * 100;
          console.log('usage rate: ' + usageRate.toFixed(2) + '%', usage);

          appManager.sendEvent(`chat:event:${chatId}`, {
            type: ChatEvent.ChatUsage,
            data: {
              usage,
              usageRate: Math.round(usageRate * 100) / 100,
              modelId: `${providerType}:${modelId}`,
              maxTokens: maxContextSize,
            },
          });
          currentThread = await memoryStore.getThreadById({ threadId: chatId });
          currentThread = await memoryStore.updateThread({
            id: chatId,
            title: currentThread.title,
            metadata: {
              ...(currentThread.metadata || {}),
              usage,
              maxTokens: maxContextSize,
              model,
              modelId: `${providerType}:${modelId}`,
            },
          });
        },
        onError: async ({ error }: { error: Error | string }) => {
          console.error(error);
          let errMsg = 'Unknown error';
          if (isString(error)) {
            errMsg = error;
          } else {
            errMsg = error?.message || error?.name;
          }

          appManager.sendEvent(`chat:event:${chatId}`, {
            type: ChatEvent.ChatError,
            data: errMsg,
          });
          await callback?.onError?.(errMsg);
        },
        onChunk: async (chunk) => {
          // console.log('Stream chunk:', chunk);
          if (chunk.type == 'text-delta') {
            const textDelta = chunk.payload.text;
            const _chunks = requestContext.get('chunks') ?? {
              runId: chunk.runId,
              text: textDelta,
            };
            if (chunk.runId == _chunks.runId) {
              _chunks.text += textDelta;
            } else {
              _chunks.runId = chunk.runId;
              _chunks.text = textDelta;
            }
            await callback?.onChunk?.(textDelta);
            requestContext.set('chunks', _chunks);
          } else {
            requestContext.set('chunks', undefined);
          }
        },
        requireToolApproval: requireToolApproval,

      };
      appManager.sendEvent(`chat:event:${chatId}`, {
        type: ChatEvent.ChatChanged,
        data: { type: ChatChangedType.Start, chatId, resourceId },
      });
      appManager.sendEvent(ChatEvent.ChatChanged, {
        data: { type: ChatChangedType.Start, chatId, resourceId },
      });
      this.threadChats.push({
        id: chatId,
        title: 'string',
        status: 'streaming',
        controller,
      });
      let _inputMessage = inputMessage;
      let resume = toolCallId
        ? {
          toolCallId,
          approved,
          resumeData,
        }
        : undefined;
      while (true) {
        const historyMessages = await memoryStore.listMessages({
          threadId: chatId,
          resourceId: resourceId,
        });
        const historyMessagesAISdkV5 = toAISdkV5Messages(
          historyMessages.messages,
        );
        let input = [...historyMessagesAISdkV5];
        if (_inputMessage) input.push(_inputMessage);

        const messages = convertToModelMessages(historyMessagesAISdkV5);
        const maxContextSize = requestContext.get('maxContextSize');
        const thresholdTokenCount = Math.floor(maxContextSize * 0.7);
        const _tools = await agent.listTools({ requestContext });
        const instructions = await agent.getInstructions({
          requestContext,
        });
        const system = await convertToInstructionContent(instructions);

        let slashCommand;
        const slashCommands = ChatSlashCommandConfig.map(x => x.id)
        if (_inputMessage && _inputMessage.role == 'user' && _inputMessage.parts.length == 1) {
          slashCommand = slashCommands.find(x => _inputMessage.parts[0].text.startsWith("/" + x))
        }






        const { compressedMessage, keepMessages, hasCompressed } =
          await this.compressMessages(
            [
              { role: 'system', content: system } as SystemModelMessage,
              ...messages,
            ],
            _tools,
            {
              abortSignal: streamOptions.abortSignal,
              thresholdTokenCount,
              requestContext,
              force: slashCommand == 'compact',
              disableKeepMessage: true,
              model: fastLanguageModel,
            },
          );
        if (hasCompressed) {
          const compressedMessageText = compressedMessage.content?.find(x => x.type == 'text')?.text;
          if (compressedMessageText) {
            requestContext.set('compressedMessage', compressedMessageText);
          }

        }

        const bashSessions = bashManager.getBashSessions(chatId);
        if (bashSessions.length > 0) {
          const systemReminder = [];
          for (const bashSession of bashSessions) {
            if (bashManager.hasUpdate(bashSession.bashId)) {
              const reminder = `Background Bash ${bashSession.bashId} (command: ${bashSession.command}) (status: ${bashSession.isExited ? 'exited' : 'running'}) Has new output available. You can check its output using the BashOutput tool.`;
              systemReminder.push(reminder);
            }
          }
          if (systemReminder.length > 0) {
            input[input.length - 1].parts.push({
              type: 'text',
              text: `<system-reminder>\n${systemReminder.join('\n')}\n</system-reminder>`,
            });
          }
        }

        delete streamOptions.context;

        let injectedMessages = [];
        // 注入消息
        // if (hasCompressed || input.length == 1 && input[0].role == 'user') {
        //   injectedMessages = await this.getInjectMessages(requestContext, hasCompressed);
        // }
        injectedMessages = await this.getInjectMessages(requestContext, hasCompressed);
        if (hasCompressed) {
          input = [{
            id: nanoid(),
            threadId: chatId,
            resourceId: resourceId,
            role: 'user',
            content: {
              format: 2,
              parts: [],
              metadata: {
                compressed: true,
              },
            },
            type: 'v2',
            createdAt: new Date(),
          } as MastraDBMessage];


          if (injectedMessages.length > 0) {
            input[0].content.parts.unshift(...injectedMessages);
            input[0].content.metadata["injectMessage"] = true;
          }
          await memoryStore.updateMessages({
            messages: historyMessages.messages.map((x) => {
              return {
                id: x.id,
                resourceId: x.resourceId + '.history',
              };
            }),
          });
        } else {
          if (injectedMessages.length > 0) {
            const injectIndex = input.findIndex(x => x.metadata?.injectMessage === true);
            if (injectIndex >= 0) {
              input[injectIndex].parts = [...injectedMessages];
            } else {
              input = [{
                id: nanoid(),
                threadId: chatId,
                resourceId: resourceId,
                role: 'user',
                content: {
                  format: 2,
                  parts: [...injectedMessages],
                  metadata: {
                    injectMessage: true,
                  },
                },
                type: 'v2',
                createdAt: new Date(),
              } as MastraDBMessage, ...input]
            }

            //input[0].parts.unshift(...injectedMessages);
          }
        }





        stream = await this.nextStep(
          agent,
          input,
          streamOptions,
          resume,
          callback,
        );

        if (stream.status == 'success') {
          const content = await stream.content;
          if (content.length == 0) {
            throw new Error('No content returned');
          }
        }


        tools = requestContext.get('tools') as string[];
        const skillsLoaded = requestContext.get('skillsLoaded') as string[] || [];
        const tasks = requestContext.get('tasks') as ChatTask[] || [];
        const fileLastReadTime = requestContext.get('fileLastReadTime') as Record<string, number> || {};
        await callback?.onPlanUpdate?.(tasks);

        currentThread = await memoryStore.updateThread({
          id: chatId,
          title: currentThread.title,
          metadata: {
            ...(currentThread.metadata || {}),
            tasks,
            tools: tools,
            skillsLoaded: skillsLoaded,
            fileLastReadTime: fileLastReadTime,
          },
        });
        appManager.sendEvent(`chat:event:${chatId}`, {
          type: ChatEvent.ChatThreadChanged,
          data: {},
        });


        agent = await agentManager.buildAgent(agentId, {
          modelId: model,
          tools: tools,
          subAgents: subAgents,
          requestContext,
        });


        const core = stream.messageList.get.all.core();
        const db = stream.messageList.get.all.db();
        const ui = stream.messageList.get.all.ui();

        if (stream.status == 'suspended') {
          break;
        } else if (stream.status == 'success') {
          // const reasoningText = await stream.reasoningText;
          // if (reasoningText) {
          //   const index = await getLastMessageIndex(db, 'assistant');
          //   if (index > 0) {
          //     const reasoningPart = db[index].content.parts.find(
          //       (x) => x.type === 'reasoning' && !x.reasoning,
          //     );
          //     reasoningPart.reasoning = reasoningText;
          //     await memoryStore.updateMessages({ messages: [...db] });
          //   }
          // }

          await this.saveThreadUsage(
            chatId,
            resourceId,
            stream.usage,
            `${providerType}:${modelId}`,
          );
          const lastMessage = core[core.length - 1];
          if (lastMessage.role == 'tool') {
          } else if (lastMessage.role == 'assistant') {
            break;
          }
        }
        _inputMessage = undefined;
        resume = undefined;

        if (streamOptions.abortSignal.aborted) {
          break;
        }
        if (stream.error) {
          throw stream.error;
        }
      }
      if (streamOptions.abortSignal.aborted) {
        const chunks = requestContext.get('chunks');
        const persisted = stream.messageList.getPersisted.input.db();
        const db = stream.messageList.get.input.db();
        // const core = stream.messageList.get.input.core();
        let messages: MastraDBMessage[] = [];
        const parts = [];
        if (chunks?.text) {
          parts.push({ type: 'text', text: chunks?.text });
        }
        parts.push({ type: 'text', text: `[Request interrupted by user]` });
        messages.push({
          id: chunks?.runId ?? nanoid(),
          role: 'assistant',
          threadId: chatId,
          resourceId: resourceId,
          type: 'v2',
          createdAt: new Date(),
          content: {
            format: 2,
            parts: parts,
            metadata: {
              aborted: true,
            },
          },
        });
        requestContext.set('chunks', undefined);
        // await memoryStore.saveMessages({ messages: [...db, ...messages] });
        await memoryStore.saveMessages({ messages: [...messages] });
      }
      return {
        success: true,
        status: stream.status,
        aborted: streamOptions.abortSignal.aborted,
        runId: stream.runId,
        messages: stream.messageList.get.all.db()
      }
    } catch (err) {
      console.error(err);
      appManager.sendEvent(`chat:event:${chatId}`, {
        type: ChatEvent.ChatError,
        data: err?.message || 'Unknown error',
      });
      return {
        success: false,
        error: err?.message || 'Unknown error',
        status: stream?.status,
      }
    } finally {
      appManager.sendEvent(`chat:event:${chatId}`, {
        type: ChatEvent.ChatChanged,
        data: { type: ChatChangedType.Finish, chatId },
      });
      appManager.sendEvent(ChatEvent.ChatChanged, {
        data: { type: ChatChangedType.Finish, chatId, resourceId },
      });
      this.threadChats = this.threadChats.filter((chat) => chat.id !== chatId);

      currentThread = await memoryStore.getThreadById({ threadId: chatId });
      if (currentThread.title == DEFAULT_TITLE) {
        try {
          const title = await agent.genTitle(
            inputMessage,
            undefined,
            undefined,
            fastLanguageModel,
          );
          currentThread = await memoryStore.updateThread({
            id: chatId,
            title: title.replaceAll('\n', '').trim(),
            metadata: currentThread.metadata,
          });

          await callback?.onThreadChanged?.({
            id: chatId,
            title: title.replaceAll('\n', '').trim(),
            status: 'idle',
          });

          appManager.sendEvent(ChatEvent.ChatChanged, {
            data: { type: ChatChangedType.TitleUpdated, chatId, title },
          });

          appManager.sendEvent(`chat:event:${chatId}`, {
            type: ChatEvent.ChatChanged,
            data: { type: ChatChangedType.TitleUpdated, chatId, title },
          });
        } catch (err) {


          console.error(err)
        }

      }

    }

    // const response = createUIMessageStreamResponse({ stream: stream_2 });
  }

  public async nextStep(
    agent: Agent,
    inputMessage:
      | UIMessageWithMetadata
      | UIMessage<unknown, UIDataTypes, UITools>,
    streamOptions: AgentExecutionOptions,
    resume?: {
      toolCallId?: string;
      approved?: boolean;
      resumeData?: Record<string, any>;
    },
    callback?: ChatCallbackEvent,
  ) {
    const chatId = streamOptions.requestContext.get(
      'threadId' as never,
    ) as string;
    const runId = streamOptions.runId;
    let stream: MastraModelOutput<unknown>;
    await appManager.refreshPreventSleep();
    if (
      runId &&
      resume?.toolCallId &&
      (resume?.approved !== undefined || resume?.resumeData !== undefined)
    ) {
      if (resume?.approved === true) {
        stream = await agent.approveToolCall({
          ...streamOptions,
          runId: runId,
          toolCallId: resume?.toolCallId,
        });
      } else if (resume?.approved === false) {
        stream = await agent.declineToolCall({
          ...streamOptions,
          runId: runId,
          toolCallId: resume?.toolCallId,
        });
      } else {
        stream = await agent.resumeStream(
          { ...resume?.resumeData },
          {
            ...streamOptions,
            runId: runId,
            toolCallId: resume?.toolCallId,
          },
        );
      }
    } else {
      console.log(inputMessage);
      stream = await agent.stream(inputMessage, streamOptions);
    }
    const uiStream = toAISdkStream(stream, {
      from: 'agent',
      sendReasoning: true,
      sendStart: false,
      sendFinish: false,
      // lastMessageId: inputMessage[inputMessage.length - 1].id,
    });

    const uiStreamReader = uiStream.getReader();
    while (true) {
      const { done, value } = await uiStreamReader.read();
      if (done) {
        break;
      }
      if (value.type == 'reasoning-delta') {
        await callback?.onThought?.(value.delta);
      }

      if (value.type == 'tool-input-available') {
        await callback?.onToolCall?.({
          toolName: value.toolName,
          toolCallId: value.toolCallId,
          input: value.input,
        });
      }
      if (value.type == 'tool-output-available') {
        await callback?.onToolCallUpdate?.({
          toolCallId: value.toolCallId,
          output: value.output,
        }, 'completed');
      }
      if (value.type == 'tool-output-error') {
        await callback?.onToolCallUpdate?.({
          toolCallId: value.toolCallId,
          output: value.errorText,
        }, 'failed');
      }
      if (value.type == 'text-start') {
        await callback?.onStart?.();
      }
      if (value.type == 'text-end') {
        await callback?.onEnd?.();
      }



      console.log('Stream chunk:', value);

      appManager.sendEvent(`chat:event:${chatId}`, {
        type: ChatEvent.ChatChunk,
        data: JSON.stringify(value),
      });
    }

    // appManager.sendEvent(`chat:event:${chatId}`, {
    //   type: ChatEvent.ChatStepFinish,
    //   data: undefined,
    // });
    return stream;
  }


  public async getInjectMessages(requestContext: RequestContext<ChatRequestContext>, hasCompressed: boolean = false) {

    const injectedMessages = [];

    const workspace = requestContext.get('workspace');
    const tools = requestContext.get('tools') ?? [];
    const skillsLoaded = requestContext.get('skillsLoaded') ?? [];


    // 注入已载入的技能, 只有当hasCompressed为true时才注入
    if (hasCompressed == true && skillsLoaded.length > 0) {
      let text = `<system-reminder>\nThe following skills were invoked in this session. Continue to follow these guidelines:\n`;
      for (const skillId of skillsLoaded) {
        const skill = await skillManager.getSkill(skillId as `${ToolType.SKILL}:${string}`)
        if (skill) {
          text += `### Skill: ${skill.id}
Base directory for this skill:  ${skill.path}

${skill.content}

`;
        }
      }
      text += `\n</system-reminder>`;
      injectedMessages.push({
        type: 'text',
        text: text,
      });
    }




    // 注入Skills元数据
    let _skills = [];

    for (const tool of tools.filter((x) =>
      x.startsWith(`${ToolType.SKILL}:`),
    )) {
      const skill = await skillManager.getSkill(
        tool as `${ToolType.SKILL}:${string}`,
      );
      if (skill) {
        _skills.push(skill);
      }
    }

    if (
      workspace &&
      fs.existsSync(workspace) &&
      fs.statSync(workspace).isDirectory()
    ) {
      const skillsPath = path.join(workspace, '.aime-chat', 'skills');
      if (fs.existsSync(skillsPath) && fs.statSync(skillsPath).isDirectory()) {
        // const skills = await fs.promises.readdir(skillsPath);
        const skills = await getSkills(skillsPath);
        for (const skill of skills) {
          if (_skills.map((x) => x.id).includes(skill.id)) {
            _skills = _skills.filter((x) => x.id !== skill.id);
          }
          _skills.push(skill);
        }
      }
    }

    if (_skills.length > 0) {
      injectedMessages.push({
        type: 'text',
        text: `<system-reminder>
The following skills are available for use with the Skill tool:

${_skills.map((x) => `- ${x.id}: ${x.description}`).join('\n')}

</system-reminder>`,
      });
    }

    // 注入tasks, 只有当hasCompressed为true时才注入
    // const tasks = requestContext.get('tasks') ?? [];
    // if (
    //   tools.includes(`${ToolType.BUILD_IN}:${TaskList.toolName}`)
    // ) {
    //   if (hasCompressed == true && tasks && tasks.length > 0) {
    //     injectedMessages.push({
    //       type: 'text',
    //       text: `<system-reminder>\nYour todo list has changed. DO NOT mention this explicitly to the user. Here are the latest contents of your todo list:\n\n${JSON.stringify(tasks)}. Continue on with the tasks at hand if applicable.\n</system-reminder>`,
    //     });
    //   }
    // }


    // 注入AGENTS.md 和 MEMORY.md
    const agentsMdPath = path.join(workspace, `AGENTS.md`);
    const memoryMdPath = path.join(workspace, '.aime-chat', 'memory', `MEMORY.md`);
    let agentsMd = '';
    let memoryMd = '';
    if (fs.existsSync(agentsMdPath) && fs.statSync(agentsMdPath).isFile()) {
      agentsMd = (await fs.promises.readFile(agentsMdPath, 'utf-8')).trim();
    }
    if (fs.existsSync(memoryMdPath) && fs.statSync(memoryMdPath).isFile()) {
      memoryMd = (await fs.promises.readFile(memoryMdPath, 'utf-8')).trim();
    }

    const commandContext = `<system-reminder>
As you answer the user's questions, you can use the following context:
${agentsMd}

${memoryMd ? `Contents of ${memoryMdPath.replaceAll('\\', '/')} (user's auto-memory, persists across conversations):
${memoryMd.split('\n').slice(0, 200).join('\n')}
`: ''}
# currentDate
Today's date is ${new Date().toISOString().split('T')[0]}.

IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.
</system-reminder>`;
    injectedMessages.push({
      type: 'text',
      text: commandContext,
    });

    // 注入压缩消息
    const compressedMessage = requestContext.get('compressedMessage');
    if (compressedMessage) {
      injectedMessages.push({
        type: 'text',
        text: `This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.

${compressedMessage}`,
      });
      requestContext.set('compressedMessage', undefined);
    }



    return injectedMessages;
  }







  @channel(MastraChannel.ChatAbort)
  public async chatAbort(chatId: string): Promise<void> {
    console.info('chatAbort', chatId);
    this.threadChats.find((chat) => chat.id === chatId)?.controller?.abort();
  }
  @channel(MastraChannel.SaveMessages)
  public async saveMessages(
    chatId: string,
    messages: MastraDBMessage[],
  ): Promise<void> {
    const storage = this.mastra.getStorage();

    const memoryStore = await storage.getStore('memory');
    await memoryStore.saveMessages({
      messages: messages,
    });
  }

  public async compressMessages(
    messages: ModelMessage[],
    tools: Record<string, BaseTool<BaseToolParams>>,
    options: {
      abortSignal?: AbortSignal,
      requestContext?: RequestContext<ChatRequestContext>;
      thresholdTokenCount?: number;
      force?: boolean;
      disableKeepMessage?: boolean;
      model: LanguageModelV2;
    },
  ): Promise<{
    compressedMessage?: ModelMessage;
    keepMessages: ModelMessage[];
    hasCompressed: boolean;
  }> {
    let tokenCount = await tokenCounter(messages);

    for (const tool of Object.values(tools)) {
      const inputSchema = zodToJsonSchema(tool.inputSchema);
      tokenCount += countTokens(
        tool.id + '\n' + tool.description + '\n' + JSON.stringify(inputSchema),
      );
    }
    const maxContextSize = options.requestContext.get('maxContextSize');
    const usage = options.requestContext.get('usage');
    tokenCount = Math.max(tokenCount, usage?.totalTokens ?? 0);
    if (
      options.thresholdTokenCount &&
      tokenCount < options.thresholdTokenCount &&
      !options.force
    ) {
      console.log('Not Compress Now: ' + ((tokenCount / maxContextSize) * 100).toFixed(2) + '% ' + 'Total Tokens: ' + tokenCount + ' Max Size: ' + maxContextSize);
      return { keepMessages: messages, hasCompressed: false };
    }
    console.log('Compress starting: Current TokenCount:', tokenCount);
    const chatId = options.requestContext.get('threadId' as never) as string;
    appManager.sendEvent(`chat:event:${chatId}`, {
      type: ChatEvent.ChatChunk,
      data: JSON.stringify({
        type: 'data-compress-start',
      }),
    });
    const systemMessage = messages.find((x) => x.role === 'system');

    let lastAssistantIndex = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        lastAssistantIndex = i;
        break;
      }
    }
    let summaryMessages = [];
    let keepMessages = [];
    if (lastAssistantIndex > 0 && !options.disableKeepMessage) {
      summaryMessages = messages.slice(0, lastAssistantIndex);
      keepMessages = messages.slice(lastAssistantIndex);
    } else {
      summaryMessages = messages;
      keepMessages = [];
    }

    const inputMessages = summaryMessages.filter((x) => x.role !== 'system');
    compressAgent.model = options.model;

    try {
      const response = await compressAgent.generate([
        ...inputMessages,
        {
          role: 'user',
          content: `Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and your previous actions.
This summary should be thorough in capturing technical details, code patterns, and architectural decisions that would be essential for continuing development work without losing context.

Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts and ensure you've covered all necessary points. In your analysis process:

1. Chronologically analyze each message and section of the conversation. For each section thoroughly identify:
   - The user's explicit requests and intents
   - Your approach to addressing the user's requests
   - Key decisions, technical concepts and code patterns
   - Specific details like:
     - file names
     - full code snippets
     - function signatures
     - file edits
   - Errors that you ran into and how you fixed them
   - Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
2. Double-check for technical accuracy and completeness, addressing each required element thoroughly.

Your summary should include the following sections:

1. Primary Request and Intent: Capture all of the user's explicit requests and intents in detail
2. Key Technical Concepts: List all important technical concepts, technologies, and frameworks discussed.
3. Files and Code Sections: Enumerate specific files and code sections examined, modified, or created. Pay special attention to the most recent messages and include full code snippets where applicable and include a summary of why this file read or edit is important.
4. Errors and fixes: List all errors that you ran into, and how you fixed them. Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
5. Problem Solving: Document problems solved and any ongoing troubleshooting efforts.
6. All user messages: List ALL user messages that are not tool results. These are critical for understanding the users' feedback and changing intent.
7. Pending Tasks: Outline any pending tasks that you have explicitly been asked to work on.
8. Current Work: Describe in detail precisely what was being worked on immediately before this summary request, paying special attention to the most recent messages from both user and assistant. Include file names and code snippets where applicable.
9. Optional Next Step: List the next step that you will take that is related to the most recent work you were doing. IMPORTANT: ensure that this step is DIRECTLY in line with the user's most recent explicit requests, and the task you were working on immediately before this summary request. If your last task was concluded, then only list next steps if they are explicitly in line with the users request. Do not start on tangential requests or really old requests that were already completed without confirming with the user first.
                       If there is a next step, include direct quotes from the most recent conversation showing exactly what task you were working on and where you left off. This should be verbatim to ensure there's no drift in task interpretation.

Here's an example of how your output should be structured:

<example>
<analysis>
[Your thought process, ensuring all points are covered thoroughly and accurately]
</analysis>

<summary>
1. Primary Request and Intent:
   [Detailed description]

2. Key Technical Concepts:
   - [Concept 1]
   - [Concept 2]
   - [...]

3. Files and Code Sections:
   - [File Name 1]
      - [Summary of why this file is important]
      - [Summary of the changes made to this file, if any]
      - [Important Code Snippet]
   - [File Name 2]
      - [Important Code Snippet]
   - [...]

4. Errors and fixes:
    - [Detailed description of error 1]:
      - [How you fixed the error]
      - [User feedback on the error if any]
    - [...]

5. Problem Solving:
   [Description of solved problems and ongoing troubleshooting]

6. All user messages:
    - [Detailed non tool use user message]
    - [...]

7. Pending Tasks:
   - [Task 1]
   - [Task 2]
   - [...]

8. Current Work:
   [Precise description of current work]

9. Optional Next Step:
   [Optional Next step to take]

</summary>
</example>

Please provide your summary based on the conversation so far, following this structure and ensuring precision and thoroughness in your response.

There may be additional summarization instructions provided in the included context. If so, remember to follow these instructions when creating the above summary. Examples of instructions include:
<example>
## Compact Instructions
When summarizing the conversation focus on typescript code changes and also remember the mistakes you made and how you fixed them.
</example>

<example>
# Summary instructions
When you are using compact - please focus on test output and code changes. Include file reads verbatim.
</example>


IMPORTANT: Do NOT use any tools. You MUST respond with ONLY the <summary>...</summary> block as your text output.`,
        } as UserModelMessage,
      ], {
        abortSignal: options?.abortSignal,
        providerOptions: {
          openai: {
            maxTokens: 20000
          },
          anthropic: {
            maxTokens: 20000
          },
          google: {
            maxTokens: 20000
          },
          azure: {
            maxTokens: 20000
          },
        }
      });

      function getTagContent(text, tag) {
        const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
        const match = text.match(regex);
        return match ? match[1] : null;
      }

      if (options?.abortSignal?.aborted === true) {
        appManager.sendEvent(`chat:event:${chatId}`, {
          type: ChatEvent.ChatChunk,
          data: JSON.stringify({
            type: 'data-compress-end',
            data: {

            },
          }),
        });
        return {
          compressedMessage: undefined,
          keepMessages: keepMessages,
          hasCompressed: false,
        };
      }

      console.log('Compress Response', response.text);

      const summary = getTagContent(response.text, 'summary');
      const analysis = getTagContent(response.text, 'analysis');

      const text = `
${response.text}
`

      const userMessage = {
        role: 'user',
        content: [{ type: 'text', text: text }],
      } as UserModelMessage;

      const usage = response.usage;
      appManager.sendEvent(`chat:event:${chatId}`, {
        type: ChatEvent.ChatChunk,
        data: JSON.stringify({
          type: 'data-compress-end',
          data: {
            usage,
          },
        }),
      });
      return {
        compressedMessage: userMessage,
        keepMessages: keepMessages,
        hasCompressed: true,
      };
    } catch (err) {
      console.error('Failed to compress messages', err);
      lastAssistantIndex = 0;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          lastAssistantIndex = i;
          if (lastAssistantIndex < messages.length - 5) {
            break;
          }

        }
      }

      return {
        compressedMessage: undefined,
        keepMessages: messages.slice(lastAssistantIndex),
        hasCompressed: false,
      };
    }

  }

  public async saveThreadUsage(
    threadId: string,
    resourceId: string,
    usage: MastraModelOutput['usage'],
    modelId?: string,
  ) {
    const _usage = await usage;

    const providers = modelsData[modelId.split(':')[0]];

    const costs = getTokenCosts({ modelId, usage: _usage, providers });
    try {
      const data = await this.mastraThreadsUsageRepository.save(
        new MastraThreadsUsage(
          threadId,
          resourceId,
          _usage as LanguageModelV2Usage,
          modelId,
          costs,
          costs?.totalUSD,
        ),
      );
      appManager.sendEvent(ChatEvent.ChatUsageChanged, {
        data: { threadId, resourceId, usage: _usage, modelId, costs },
      });
    } catch {
      console.error('Failed to save thread usage', threadId, usage);
    }
  }

  private async findThreadUsageRows({
    threadId,
    resourceId,
  }: {
    threadId?: string;
    resourceId?: string;
  }) {
    // 直接走 SQL（QueryBuilder），避免在 JS 层做筛选
    const qb = this.mastraThreadsUsageRepository.createQueryBuilder('u');
    if (threadId) qb.andWhere('u.thread_id = :threadId', { threadId });
    if (resourceId) qb.andWhere('u.resource_id = :resourceId', { resourceId });
    qb.orderBy('u.createdAt', 'ASC');
    return qb.getMany();
  }

  private getUsageDaySqlExpr(alias = 'u') {
    const type = dbManager.dataSource.options.type;
    // better-sqlite3 / sqlite 都支持 strftime
    if (type === 'better-sqlite3' || type === 'sqlite') {
      return `strftime('%Y-%m-%d', ${alias}.createdAt)`;
    }
    // 兜底：多数数据库支持 DATE()
    return `DATE(${alias}.createdAt)`;
  }

  private toFiniteNumber(v: any) {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  private async getThreadUsageSummaryFromSql({
    threadId,
    resourceId,
  }: {
    threadId?: string;
    resourceId?: string;
  }) {
    const base = this.mastraThreadsUsageRepository.createQueryBuilder('u');
    if (threadId) base.andWhere('u.thread_id = :threadId', { threadId });
    if (resourceId)
      base.andWhere('u.resource_id = :resourceId', { resourceId });

    const raw = await base
      .select('COUNT(1)', 'count')
      .addSelect('SUM(COALESCE(u.input_tokens, 0))', 'inputTokens')
      .addSelect('SUM(COALESCE(u.output_tokens, 0))', 'outputTokens')
      .addSelect('SUM(COALESCE(u.total_tokens, 0))', 'totalTokens')
      .addSelect('SUM(COALESCE(u.reasoning_tokens, 0))', 'reasoningTokens')
      .addSelect('SUM(COALESCE(u.cached_input_tokens, 0))', 'cachedInputTokens')
      .addSelect('SUM(COALESCE(u.total_costs_usd, 0))', 'totalCostsUsd')
      .addSelect('MIN(u.createdAt)', 'firstAt')
      .addSelect('MAX(u.createdAt)', 'lastAt')
      .getRawOne();

    const dayExpr = `COALESCE(${this.getUsageDaySqlExpr('u')}, 'unknown')`;
    const byDayRaw = await this.mastraThreadsUsageRepository
      .createQueryBuilder('u')
      .select(dayExpr, 'day')
      .addSelect('COUNT(1)', 'count')
      .addSelect('SUM(COALESCE(u.input_tokens, 0))', 'inputTokens')
      .addSelect('SUM(COALESCE(u.output_tokens, 0))', 'outputTokens')
      .addSelect('SUM(COALESCE(u.total_tokens, 0))', 'totalTokens')
      .addSelect('SUM(COALESCE(u.reasoning_tokens, 0))', 'reasoningTokens')
      .addSelect('SUM(COALESCE(u.cached_input_tokens, 0))', 'cachedInputTokens')
      .addSelect('SUM(COALESCE(u.total_costs_usd, 0))', 'totalCostsUsd')
      .where(
        base.expressionMap.wheres.map((w) => w.condition).join(' AND ') ||
        '1=1',
        base.getParameters(),
      )
      .groupBy(dayExpr)
      .orderBy('day', 'ASC')
      .getRawMany();

    const byResourceRaw = await this.mastraThreadsUsageRepository
      .createQueryBuilder('u')
      .select("COALESCE(u.resource_id, 'unknown')", 'resourceId')
      .addSelect('COUNT(1)', 'count')
      .addSelect('SUM(COALESCE(u.input_tokens, 0))', 'inputTokens')
      .addSelect('SUM(COALESCE(u.output_tokens, 0))', 'outputTokens')
      .addSelect('SUM(COALESCE(u.total_tokens, 0))', 'totalTokens')
      .addSelect('SUM(COALESCE(u.reasoning_tokens, 0))', 'reasoningTokens')
      .addSelect('SUM(COALESCE(u.cached_input_tokens, 0))', 'cachedInputTokens')
      .addSelect('SUM(COALESCE(u.total_costs_usd, 0))', 'totalCostsUsd')
      .where(
        base.expressionMap.wheres.map((w) => w.condition).join(' AND ') ||
        '1=1',
        base.getParameters(),
      )
      .groupBy('resourceId')
      .orderBy('totalTokens', 'DESC')
      .getRawMany();

    const byModelRaw = await this.mastraThreadsUsageRepository
      .createQueryBuilder('u')
      .select("COALESCE(u.model_id, 'unknown')", 'modelId')
      .addSelect('COUNT(1)', 'count')
      .addSelect('SUM(COALESCE(u.input_tokens, 0))', 'inputTokens')
      .addSelect('SUM(COALESCE(u.output_tokens, 0))', 'outputTokens')
      .addSelect('SUM(COALESCE(u.total_tokens, 0))', 'totalTokens')
      .addSelect('SUM(COALESCE(u.reasoning_tokens, 0))', 'reasoningTokens')
      .addSelect('SUM(COALESCE(u.cached_input_tokens, 0))', 'cachedInputTokens')
      .addSelect('SUM(COALESCE(u.total_costs_usd, 0))', 'totalCostsUsd')
      .where(
        base.expressionMap.wheres.map((w) => w.condition).join(' AND ') ||
        '1=1',
        base.getParameters(),
      )
      .groupBy('modelId')
      .orderBy('totalTokens', 'DESC')
      .getRawMany();

    return {
      count: this.toFiniteNumber(raw?.count),
      inputTokens: this.toFiniteNumber(raw?.inputTokens),
      outputTokens: this.toFiniteNumber(raw?.outputTokens),
      totalTokens: this.toFiniteNumber(raw?.totalTokens),
      reasoningTokens: this.toFiniteNumber(raw?.reasoningTokens),
      cachedInputTokens: this.toFiniteNumber(raw?.cachedInputTokens),
      totalCostsUsd: this.toFiniteNumber(raw?.totalCostsUsd),
      firstAt: raw?.firstAt ?? undefined,
      lastAt: raw?.lastAt ?? undefined,
      byDay: (byDayRaw ?? []).map((r: any) => ({
        day: r?.day ?? 'unknown',
        count: this.toFiniteNumber(r?.count),
        inputTokens: this.toFiniteNumber(r?.inputTokens),
        outputTokens: this.toFiniteNumber(r?.outputTokens),
        totalTokens: this.toFiniteNumber(r?.totalTokens),
        reasoningTokens: this.toFiniteNumber(r?.reasoningTokens),
        cachedInputTokens: this.toFiniteNumber(r?.cachedInputTokens),
        totalCostsUsd: this.toFiniteNumber(r?.totalCostsUsd),
      })),
      byResourceId: (byResourceRaw ?? []).map((r: any) => ({
        resourceId: r?.resourceId ?? 'unknown',
        count: this.toFiniteNumber(r?.count),
        inputTokens: this.toFiniteNumber(r?.inputTokens),
        outputTokens: this.toFiniteNumber(r?.outputTokens),
        totalTokens: this.toFiniteNumber(r?.totalTokens),
        reasoningTokens: this.toFiniteNumber(r?.reasoningTokens),
        cachedInputTokens: this.toFiniteNumber(r?.cachedInputTokens),
        totalCostsUsd: this.toFiniteNumber(r?.totalCostsUsd),
      })),
      byModelId: (byModelRaw ?? []).map((r: any) => ({
        modelId: r?.modelId ?? 'unknown',
        count: this.toFiniteNumber(r?.count),
        inputTokens: this.toFiniteNumber(r?.inputTokens),
        outputTokens: this.toFiniteNumber(r?.outputTokens),
        totalTokens: this.toFiniteNumber(r?.totalTokens),
        reasoningTokens: this.toFiniteNumber(r?.reasoningTokens),
        cachedInputTokens: this.toFiniteNumber(r?.cachedInputTokens),
        totalCostsUsd: this.toFiniteNumber(r?.totalCostsUsd),
      })),
    };
  }

  @channel(MastraChannel.GetUsage)
  public async getUsage({
    threadId,
    resourceId,
  }: {
    threadId: string;
    resourceId?: string;
  }) {
    return this.findThreadUsageRows({ threadId, resourceId });
  }

  @channel(MastraChannel.GetUsageSummary)
  public async getUsageSummary({
    threadId,
    resourceId,
  }: {
    threadId?: string;
    resourceId?: string;
  }) {
    const rows = await this.findThreadUsageRows({ threadId, resourceId });
    return {
      rows,
      summary: await this.getThreadUsageSummaryFromSql({
        threadId,
        resourceId,
      }),
    };
  }
}

const mastraManager = new MastraManager();
export default mastraManager;
