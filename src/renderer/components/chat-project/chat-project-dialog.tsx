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
import { Switch } from '@/renderer/components/ui/switch';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, FieldContent, FieldLabel } from '../ui/field';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/renderer/components/ui/form';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import {
  BriefcaseBusiness,
  CheckCircle2Icon,
  CodeIcon,
  Folder,
  FolderCode,
  Github,
  Lightbulb,
  LoaderCircle,
} from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Project } from '@/types/project';
import { ChatAgentSelector } from '../chat-ui/chat-agent-selector';
import { useGlobal } from '@/renderer/hooks/use-global';
import { ChatModelSelect } from '../chat-ui/chat-model-select';

const chatProjectSchema = z.object({
  title: z.string(),
  path: z.string(),
  tag: z.string().optional(),
  githubUrl: z.string().trim().optional(),
  timelineEnabled: z.boolean(),
});

type ChatProjectFormData = z.infer<typeof chatProjectSchema>;

export interface ChatProjectDialogProps extends React.ComponentProps<
  typeof Dialog
> {
  children?: React.ReactNode;
  value?: Project;
  onSubmit?: (data: ChatProjectFormData) => void;
}

export function ChatProjectDialog(props: ChatProjectDialogProps) {
  const { children, onSubmit, open, value } = props;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { appInfo } = useGlobal();

  const form = useForm<ChatProjectFormData>({
    resolver: zodResolver(chatProjectSchema),
    defaultValues: {
      title: value?.title,
      path: value?.path,
      tag: value?.tag,
      githubUrl: '',
      timelineEnabled: value ? Boolean(value.timelineEnabled) : true,
    },
    reValidateMode: 'onSubmit',
  });
  const formValues = form.watch();
  let submitLabel = value ? t('common.save') : t('project.new_project');
  if (form.formState.isSubmitting && !value) {
    submitLabel = t('project.creating_project');
  }

  const handleSubmit = async (data: ChatProjectFormData) => {
    try {
      const result = await window.electron.projects.saveProject({
        ...data,
        id: value?.id,
      });
      onSubmit?.(data);
      props?.onOpenChange(false);
      navigate(`/projects/${result.id}`);
    } catch (err) {
      toast.error(err.message);
    }
  };
  useEffect(() => {
    if (open) {
      form.reset();
      form.setValue('title', value?.title);
      form.setValue('path', value?.path);
      form.setValue('tag', value?.tag);
      form.setValue('githubUrl', '');
      form.setValue(
        'timelineEnabled',
        value ? Boolean(value.timelineEnabled) : true,
      );
    }
  }, [open, form, value, appInfo.defaultModel?.model]);
  return (
    <Dialog {...props} open={open}>
      <DialogTrigger>{children}</DialogTrigger>
      <DialogContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)}>
            <DialogHeader>
              <DialogTitle>
                {value ? t('project.edit_project') : t('project.new_project')}
              </DialogTitle>
            </DialogHeader>
            <div className="mt-4 gap-4 min-w-0 flex flex-col">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <Field>
                    <FieldContent className="flex flex-row items-center gap-2">
                      <Input id="title" name="title" {...field} />
                    </FieldContent>
                  </Field>
                )}
              />

              <FormField
                control={form.control}
                name="path"
                render={({ field }) => (
                  <Field className="min-w-0 inline-grid">
                    <FieldLabel>{t('project.project_path')}</FieldLabel>
                    <FieldContent className="flex flex-row items-center gap-2 min-w-0 justify-between">
                      <Button
                        variant="link"
                        type="button"
                        className="flex-1 truncate justify-start bg-secondary "
                        onClick={() => {
                          if (field.value)
                            window.electron.app.openPath(field.value);
                        }}
                      >
                        <span className="truncate  min-w-0">{field.value}</span>
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        onClick={async () => {
                          const res = await window.electron.app.showOpenDialog({
                            properties: ['openDirectory'],
                            defaultPath: field.value,
                          });
                          if (res.canceled) return;
                          const { filePaths } = res;
                          if (filePaths.length !== 1) return;
                          const path = filePaths[0];
                          field.onChange(path);
                          if (!formValues.title) {
                            form.setValue(
                              'title',
                              path.replaceAll('\\', '/').split('/').pop() || '',
                            );
                          }
                        }}
                      >
                        <Folder></Folder>
                      </Button>
                    </FieldContent>
                  </Field>
                )}
              />
              {!value && (
                <FormField
                  control={form.control}
                  name="githubUrl"
                  render={({ field }) => (
                    <Field>
                      <FieldLabel>{t('project.github_url')}</FieldLabel>
                      <FieldContent>
                        <div className="relative">
                          <Github className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            {...field}
                            className="pl-9"
                            placeholder="https://github.com/owner/repository.git"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                          />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t('project.github_url_description')}
                        </p>
                      </FieldContent>
                    </Field>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="tag"
                render={({ field }) => (
                  <Field>
                    <FieldContent className="flex flex-row items-center gap-2 min-w-0 ">
                      <ToggleGroup
                        type="single"
                        variant="outline"
                        spacing={2}
                        size="sm"
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <ToggleGroupItem value="code">
                          <FolderCode />
                          Code
                        </ToggleGroupItem>
                        <ToggleGroupItem value="work">
                          <BriefcaseBusiness />
                          Work
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </FieldContent>
                  </Field>
                )}
              />
              <FormField
                control={form.control}
                name="timelineEnabled"
                render={({ field }) => (
                  <FormItem className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1.5">
                      <FormLabel>{t('timeline.enable_action')}</FormLabel>
                      <FormDescription className="text-xs leading-5">
                        {t('timeline.enable_description')}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        className="mt-0.5"
                        name={field.name}
                        ref={field.ref}
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        onBlur={field.onBlur}
                        disabled={form.formState.isSubmitting}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              {/* <Alert>
                <Lightbulb />
                <AlertTitle>Success! Your changes have been saved</AlertTitle>
              </Alert> */}
            </div>
            <DialogFooter className="mt-4">
              <DialogClose asChild>
                <Button variant="outline">{t('common.cancel')}</Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={
                  form.formState.isSubmitting ||
                  !formValues.title ||
                  !formValues.path
                }
              >
                {form.formState.isSubmitting && (
                  <LoaderCircle className="animate-spin" />
                )}
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
