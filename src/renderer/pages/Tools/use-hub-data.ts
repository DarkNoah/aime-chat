import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Agent } from '@/types/agent';
import { McpEvent } from '@/types/mcp';
import { Tool, ToolEvent, ToolType } from '@/types/tool';
import { EMPTY_HUB_DATA, HubData } from './hub-model';

type McpClientUpdate = Partial<Tool> & { id: string };

export function useHubData() {
  const [data, setData] = useState<HubData>(EMPTY_HUB_DATA);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [agents, tools] = await Promise.all([
        window.electron.agents.getList() as Promise<Agent[]>,
        window.electron.tools.getList() as Promise<Record<ToolType, Tool[]>>,
      ]);
      if (!mountedRef.current) return;
      setData({
        agents: agents ?? [],
        builtin: tools?.[ToolType.BUILD_IN] ?? [],
        skills: tools?.[ToolType.SKILL] ?? [],
        connectors: tools?.[ToolType.MCP] ?? [],
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const offMcp = window.electron.ipcRenderer.on(
      McpEvent.McpClientUpdated,
      (payload) => {
        const update = payload as McpClientUpdate;
        setData((prev) => ({
          ...prev,
          connectors: prev.connectors.map((tool) =>
            tool.id === update.id ? { ...tool, ...update } : tool,
          ),
        }));
      },
    );
    const offList = window.electron.ipcRenderer.on(
      ToolEvent.ToolListUpdated,
      () => {
        refresh();
      },
    );
    return () => {
      mountedRef.current = false;
      offMcp();
      offList();
    };
  }, [refresh]);

  const patchAgent = useCallback((id: string, patch: Partial<Agent>) => {
    setData((prev) => ({
      ...prev,
      agents: prev.agents.map((agent) =>
        agent.id === id ? { ...agent, ...patch } : agent,
      ),
    }));
  }, []);

  const patchTool = useCallback((id: string, patch: Partial<Tool>) => {
    const apply = (tools: Tool[]) =>
      tools.map((tool) => (tool.id === id ? { ...tool, ...patch } : tool));
    setData((prev) => ({
      ...prev,
      builtin: apply(prev.builtin),
      skills: apply(prev.skills),
      connectors: apply(prev.connectors),
    }));
  }, []);

  return { data, loading, refresh, patchAgent, patchTool };
}
