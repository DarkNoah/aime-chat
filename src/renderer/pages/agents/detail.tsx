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
import {
  IconArrowBigRightLinesFilled,
  IconBox,
  IconEdit,
  IconNavigation,
  IconPlus,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
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
import { Agent, AgentTags, AgentType } from '@/types/agent';
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
  ItemActions,
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
import { Textarea } from '@/renderer/components/ui/textarea';
import { ChatAgentSelector } from '@/renderer/components/chat-ui/chat-agent-selector';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/renderer/components/ui/alert-dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
} from '@/renderer/components/ui/empty';
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from '@/renderer/components/ui/field';
import { ChatModelSelect } from '@/renderer/components/chat-ui/chat-model-select';

function AgentDetail() {
  const { setTitle, setTitleAction } = useHeader();
  const [isRunning, setIsRunning] = useState(false);
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [agent, setAgent] = useState<Agent | null>(null);
  const [editinInstructions, setEditinInstructions] = useState<boolean>(false);
  // useEffect(() => {
  //   setTitle(t('sidebar.agents'));
  // }, [setTitle, t]);

  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();

  const handleDelete = async () => {
    await window.electron.agents.deleteAgent(id);
    navigate('/agents');
  };

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

    if (data.type === AgentType.CUSTOM) {
      setTitleAction(
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">
              <IconTrash></IconTrash>
              {t('common.delete')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('common.delete_agent')}</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>,
      );
    }

    setAgent(data);
  };
  useEffect(() => {
    getAgent();
  }, [id]);

  const handleAddDefaultTool = async (tools: string[]) => {
    await window.electron.agents.saveAgent({
      id: agent?.id,
      tools,
    });
    const data = await window.electron.agents.getAgent(id);
    setAgent(data);
  };

  const handleAddDefaultSubAgent = async (subAgents: string[]) => {
    await window.electron.agents.saveAgent({
      id: agent?.id,
      subAgents,
    });
    const data = await window.electron.agents.getAgent(id);
    setAgent(data);
  };

  const handleAgentChanged = async (_data: Agent) => {
    await window.electron.agents.saveAgent({
      ..._data,
      id: agent?.id,
    });
    await getAgent();
  };

  return (
    <div className="h-full w-full flex flex-row gap-2 p-4 min-h-0 overflow-y-auto">
      <div className="w-[500px]">
        <Card>
          <CardHeader>
            {/* <CardTitle className="flex flex-col ">
              <small className="text-xs text-gray-500 flex flex-row items-center mb-2">
                <Label>ID: </Label> {agent?.id}
              </small>
              <Input
                className="border-none focus-visible:ring-0 shadow-none focus-visible:bg-secondary w-full bg-secondary"
                value={agent?.name}
                autoFocus
                onChange={(e) => setAgent({ ...agent, name: e.target.value })}
                onBlur={() => handleAgentChanged(agent)}
                readOnly={agent?.type !== AgentType.CUSTOM}
              ></Input>
            </CardTitle> */}
            <CardDescription>
              <FieldGroup>
                <Field>
                  <FieldLabel>ID: {agent?.id}</FieldLabel>
                  <FieldContent>
                    <Input
                      className="border-none focus-visible:ring-0 shadow-none focus-visible:bg-secondary w-full bg-secondary"
                      value={agent?.name}
                      autoFocus
                      onChange={(e) =>
                        setAgent({ ...agent, name: e.target.value })
                      }
                      onBlur={() => handleAgentChanged(agent)}
                      readOnly={agent?.type !== AgentType.CUSTOM}
                    ></Input>
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>{t('common.description')}:</FieldLabel>
                  <FieldContent>
                    <Textarea
                      className="border-none focus-visible:ring-0 shadow-none focus-visible:bg-secondary w-full bg-secondary"
                      value={agent?.description}
                      onChange={(e) =>
                        setAgent({ ...agent, description: e.target.value })
                      }
                      onBlur={() => handleAgentChanged(agent)}
                      readOnly={agent?.type !== AgentType.CUSTOM}
                    ></Textarea>
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>{t('common.default_model')}:</FieldLabel>
                  <FieldContent>
                    <ChatModelSelect
                      clearable
                      value={agent?.defaultModelId}
                      onChange={(model) => {
                        handleAgentChanged({ ...agent, defaultModelId: model });
                      }}
                    />
                  </FieldContent>
                </Field>
              </FieldGroup>
            </CardDescription>
          </CardHeader>

          <CardContent>
            <ToggleGroup
              type="multiple"
              variant="outline"
              spacing={2}
              size="sm"
              className="flex-wrap"
              value={agent?.tags ?? []}
              onValueChange={(value) => {
                handleAgentChanged({ ...agent, tags: value });
              }}
            >
              {Object.entries(AgentTags).map(([key, value]) => {
                return <ToggleGroupItem value={value}>{value}</ToggleGroupItem>;
              })}
            </ToggleGroup>
          </CardContent>
        </Card>
      </div>
      <Tabs className="flex-1" defaultValue="instructions">
        <TabsList>
          <TabsTrigger value="instructions">
            {t('agents.instructions')}
          </TabsTrigger>
          <TabsTrigger value="tools">
            {`${t('agents.tools')} (${agent?.tools?.length ?? 0})`}
          </TabsTrigger>
          <TabsTrigger value="subAgents">
            {`${t('agents.sub_agents')} (${agent?.subAgents?.length ?? 0})`}
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="instructions"
          className="overflow-y-auto min-h-0 flex-1"
        >
          <Card>
            <CardContent className="flex flex-col gap-2">
              {editinInstructions && agent?.type === AgentType.CUSTOM && (
                <div className="flex flex-row gap-2">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      console.log(agent);
                      await handleAgentChanged(agent);
                      setEditinInstructions(false);
                    }}
                  >
                    {t('common.save')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      getAgent();
                      setEditinInstructions(false);
                    }}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              )}
              {!editinInstructions && agent?.type === AgentType.CUSTOM && (
                <div>
                  <Button
                    variant="outline"
                    onClick={() => setEditinInstructions(true)}
                  >
                    {t('common.edit')}
                  </Button>
                </div>
              )}

              {!editinInstructions && agent?.instructions && (
                <pre className="text-sm text-wrap whitespace-pre-wrap">
                  {agent?.instructions}
                </pre>
              )}
              {!editinInstructions && !agent?.instructions && (
                <div className="flex items-center space-x-4 ">
                  <Empty className="bg-secondary/50">
                    <EmptyHeader>
                      {/* <EmptyMedia variant="icon"></EmptyMedia> */}
                      <EmptyDescription className="flex flex-col items-center gap-2">
                        <IconBox />
                        No Prompt
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </div>
              )}
              {editinInstructions && (
                <Textarea
                  placeholder={t('agents.prompt_placeholder')}
                  value={agent?.instructions}
                  onChange={(e) =>
                    setAgent({ ...agent, instructions: e.target.value })
                  }
                ></Textarea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="tools" className="overflow-y-auto min-h-0 flex-1">
          <Card>
            <CardContent className="flex flex-col gap-2">
              <ChatToolSelector
                value={agent?.tools ?? []}
                onChange={handleAddDefaultTool}
              >
                <Button variant="outline">
                  <IconEdit></IconEdit>
                  {t('agents.config_defalut_tool')}
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
        <TabsContent
          value="subAgents"
          className="overflow-y-auto min-h-0 flex-1"
        >
          <Card>
            <CardContent className="flex flex-col gap-2">
              <ChatAgentSelector
                mode="multiple"
                value={agent?.subAgents ?? []}
                onChange={handleAddDefaultSubAgent}
              >
                <Button variant="outline" className="w-full">
                  <IconEdit></IconEdit>
                  {t('agents.config_subagent')}
                </Button>
              </ChatAgentSelector>
              {agent?.subAgents.map((subAgentId) => {
                return (
                  <Item key={subAgentId} variant="outline">
                    <ItemContent>
                      <ItemTitle>{subAgentId}</ItemTitle>
                    </ItemContent>
                    <ItemActions>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="cursor-pointer"
                        onClick={() => {
                          navigate(`/agents/${subAgentId}`);
                        }}
                      >
                        <IconArrowBigRightLinesFilled></IconArrowBigRightLinesFilled>
                      </Button>
                    </ItemActions>
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
