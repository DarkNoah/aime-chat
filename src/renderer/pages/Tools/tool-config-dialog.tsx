import { Button } from '@/renderer/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/renderer/components/ui/dialog';
import Form from '@rjsf/shadcn';
import type { RJSFSchema, Widget, WidgetProps } from '@rjsf/utils';
import { IconSettings } from '@tabler/icons-react';
import { ZodSchema } from 'zod';
import validator from '@rjsf/validator-ajv8';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ProviderSelector } from '@/renderer/components/provider-selector';
import { ProviderTag } from '@/types/provider';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { ChatModelSelect } from '@/renderer/components/chat-ui/chat-model-select';

const ProviderSelectorWidget: Widget<any, RJSFSchema, any> = ({
  value,
  onChange,
  disabled,
  readonly,
  options,
}: WidgetProps<any, RJSFSchema, any>) => {
  const providerType = ((options as Record<string, unknown>)?.providerTag ??
    (options as Record<string, unknown>)?.type ??
    undefined) as ProviderTag | undefined;

  return (
    <ProviderSelector
      value={typeof value === 'string' ? value : undefined}
      onValueChange={(val) => onChange(val)}
      disabled={disabled || readonly}
      type={providerType}
    />
  );
};

const ModelSelectorWidget: Widget<any, RJSFSchema, any> = ({
  value,
  onChange,
  disabled,
  readonly,
  options,
}: WidgetProps<any, RJSFSchema, any>) => {
  return (
    <ChatModelSelect
      value={typeof value === 'string' ? value : undefined}
      onChange={(val) => onChange(val)}
      disabled={disabled || readonly}
    />
  );
};

export function ToolConfigDialog({
  toolId,
  configSchema,
  uiSchema,
  onSubmit,
}: {
  toolId: string;
  configSchema: ZodSchema;
  uiSchema?: any;
  onSubmit?: (e: any) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const handleSubmit = async (e: any) => {
    console.log(e);
    onSubmit?.(e);
    try {
      await window.electron.tools.updateToolConfig(toolId, e.formData);
      setOpen(false);
    } catch (err) {
      toast.error(err.message);
    }
  };
  useEffect(() => {
    const getToolConfig = async () => {
      if (toolId && open) {
        const tool = await window.electron.tools.getTool(toolId);
        console.log(tool);
        setData(tool.value);
      }
    };
    getToolConfig();
  }, [toolId, open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <IconSettings />
          {t('tools.config')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('common.tool_config')}</DialogTitle>
        </DialogHeader>
        <Form
          formData={data}
          schema={zodToJsonSchema(configSchema) as any}
          validator={validator}
          onSubmit={handleSubmit}
          uiSchema={uiSchema}
          widgets={{
            providerSelector: ProviderSelectorWidget,
            modelSelector: ModelSelectorWidget,
          }}
        >
          <div className="flex justify-end mt-2">
            <Button type="submit">{t('common.save')}</Button>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
