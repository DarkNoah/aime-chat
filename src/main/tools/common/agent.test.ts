import { Agent } from './agent';
import { agentManager } from '@/main/mastra/agents';
import { appManager } from '@/main/app';
import mastraManager from '@/main/mastra';
import { providersManager } from '@/main/providers';

jest.mock('@/main/mastra/agents', () => ({
  agentManager: {
    buildAgent: jest.fn(),
  },
}));

jest.mock('@/main/app', () => ({
  appManager: {
    getInfo: jest.fn(),
  },
}));

jest.mock('@/main/mastra', () => ({
  __esModule: true,
  default: {
    mastra: {
      getStorage: jest.fn(),
    },
  },
}));

jest.mock('@/main/providers', () => ({
  providersManager: {
    getLanguageModel: jest.fn(),
  },
}));

jest.mock('@/utils/nanoid', () => ({
  nanoid: jest.fn(() => 'test-id'),
}));

jest.mock('./background-agent', () => ({
  __esModule: true,
  default: {},
}));

describe('Agent tool input schema', () => {
  it('does not expose a background completion injection mode', () => {
    const tool = new Agent({ subAgents: [] });
    const input = {
      description: 'Inspect project',
      prompt: 'Inspect every relevant file',
      subagent_type: 'Explore',
      run_in_background: true,
    };

    expect(Object.keys(tool.inputSchema.shape)).not.toContain('injection_mode');
    expect(tool.inputSchema.safeParse(input).success).toBe(true);
    expect(
      tool.inputSchema.safeParse({
        ...input,
        injection_mode: 'after-session',
      }).success,
    ).toBe(false);
    expect(tool.description).not.toContain('injection_mode');
  });
});

describe('Agent tool observational memory', () => {
  const saveThread = jest.fn();
  const stream = jest.fn();
  const observationalMemoryModel = { modelId: 'observational-memory-model' };

  beforeEach(() => {
    jest.clearAllMocks();
    (
      mastraManager.mastra.getStorage as unknown as jest.Mock
    ).mockReturnValue({
      getStore: jest.fn().mockResolvedValue({ saveThread }),
    });
    jest.mocked(providersManager.getLanguageModel).mockResolvedValue(
      observationalMemoryModel as never,
    );
    jest.mocked(agentManager.buildAgent).mockResolvedValue({ stream } as never);
    stream.mockResolvedValue({
      fullStream: [],
      text: Promise.resolve('done'),
      content: Promise.resolve([]),
      status: 'success',
    });
  });

  it.each([
    ['the configured fast model', 'provider/fast', 'provider/fast'],
    ['the request model fallback', '', 'provider/chat'],
  ])('uses %s for observational memory', async (_, fastModel, expectedModel) => {
    jest.mocked(appManager.getInfo).mockResolvedValue({
      defaultAgent: 'default-agent',
      defaultThink: 'low',
      defaultModel: {
        fastModel,
      },
    } as never);

    const requestValues: Record<string, unknown> = {
      model: 'provider/chat',
      agentId: 'root-agent',
      threadId: 'root-thread',
      resourceId: 'root-resource',
      tools: [],
    };
    const tool = new Agent({ subAgents: [] });

    await tool.execute(
      {
        description: 'Inspect project',
        prompt: 'Inspect every relevant file',
        subagent_type: 'Explore',
      },
      {
        writer: { write: jest.fn() },
        requestContext: {
          get: jest.fn((key: string) => requestValues[key]),
        },
        agent: { toolCallId: 'agent-call' },
      } as never,
    );

    expect(providersManager.getLanguageModel).toHaveBeenCalledWith(
      expectedModel,
    );
    expect(agentManager.buildAgent).toHaveBeenCalledWith(
      'Explore',
      expect.objectContaining({
        modelId: 'provider/chat',
        observationalMemory: {
          model: observationalMemoryModel,
          observation: {
            messageTokens: 64_000,
          },
        },
      }),
    );
    expect(stream).toHaveBeenCalledWith(
      'Inspect every relevant file',
      expect.objectContaining({
        memory: expect.objectContaining({
          options: expect.objectContaining({
            readOnly: false,
            lastMessages: false,
          }),
        }),
      }),
    );
    expect(stream.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        memory: expect.objectContaining({
          options: expect.not.objectContaining({
            observationalMemory: expect.anything(),
          }),
        }),
      }),
    );
  });
});
