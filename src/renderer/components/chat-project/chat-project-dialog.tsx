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
import React, { useState } from 'react';
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
import { CheckCircle2Icon } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';

const chatProjectSchema = z.object({
  title: z.string(),
  path: z.string(),
  tag: z.string().optional(),
});

type ChatProjectFormData = z.infer<typeof chatProjectSchema>;

export interface ChatProjectDialogProps extends React.ComponentProps<
  typeof Dialog
> {
  children?: React.ReactNode;
  onSubmit?: (data: ChatProjectFormData) => void;
}

export function ChatProjectDialog(props: ChatProjectDialogProps) {
  const { children, onSubmit } = props;
  const { t } = useTranslation();

  const form = useForm<ChatProjectFormData>({
    resolver: zodResolver(chatProjectSchema),
    defaultValues: {
      title: '',
      path: '',
      tag: '',
    },
    reValidateMode: 'onSubmit',
  });

  const handleSubmit = async (data: ChatProjectFormData) => {
    debugger;
    onSubmit?.(data);
  };
  return (
    <Dialog {...props}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)}>
            <DialogHeader>
              <DialogTitle>{t('project.new_project')}</DialogTitle>
              {/* <DialogDescription>
              Make changes to your profile here. Click save when you&apos;re
              done.
            </DialogDescription> */}
            </DialogHeader>
            <div className="grid gap-4 min-w-0 flex flex-col">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <Field>
                    <FieldLabel>{t('common.title')}</FieldLabel>
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
                  <Field>
                    <FieldLabel>{t('common.path')}</FieldLabel>
                    <FieldContent className="flex flex-row items-center gap-2 min-w-0 ">
                      <Button
                        variant="link"
                        type="button"
                        className="flex-1 truncate justify-start bg-secondary min-w-0"
                        onClick={() => {
                          if (field.value)
                            window.electron.app.openPath(field.value);
                        }}
                      >
                        <span className="truncate  min-w-0">{field.value}</span>
                      </Button>
                      <Button
                        type="button"
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
                        }}
                      >
                        更改目录
                      </Button>
                    </FieldContent>
                  </Field>
                )}
              />
              <FormField
                control={form.control}
                name="tag"
                render={({ field }) => (
                  <Field>
                    <FieldLabel>{t('common.tag')}</FieldLabel>
                    <FieldContent className="flex flex-row items-center gap-2 min-w-0 ">
                      <ToggleGroup
                        type="single"
                        variant="outline"
                        spacing={2}
                        size="sm"
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <ToggleGroupItem value="code">Code</ToggleGroupItem>
                        <ToggleGroupItem value="work">Work</ToggleGroupItem>
                      </ToggleGroup>
                    </FieldContent>
                  </Field>
                )}
              />
              <Alert>
                <CheckCircle2Icon />
                <AlertTitle>Success! Your changes have been saved</AlertTitle>
                <AlertDescription>
                  This is an alert with icon, title and description.
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter className="mt-4">
              <DialogClose asChild>
                <Button variant="outline">{t('common.cancel')}</Button>
              </DialogClose>
              <Button type="submit">{t('project.new_project')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
