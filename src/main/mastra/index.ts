import { Mastra, MastraMessageV2 } from '@mastra/core';
import { Memory } from '@mastra/memory';
import { LangSmithExporter } from '@mastra/langsmith';
import { getStorage, getVectorStore } from './storage';
import { BaseManager } from '../BaseManager';
import express, { Response, Request } from 'express';
import { appManager } from '../app';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  ModelMessage,
  PrepareStepResult,
  StepResult,
  UIMessage,
} from 'ai';
import type {
  LanguageModelV2,
  SharedV2ProviderOptions,
} from '@ai-sdk/provider-v5';
import { toAISdkV5Messages } from '@mastra/ai-sdk/ui';
import { toAISdkStream } from '@mastra/ai-sdk';
// import { RuntimeContext } from '@mastra/core';
import { RequestContext } from '@mastra/core/request-context';
import { reactAgent } from './agents/react-agent';
import { providersManager } from '../providers';
import { Readable } from 'stream';
import { channel } from '../ipc/IpcController';
import { PaginationInfo } from '@/types/common';
import { MastraChannel } from '@/types/ipc-channel';
import {
  Agent,
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
  ChatThread,
} from '@/types/chat';
import { nanoid } from '@/utils/nanoid';
import { IpcMainEvent } from 'electron';
import { isObject, isString } from '@/utils/is';
import { toolsManager } from '../tools';
import { ToolType } from '@/types/tool';
import {
  convertMastraChunkToAISDKv5,
  WorkflowRunOutput,
} from '@mastra/core/stream';
import { chatWorkflow, claudeCodeWorkflow } from './workflow';
import { StorageThreadType } from '@mastra/core/memory';
import tokenCounter from '@/main/utils/tokenCounter';
import {
  convertToCoreMessages,
  convertToInstructionContent,
} from '../utils/convertToCoreMessages';
import { compressAgent } from './agents/compress-agent';
import { skillManager } from '../tools/common/skill';

const modelsData = require('@/../assets/models.json');
class MastraManager extends BaseManager {
  app: express.Application;
  private httpServer?: ReturnType<express.Application['listen']>;
  mastra: Mastra;

