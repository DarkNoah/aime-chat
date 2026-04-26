import { cn } from '@/renderer/lib/utils';
import React, { useState, type ComponentProps } from 'react';
import { ShieldCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { useTranslation } from 'react-i18next';
import { UntilEndPrompt } from '@/types/chat';

const DEFAULT_VALUE: UntilEndPrompt = { enable: false, prompt: '' };

export type ChatUntilEndProps = ComponentProps<typeof Dialog> & {
  children: React.ReactNode;
  className?: string;
  value?: UntilEndPrompt;
  onChange?: (value: UntilEndPrompt) => void;
};

export const ChatUntilEnd = ({ children, ...props }: ChatUntilEndProps) => {
  const { value = DEFAULT_VALUE, onChange, className } = props;
  const [open, setOpen] = useState(false);
  const [enable, setEnable] = useState<boolean>(value.enable);
  const [text, setText] = useState<string>(value.prompt);
  const { t } = useTranslation();

  const handleConfirm = () => {
    onChange?.({ enable, prompt: text });
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setEnable(value.enable);
          setText(value.prompt);
        }
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        className={cn('flex flex-col gap-4 sm:max-w-[560px]', className)}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            {t('chat.until_end', 'End Guard')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'chat.until_end_description',
              'Before the model ends the conversation, it will re-verify the checklist below. The model is only allowed to call the Done tool when every item passes; otherwise it will keep working until they do.',
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-row items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="until-end-enable" className="cursor-pointer">
              {t('chat.until_end_enable', 'Enable')}
            </Label>
            {!enable && (
              <span className="text-xs text-muted-foreground">
                {t(
                  'chat.until_end_disabled_tip',
                  'Disabled: the model will not run any extra end-of-turn checks.',
                )}
              </span>
            )}
          </div>
          <Switch
            id="until-end-enable"
            checked={enable}
            onCheckedChange={setEnable}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="until-end-checklist" className="text-sm font-medium">
            {t('chat.until_end_checklist_label', 'Checklist')}
          </Label>
          <Textarea
            id="until-end-checklist"
            className="min-h-[200px] font-mono text-sm leading-relaxed"
            placeholder={t(
              'chat.until_end_placeholder',
              'e.g.\n1. Confirm all modified files pass lint checks\n2. Confirm related tests have been run and passed\n3. A concise summary of changes has been given to the user',
            )}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {t(
              'chat.until_end_hint',
              'Tip: clear, individually verifiable items work best.',
            )}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleConfirm}>
            {t('common.confirm', 'Confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
