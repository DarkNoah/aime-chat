import { createStep, createWorkflow } from '@mastra/core/workflows';
import z from 'zod';
import mastraManager from '..';
import { providersManager } from '@/main/providers';
import { toolsManager } from '@/main/tools';
import { ToolType } from '@/types/tool';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { getStorage } from '../storage';
import { createUIMessageStream } from 'ai';
import { toAISdkV5Messages } from '@mastra/ai-sdk/ui';

const compressStep = createStep({
  id: 'compress-step',
  description: 'compress messages',
  inputSchema: z.object({
    messages: z.array(z.any()),
    model: z.string(),
  }),
  outputSchema: z.object({
    messages: z.array(z.any()),
  }),
  execute: async ({ inputData, mastra, resumeData, suspend, writer }) => {
    return { messages: [] };
  },
});

const runStep = createStep({
  id: 'compress-step',
  description: 'compress messages',
  inputSchema: z.object({
    messages: z.array(z.any()),
    agentId: z.string(),
    model: z.string(),
    tools: z.array(z.string()),
  }),
  outputSchema: z.object({
    messages: z.array(z.any()),
  }),
  execute: async (e) => {
    const { inputData, mastra, writer, abortSignal } = e;
    const { messages, model, agentId, tools } = inputData;
    const mastraAgent = mastraManager.mastra.getAgentById(
      agentId || 'react-agent',
    );
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
      // tools: { Bash: Bash.build(), WebFetch, PythonExecute },
    });

    const stream = await agent?.stream(messages, {
      maxSteps: 100,
      abortSignal: abortSignal,
    });
    // await stream.aisdk.v5.toUIMessageStream().pipeTo(writer!);
    const uiStream = stream.aisdk.v5.toUIMessageStream();

    const reader = uiStream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      await writer.write(value);
    }
    return {
      messages: [],
    };
  },
});

export const claudeCodeWorkflow = createWorkflow({
  id: 'claude-code',
  description: 'compress messages',
  inputSchema: z.object({
    messages: z.array(z.any()),
    model: z.string(),
  }),
  outputSchema: z.object({
    messages: z.array(z.any()),
  }),
  options: {
    shouldPersistSnapshot: ({ workflowStatus }) =>
      workflowStatus === 'suspended',
  },
})
  // .then(runStep)
  .dowhile(runStep, async ({ inputData: { end } }) => end)
  .commit();

const chatStep = createStep({
  id: 'chat-step',
  description: 'chat step',
  inputSchema: z.object({
    messages: z.array(z.any()),
    agentId: z.string(),
    model: z.string(),
    tools: z.array(z.string()),
  }),
  outputSchema: z.object({
    messages: z.array(z.any()),
  }),
  execute: async (e) => {
    return { messages: [] };
  },
});

const toolExecutionStep = createStep({
  id: 'tool-execution-step',
  description: 'tool execution step',
  inputSchema: z.object({
    messages: z.array(z.any()),
  }),
  outputSchema: z.object({ messages: z.array(z.any()) }),
  execute: async (e) => {
    return { messages: [] };
  },
});

export const chatWorkflow = createWorkflow({
  id: 'chat-workflow',
  inputSchema: z.object({
    messages: z.array(z.any()),
    agentId: z.string(),
    model: z.string(),
    tools: z.array(z.string()),
  }),
  outputSchema: z.object({ messages: z.array(z.any()) }),
})
  .then(chatStep)
  .then(toolExecutionStep)
  .commit();
