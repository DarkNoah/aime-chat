'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/renderer/components/ui/button';
import { Progress } from '@/renderer/components/ui/progress';
import { CircleCheckIcon, Loader2Icon, StarIcon } from 'lucide-react';
import { useHeader } from '@/renderer/hooks/use-title';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Input } from '@/renderer/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/renderer/components/ui/dropdown-menu';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { ScrollArea } from '@/renderer/components/ui/scroll-area';
import { SidebarMenu } from '@/renderer/components/ui/sidebar';
import {
  Link,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { Agent, AgentTags } from '@/types/agent';
import { Label } from '@/renderer/components/ui/label';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/renderer/components/ui/toggle-group';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/renderer/components/ui/input-group';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/renderer/components/ui/card';
import { Switch } from '@/renderer/components/ui/switch';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/renderer/components/ui/breadcrumb';
import { Streamdown } from '@/renderer/components/ai-elements/streamdown';
import { Badge } from '@/renderer/components/ui/badge';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/renderer/components/ui/item';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/renderer/components/ui/tabs';
import { ChatToolSelector } from '@/renderer/components/chat-ui/chat-tool-selector';

function AgentDetail() {
  const { setTitle } = useHeader();
  const [isRunning, setIsRunning] = useState(false);
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [agent, setAgent] = useState<Agent | null>(null);
  // useEffect(() => {
  //   setTitle(t('sidebar.agents'));
  // }, [setTitle, t]);

  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();

  const getAgent = async () => {
    const data = await window.electron.agents.getAgent(id);
    console.log(data);
    setAgent(data);
    setTitle([
      {
        title: t('common.agents'),
        path: '/agents',
      },
      {
        title: data?.name,
        path: `/agents/${data?.id}`,
      },
    ]);
    setAgent(data);
  };
  useEffect(() => {
    getAgent();
  }, []);

  const handleStart = () => {};

  const handleAddDefaultTool = (tools: string[]) => {
    console.log(tools);
  };

  return (
    <div className="h-full w-full flex flex-row gap-2 p-4 min-h-0 overflow-y-auto">
      <div className="w-[500px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-col ">
              {agent?.name}{' '}
              <small className="text-xs text-gray-500 flex flex-row items-center">
                <Label>ID: </Label> {agent?.id}
              </small>
            </CardTitle>
            <CardDescription>{agent?.description}</CardDescription>
          </CardHeader>
          <CardContent></CardContent>
        </Card>
      </div>
      <Tabs className="flex-1" defaultValue="instructions">
        <TabsList>
          <TabsTrigger value="instructions">
            {t('agents.instructions')}
          </TabsTrigger>
          <TabsTrigger value="tools">
            {`${t('agents.tools')} (${agent?.tools.length ?? 0})`}
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="instructions"
          className="overflow-y-auto min-h-0 flex-1"
        >
          <Card>
            <CardContent>
              <pre className="text-sm text-wrap whitespace-pre-wrap">
                {agent?.instructions}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="tools" className="overflow-y-auto min-h-0 flex-1">
          <Card>
            <CardContent className="flex flex-col gap-2">
              <ChatToolSelector onChange={handleAddDefaultTool}>
                <Button variant="outline">
                  <IconPlus></IconPlus>
                  {t('agents.add_defalut_tool')}
                </Button>
              </ChatToolSelector>

              {agent?.tools.map((toolId) => {
                return (
                  <Item key={toolId} variant="outline">
                    <ItemContent>
                      <ItemTitle>
                        {toolId.split(':').slice(1).join(':')}
                      </ItemTitle>
                    </ItemContent>
                  </Item>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default AgentDetail;
