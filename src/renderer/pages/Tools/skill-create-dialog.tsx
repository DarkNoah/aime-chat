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
import z, { ZodSchema } from 'zod';
import validator from '@rjsf/validator-ajv8';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

export function SkillCreateDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit?: (e: any) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const handleSubmit = async (e: any) => {
    onSubmit?.(e);
    try {
      const result = await window.electron.tools.saveSkill(
        undefined,
        e.formData,
      );
      onOpenChange(false);
      navigate(`/tools/${result.id}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <IconSettings />
          {t('tools.create_skill')}
        </Button>
      </DialogTrigger> */}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('tools.create_skill')}</DialogTitle>
        </DialogHeader>
        <Form
          formData={data}
          schema={
            zodToJsonSchema(
              z.object({
                name: z.string(),
                description: z.string(),
              }),
            ) as any
          }
          validator={validator}
          onSubmit={handleSubmit}
          uiSchema={{
            name: {
              'ui:title': t('common.name'),
            },
            description: {
              'ui:widget': 'textarea',
              'ui:title': t('common.description'),
            },
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
