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
import { Tool } from '@/types/tool';
import { ItemText } from '@radix-ui/react-select';
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import Form from '@rjsf/shadcn';
import validator from '@rjsf/validator-ajv8';
import { IconFolder } from '@tabler/icons-react';

function ToolDetail() {
  const location = useLocation();
  const { id } = useParams();
  const { setTitle } = useHeader();
  const [tool, setTool] = useState<Tool | null>(null);

  const getTool = useCallback(async () => {
    try {
      const data = await window.electron.tools.getTool(id);
      setTool(data);
      setTitle(data?.name || '');
      console.log(data);
    } catch (err) {
      toast.error(err.message);
    }
  }, [id, setTitle]);

  useEffect(() => {
    getTool();
  }, [getTool, id]);

  const handleToggleToolActive = async () => {
    await window.electron.tools.toggleToolActive(id);
    await getTool();
  };

  const handleSubmit = async (toolName: string, data: any) => {
    console.log(data);
    const res = await window.electron.tools.executeTool(
      tool.id,
      toolName,
      data,
    );
    console.log(res);
  };
  return (
    <div className="p-4 overflow-y-auto">
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
          <ItemActions>
            <Switch
              checked={tool?.isActive}
              onCheckedChange={handleToggleToolActive}
            ></Switch>
            {tool?.type === 'mcp' && (
              <Button variant="outline" size="sm">
                Edit
              </Button>
            )}
          </ItemActions>
        )}

        <pre className="text-wrap">{tool?.description}</pre>
      </Item>
      {tool?.type === 'mcp' && (
        <Tabs className="mt-2" defaultValue="tools">
          <TabsList>
            <TabsTrigger value="tools">
              Tools ({tool?.tools.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="tools">
            <Accordion type="multiple" defaultValue={[]} className="w-full">
              {tool?.tools?.map((t) => (
                <AccordionItem value={t.id} key={t.id}>
                  <AccordionTrigger>{t.name}</AccordionTrigger>
                  <AccordionContent className="flex flex-col gap-4 text-balance">
                    <pre className="text-xs break-all text-wrap bg-secondary p-4 rounded-2xl">
                      {t?.description}
                    </pre>
                    {t.inputSchema && t.inputSchema.type === 'object' && (
                      <Form
                        schema={t.inputSchema}
                        validator={validator}
                        onSubmit={(e) => handleSubmit(t.id, e.formData)}
                      >
                        <div className="flex items-center gap-3 mt-2">
                          <Button type="submit">Submit</Button>
                        </div>
                      </Form>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </TabsContent>
        </Tabs>
      )}
      {tool?.type === 'skill' && (
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

          <div className="p-4 bg-secondary rounded-xl mt-2">
            {' '}
            <Streamdown>{tool?.content}</Streamdown>
          </div>
        </>
      )}
    </div>
  );
}

export default ToolDetail;
