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
import { Textarea } from '@/renderer/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/renderer/components/ui/form';

export interface AgentImportDialogProps
  extends React.ComponentProps<typeof Dialog> {
  children?: React.ReactNode;
  onSubmit?: (data: { content: string }) => void;
}

export function AgentImportDialog(props: AgentImportDialogProps) {
  const { children, onSubmit, open, onOpenChange, ...dialogProps } = props;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const schema = z.object({
    content: z.string().trim().min(1, t('common.required')),
  });
  type AgentImportFormData = z.infer<typeof schema>;

  const form = useForm<AgentImportFormData>({
    resolver: zodResolver(schema),
    defaultValues: { content: '' },
  });

  useEffect(() => {
    if (open) form.reset();
  }, [open, form]);

  const handleSubmit = async (data: AgentImportFormData) => {
    setSubmitting(true);
    const content = data.content ?? '';
    try {
      const result = await window.electron.agents.importAgent(content);
      onSubmit?.({ content });
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
      <DialogContent className="sm:max-w-2xl">
        <Form {...form}>
          <form
            className="flex flex-col gap-5"
            onSubmit={form.handleSubmit(handleSubmit)}
          >
            <DialogHeader>
              <DialogTitle>{t('tools_hub.import_agent')}</DialogTitle>
              <DialogDescription>
                {t('tools_hub.agent.import_description')}
              </DialogDescription>
            </DialogHeader>
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      autoFocus
                      aria-label={t('tools_hub.import_agent')}
                      className="max-h-[60vh] min-h-64 font-mono text-xs"
                      placeholder={
                        'id = "my-agent"\nname = "My Agent"\ndescription = ""\ninstructions = """\n...\n"""\ntools = []'
                      }
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
                {t('common.import')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
