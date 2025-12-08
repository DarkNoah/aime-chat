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
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
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

function AgentPage() {
  const { setTitle } = useHeader();
  const [isRunning, setIsRunning] = useState(false);
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  useEffect(() => {
    setTitle(t('sidebar.agents'));
  }, [setTitle, t]);

  const getList = async () => {
    const data = await window.electron.agents.getList();
    console.log(data);
    setAgents(data);
  };
  useEffect(() => {
    getList();
  }, []);

  const handleClickAgent = (agent: Agent) => {
    navigate(`/agents/${agent.id}`);
  };

  return (
    <div className="h-full w-full flex flex-col gap-2 p-4">
      <div className="flex flex-col w-full min-w-0">
        <div className="flex flex-col items-center justify-between gap-2">
          <div className="flex flex-row items-center gap-2">
            <InputGroup>
              <InputGroupInput
                placeholder={t('common.search')}
                value={search}
                className="w-[400px]"
                onChange={(e) => setSearch(e.target.value)}
              />
              <InputGroupAddon>
                <IconSearch></IconSearch>
              </InputGroupAddon>
            </InputGroup>

            <Button>Add</Button>
          </div>

          <div className="flex flex-row items-center gap-2 flex-1 w-full min-w-0 ">
            <Label>{t('common.category')}:</Label>
            <div className="flex-1 min-w-0 w-full ">
              <ToggleGroup
                type="multiple"
                variant="outline"
                spacing={2}
                size="sm"
                className="flex-wrap"
              >
                {Object.entries(AgentTags).map(([key, value]) => {
                  return (
                    <ToggleGroupItem value={value}>{value}</ToggleGroupItem>
                  );
                })}
              </ToggleGroup>
            </div>
          </div>
        </div>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="w-full flex flex-row flex-wrap gap-2">
          {agents.map((agent) => (
            <Card className="w-full max-w-sm" key={agent.id}>
              <CardHeader>
                <CardTitle
                  className="cursor-pointer hover:underline"
                  onClick={() => handleClickAgent(agent)}
                >
                  {agent.name}
                </CardTitle>
                <CardDescription>{agent.description}</CardDescription>
                <CardAction>
                  <Switch
                    checked={agent.isActive}
                    onCheckedChange={async (v) => {
                      await window.electron.agents.update({
                        id: agent.id,
                        isActive: v,
                      });
                      await getList();
                    }}
                  />
                </CardAction>
              </CardHeader>
              <CardContent></CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export default AgentPage;
