import { cn } from '@/renderer/lib/utils';
import React, { useState, type ComponentProps } from 'react';
import {
  Dialog,
  DialogContent,
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
      <DialogContent className={cn('flex flex-col gap-4', className)}>
        <DialogHeader>
          <DialogTitle>{t('chat.until_end', 'Until End')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-row items-center justify-between">
          <Label htmlFor="until-end-enable">
            {t('chat.until_end_enable', 'Enable')}
          </Label>
          <Switch
            id="until-end-enable"
            checked={enable}
            onCheckedChange={setEnable}
          />
        </div>
        <Textarea
          className="min-h-[160px]"
          placeholder={t('chat.until_end_placeholder', 'Enter text...')}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
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
