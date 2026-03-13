import { Settings } from '@/entities/settings';
import { ACPInfo } from '@/types/app';
import { nanoid } from '@/utils/nanoid';
import { app } from 'electron';
import fs from 'node:fs';
import crypto from 'node:crypto';
import http, { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { dbManager } from '../db';
import { BaseManager } from '../BaseManager';
import { Repository } from 'typeorm';
import { projectManager } from '../project';
import { Projects } from '@/entities/projects';
import mastraManager from '../mastra';
import type { ModelId, AuthenticateRequest, AuthenticateResponse, InitializeRequest, InitializeResponse, ListSessionsRequest, ListSessionsResponse, SessionInfo, LoadSessionRequest, LoadSessionResponse, NewSessionRequest, NewSessionResponse, SetSessionModeRequest, SetSessionModeResponse, PromptRequest, PromptResponse, SetSessionConfigOptionRequest, SetSessionConfigOptionResponse, SessionConfigOption, SessionUpdate, UsageUpdate, CreateTerminalRequest, CreateTerminalResponse, ModelInfo, SessionInfoUpdate, ToolCall, ToolCallUpdate, Plan, PlanEntry, PlanEntryStatus, ToolKind } from '@agentclientprotocol/sdk' with { "resolution-mode": "import" };
import { agentManager } from '../mastra/agents';
import { DefaultAgent } from '../mastra/agents/default-agent';
import { appManager } from './index';
import { providersManager } from '../providers';

import { ModelType, Provider, ProviderModel } from '@/types/provider';
import { Read } from '../tools/file-system/read';
import { Edit } from '../tools/file-system/edit';
import { Bash } from '../tools/file-system/bash';
import { WebFetch } from '../tools/web/web-fetch';
import { WebSearch } from '../tools/web/web-search';

export type ACPConfig = {
  enabled: boolean;
  transport: 'http';
  port: number;
};

type SessionState = {
  id: string;
  createdAt: string;
  pendingPrompt?: AbortController | null;
};

type ACPModule = any;

type PromptRequestLike = {
  sessionId: string;
  prompt?: Array<{ type?: string; text?: string }>;
};

type CancelNotificationLike = {
  sessionId: string;
};

type SessionUpdateWriter = (update: SessionUpdate) => void | Promise<void>;

class ACPRequestError extends Error {
  code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
    this.name = 'ACPRequestError';
  }
}

const ACP_PROTOCOL_VERSION = 1;
const DEFAULT_ACP_PORT = 41101;

const DEFAULT_ACP_CONFIG: ACPConfig = {
  enabled: false,
  transport: 'http',
  port: DEFAULT_ACP_PORT,
};

async function readJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  return raw ? JSON.parse(raw) : {};
}

class ACPManager extends BaseManager {
  private settingsRepository: Repository<Settings>;
  private config: ACPConfig = DEFAULT_ACP_CONFIG;
  // private sessions = new Map<string, SessionState>();
  private server?: http.Server;

  public async init(): Promise<void> {
    this.settingsRepository = dbManager.dataSource.getRepository(Settings);
    this.config = await this.getConfig();
    await this.ensureBridgeScript();
  }

  public async getConfig(): Promise<ACPConfig> {
    const setting = await this.settingsRepository.findOne({
      where: { id: 'acp' },
    });

    return {
      ...DEFAULT_ACP_CONFIG,
      ...(setting?.value ?? {}),
      transport: 'http',
    };
  }

  public async setEnabled(enabled: boolean): Promise<ACPConfig> {
    const config = {
      ...(await this.getConfig()),
      enabled,
      transport: 'http' as const,
    };

    await this.settingsRepository.upsert(new Settings('acp', config), ['id']);
    this.config = config;
    await this.ensureBridgeScript();

    return config;
  }

  public async setPort(port: number): Promise<ACPConfig> {
    const config = {
      ...(await this.getConfig()),
      port,
      transport: 'http' as const,
    };

    await this.settingsRepository.upsert(new Settings('acp', config), ['id']);
    this.config = config;
    await this.ensureBridgeScript();

    return config;
  }

  public async start(): Promise<void> {
    this.config = await this.getConfig();
    if (!this.config.enabled || this.server?.listening) return;

    this.server = http.createServer((req, res) => {
      this.handleHttpRequest(req, res).catch((error) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.config.port, '127.0.0.1', () => {
        this.server?.off('error', reject);
        resolve();
      });
    });

    await this.ensureBridgeScript();
  }

  public async stop(): Promise<void> {
    if (!this.server) return;

    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    this.server = undefined;
  }

