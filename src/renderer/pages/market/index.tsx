import { Button } from '@/renderer/components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/renderer/components/ui/item';
import { ScrollArea } from '@/renderer/components/ui/scroll-area';
import { Skeleton } from '@/renderer/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/renderer/components/ui/tabs';
import { useHeader } from '@/renderer/hooks/use-title';
import { Tool, ToolType } from '@/types/tool';
import { IconPlus } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

function MarketPage() {
  const { setTitle } = useHeader();
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<ToolType.SKILL | ToolType.MCP>(
    ToolType.SKILL,
  );
  const [loading, setLoading] = useState(false);
  const [tools, setTools] = useState<
    {
      id: string;
      name: string;
      description: string;
      isInstalled: boolean;
    }[]
  >([]);

  useEffect(() => {
    setTitle(t('sidebar.market'));
  }, [setTitle, t]);

  const getData = useCallback(
    async (_activeTab: ToolType.SKILL | ToolType.MCP) => {
      setLoading(true);
      const data = await window.electron.market.getMarketData(_activeTab);
      console.log(data);
      setTools(data);
      setLoading(false);
    },
    [],
  );

  const installMCP = async (id, mcpServers) => {
    const data = await window.electron.tools.saveMCPServer(id, mcpServers);
  };

  useEffect(() => {
    getData(activeTab);
  }, [getData, activeTab]);
  return (
    <div className="flex flex-1 flex-col gap-2 overflow-hidden p-6 pt-6 mx-auto w-full max-w-3xl">
      <Tabs
        defaultValue={ToolType.SKILL}
        value={activeTab}
        onValueChange={(value) =>
          setActiveTab(value as ToolType.SKILL | ToolType.MCP)
        }
      >
        <TabsList>
          <TabsTrigger value={ToolType.SKILL}>
            {t('market.skills', 'Skills')}
          </TabsTrigger>
          <TabsTrigger value="mcp">{t('market.mcp', 'MCP')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {activeTab === ToolType.SKILL && (
        <span>Give aime chat superpowers. </span>
      )}
      {/* {loading && (
        <div className="grid flex-1 gap-3 lg:grid-cols-2 content-start mt-3 mb-6">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton className="h-20 w-full" key={index} />
          ))}
        </div>
      )} */}
      {!loading && (
        <ScrollArea className="flex-1 min-h-0">
          <small>{t('market.installed', 'Installed')}</small>
          <div className="grid flex-1 gap-3 lg:grid-cols-2 content-start mt-3 mb-6">
            {tools
              .filter((tool) => tool.isInstalled)
              .map((tool) => (
                <Item variant="outline" key={tool.id}>
                  <ItemContent>
                    <ItemTitle
                      className="cursor-pointer"
                      onClick={() => navigate(`/tools/${tool.id}`)}
                    >
                      <span>{tool.name}</span>
                    </ItemTitle>
                    <ItemDescription>{tool.description}</ItemDescription>
                  </ItemContent>
                </Item>
              ))}
          </div>
          <small>{t('market.recommended', 'Recommended')}</small>
          {tools
            .filter((tool) => !tool.isInstalled)
            .map((tool) => (
              <Item variant="outline" key={tool.name}>
                <ItemContent>
                  <ItemTitle>
                    <span>{tool.name}</span>
                  </ItemTitle>
                  <ItemDescription>{tool.description}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button variant="outline" size="icon">
                    <IconPlus />
                  </Button>
                </ItemActions>
              </Item>
            ))}
        </ScrollArea>
      )}
    </div>
  );
}

export default MarketPage;
