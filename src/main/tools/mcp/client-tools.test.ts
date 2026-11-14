/** @jest-environment node */
import { loadMcpTools, type McpClientState } from './client-tools';

describe('loadMcpTools', () => {
  const createClient = () => {
    const listToolsWithErrors = jest.fn();
    const notifications = { onListChanged: jest.fn() };
    const mcp = Object.defineProperty({ listToolsWithErrors }, 'tools', {
      get: () => notifications,
    });
    const client: Pick<McpClientState, 'mcp' | 'tools'> = {
      mcp: mcp as unknown as McpClientState['mcp'],
    };
    return { client, listToolsWithErrors, notifications };
  };

  it('caches discovered tools without overwriting the SDK notification API', async () => {
    const { client, listToolsWithErrors, notifications } = createClient();
    const tools = {
      chrome_devtools_list_pages: { id: 'chrome_devtools_list_pages' },
    };
    listToolsWithErrors.mockResolvedValue({ tools, errors: {} });

    await expect(loadMcpTools(client)).resolves.toBe(tools);
    expect(client.tools).toBe(tools);
    expect(client.mcp.tools).toBe(notifications);
  });

  it('reports per-server connection failures instead of caching empty tools', async () => {
    const { client, listToolsWithErrors } = createClient();
    client.tools = {};
    listToolsWithErrors.mockResolvedValue({
      tools: {},
      errors: { chrome_devtools: 'spawn npx ENOENT' },
    });

    await expect(loadMcpTools(client)).rejects.toThrow(
      'chrome_devtools: spawn npx ENOENT',
    );
    expect(client.tools).toBeUndefined();
  });

  it('clears stale tools when discovery throws and preserves the original error', async () => {
    const { client, listToolsWithErrors } = createClient();
    client.tools = {};
    const error = new Error('Connection closed');
    listToolsWithErrors.mockRejectedValue(error);

    await expect(loadMcpTools(client)).rejects.toBe(error);
    expect(client.tools).toBeUndefined();
  });

  it('allows a successful server with no tools', async () => {
    const { client, listToolsWithErrors } = createClient();
    listToolsWithErrors.mockResolvedValue({ tools: {}, errors: {} });

    await expect(loadMcpTools(client)).resolves.toEqual({});
    expect(client.tools).toEqual({});
  });
});