  public isRunning(): boolean {
    return !!this.server?.listening;
  }

  public getUrl(): string {
    return `http://127.0.0.1:${this.config.port}/acp`;
  }

  public getBridgeDir(): string {
    return path.join(app.getPath('userData'), 'acp');
  }

  public getBridgeScriptPath(): string {
    return path.join(this.getBridgeDir(), 'stdio-http-bridge.js');
  }

  public getBridgeCommand(): string {
    return `node ${JSON.stringify(this.getBridgeScriptPath())}`;
  }

  private getBridgeScriptContent(): string {
    const endpoint = this.getUrl();
    return `#!/usr/bin/env node
const readline = require('node:readline');
const { URL } = require('node:url');

const endpoint = process.env.AIME_CHAT_ACP_HTTP_URL || ${JSON.stringify(endpoint)};
const endpointUrl = new URL(endpoint);

async function sendMessage(message) {
  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(message),
  });

  if (response.status === 204) {
    return [];
  }

  const body = response.body;
  if (!body) {
    const text = await response.text();
    return text ? [JSON.parse(text)] : [];
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const messages = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\\r?\\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      messages.push(JSON.parse(trimmed));
    }
  }

  buffer += decoder.decode();
  const trimmed = buffer.trim();
  if (trimmed) {
    messages.push(JSON.parse(trimmed));
  }

  return messages;
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

let queue = Promise.resolve();

rl.on('line', (line) => {
  queue = queue.then(async () => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let message;
    try {
      message = JSON.parse(trimmed);
    } catch (error) {
      process.stderr.write(\`Failed to parse ACP message: \${error.message}\\n\`);
      return;
    }

    try {
      const results = await sendMessage(message);
      for (const result of results) {
        process.stdout.write(JSON.stringify(result) + '\\n');
      }
    } catch (error) {
      const fallback = {
        jsonrpc: '2.0',
        id: message.id ?? null,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        },
      };

      if (message.id !== undefined && message.id !== null) {
        process.stdout.write(JSON.stringify(fallback) + '\\n');
      } else {
        process.stderr.write(\`ACP bridge error: \${fallback.error.message}\\n\`);
      }
    }
  }).catch((error) => {
    process.stderr.write(\`ACP bridge unexpected error: \${error instanceof Error ? error.message : String(error)}\\n\`);
  });
});

rl.on('close', async () => {
  await queue.catch(() => undefined);
  process.exit(0);
});
`;
  }

  public async ensureBridgeScript(): Promise<void> {
    fs.mkdirSync(this.getBridgeDir(), { recursive: true });
    const scriptPath = this.getBridgeScriptPath();
    fs.writeFileSync(scriptPath, this.getBridgeScriptContent(), 'utf-8');
    fs.chmodSync(scriptPath, 0o755);
  }

  public async getInfo(): Promise<ACPInfo> {
    this.config = await this.getConfig();

    return {
      enabled: this.config.enabled,
      status: this.isRunning() ? 'running' : 'stopped',
      transport: 'http',
      url: this.getUrl(),
      port: this.config.port,
      bridgeScriptPath: this.getBridgeScriptPath(),
      bridgeCommand: this.getBridgeCommand(),
    };
  }

  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse) {
    if (req.method === 'GET' && req.url === '/acp') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          name: 'aime-chat-acp',
          transport: 'http',
          status: this.isRunning() ? 'running' : 'stopped',
        }),
      );
      return;
    }

    if (req.method !== 'POST' || req.url !== '/acp') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    const body = await readJsonBody(req);
    const method = body?.method;
    const params = body?.params ?? {};
    console.log('method', method);
    console.log('params', params);

    const writeJsonLine = (payload: unknown) => {
      res.write(JSON.stringify(payload) + '\n');
    };

    const writeSessionUpdate: SessionUpdateWriter = (update) => {
      writeJsonLine({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: params.sessionId,
          update,
        },
      });
    };

    try {
      let result: unknown;
      const agent = new ACPStudioAgent();

      if (method === 'session/prompt') {
        res.writeHead(200, {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        result = await agent.prompt(params, writeSessionUpdate);
        writeJsonLine({
          jsonrpc: '2.0',
          id: body?.id ?? null,
          result,
        });
        res.end();
        return;
      }

      switch (method) {
        case 'initialize':
          result = await agent.initialize(params);
          break;
        case 'authenticate':
          result = await agent.authenticate(params);
          break;
        case 'session/set_config_option':
          result = await agent.setSessionConfigOption(params);
          break;
        case 'session/load':
          result = await agent.loadSession(params);
          break;
        case 'session/list':
          result = await agent.listSessions(params);
          break;
        case 'session/new':
          result = await agent.newSession(params);
          break;
        case 'session/set_mode':
          result = await agent.setSessionMode(params);
          break;
        case 'session/cancel':
          await agent.cancel(params);
          res.writeHead(204);
          res.end();
          return;
        case 'terminal/create':
          result = await agent.createTerminal(params);
          break;
        default:
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: body?.id ?? null,
              error: {
                code: -32601,
                message: `Method not found: ${method}`,
              },
            }),
          );
          return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: body?.id ?? null,
          result,
        }),
      );
    } catch (error) {
      const statusCode = method === 'session/prompt' ? 200 : 500;
      if (!res.headersSent) {
        res.writeHead(statusCode, {
          'Content-Type': method === 'session/prompt' ? 'application/x-ndjson; charset=utf-8' : 'application/json',
        });
      }

      const payload = {
        jsonrpc: '2.0',
        id: body?.id ?? null,
        error: {
          code: error instanceof ACPRequestError ? error.code : -32000,
          message: error instanceof Error ? error.message : String(error),
        },
      };

      if (method === 'session/prompt') {
        writeJsonLine(payload);
        res.end();
        return;
      }

      res.end(JSON.stringify(payload));
    }
  }
}

