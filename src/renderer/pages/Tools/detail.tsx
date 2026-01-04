import { Streamdown } from '@/renderer/components/ai-elements/streamdown';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/renderer/components/ui/accordion';
import { Badge } from '@/renderer/components/ui/badge';
import { Button } from '@/renderer/components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/renderer/components/ui/item';
import { ScrollArea } from '@/renderer/components/ui/scroll-area';
import { Switch } from '@/renderer/components/ui/switch';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/renderer/components/ui/tabs';
import { useHeader } from '@/renderer/hooks/use-title';
import { Tool, ToolConfig, ToolType } from '@/types/tool';
import { ItemText } from '@radix-ui/react-select';
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Form, { Widgets } from '@rjsf/shadcn';
import validator from '@rjsf/validator-ajv8';
import { IconFolder } from '@tabler/icons-react';
import { ChatPreview } from '@/renderer/components/chat-ui/chat-preview';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/renderer/components/ui/resizable';
import { ChatToolResultPreview } from '@/renderer/components/chat-ui/chat-preview/chat-tool-result-preview';
import { Loader } from '@/renderer/components/ai-elements/loader';
import { Spinner } from '@/renderer/components/ui/spinner';
import { ToolUIPart } from 'ai';
import { nanoid } from '@/utils/nanoid';
import { ToolConfigDialog } from './tool-config-dialog';
import { ToolEditDialog } from './tool-edit-dialog';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Transl } from '@/renderer/components/translations/transl';

