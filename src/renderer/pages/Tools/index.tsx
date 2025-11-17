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
import { ImportMcp } from '@/types/ipc-channel';
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
  const [view, setView] = useState<ToolType>(ToolType.MCP);
  const [search, setSearch] = useState('');
  useEffect(() => {
    setTitle(t('common.tools'));
  }, [setTitle, t]);

  const form = useForm<ImportMcp>({
    mode: 'onChange',
    defaultValues: {
      mcpConfig: '',
    },
  });
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
  const openDialog = () => {
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
              <Button
                variant="outline"
                size="icon"
                onClick={() => openDialog()}
              >
                <IconPlus></IconPlus>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="start">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => openDialog()}>
                  导入MCP
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
              ?.filter((kb) =>
                kb.name.toLowerCase().includes(search.toLowerCase()),
              )
              ?.map((kb) => (
                <SidebarMenuItem
                  key={kb.id}
                  className="group/item mb-1 cursor-pointer w-[calc(var(--sidebar-width))]"
                >
                  <SidebarMenuButton
                    asChild
                    isActive={location?.pathname?.startsWith(`/tools/${kb.id}`)}
                    className="truncate w-full flex flex-row justify-between h-full"
                  >
                    <Item
                      className=" w-full flex flex-row justify-between flex-nowrap"
                      onClick={() => navigate(`/tools/${kb.id}`)}
                    >
                      <ItemContent className="min-w-0 ">
                        <ItemTitle className="line-clamp-1 w-auto">
                          {kb.name}
                        </ItemTitle>
                        {kb.status === 'running' && (
                          <IconToggleRightFilled className="text-green-500/50"></IconToggleRightFilled>
                        )}
                        {(kb.status === 'stopped' || kb.status === 'error') && (
                          <IconToggleLeft className="text-red-500/50"></IconToggleLeft>
                        )}
                        {kb.status === 'starting' && (
                          <IconLoader2 className="text-yellow-400/50 animate-spin"></IconLoader2>
                        )}
                        {kb.status === undefined && kb.isActive && (
                          <IconToggleRightFilled className="text-green-500/50"></IconToggleRightFilled>
                        )}
                        {kb.status === undefined && !kb.isActive && (
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
