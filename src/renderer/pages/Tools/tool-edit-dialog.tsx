import { Button } from '@/renderer/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/renderer/components/ui/dialog';
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/renderer/components/ui/toggle-group';
import { FieldGroup } from '@/renderer/components/ui/field';
import { useForm } from 'react-hook-form';
import { CreateMcp, ImportMcp } from '@/types/mcp';
import { nanoid } from '@/utils/nanoid';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/renderer/components/ui/form';
import { Textarea } from '@/renderer/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select';
import { Input } from '@/renderer/components/ui/input';

export function ToolEditDialog({
  toolId,
  onSubmit,
  children,
  open,
  onOpenChange,
}: {
  toolId?: string;
  onSubmit?: (e: any) => void;
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  // const [open, setOpen] = useState(false);
  const [createMCPMode, setCreateMCPMode] = useState<'general' | 'json'>(
    'general',
  );
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<ImportMcp>({
    mode: 'onChange',
    defaultValues: {
      mcpConfig: '',
    },
  });

  const createMcpForm = useForm<CreateMcp>({
    mode: 'onChange',
    defaultValues: {
      name: '',
      type: 'stdio',
      url: '',
      command: '',
      args: '',
      env: '',
      headers: {},
    },
  });

  const selectedType = createMcpForm.watch('type');

  const handleImport = async (value: ImportMcp) => {
    try {
      await window.electron.tools.saveMCPServer(toolId, value.mcpConfig);
      onOpenChange?.(false);
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
        const env = {};
        value.env
          ?.split('\n')
          .filter((x) => x.trim())
          .forEach((x) => {
            const [key, v] = x.split('=');
            if (key.trim() && v.trim()) {
              env[key.trim()] = v.trim();
            }
          });

        config.mcpServers = {
          [value.name]: {
            command: value.command,
            args: value.args.split('\n'),
            env: value.env ? env : undefined,
          },
        };
      } else if (value.type === 'sse') {
        config.mcpServers = {
          [value.name]: {
            url: value.url,
            headers: value.headers,
          },
        };
      }
      await window.electron.tools.saveMCPServer(toolId, JSON.stringify(config));
      onOpenChange?.(false);
      form.reset();
    } catch (err) {
      toast.error(err.message);
    }
  };

  useEffect(() => {
    const getTool = async () => {
      if (toolId && open) {
        const tool = await window.electron.tools.getTool(toolId);
        const { mcpConfig } = tool;
        if (mcpConfig) {
          form.setValue(
            'mcpConfig',
            JSON.stringify({ mcpServers: mcpConfig }, null, 2),
          );
          const key = Object.keys(mcpConfig)[0];
          createMcpForm.setValue('name', key);
          if ('command' in mcpConfig[key]) {
            let env;
            if (mcpConfig[key].env) {
              env = Object.entries(mcpConfig[key].env)
                .map(([k, value]) => `${k}=${value}`)
                .join('\n');
            }
            createMcpForm.setValue('type', 'stdio');
            createMcpForm.setValue('command', mcpConfig[key].command);
            createMcpForm.setValue('args', mcpConfig[key].args?.join('\n'));
            createMcpForm.setValue('env', env);
          } else if ('url' in mcpConfig[key]) {
            createMcpForm.setValue('type', 'sse');
            createMcpForm.setValue('url', mcpConfig[key].url);
            createMcpForm.setValue('headers', mcpConfig[key].headers);
          }
        }
        console.log(tool);
      }
    };
    getTool();
    if (open) {
      createMcpForm.reset();
    }
  }, [toolId, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {toolId ? t('tools.edit_mcp') : t('tools.add_mcp')}
          </DialogTitle>
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

        {createMCPMode === 'json' && form && (
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
                      <FormControl>
                        <Textarea
                          id="mcpConfig"
                          placeholder={`{\n"mcpservers":{\n\t"mcp-name":{\n\t\t"command": "command",\n\t\t"args": ["arg1", "arg2"],\n\t\t"env": "env"\n\t\t}\n\t}\n}`}
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
                  name="name"
                  control={createMcpForm.control}
                  rules={{ required: t('common.required') as string }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="name">{t('common.name')}</FormLabel>
                      <FormControl>
                        <Input id="name" placeholder="请输入名称" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="type"
                  control={createMcpForm.control}
                  rules={{ required: t('common.required') as string }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="type">{t('common.type')}</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="请选择类型" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="stdio">Stdio</SelectItem>
                            <SelectItem value="sse">
                              StreamableHttp / SSE
                            </SelectItem>
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
                            {t('tools.mcp_command')}
                          </FormLabel>
                          <FormControl>
                            <Input
                              id="command"
                              placeholder={t('tools.mcp_command_placeholder')}
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
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel htmlFor="args">
                            {t('tools.mcp_args')}
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              id="args"
                              placeholder={t('tools.mcp_args_placeholder')}
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
                            {t('tools.mcp_env')}
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              id="env"
                              placeholder="Key1=Value1\nKey2=Value2"
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
                            {t('tools.mcp_url')}
                          </FormLabel>
                          <FormControl>
                            <Input
                              id="url"
                              placeholder={t('tools.mcp_url_placeholder')}
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
                            {t('tools.mcp_headers')}
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              id="headers"
                              placeholder={t('tools.mcp_headers_placeholder')}
                              value={JSON.stringify(field.value, null, 2)}
                              onChange={(e) => {
                                field.onChange(JSON.parse(e.target.value));
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
                  {submitting ? t('common.submitting') : t('common.submit')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