class ACPStudioAgent {
  constructor() { }

  async initialize(params: InitializeRequest): Promise<InitializeResponse> {
    return {
      protocolVersion: params.protocolVersion || ACP_PROTOCOL_VERSION,
      agentCapabilities: {
        loadSession: true,
        sessionCapabilities: {
          list: {},
        },
        promptCapabilities: {
          audio: false,
          image: false,
          embeddedContext: false,
        },
        mcpCapabilities: {
          sse: true,
          http: true,
        }
      },
      agentInfo: {
        name: 'aime-chat-acp',
        title: 'Aime Chat ACP',
        version: app.getVersion(),
      },
      authMethods: [],
    };
  }

  async authenticate(params: AuthenticateRequest): Promise<AuthenticateResponse> {
    return {};
  }

  async setSessionConfigOption(params: SetSessionConfigOptionRequest): Promise<SetSessionConfigOptionResponse> {
    return {
      configOptions: [] as SessionConfigOption[]
    };
  }

  async loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
    const { cwd, sessionId, mcpServers } = params;
    const thread = await mastraManager.getThread(sessionId, true);
    if (!thread) {
      throw new ACPRequestError(-32000, `Session ${sessionId} not found`);
    }

    const projectId = thread.resourceId.split(':')[1];
    const project = await projectManager.projectsRepository.findOne({
      where: { id: projectId },
    });
    const agents = await agentManager.getAvailableAgents();

    const agentId = project.defaultAgentId || DefaultAgent.agentName;

    const appInfo = await appManager.getInfo()
    const agent = await agentManager.getAgent(agentId);
    const modelId = thread?.metadata?.model || agent?.defaultModelId || appInfo?.defaultModel?.model as string;


    const providers = await providersManager.getAvailableModels();



