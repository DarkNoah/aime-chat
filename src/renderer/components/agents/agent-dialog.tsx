import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { IconLoader2 } from '@tabler/icons-react';
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
import { Textarea } from '@/renderer/components/ui/textarea';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/renderer/components/ui/form';

const AGENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export interface AgentDialogProps extends React.ComponentProps<typeof Dialog> {
  children?: React.ReactNode;
  onSubmit?: (data: { id: string; name: string; description?: string }) => void;
}

export function AgentDialog(props: AgentDialogProps) {
  const { children, onSubmit, open, onOpenChange, ...dialogProps } = props;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const agentSchema = z.object({
    id: z
      .string()
      .trim()
      .min(1, t('common.required'))
      .regex(AGENT_ID_PATTERN, t('tools_hub.agent.id_invalid')),
    name: z.string().trim().min(1, t('common.required')),
    description: z.string().optional(),
  });
  type AgentFormData = z.infer<typeof agentSchema>;

  const form = useForm<AgentFormData>({
    resolver: zodResolver(agentSchema),
    defaultValues: { id: '', name: '', description: '' },
  });

  useEffect(() => {
    if (open) form.reset();
  }, [open, form]);

  const handleSubmit = async (data: AgentFormData) => {
    const payload = {
      id: data.id ?? '',
      name: data.name ?? '',
      description: data.description,
    };
    setSubmitting(true);
    try {
      const existing = await window.electron.agents
        .getAgent(payload.id)
        .catch(() => null);
      if (existing) {
        form.setError('id', { message: t('tools_hub.agent.id_taken') });
        return;
      }
      const result = await window.electron.agents.saveAgent({
        ...payload,
        isActive: true,
      });
      onSubmit?.(payload);
      onOpenChange?.(false);
      navigate(`/tools/agents/${encodeURIComponent(result.id)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog {...dialogProps} open={open} onOpenChange={onOpenChange}>
      {children ? <DialogTrigger asChild>{children}</DialogTrigger> : null}
      <DialogContent>
        <Form {...form}>
          <form
            className="flex flex-col gap-5"
            onSubmit={form.handleSubmit(handleSubmit)}
          >
            <DialogHeader>
              <DialogTitle>{t('tools_hub.create_agent')}</DialogTitle>
              <DialogDescription>
                {t('tools_hub.agent.create_description')}
              </DialogDescription>
            </DialogHeader>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('tools_hub.agent.name')}</FormLabel>
                  <FormControl>
                    <Input autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ID</FormLabel>
                  <FormControl>
                    <Input
                      className="font-mono"
                      placeholder="my-agent"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    {t('tools_hub.agent.id_hint')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('tools_hub.agent.description')}</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder={t('tools_hub.agent.description_placeholder')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {t('common.cancel')}
                </Button>
              </DialogClose>
              <Button type="submit" disabled={submitting}>
                {submitting ? <IconLoader2 className="animate-spin" /> : null}
                {t('tools_hub.agent.create_and_edit')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