function ToolDetail() {
  const location = useLocation();
  const { t } = useTranslation();
  const { id } = useParams();
  const { setTitle } = useHeader();
  const [tool, setTool] = useState<Tool | null>(null);
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [toolExecuting, setToolExecuting] = useState<Record<string, boolean>>(
    {},
  );
  const [openMcpDialog, setOpenMcpDialog] = useState<boolean>(false);
  const navigate = useNavigate();
  const [toolResultPreview, setToolResultPreview] = useState<{
    title?: string;
    part?: ToolUIPart;
  } | null>(null);

  const getTool = useCallback(async () => {
    try {
      const data: Tool = await window.electron.tools.getTool(id);
      setTool(data);
      setTitle(data?.name || '');
      console.log(data);
      if ('tools' in data && data?.tools) {
        const toole = {};
        for (const _tool of Object.values(data.tools)) {
          toole[_tool.name] = false;
        }
        setToolExecuting(toole);
      }
    } catch (err) {
      toast.error(err.message);
    }
  }, [id, setTitle]);

  useEffect(() => {
    getTool();
  }, [getTool, id]);

  const handleToggleToolActive = async () => {
    try {
      await window.electron.tools.toggleToolActive(id);
      await getTool();
      // toast.success('Tool activated successfully');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleSubmit = async (toolName: string, data: any) => {
    setToolExecuting((prve) => ({
      ...prve,
      [toolName]: true,
    }));
    try {
      const res = await window.electron.tools.executeTool(
        tool.id,
        toolName,
        data,
      );
      console.log(res);
      setToolResultPreview({
        title: toolName,
        part: {
          type: `tool-${toolName}`,
          output: res,
          toolCallId: nanoid(),
          state: 'output-available',
          input: undefined,
        },
      });

      setShowPreview(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setToolExecuting((prve) => ({
        ...prve,
        [toolName]: false,
      }));
    }
  };

  const handleStop = async (toolName: string) => {
    if (!toolExecuting[toolName]) return;
    try {
      await window.electron.tools.abortTool(tool.id, toolName);
    } catch (err) {}
  };

  const handleDelete = async (toolId: string) => {
    try {
      const res = await window.electron.tools.deleteTool(toolId);
      navigate('/tools');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleReconnectMCP = async (toolId: string) => {
    await window.electron.tools.reconnectMCP(toolId);
    await getTool();
  };

  const handleEditMcp = async (toolId: string) => {
    const mcpConfig = await window.electron.tools.getMcp(toolId);
    console.log(mcpConfig);
  };

  const renderForm = (_tool: Tool['tools'][number]) => {
    return (
      <Form
        schema={_tool?.inputSchema}
        validator={validator}
        widgets={{
          TextWidget: Widgets.TextareaWidget,
        }}
        onSubmit={(e) => handleSubmit(_tool.name, e.formData)}
      >
        <div className="flex items-center gap-3 mt-2">
          {toolExecuting[_tool.name] === false && (
            <Button type="submit" variant="outline">
              {t('tools.execute')}
            </Button>
          )}
          {toolExecuting[_tool.name] === true && (
            <Button type="button" onClick={(e) => handleStop(_tool.name)}>
              <Spinner></Spinner>
              Stop
            </Button>
          )}
        </div>
      </Form>
    );
  };

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full w-full">
      <ResizablePanel className="w-full flex-1 p-4 overflow-y-auto!">
        <Item variant="outline">
          <ItemContent>
            <ItemTitle className="flex items-center gap-2">
              {tool?.name}{' '}
              <small className="text-xs text-muted-foreground">
                {tool?.version}
              </small>
            </ItemTitle>
            <ItemDescription>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{tool?.type}</Badge>
              </div>
            </ItemDescription>
          </ItemContent>
          {tool && (
            <ItemActions className="gap-2">
              {ToolConfig[tool?.name]?.configSchema && (
                <ToolConfigDialog
                  toolId={tool.id}
                  configSchema={ToolConfig[tool?.name].configSchema}
                  uiSchema={ToolConfig[tool?.name].uiSchema}
                />
              )}
              <Switch
                checked={tool?.isActive}
                onCheckedChange={handleToggleToolActive}
              ></Switch>
              {tool?.type === ToolType.MCP && (
                <>
                  <ToolEditDialog
                    toolId={tool.id}
                    open={openMcpDialog}
                    onOpenChange={setOpenMcpDialog}
                  ></ToolEditDialog>
                  {tool.isActive && tool.status === 'running' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReconnectMCP(tool.id)}
                    >
                      Reconnect
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOpenMcpDialog(true)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(tool.id)}
                  >
                    {t('common.delete')}
                  </Button>
                </>
              )}
              {tool?.type === ToolType.SKILL && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(tool.id)}
                >
                  {t('common.delete')}
                </Button>
              )}
            </ItemActions>
          )}
          {tool?.isToolkit && tool?.description && (
            <pre className="text-wrap w-full text-muted-foreground">
              {tool?.description}
            </pre>
          )}
        </Item>
        {(tool?.type === ToolType.MCP || tool?.type === ToolType.BUILD_IN) && (
          <Tabs className="mt-2" defaultValue="tools">
            {tool?.tools.length > 1 && (
              <TabsList>
                <TabsTrigger value="tools">
                  Tools ({tool?.tools.length})
                </TabsTrigger>
              </TabsList>
            )}

            {tool?.tools.length > 0 && (
              <TabsContent value="tools">
                <Accordion type="multiple" defaultValue={[]} className="w-full">
                  {tool?.tools?.map((_tool) => (
                    <AccordionItem value={_tool.id} key={_tool.id}>
                      <AccordionTrigger>{_tool.name}</AccordionTrigger>
                      <AccordionContent className="flex flex-col gap-4 text-balance">
                        <pre className="text-xs break-all text-wrap bg-secondary p-4 rounded-2xl">
                          {_tool?.description}
                        </pre>
                        {_tool.inputSchema &&
                          _tool.inputSchema.type === 'object' &&
                          renderForm(_tool)}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </TabsContent>
            )}
          </Tabs>
        )}
        {tool?.type === ToolType.SKILL && (
          <>
            <div className="mt-2 overflow-hidden">
              <Button
                variant="link"
                onClick={() => window.electron.app.openPath(tool?.path)}
              >
                <IconFolder />
                {tool?.path}
              </Button>
            </div>
            <div className="flex text-sm text-muted-foreground mt-2">
              <Transl>{tool?.description}</Transl>
            </div>
            <div className="p-4 bg-secondary rounded-xl mt-2">
              {' '}
              <Transl useMarkdown>{tool?.content}</Transl>
            </div>
          </>
        )}
      </ResizablePanel>
      {showPreview && (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel
            maxSize={showPreview ? 75 : 0}
            className={`h-full flex-1 `}
          >
            <div className="p-2 w-full h-full">
              <div className=" w-full h-full border rounded-2xl ">
                <ChatToolResultPreview
                  className="overflow-y-auto"
                  title={toolResultPreview?.title}
                  part={toolResultPreview?.part}
                />
              </div>
            </div>
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}

export default ToolDetail;
