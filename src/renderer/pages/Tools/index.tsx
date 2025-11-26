import { useEffect, useState } from 'react';
import { useHeader } from '@/renderer/hooks/use-title';
import { useTranslation } from 'react-i18next';
import ThreadsList from '@/renderer/components/threads-list';
import { Button } from '@/renderer/components/ui/button';
import { Input } from '@/renderer/components/ui/input';
import { ScrollArea } from '@/renderer/components/ui/scroll-area';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/renderer/components/ui/sidebar';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/renderer/components/ui/dialog';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/renderer/components/ui/item';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/renderer/components/ui/dropdown-menu';
import {
  IconBox,
  IconClock,
  IconDots,
  IconEdit,
  IconLoader2,
  IconPlus,
  IconToggleLeft,
  IconToggleRightFilled,
  IconTool,
  IconTrashX,
} from '@tabler/icons-react';
import { McpEvent } from '@/types/mcp';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/renderer/components/ui/form';
import { FieldGroup } from '@/renderer/components/ui/field';
import { useForm } from 'react-hook-form';
import { CreateMcp, ImportMcp } from '@/types/mcp';
import { Textarea } from '@/renderer/components/ui/textarea';
import { toast } from 'sonner';
import { Switch } from '@/renderer/components/ui/switch';
import { Tool, ToolType } from '@/types/tool';
import ToolDetail from './detail';
import { Skeleton } from '@/renderer/components/ui/skeleton';
import { Badge } from '@/renderer/components/ui/badge';
import {
  BadgeCheckIcon,
  DogIcon,
  Dot,
  HeartIcon,
  StarIcon,
  ToggleLeft,
} from 'lucide-react';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/renderer/components/ui/toggle-group';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/renderer/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select';
import { nanoid } from '@/utils/nanoid';

