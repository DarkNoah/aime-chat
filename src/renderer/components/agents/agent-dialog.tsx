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
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
});

type AgentFormData = z.infer<typeof agentSchema>;

export interface AgentDialogProps extends React.ComponentProps<typeof Dialog> {
  children?: React.ReactNode;
  onSubmit?: (data: AgentFormData) => void;
}

export function AgentDialog(props: AgentDialogProps) {
  const { children, onSubmit, open } = props;
  const { t } = useTranslation();
  const navigate = useNavigate();

  const form = useForm<AgentFormData>({
    resolver: zodResolver(agentSchema),
    defaultValues: {
      id: '',
      name: '',
      description: '',
    },
    reValidateMode: 'onSubmit',
  });

  const handleSubmit = async (data: AgentFormData) => {
    try {
      const result = await window.electron.agents.saveAgent(data);
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
              <DialogTitle>{t('agents.add_agent')}</DialogTitle>
            </DialogHeader>
            <div className="mt-4 gap-4 min-w-0 flex flex-col">
              <FormField
                control={form.control}
                name="id"
                rules={{ required: t('common.required') as string }}
                render={({ field }) => (
                  <Field>
                    <FieldLabel>ID:</FieldLabel>
                    <FieldContent className="flex flex-row items-center gap-2">
                      <Input id="id" name="id" {...field} />
                    </FieldContent>
                  </Field>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <Field>
                    <FieldLabel>{t('common.name')}</FieldLabel>
                    <FieldContent className="flex flex-row items-center gap-2">
                      <Input id="name" name="name" {...field} />
                    </FieldContent>
                  </Field>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <Field>
                    <FieldLabel>{t('common.description')}</FieldLabel>
                    <FieldContent className="flex flex-row items-center gap-2">
                      <Textarea
                        id="description"
                        name="description"
                        {...field}
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
