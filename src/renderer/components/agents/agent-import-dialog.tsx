import { Button } from '@/renderer/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/renderer/components/ui/dialog';
import { Input } from '@/renderer/components/ui/input';
import { Label } from '@/renderer/components/ui/label';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, FieldContent, FieldLabel } from '../ui/field';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/renderer/components/ui/form';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import {
  BriefcaseBusiness,
  CheckCircle2Icon,
  CodeIcon,
  Folder,
  FolderCode,
  Lightbulb,
} from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Textarea } from '../ui/textarea';

const agentSchema = z.object({
  content: z.string(),
});

type AgentImportFormData = z.infer<typeof agentSchema>;

export interface AgentImportDialogProps extends React.ComponentProps<
  typeof Dialog
> {
  children?: React.ReactNode;
  onSubmit?: (data: AgentImportFormData) => void;
}

export function AgentImportDialog(props: AgentImportDialogProps) {
  const { children, onSubmit, open } = props;
  const { t } = useTranslation();
  const navigate = useNavigate();

  const form = useForm<AgentImportFormData>({
    resolver: zodResolver(agentSchema),
    defaultValues: {
      content: '',
    },
    reValidateMode: 'onSubmit',
  });

  const handleSubmit = async (data: AgentImportFormData) => {
    try {
      const result = await window.electron.agents.importAgent(data.content);
      onSubmit?.(data);
      // props?.onOpenChange(false);
      navigate(`/agents/${result.id}`);
    } catch (err) {
      toast.error(err.message);
    }
  };
  useEffect(() => {
    if (open) {
      form.reset();
    }
  }, [open, form]);
  return (
    <Dialog {...props} open={open}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)}>
            <DialogHeader>
              <DialogTitle>{t('agents.import_agent')}</DialogTitle>
            </DialogHeader>
            <div className="mt-4 gap-4 min-w-0 flex flex-col">
              <FormField
                control={form.control}
                name="content"
                rules={{ required: t('common.required') as string }}
                render={({ field }) => (
                  <Field>
                    <FieldContent className="flex flex-row items-center gap-2 ">
                      <Textarea
                        id="content"
                        name="content"
                        {...field}
                        className="max-h-[70vh]"
                      />
                    </FieldContent>
                  </Field>
                )}
              />
            </div>
            <DialogFooter className="mt-4">
              <DialogClose asChild>
                <Button variant="outline">{t('common.cancel')}</Button>
              </DialogClose>
              <Button type="submit">{t('common.submit')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