function Tools() {
  const { setTitle } = useHeader();
  const [model, setModel] = useState<string>('');
  const { t } = useTranslation();
  const [tools, setTools] = useState<{ mcp: Tool[]; skills: Tool[] }>({
    mcp: [],
    skills: [],
  });
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState<ToolType>(ToolType.BUILD_IN);
  const [search, setSearch] = useState('');
  const [createMCPMode, setCreateMCPMode] = useState<'general' | 'json'>(
    'general',
  );

  useEffect(() => {
    setTitle(t('common.tools'));
  }, [setTitle, t]);

  const form = useForm<ImportMcp>({
    mode: 'onChange',
    defaultValues: {
      mcpConfig: '',
    },
  });

  const createMcpForm = useForm<CreateMcp>({
    mode: 'onChange',
    defaultValues: {
      type: 'stdio',
      url: '',
      command: '',
      args: '',
      env: '',
      headers: {},
    },
  });

  const selectedType = createMcpForm.watch('type');

  useEffect(() => {
    const getList = async () => {
      try {
        const data = await window.electron.tools.getList();
        console.log(data);
        setTools(data);
      } catch (err) {
        toast.error(err.message);
      }
    };
    getList();
    const handleMcpEvent = (data) => {
      console.log(data);
      setTools((_tools) => {
        const newTools = {
          ..._tools,
          [ToolType.MCP]: _tools[ToolType.MCP].map((x) =>
            x.id === data.id ? { ...x, ...data } : x,
          ),
          [ToolType.SKILL]: _tools[ToolType.SKILL].map((x) =>
            x.id === data.id ? { ...x, ...data } : x,
          ),
          [ToolType.BUILD_IN]: _tools[ToolType.BUILD_IN].map((x) =>
            x.id === data.id ? { ...x, ...data } : x,
          ),
        };
        console.log(newTools);
        return newTools;
      });
    };
    window.electron.ipcRenderer.on(McpEvent.McpClientUpdated, handleMcpEvent);
    return () => {
      window.electron.ipcRenderer.removeListener(
        McpEvent.McpClientUpdated,
        handleMcpEvent,
      );
    };
  }, []);

  const handleDelete = (id: string) => {};

  const handleImport = async (value: ImportMcp) => {
    try {
      await window.electron.tools.importMcp(value.mcpConfig);
      setOpen(false);
      form.reset();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleCreateMcp = async (value: CreateMcp) => {
    try {
      const config = {
        mcpServers: {},
      };
      if (value.type === 'stdio') {
        config.mcpServers = {
          [nanoid()]: {
            command: value.command,
            args: value.args.split('\n'),
            env: value.env,
          },
        };
      } else if (value.type === 'sse') {
        config.mcpServers = {
          url: value.url,
          headers: value.headers,
        };
      }
      await window.electron.tools.importMcp(JSON.stringify(config));
      setOpen(false);
      form.reset();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const openMcpDialog = async () => {
    setOpen(true);
  };
  return (
    <div className="h-full w-full flex flex-row justify-between">
      <div className="flex flex-col gap-2 h-full p-4">
        <div className="flex flex-row items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          ></Input>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <IconPlus></IconPlus>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="start">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => openMcpDialog()}>
                  创建MCP
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog open={open} onOpenChange={setOpen}>
            {/* <DialogTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => openDialog()}
              >
                <IconPlus></IconPlus>
              </Button>
            </DialogTrigger> */}
            <DialogContent>
              <DialogHeader>
                <DialogTitle>导入MCP</DialogTitle>
              </DialogHeader>
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={2}
                size="sm"
                value={createMCPMode}
                onValueChange={(value) => {
                  setCreateMCPMode(value as 'general' | 'json');
                }}
              >
                <ToggleGroupItem
                  value="general"
                  className="data-[state=off]:bg-transparent bg-secondary "
                >
                  General
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="json"
                  className="data-[state=off]:bg-transparent bg-secondary "
                >
                  Json
                </ToggleGroupItem>
              </ToggleGroup>
              {createMCPMode === 'json' && (
                <Form {...form}>
                  <form
                    className="flex flex-col gap-4"
                    onSubmit={form.handleSubmit(handleImport)}
                  >
                    <FieldGroup>
                      <FormField
                        name="mcpConfig"
                        control={form.control}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel htmlFor="mcpConfig">
                              {t('knowledge-base.name')}
                            </FormLabel>
                            <FormControl>
                              <Textarea
                                id="mcpConfig"
                                placeholder="请输入知识库名称"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </FieldGroup>

                    <DialogFooter>
                      <Button
                        type="submit"
                        disabled={!form.formState.isValid || submitting}
                      >
                        {submitting ? '创建中…' : '创建'}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              )}
              {createMCPMode === 'general' && (
                <Form {...createMcpForm}>
                  <form
                    className="flex flex-col gap-4"
                    onSubmit={createMcpForm.handleSubmit(handleCreateMcp)}
                  >
                    <FieldGroup>
                      <FormField
                        name="type"
                        control={createMcpForm.control}
                        rules={{ required: t('common.required') as string }}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel htmlFor="type">
                              {t('common.type')}
                            </FormLabel>
                            <FormControl>
                              <Select
                                value={field.value}
                                onValueChange={field.onChange}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="请选择类型" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="stdio">stdio</SelectItem>
                                  <SelectItem value="sse">sse</SelectItem>
                                </SelectContent>
                              </Select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {selectedType === 'stdio' && (
                        <>
                          <FormField
                            name="command"
                            control={createMcpForm.control}
                            rules={{ required: t('common.required') as string }}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel htmlFor="command">
                                  {t('common.command')}
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    id="command"
                                    placeholder="请输入命令"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            name="args"
                            control={createMcpForm.control}
                            rules={{ required: t('common.required') as string }}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel htmlFor="args">
                                  {t('common.args')}
                                </FormLabel>
                                <FormControl>
                                  <Textarea
                                    id="args"
                                    placeholder="请输入命令"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            name="env"
                            control={createMcpForm.control}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel htmlFor="env">
                                  {t('common.env')}
                                </FormLabel>
                                <FormControl>
                                  <Textarea
                                    id="env"
                                    placeholder="请输入命令"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </>
                      )}
                      {selectedType === 'sse' && (
                        <>
                          <FormField
                            name="url"
                            control={createMcpForm.control}
                            rules={{ required: t('common.required') as string }}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel htmlFor="url">
                                  {t('common.url')}
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    id="url"
                                    placeholder="请输入命令"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            name="headers"
                            control={createMcpForm.control}
                            rules={{ required: t('common.required') as string }}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel htmlFor="headers">
                                  {t('common.headers')}
                                </FormLabel>
                                <FormControl>
                                  <Textarea
                                    id="headers"
                                    placeholder="请输入headers"
                                    value={JSON.stringify(field.value)}
                                    onChange={(e) => {
                                      field.onChange(
                                        JSON.parse(e.target.value),
                                      );
                                    }}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </>
                      )}
                    </FieldGroup>

                    <DialogFooter>
                      <Button
                        type="submit"
                        disabled={!form.formState.isValid || submitting}
                      >
                        {submitting ? '创建中…' : '创建'}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              )}
            </DialogContent>
          </Dialog>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={2}
          size="sm"
          value={view}
          onValueChange={(value) => {
            if (value === '') {
              return;
            }
            setView(value as ToolType);
          }}
        >
          <ToggleGroupItem
            value={ToolType.BUILD_IN}
            className="data-[state=off]:bg-transparent bg-secondary "
          >
            Built-in
          </ToggleGroupItem>
          <ToggleGroupItem
            value={ToolType.MCP}
            className="data-[state=off]:bg-transparent bg-secondary "
          >
            MCP
          </ToggleGroupItem>
          <ToggleGroupItem
            value={ToolType.SKILL}
            className="data-[state=off]:bg-transparent bg-secondary"
          >
            Skills
          </ToggleGroupItem>
        </ToggleGroup>

        <ScrollArea className="h-full flex-1 min-h-0">
          <SidebarMenu className="pr-3">
            {tools[view]
              ?.filter((tool) =>
                tool.name.toLowerCase().includes(search.toLowerCase()),
              )
              ?.map((tool) => (
                <SidebarMenuItem
                  key={tool.id}
                  className="group/item mb-1 cursor-pointer w-[calc(var(--sidebar-width))]"
                >
                  <SidebarMenuButton
                    asChild
                    isActive={location?.pathname?.startsWith(
                      `/tools/${tool.id}`,
                    )}
                    className="truncate w-full flex flex-row justify-between h-full"
                  >
                    <Item
                      className=" w-full flex flex-row justify-between flex-nowrap"
                      onClick={() => navigate(`/tools/${tool.id}`)}
                    >
                      <ItemContent className="min-w-0 ">
                        <ItemTitle className="line-clamp-1 w-auto">
                          {tool.name}
                        </ItemTitle>
                        {tool.status === 'running' && (
                          <IconToggleRightFilled className="text-green-500/50"></IconToggleRightFilled>
                        )}
                        {(tool.status === 'stopped' ||
                          tool.status === 'error') && (
                          <IconToggleLeft className="text-red-500/50"></IconToggleLeft>
                        )}
                        {tool.status === 'starting' && (
                          <IconLoader2 className="text-yellow-400/50 animate-spin"></IconLoader2>
                        )}
                        {tool.status === undefined && tool.isActive && (
                          <IconToggleRightFilled className="text-green-500/50"></IconToggleRightFilled>
                        )}
                        {tool.status === undefined && !tool.isActive && (
                          <IconToggleLeft className="text-red-500/50"></IconToggleLeft>
                        )}
                      </ItemContent>
                    </Item>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            {tools[view]?.filter((kb) =>
              kb.name.toLowerCase().includes(search.toLowerCase()),
            ).length === 0 && (
              <div className="flex items-center space-x-4 w-[calc(var(--sidebar-width))]">
                <Empty className="bg-secondary/50">
                  <EmptyHeader>
                    {/* <EmptyMedia variant="icon"></EmptyMedia> */}
                    <EmptyDescription className="flex flex-col items-center gap-2">
                      <IconBox />
                      No Result
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </div>
            )}
          </SidebarMenu>
        </ScrollArea>
      </div>

      <div className="flex flex-col flex-1 w-full min-w-0">
        <Routes>
          <Route path=":id" element={<ToolDetail />} />
        </Routes>
      </div>
    </div>
  );
}

export default Tools;