  threadChats: (ChatThread & { controller: AbortController })[] = [];

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
      agents: {
        reactAgent,
      },
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
    this.app.get('/auth/callback', async (req, res) => {
      const { code } = req.query;
    });
    await this.start();
  }

  public start() {
    if (this.httpServer?.listening) return;
    try {
      this.httpServer = this.app.listen(4133, '127.0.0.1', () => {
        console.log(`Mastra HTTP Server running on port 4133`);
      });
    } catch {
      appManager.send('AIME HTTP Server start failed', 'error');
    }
  }

  public restart() {
    this.close();
    this.start();
  }

  public close() {
    if (this.httpServer?.listening) {
      this.httpServer?.close();
    }
  }

  @channel(MastraChannel.GetThreads)
  public async getThreads({
    page = 0,
    size = 20,
  }: {
    page: number;
    size: number;
  }): Promise<PaginationInfo<StorageThreadType>> {
    const storage = this.mastra.getStorage();
    const threads = await storage?.listThreadsByResourceId({
      page: page,
      perPage: size,
      resourceId: '123',
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
  public async getThread(
    id: string,
  ): Promise<StorageThreadType & { messages: UIMessage[] }> {
    const storage = this.mastra.getStorage();
    const thread = await storage?.getThreadById({ threadId: id });

    const messages = await storage.listMessages({
      threadId: id,
      resourceId: '123',
      // format: 'v2',
    });
    // const _messages = convertMessages(messages.messages || []).to('AIV5.UI');

    return { ...thread, messages: toAISdkV5Messages(messages.messages) };
  }

  @channel(MastraChannel.CreateThread)
  public async createThread(): Promise<StorageThreadType> {
    const storage = this.mastra.getStorage();
    const thread = await storage.saveThread({
      thread: {
        id: nanoid(),
        title: 'New Thread',
        resourceId: '123',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
      },
    });
    await appManager.sendEvent('mastra:thread-created', thread);
    return thread;
  }

  @channel(MastraChannel.UpdateThread)
  public async updateThread(
    id: string,
    data: StorageThreadType,
  ): Promise<StorageThreadType> {
    const storage = this.mastra.getStorage();
    const thread = await storage.updateThread({
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
    await storage.deleteThread({ threadId: id });
  }

  @channel(MastraChannel.Chat, { mode: 'on' })
  public async chat(event: IpcMainEvent, data: ChatInput): Promise<void> {
    const {
      agentId,
      messageId,
      trigger,
      messages: uiMessages,
      model,
      webSearch,
      think,
      tools = [],
      runId,
      chatId,
      options,
    } = data;
    const storage = this.mastra.getStorage();
    let currentThread = await storage.getThreadById({ threadId: chatId });

    for (const uiMessage of uiMessages) {
      delete uiMessage.id;
    }
    const inputMessage = uiMessages[uiMessages.length - 1];

    const mastraAgent = this.mastra.getAgentById(agentId || 'react-agent');

    if (!mastraAgent) {
      throw new Error('Agent not found');
    }

    const provider = await providersManager.get(model.split('/')[0]);
    if (!provider) {
      throw new Error('Provider not found');
    }

    const { providerId, modeId, modelInfo } =
      await providersManager.getModelInfo(model);

    mastraAgent.model = await providersManager.getLanguageModel(model);

    let _skills = await skillManager.getClaudeSkills();
    _skills = _skills.filter((x) => tools.includes(x.id));

    const _tools = toolsManager.buildTools(tools, {
      [`${ToolType.BUILD_IN}:Skill`]: {
        skills: _skills,
      },
    });
    const fastModel = (await appManager.getInfo())?.defaultModel?.fastModel;
    const fastLanguageModel = (await providersManager.getLanguageModel(
      fastModel || model,
    )) as LanguageModelV2;

    const agent = new Agent({
      name: mastraAgent.name,
      instructions: ({ requestContext }) => {
        return mastraAgent.getInstructions({ requestContext });
      },
      model: await providersManager.getLanguageModel(model),
      memory: new Memory({
        storage: getStorage(),
        options: {
          semanticRecall: false,
          workingMemory: {
            enabled: false,
          },
          lastMessages: false,
        },
        // memory:{
      }),

      tools: _tools,
      mastra: this.mastra,
      // workflows: { chatWorkflow },
      // tools: { Bash: Bash.build(), WebFetch, PythonExecute },
    });

    if (modelInfo?.tool_call === false) {
    }
    try {
      // const info = modelsData[provider.type]?.models[_modeId] || {};

      const requestContext = new RequestContext();
      requestContext.set('model' as never, model as never);
      requestContext.set('threadId' as never, chatId as never);
      if (modelInfo?.limit?.context)
        requestContext.set(
          'limit_context' as never,
          modelInfo?.limit?.context as never,
        );

      // const thread = await this.mastra.getStorage().getThreadById({ threadId });

      // const messages = convertToModelMessages(uiMessages);
      const recentMessage = agent.getMostRecentUserMessage(uiMessages);
      const controller = new AbortController();
      const signal = controller.signal;
      let chunkPart;

      // const snapshot = await storage?.loadWorkflowSnapshot({
      //   runId: chatId,
      //   workflowName: workflow.id,
      // });

      const historyMessages = await storage.listMessages({
        threadId: chatId,
        resourceId: '123',
      });

      const historyMessagesAISdkV5 = toAISdkV5Messages(
        historyMessages.messages,
      );
      const input = [...historyMessagesAISdkV5, recentMessage];

      const stream = await agent.stream(input, {
        // format: 'aisdk',
        // runId: chatId,
        // requireToolApproval: true,
        providerOptions: options?.providerOptions,
        modelSettings: options?.modelSettings,
        requestContext: requestContext,
        maxSteps: 60,
        memory: {
          thread: {
            id: chatId,
          },
          resource: '123',
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
          const reasoningText = await stream.reasoningText;
          console.log('Stream finished after', steps.length, 'steps');
          console.log('stream usage:', usage);
          // Persist final results to database

          const uiMessages = response.uiMessages;
          const msg = await storage.updateMessages({
            messages: uiMessages.map((x) => {
              return {
                id: x.id,
                content: {
                  reasoning: reasoningText,
                  metadata: { ...x.metadata, usage: usage },
                },
              };
            }),
          });
        },

        onStepFinish: async (event) => {
          //storage.saveMessages();
          const { usage, response, text, reasoning } = event;
          const limit_context =
            (requestContext.get('limit_context' as never) as number) ||
            64 * 1000;

          const history = (requestContext.get('usage' as never) as {
            // inputTokens: number;
            // outputTokens: number;
            totalTokens: number;
          }) ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
          // history.inputTokens += usage?.inputTokens ?? 0;
          // history.outputTokens += usage?.outputTokens ?? 0;
          history.totalTokens += usage?.totalTokens ?? 0;
          requestContext.set('usage' as never, history as never);
          const usageRate = (usage?.totalTokens / limit_context) * 100;
          console.log('usage rate: ' + usageRate.toFixed(2) + '%');

          appManager.sendEvent(`chat:event:${chatId}`, {
            type: ChatEvent.ChatUsage,
            data: {
              usage,
              usageRate: Math.round(usageRate * 100) / 100,
              modelId: model,
              maxTokens: limit_context,
            },
          });
          currentThread = await storage.updateThread({
            id: chatId,
            title: currentThread.title,
            metadata: {
              ...(currentThread.metadata || {}),
              usage,
              maxTokens: limit_context,
              modelId: model,
            },
          });
          // debugger;

          //console.log("Step finished after", event);
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
          // console.log('Stream chunk:', chunk);
        },
        prepareStep: async (options) => {
          console.log('Prepare step:', options);
          const instructions = await agent.getInstructions({ requestContext });
          const messages = convertToCoreMessages(options.messages);
          const instructionContent = convertToInstructionContent(instructions);

          const token = await tokenCounter(messages, {
            role: 'system',
            content: instructionContent,
          });
          if (token > 100000) {
            compressAgent.model = fastLanguageModel;

            const compressResult = await compressAgent.generate(
              options.messages,
              {
                modelSettings: {
                  maxOutputTokens: 32 * 1000,
                },
              },
            );
            const text = compressResult.text;
            const todos = requestContext.get('todos' as never);
            if (todos) {
            }
          }

          return options;
        },
      });

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

      // for await (const chunk of stream.fullStream) {
      //   console.log(chunk);
      //   const convertedChunk = convertMastraChunkToAISDKv5({ chunk });
      //   appManager.sendEvent(`chat:event:${chatId}`, {
      //     type: ChatEvent.ChatChunk,
      //     data: JSON.stringify(convertedChunk),
      //   });
      // }
      const uiStream = toAISdkStream(stream, {
        from: 'agent',
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
      if (stream.status == 'suspended') {
        const suspendPayload = await stream.suspendPayload;

        appManager.sendEvent(`chat:event:${chatId}`, {
          type: ChatEvent.ChatChunk,
          data: JSON.stringify({
            type: 'tool-approval-requested',
            runId: stream.runId,
            toolName: suspendPayload.toolName,
            toolCallId: suspendPayload.toolCallId,
          }),
        });

        const snapshot = await storage?.loadWorkflowSnapshot({
          runId: stream.runId,
          workflowName: 'executionWorkflow',
        });

        const snapshot2 = await storage?.loadWorkflowSnapshot({
          runId: stream.runId,
          workflowName: 'agentic-loop',
        });

        debugger;
      }

      appManager.sendEvent(`chat:event:${chatId}`, {
        type: ChatEvent.ChatChanged,
        data: { type: ChatChangedType.Finish, chatId },
      });
      appManager.sendEvent(ChatEvent.ChatChanged, {
        data: { type: ChatChangedType.Finish, chatId },
      });

      // let heartbeat;
      // const stream_2 = await createUIMessageStream({
      //   execute: async (options) => {
      //     appManager.sendEvent(`chat:event:${chatId}`, {
      //       type: ChatEvent.ChatChanged,
      //       data: { type: ChatChangedType.Start, chatId },
      //     });

      //     appManager.sendEvent(ChatEvent.ChatChanged, {
      //       data: { type: ChatChangedType.Start, chatId },
      //     });
      //     this.threadChats.push({
      //       id: chatId,
      //       title: 'string',
      //       status: 'streaming',
      //       controller,
      //     });
      //     const { writer } = options;
      //     heartbeat = setInterval(() => {
      //       writer.write({
      //         type: 'data-heartbeat',
      //         data: { datetime: new Date().toISOString() },
      //         transient: true,
      //       });
      //     }, 1000 * 30);

      //     writer.merge(stream.aisdk.v5.toUIMessageStream());
      //   },
      //   onFinish: (data) => {
      //     clearInterval(heartbeat);
      //     appManager.sendEvent(ChatEvent.ChatChanged, {
      //       data: { type: ChatChangedType.Finish, chatId },
      //     });
      //   },
      //   onError: (error: Error | undefined) => {
      //     console.log('Stream error:', error);
      //     clearInterval(heartbeat);

      //     return error?.message ?? 'Unknown error';
      //   },
      // });

      // const reader = stream_2.getReader();
      // while (true) {
      //   const { done, value } = await reader.read();
      //   if (done) {
      //     break;
      //   }

      //   appManager.sendEvent(`chat:event:${chatId}`, {
      //     type: ChatEvent.ChatChunk,
      //     data: JSON.stringify(value),
      //   });
      // }
    } catch (err) {
      console.error(err);
      appManager.sendEvent(`chat:event:${chatId}`, {
        type: ChatEvent.ChatError,
        data: err?.message || 'Unknown error',
      });
    } finally {
      if (currentThread.title == 'New Thread') {
        const fastModel = (await appManager.getInfo())?.defaultModel?.fastModel;
        const fastLanguageModel = (await providersManager.getLanguageModel(
          fastModel || model,
        )) as LanguageModelV2;
        const title = await agent.genTitle(
          inputMessage,
          undefined,
          undefined,
          fastLanguageModel,
        );
        currentThread = await storage.updateThread({
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

  @channel(MastraChannel.ChatWorkflow, { mode: 'on' })
  public async chatWorkflow(
    event: IpcMainEvent,
    data: ChatInput,
  ): Promise<void> {
    const {
      agentId,
      messageId,
      trigger,
      messages: uiMessages,
      model,
      webSearch,
      think,
      tools,
      runId,
      chatId,
      options,
    } = data;
    const storage = this.mastra.getStorage();
    let currentThread = await storage.getThreadById({ threadId: chatId });
    const inputMessage = uiMessages[uiMessages.length - 1];
    const mastraAgent = this.mastra.getAgentById(agentId || 'react-agent');
    if (!mastraAgent) {
      throw new Error('Agent not found');
    }
    const { providerId, modeId, modelInfo } =
      await providersManager.getModelInfo(model);
    mastraAgent.model = await providersManager.getLanguageModel(model);
    const _tools = toolsManager.createTools(tools, {
      Skill: {
        skills: tools
          .filter((x) => x.startsWith(ToolType.SKILL + ':'))
          .map((x) => x.split(':').slice(2).join(':')),
      },
    });
    const requestContext = new RequestContext();
    requestContext.set('model' as never, model as never);

    const workflow = this.mastra.getWorkflowById('claude-code');

    let result: WorkflowRunOutput;

    const run = await workflow.createRun({
      runId: chatId,
      resourceId: '123',
      disableScorers: true,
    });

    const snapshot = await storage?.loadWorkflowSnapshot({
      runId: chatId,
      workflowName: workflow.id,
    });

    if (snapshot?.status == 'suspended') {
      for (const [key, value] of Object.entries(snapshot.requestContext)) {
        requestContext.set(key as never, value as never);
      }
      result = await run.resumeStream({
        resumeData: { start: true },
        requestContext: requestContext,
      });
    } else {
      result = await run.stream({
        inputData: {
          messages: uiMessages,
          // agentId: 'claude-code',
          model: model,
          tools: tools,
        },
        requestContext,
      });
    }

    // let heartbeat;
    // const stream_2 = await createUIMessageStream({
    //   execute: async (options) => {
    //     appManager.sendEvent(`chat:event:${chatId}`, {
    //       type: ChatEvent.ChatStart,
    //       data: {},
    //     });

    //     appManager.sendEvent(ChatEvent.ChatStart, {
    //       data: { chatId },
    //     });
    //     this.threadChats.push({
    //       id: chatId,
    //       title: 'string',
    //       status: 'streaming',
    //       controller: run.abortController,
    //     });
    //     const { writer } = options;
    //     heartbeat = setInterval(() => {
    //       writer.write({
    //         type: 'data-heartbeat',
    //         data: { datetime: new Date().toISOString() },
    //         transient: true,
    //       });
    //     }, 1000 * 30);

    //     writer.merge(result.fullStream.);
    //   },
    //   onFinish: (data) => {
    //     clearInterval(heartbeat);
    //     appManager.sendEvent(ChatEvent.ChatFinish, {
    //       data: { chatId },
    //     });
    //   },
    //   onError: (error: Error | undefined) => {
    //     console.log('Stream error:', error);
    //     clearInterval(heartbeat);

    //     return error?.message ?? 'Unknown error';
    //   },
    // });

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
      controller: run.abortController,
    });

    for await (const chunk of result.fullStream) {
      console.log(chunk);
      appManager.sendEvent(`chat:event:${chatId}`, {
        type: ChatEvent.ChatChunk,
        data: JSON.stringify(chunk),
      });
    }

    appManager.sendEvent(ChatEvent.ChatChanged, {
      data: { type: ChatChangedType.Finish, chatId },
    });
    appManager.sendEvent(`chat:event:${chatId}`, {
      type: ChatEvent.ChatChanged,
      data: { type: ChatChangedType.Finish, chatId },
    });
    this.threadChats = this.threadChats.filter((chat) => chat.id !== chatId);

    // const reader = result.fullStream.getReader();
    // while (true) {
    //   const { done, value } = await reader.read();
    //   if (done) {
    //     break;
    //   }
    //   console.log(value);
    //   appManager.sendEvent(`chat:event:${chatId}`, {
    //     type: ChatEvent.ChatChunk,
    //     data: JSON.stringify(value),
    //   });
    // }
  }
  @channel(MastraChannel.ChatResume, { mode: 'on' })
  public async chatResume(event: IpcMainEvent, data: ChatInput) {
    const {
      agentId,
      messageId,
      trigger,
      messages: uiMessages,
      model,
      webSearch,
      think,
      tools,
      runId,
      chatId,
      options,
    } = data;
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
    await storage.saveMessages({
      messages: messages,
    });
  }
}

const mastraManager = new MastraManager();
export default mastraManager;