    const models = [];
    providers.map((provider: Provider) => {
      provider.models?.map((model: ProviderModel) => {
        models.push({
          id: model.id,
          name: model.name,
        })
      })
    })
    return {
      modes: {
        currentModeId: agentId,
        availableModes: agents.filter(x => !x.isHidden).map((agent) => ({
          id: agent.id,
          name: agent.name,
          description: agent.description,
        }))
      },
      models: {
        currentModelId: modelId as ModelId,
        availableModels: models
      }
    };
  }

  async listSessions(params: ListSessionsRequest): Promise<ListSessionsResponse> {
    const project = await projectManager.projectsRepository.findOne({
      where: {
        path: params.cwd,
      },
    });
    if (!project) {
      return {
        sessions: [],
        nextCursor: null,
      };
    }

    const threads = await mastraManager.getThreads({
      resourceId: `project:${project.id}`,
    });

    const sessions =
      threads.items
        .map((thread) => {
          return {
            sessionId: thread.id,
            cwd: project.path,
            title: thread.title || project?.title || null,
            updatedAt: thread.updatedAt ? new Date(thread.updatedAt).toISOString() : null,
          } as SessionInfo;
        }) as SessionInfo[];
    return {
      sessions,
    } as ListSessionsResponse;
  }

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    let project = await projectManager.projectsRepository.findOne({
      where: {
        path: params.cwd,
      },
    });
    let projectId: string;

    if (!project) {
      projectId = nanoid();
      const name = path.basename(params.cwd);
      project = new Projects(projectId);
      project.title = name;
      project.path = params.cwd;
      project = await projectManager.saveProject(project);
    } else {
      projectId = project.id;
    }

    // const threads = await mastraManager.getThreads({
    //   resourceId: `project:${projectId}`,
    // });

    // let thread = threads.items.find((x) => x.resourceId === `project:${projectId}`);
    // if (!thread) {
    //   thread = await mastraManager.createThread({
    //     resourceId: `project:${projectId}`,
    //   });
    // }

    const appInfo = await appManager.getInfo();
    const agentId = project.defaultAgentId ?? appInfo?.defaultAgent;
    const agent = await agentManager.getAgent(agentId);

    const modelId = agent?.defaultModelId || appInfo?.defaultModel?.model as string

    const thread = await mastraManager.createThread({
      resourceId: `project:${projectId}`,
      agentId: agentId,
      model: modelId,
      tools: agent?.tools,
    });

    const providers = await providersManager.getAvailableModels(ModelType.LLM);
    const models = [];
    for (const provider of providers) {
      for (const model of provider.models) {
        models.push({
          modelId: model.id,
          name: model.name,
        } as ModelInfo)
      }
    }



    const agents = await agentManager.getAvailableAgents();
    // const modelId = thread.metadata?.model || agent.defaultModelId || appInfo?.defaultModel?.model as ModelId;
    // this.sessions.set(thread.id, {
    //   id: thread.id,
    //   createdAt: new Date().toISOString(),
    //   pendingPrompt: null,
    // });

    return {
      sessionId: thread.id,
      configOptions: null,
      modes: {
        currentModeId: agent.id,
        availableModes: agents.filter(x => !x.isHidden).map((agent) => ({
          id: agent.id,
          name: agent.name,
          description: agent.description,
        }))
      },
      models: {
        currentModelId: modelId as ModelId,
        availableModels: models
      },
      _meta: {
        threadId: thread.id,
        resourceId: thread.resourceId,
        projectId,
      },
    } as NewSessionResponse;
  }

  async setSessionMode(params: SetSessionModeRequest): Promise<SetSessionModeResponse> {
    const { sessionId, modeId } = params;
    const thread = await mastraManager.getThread(sessionId, true);
    if (!thread) {
      throw new ACPRequestError(-32000, `Session ${sessionId} not found`);
    }

    const projectId = thread.resourceId.split(':')[1];
    const project = await projectManager.projectsRepository.findOne({
      where: { id: projectId },
    });
    if (!project) {
      throw new ACPRequestError(-32000, `Project ${projectId} not found`);
    }

    const agent = await agentManager.getAgent(modeId);

    if (!agent || agent.isHidden) {
      throw new ACPRequestError(-32000, `Agent ${modeId} not found`);
    }

    project.defaultAgentId = agent.id;

    await mastraManager.updateThread(sessionId, {
      id: thread.id,
      resourceId: thread.resourceId,
      createdAt: thread.createdAt,
      updatedAt: new Date(),
      title: project.title,
      metadata: {
        ...thread.metadata,
        agentId: agent.id,
      },
    });



    await projectManager.saveProject(project);

    return {};
  }

  async createTerminal(params: CreateTerminalRequest): Promise<CreateTerminalResponse> {
    const { sessionId, args, cwd, env, command, outputByteLimit } = params;


    return {
      terminalId: nanoid(),
    };
  }
  async prompt(params: PromptRequest, writeUpdate?: SessionUpdateWriter): Promise<PromptResponse> {
    const threadId = params.sessionId;
    const thread = await mastraManager.getThread(threadId, true);

    if (!thread) {
      throw new ACPRequestError(-32000, `Session ${params.sessionId} not found`);
    }

    const emitUpdate = async (update: SessionUpdate) => {
      if (!writeUpdate) return;
      await writeUpdate(update);
    };

    const projectId = thread.resourceId.split(':')[1];
    const textParts = (params.prompt ?? [])
      .filter((item) => item.type === 'text')
      .map((item) => item.text || '')
      .join('\n');
    const messageParts = textParts ? [{ type: 'text' as const, text: textParts }] : [];
    const messageId = crypto.randomUUID();

    const appInfo = await appManager.getInfo();
    const project = await projectManager.getProject(projectId);
    const agentId = thread.metadata?.agentId as string || project.defaultAgentId || appInfo.defaultAgent;
    const agent = await agentManager.getAgent(agentId);
    const modeId = thread.metadata?.model as string || agent.defaultModelId || appInfo.defaultModel?.model as string;

    for (const part of params.prompt) {
      await emitUpdate({
        sessionUpdate: 'user_message_chunk',
        content: part,
      });
    }


    const getKind = (toolName: string): ToolKind | undefined => {

      if (toolName == Read.toolName) {
        return 'read';
      }
      else if (toolName == Edit.toolName) {
        return 'edit';
      }
      else if (toolName == Bash.toolName) {
        return 'execute';
      } else if (toolName == WebFetch.toolName) {
        return 'fetch';
      } else if (toolName == WebSearch.toolName) {
        return 'search';
      }
      else {
        return 'other';
      }
    }
    const chatResult = await mastraManager.chat(undefined, {
      chatId: threadId,
      projectId,
      model: modeId,
      agentId: agentId,
      tools: thread.metadata?.tools as string[] || agent.tools || [],
      subAgents: thread.metadata?.subAgents as string[] || agent.subAgents || [],
      webSearch: false,
      requireToolApproval: false,
      messages: [{
        id: nanoid(),
        parts: messageParts,
        role: 'user',
      }],
    }, {
      onPlanUpdate: async (plans) => {
        await emitUpdate({
          sessionUpdate: 'plan',
          entries: plans.map((plan) => ({
            content: plan.description,
            status: plan.status as PlanEntryStatus
          } as PlanEntry)),
        } as Plan & { sessionUpdate: 'plan' });
      },
      onToolCall: async (toolCall) => {
        await emitUpdate({
          title: toolCall.toolName,
          sessionUpdate: 'tool_call',
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          rawInput: toolCall.input,
          status: 'pending',
          kind: getKind(toolCall.toolName),
          content: [],
        } as ToolCall & { sessionUpdate: 'tool_call' });
      },
      onToolCallUpdate: async (toolCallOutput, status) => {
        await emitUpdate({
          sessionUpdate: 'tool_call_update',
          toolCallId: toolCallOutput.toolCallId,
          output: toolCallOutput.output,
          status: 'completed',
          title: '',
        } as ToolCallUpdate & { sessionUpdate: 'tool_call_update' });
      },
      onThreadChanged: async (thread) => {
        await emitUpdate({
          sessionUpdate: 'session_info_update',
          updatedAt: new Date().toISOString(),
          title: thread.title,
        } as SessionInfoUpdate & { sessionUpdate: 'session_info_update' });

      },
      onThought: async (chunk) => {
        await emitUpdate({
          sessionUpdate: 'agent_thought_chunk',
          messageId,
          content: {
            type: 'text',
            text: chunk,
          },
        });
      },
      onChunk: async (chunk) => {
        await emitUpdate({
          sessionUpdate: 'agent_message_chunk',
          messageId,
          content: {
            type: 'text',
            text: chunk,
          },
        });
      },
      onUsage: async (usage, maxTokens) => {
        await emitUpdate({
          sessionUpdate: 'usage_update',
          used: usage.totalTokens,
          size: maxTokens,
        });
      },
    });

    const output = await mastraManager.getThreadMessages({
      threadId,
      resourceId: `project:${projectId}`,
    });

    const lastMessage = output.messages[output.messages.length - 1];
    const responseText = lastMessage?.parts.find((x) => x.type === 'text')?.text ?? '';

    if (!chatResult.success) {
      throw new ACPRequestError(-32000, chatResult.error || 'Unknown error');
    }

    // if (responseText) {
    //   await emitUpdate({
    //     sessionUpdate: 'agent_message_chunk',
    //     messageId,
    //     content: {
    //       type: 'text',
    //       text: responseText,
    //     },
    //   });
    // }

    const usage = thread.metadata?.usage as { totalTokens?: number } | undefined;
    const maxTokens = thread.metadata?.maxTokens as number | undefined;
    if (usage?.totalTokens && maxTokens) {
      const usageUpdate: UsageUpdate & { sessionUpdate: 'usage_update' } = {
        sessionUpdate: 'usage_update',
        used: usage.totalTokens,
        size: maxTokens,
      };
      await emitUpdate(usageUpdate);
    }

    return {
      stopReason: 'end_turn',
      _meta: {
        response: responseText,
      },
    };
  }

  async cancel(params: CancelNotificationLike): Promise<void> {
    await mastraManager.chatAbort(params.sessionId as string);
  }
}

export const acpManager = new ACPManager();
export { DEFAULT_ACP_PORT };
