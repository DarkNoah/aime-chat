import { Mastra } from '@mastra/core';
import { Memory } from '@mastra/memory';
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
// import { toAISdkV5Messages } from '@mastra/ai-sdk';

import { toAISdkFormat, toAISdkStream } from '@mastra/ai-sdk';
// import { RuntimeContext } from '@mastra/core';
import { RequestContext } from '@mastra/core/request-context';
import { providersManager } from '../providers';
import { channel } from '../ipc/IpcController';
import { PaginationInfo } from '@/types/common';
import { MastraChannel } from '@/types/ipc-channel';
import {
  Agent,
  AgentExecutionOptions,
  convertMessages,
  MastraDBMessage,
  MastraLanguageModel,
  MastraMessageContentV2,
  UIMessageWithMetadata,
} from '@mastra/core/agent';
import {
  ChatChangedType,
  ChatEvent,
  ChatInput,
  ChatRequestContext,
  ChatTask,
  ChatThread,
  ChatTodo,
  DEFAULT_RESOURCE_ID,
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
import { formatCodeWithLineNumbers } from '../utils/format';

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
    page: number;
    size: number;
    resourceId?: string;
  }): Promise<PaginationInfo<StorageThreadType>> {
    const storage = this.mastra.getStorage();
    const memory = await storage.getStore('memory');

    const threads = await memory?.listThreads({
      page: page,
      perPage: size,
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
  public async getThread(id: string): Promise<ThreadState> {
    const storage = this.mastra.getStorage();
    const memoryStore = await storage.getStore('memory');
    const thread = await memoryStore?.getThreadById({ threadId: id });

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

    const messages = await memoryStore.listMessages({
      threadId: id,
      resourceId: thread?.resourceId || DEFAULT_RESOURCE_ID,
      // format: 'v2',
    });
    // const _messages = convertMessages(messages.messages || []).to('AIV5.UI');

    return {
      ...thread,
      messages: toAISdkV5Messages(messages.messages),
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
    model?: string;
    resourceId?: string;
    agentId?: string;
  }): Promise<StorageThreadType> {
    const storage = this.mastra.getStorage();
    const memoryStore = await storage.getStore('memory');
    const thread = await memoryStore.saveThread({
      thread: {
        id: nanoid(),
        title: 'New Thread',
        resourceId: options?.resourceId ?? DEFAULT_RESOURCE_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          ...(options || {}),
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
    const memoryStore = await storage.getStore('memory');
    const thread = await memoryStore.updateThread({
      id: id,
      title: data.title,
      metadata: data.metadata || {},
    });
    appManager.sendEvent(ChatEvent.ChatChanged, {
      data: {
        type: ChatChangedType.TitleUpdated,
        chatId: id,
        title: data.title,
      },
    });
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
    if (thread.metadata?.tasks && thread.metadata?.tasks.length > 0) {
      await memoryStore.updateThread({
        id: id,
        title: thread.title,
        metadata: {
          ...(thread.metadata || {}),
          tasks: [],
          usage: {}
        },
      });
    }
  }

  @channel(MastraChannel.Chat, { mode: 'on' })
  public async chat(event: IpcMainEvent, data: ChatInput): Promise<void> {
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
    let project: Project | undefined;
    if (projectId) {
      project = await projectManager.getProject(projectId);
      if (project) {
        resourceId = `project:${project?.id}`;
      }
    }
    const appInfo = await appManager.getInfo();
    const memoryStore = await storage.getStore('memory');
    let currentThread = await memoryStore.getThreadById({ threadId: chatId });

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
      const todos: ChatTodo[] =
        (currentThread.metadata?.todos as ChatTodo[]) || [];
      const tasks: ChatTask[] =
        (currentThread.metadata?.tasks as ChatTask[]) || [];
      const requestContext = new RequestContext<ChatRequestContext>();
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
      requestContext.set(
        'maxContextSize',
        modelInfo?.limit?.context ?? 64 * 1000,
      );

      let additionalInstructions;
      const agentsMdPath = path.join(workspace, `AGENTS.md`);
      if (fs.existsSync(agentsMdPath) && fs.statSync(agentsMdPath).isFile()) {
        const agentsMd = fs.readFileSync(agentsMdPath, 'utf-8');
        if (agentsMd) {
          additionalInstructions = `
<system-reminder>
Note: ${agentsMdPath} was modified, either by the user or by a linter. Don't tell the user this, since they are already aware. This change was intentional, so make sure to take it into account as you proceed (ie. don't revert it unless the user asks you to). So that you don't need to re-read the file, here's the result of running \`cat - n\` on a snippet of the edited file:
${formatCodeWithLineNumbers({ content: agentsMd, startLine: 0 })}
</system-reminder>`;
          requestContext.set('additionalInstructions', additionalInstructions);
        }
      }

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
          reasoningEffort: think ? 'medium' : undefined,
          include: [
            'reasoning.encrypted_content',
            ...(webSearch ? ['web_search_call.action.sources'] : []),
          ],
        },
        deepseek: {
          thinking: {
            type: 'enabled',
          },
        },
        google: {
          thinkingConfig: {
            thinkingLevel: 'low',
            includeThoughts: true,
          },
        },
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

        // stopWhen: (event) => {
        //   const { steps } = event;
        //   return true;
        // },
        onAbort: (event) => {
          const { steps } = event;
          // Handle cleanup when stream is aborted
          console.log('Stream aborted after', steps.length, 'steps');
          // Persist partial results to database
        },
        onFinish: async (event) => {
          const { steps, usage, response, reasoning } = event;
          // const reasoningText = await stream.reasoningText;
          console.log('Stream finished after', steps.length, 'steps');
          console.log('stream usage:', usage);
          // Persist final results to database

          // const uiMessages = response.uiMessages;
          // const msg = await storage.updateMessages({
          //   messages: uiMessages.map((x) => {
          //     return {
          //       id: x.id,
          //       content: {
          //         reasoning: reasoningText,
          //         metadata: { ...x.metadata, usage: usage },
          //       },
          //     };
          //   }),
          // });
        },

        onStepFinish: async (event) => {
          //storage.saveMessages();
          const { usage, response, text, reasoning } = event;
          const maxContextSize = requestContext.get('maxContextSize');

          const history = (requestContext.get('usage' as never) as {
            // inputTokens: number;
            // outputTokens: number;
            totalTokens: number;
          }) ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
          // history.inputTokens += usage?.inputTokens ?? 0;
          // history.outputTokens += usage?.outputTokens ?? 0;
          history.totalTokens += usage?.totalTokens ?? 0;
          requestContext.set('usage' as never, history as never);
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
        onError: ({ error }: { error: Error | string }) => {
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
        },
        onChunk: (chunk) => {
          console.log('Stream chunk:', chunk);
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
            requestContext.set('chunks', _chunks);
          } else {
            requestContext.set('chunks', undefined);
          }
          //if()
          //const maxContextSize = requestContext.get('maxContextSize');
        },
        requireToolApproval: requireToolApproval,

      };
      // if (runId && (approved !== undefined || resumeData !== undefined)) {
      //   if (approved === true) {
      //     stream = await agent.approveToolCall({
      //       ...streamOptions,
      //       runId: runId,
      //       toolCallId: toolCallId,
      //     });
      //   } else if (approved === false) {
      //     stream = await agent.declineToolCall({
      //       ...streamOptions,
      //       runId: runId,
      //       toolCallId: toolCallId,
      //     });
      //   } else {
      //     stream = await agent.resumeStream(
      //       { ...resumeData },
      //       {
      //         ...streamOptions,
      //         runId: runId,
      //         toolCallId: toolCallId,
      //       },
      //     );
      //   }
      // } else {
      //   stream = await agent.stream(inputMessage, streamOptions);
      // }

      appManager.sendEvent(`chat:event:${chatId}`, {
        type: ChatEvent.ChatChanged,
        data: { type: ChatChangedType.Start, chatId },
      });
      appManager.sendEvent(ChatEvent.ChatChanged, {
        data: { type: ChatChangedType.Start, chatId },
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

        const { compressedMessage, keepMessages, hasCompressed } =
          await this.compressMessages(
            [
              { role: 'system', content: system } as SystemModelMessage,
              ...messages,
            ],
            _tools,
            {
              thresholdTokenCount,
              requestContext,
              model: fastLanguageModel,
            },
          );
        if (hasCompressed) {
          await memoryStore.updateMessages({
            messages: historyMessages.messages.map((x) => {
              return {
                id: x.id,
                resourceId: x.resourceId + '.history',
              };
            }),
          });
          const compressedDBMessage = {
            id: nanoid(),
            threadId: chatId,
            resourceId: resourceId,
            role: 'user',
            content: {
              format: 2,
              parts: compressedMessage.content,
              metadata: {
                compressed: true,
              },
            },
            type: 'v2',
            createdAt: new Date(),
          } as MastraDBMessage;
          const todos = requestContext.get('todos');
          const tasks = requestContext.get('tasks');
          if (tools.includes(`${ToolType.BUILD_IN}:${TodoWrite.toolName}`)) {
            if (todos && todos.length > 0) {
              compressedDBMessage.content.parts.push({
                type: 'text',
                text: `<system-reminder>\nYour todo list has changed. DO NOT mention this explicitly to the user. Here are the latest contents of your todo list:\n\n${JSON.stringify(todos)}. Continue on with the tasks at hand if applicable.\n</system-reminder>`,
              });
            } else {
              compressedDBMessage.content.parts.push({
                type: 'text',
                text: `<system-reminder>\nThis is a reminder that your todo list is currently empty. DO NOT mention this to the user explicitly because they are already aware. If you are working on tasks that would benefit from a todo list please use the TodoWrite tool to create one. If not, please feel free to ignore. Again do not mention this message to the user.\n</system-reminder>`,
              });
            }
          } else if (
            tools.includes(`${ToolType.BUILD_IN}:${TaskList.toolName}`)
          ) {
            if (tasks && tasks.length > 0) {
              compressedDBMessage.content.parts.push({
                type: 'text',
                text: `<system-reminder>\nYour todo list has changed. DO NOT mention this explicitly to the user. Here are the latest contents of your todo list:\n\n${JSON.stringify(tasks)}. Continue on with the tasks at hand if applicable.\n</system-reminder>`,
              });
            } else {
              compressedDBMessage.content.parts.push({
                type: 'text',
                text: `<system-reminder>\nThis is a reminder that your todo list is currently empty. DO NOT mention this to the user explicitly because they are already aware. If you are working on tasks that would benefit from a todo list please use the ${TaskCreate.toolName} tool to create one. If not, please feel free to ignore. Again do not mention this message to the user.\n</system-reminder>`,
              });
            }
          }

          input = [compressedDBMessage, ...keepMessages];
          if (_inputMessage) input.push(_inputMessage);
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

        stream = await this.nextStep(
          agent,
          input,
          streamOptions,
          resume,
          think,
        );

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
      // if (stream.status == 'suspended') {
      //   const messages = stream.messageList.get.all.db();
      //   const lastMessage = messages[messages.length - 1];
      //   if (
      //     lastMessage?.role == 'assistant' &&
      //     lastMessage?.content?.metadata?.pendingToolApprovals
      //   ) {
      //     const pendingToolApprovals =
      //       lastMessage?.content?.metadata?.pendingToolApprovals;
      //   } else {
      //     // const core = stream.messageList.get.all.core();
      //     const suspendPayload = await stream.suspendPayload;
      //     // const finishReason = await stream.finishReason;
      //     const toolCallId = suspendPayload.toolCallId;
      //     suspendPayload.runId = stream.runId;

      //     const message = messages.find(
      //       (x) =>
      //         x.role == 'assistant' &&
      //         x.content.parts.find(
      //           (x) =>
      //             x.type == 'tool-invocation' &&
      //             x.toolInvocation.toolCallId == toolCallId,
      //         ),
      //     );

      //     await memoryStore.updateMessages({
      //       messages: [
      //         {
      //           id: message.id,
      //           content: {
      //             ...message.content,
      //             metadata: {
      //               ...message.content.metadata,
      //               suspendPayload: {
      //                 ...((message.content.metadata?.suspendPayload as Record<
      //                   string,
      //                   any
      //                 >) ?? {}),
      //                 [toolCallId]: suspendPayload,
      //               },
      //             },
      //           },
      //         },
      //       ],
      //     });
      //   }
      // }

      if (streamOptions.abortSignal.aborted) {
        const chunks = requestContext.get('chunks');
        const Persisted = stream.messageList.getPersisted.input.db();
        const db = stream.messageList.get.input.db();
        // const core = stream.messageList.get.input.core();
        let messages: MastraDBMessage[] = [];
        messages.push({
          id: chunks.runId,
          role: 'assistant',
          threadId: chatId,
          resourceId: resourceId,
          type: 'v2',
          createdAt: new Date(),
          content: {
            format: 2,
            parts: [
              { type: 'text', text: chunks.text },
              { type: 'text', text: `[Request interrupted by user]` },
            ],
            metadata: {
              aborted: true,
            },
          },
        });
        requestContext.set('chunks', undefined);
        // await memoryStore.saveMessages({ messages: [...db, ...messages] });
        await memoryStore.saveMessages({ messages: [...messages] });
      }
    } catch (err) {
      console.error(err);
      appManager.sendEvent(`chat:event:${chatId}`, {
        type: ChatEvent.ChatError,
        data: err?.message || 'Unknown error',
      });
    } finally {
      appManager.sendEvent(`chat:event:${chatId}`, {
        type: ChatEvent.ChatChanged,
        data: { type: ChatChangedType.Finish, chatId },
      });
      appManager.sendEvent(ChatEvent.ChatChanged, {
        data: { type: ChatChangedType.Finish, chatId },
      });
      currentThread = await memoryStore.getThreadById({ threadId: chatId });
      if (currentThread.title == 'New Thread') {
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

        appManager.sendEvent(ChatEvent.ChatChanged, {
          data: { type: ChatChangedType.TitleUpdated, chatId, title },
        });

        appManager.sendEvent(`chat:event:${chatId}`, {
          type: ChatEvent.ChatChanged,
          data: { type: ChatChangedType.TitleUpdated, chatId, title },
        });
      }
      this.threadChats = this.threadChats.filter((chat) => chat.id !== chatId);
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
    think?: boolean,
  ) {
    const chatId = streamOptions.requestContext.get(
      'threadId' as never,
    ) as string;
    const runId = streamOptions.runId;
    let stream: MastraModelOutput<unknown>;

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
      sendReasoning: false,
      sendStart: false,
      sendFinish: false
      // lastMessageId: inputMessage[inputMessage.length - 1].id,
    });

    const uiStreamReader = uiStream.getReader();
    while (true) {
      const { done, value } = await uiStreamReader.read();
      if (done) {
        break;
      }
      console.log(value);
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

  // @channel(MastraChannel.ChatWorkflow, { mode: 'on' })
  // public async chatWorkflow(
  //   event: IpcMainEvent,
  //   data: ChatInput,
  // ): Promise<void> {
  //   const {
  //     agentId,
  //     messageId,
  //     trigger,
  //     messages: uiMessages,
  //     model,
  //     webSearch,
  //     think,
  //     tools,
  //     runId,
  //     chatId,
  //     options,
  //   } = data;
  //   const storage = this.mastra.getStorage();
  //   let currentThread = await storage.getThreadById({ threadId: chatId });
  //   const inputMessage = uiMessages[uiMessages.length - 1];
  //   const mastraAgent = this.mastra.getAgentById(agentId || 'react-agent');
  //   if (!mastraAgent) {
  //     throw new Error('Agent not found');
  //   }
  //   const { providerId, modeId, modelInfo } =
  //     await providersManager.getModelInfo(model);
  //   mastraAgent.model = await providersManager.getLanguageModel(model);
  //   const _tools = toolsManager.createTools(tools, {
  //     Skill: {
  //       skills: tools
  //         .filter((x) => x.startsWith(ToolType.SKILL + ':'))
  //         .map((x) => x.split(':').slice(2).join(':')),
  //     },
  //   });
  //   const requestContext = new RequestContext();
  //   requestContext.set('model' as never, model as never);

  //   const workflow = this.mastra.getWorkflowById('claude-code');

  //   let result: WorkflowRunOutput;

  //   const run = await workflow.createRun({
  //     runId: chatId,
  //     resourceId: DEFAULT_RESOURCE_ID,
  //     disableScorers: true,
  //   });

  //   const snapshot = await storage?.loadWorkflowSnapshot({
  //     runId: chatId,
  //     workflowName: workflow.id,
  //   });

  //   if (snapshot?.status == 'suspended') {
  //     for (const [key, value] of Object.entries(snapshot.requestContext)) {
  //       requestContext.set(key as never, value as never);
  //     }
  //     result = await run.resumeStream({
  //       resumeData: { start: true },
  //       requestContext: requestContext,
  //     });
  //   } else {
  //     result = await run.stream({
  //       inputData: {
  //         messages: uiMessages,
  //         // agentId: 'claude-code',
  //         model: model,
  //         tools: tools,
  //       },
  //       requestContext,
  //     });
  //   }

  //   // let heartbeat;
  //   // const stream_2 = await createUIMessageStream({
  //   //   execute: async (options) => {
  //   //     appManager.sendEvent(`chat:event:${chatId}`, {
  //   //       type: ChatEvent.ChatStart,
  //   //       data: {},
  //   //     });

  //   //     appManager.sendEvent(ChatEvent.ChatStart, {
  //   //       data: { chatId },
  //   //     });
  //   //     this.threadChats.push({
  //   //       id: chatId,
  //   //       title: 'string',
  //   //       status: 'streaming',
  //   //       controller: run.abortController,
  //   //     });
  //   //     const { writer } = options;
  //   //     heartbeat = setInterval(() => {
  //   //       writer.write({
  //   //         type: 'data-heartbeat',
  //   //         data: { datetime: new Date().toISOString() },
  //   //         transient: true,
  //   //       });
  //   //     }, 1000 * 30);

  //   //     writer.merge(result.fullStream.);
  //   //   },
  //   //   onFinish: (data) => {
  //   //     clearInterval(heartbeat);
  //   //     appManager.sendEvent(ChatEvent.ChatFinish, {
  //   //       data: { chatId },
  //   //     });
  //   //   },
  //   //   onError: (error: Error | undefined) => {
  //   //     console.log('Stream error:', error);
  //   //     clearInterval(heartbeat);

  //   //     return error?.message ?? 'Unknown error';
  //   //   },
  //   // });

  //   appManager.sendEvent(`chat:event:${chatId}`, {
  //     type: ChatEvent.ChatChanged,
  //     data: { type: ChatChangedType.Start, chatId },
  //   });
  //   appManager.sendEvent(ChatEvent.ChatChanged, {
  //     data: { type: ChatChangedType.Start, chatId },
  //   });
  //   this.threadChats.push({
  //     id: chatId,
  //     title: 'string',
  //     status: 'streaming',
  //     controller: run.abortController,
  //   });

  //   for await (const chunk of result.fullStream) {
  //     console.log(chunk);
  //     appManager.sendEvent(`chat:event:${chatId}`, {
  //       type: ChatEvent.ChatChunk,
  //       data: JSON.stringify(chunk),
  //     });
  //   }

  //   appManager.sendEvent(ChatEvent.ChatChanged, {
  //     data: { type: ChatChangedType.Finish, chatId },
  //   });
  //   appManager.sendEvent(`chat:event:${chatId}`, {
  //     type: ChatEvent.ChatChanged,
  //     data: { type: ChatChangedType.Finish, chatId },
  //   });
  //   this.threadChats = this.threadChats.filter((chat) => chat.id !== chatId);

  //   // const reader = result.fullStream.getReader();
  //   // while (true) {
  //   //   const { done, value } = await reader.read();
  //   //   if (done) {
  //   //     break;
  //   //   }
  //   //   console.log(value);
  //   //   appManager.sendEvent(`chat:event:${chatId}`, {
  //   //     type: ChatEvent.ChatChunk,
  //   //     data: JSON.stringify(value),
  //   //   });
  //   // }
  // }

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
      requestContext?: RequestContext<ChatRequestContext>;
      thresholdTokenCount?: number;
      force?: boolean;
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
    if (
      options.thresholdTokenCount &&
      tokenCount < options.thresholdTokenCount &&
      !options.force
    ) {
      console.log('compress: not compress', {
        tokenCount,
        thresholdTokenCount: options.thresholdTokenCount,
      });
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
    if (lastAssistantIndex > 0) {
      summaryMessages = messages.slice(0, lastAssistantIndex);
      keepMessages = messages.slice(lastAssistantIndex);
    } else {
      summaryMessages = messages;
      keepMessages = [];
    }

    const inputMessages = summaryMessages.filter((x) => x.role !== 'system');
    compressAgent.model = options.model;

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
6. Pending Tasks: Outline any pending tasks that you have explicitly been asked to work on.
7. Current Work: Describe in detail precisely what was being worked on immediately before this summary request, paying special attention to the most recent messages from both user and assistant. Include file names and code snippets where applicable.
8. Optional Next Step: List the next step that you will take that is related to the most recent work you were doing. IMPORTANT: ensure that this step is DIRECTLY in line with the user's most recent explicit requests, and the task you were working on immediately before this summary request. If your last task was concluded, then only list next steps if they are explicitly in line with the users request. Do not start on tangential requests or really old requests that were already completed without confirming with the user first.
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
</example>`,
      } as UserModelMessage,
    ]);

    const userMessage = {
      role: 'user',
      content: [{ type: 'text', text: response.text }],
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
