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
import { useTranslation } from 'react-i18next';

export type ChatUntilEndProps = ComponentProps<typeof Dialog> & {
  children: React.ReactNode;
  className?: string;
  value?: string;
  onChange?: (value: string) => void;
};

export const ChatUntilEnd = ({ children, ...props }: ChatUntilEndProps) => {
  const { value = '', onChange, className } = props;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const { t } = useTranslation();

  const handleConfirm = () => {
    onChange?.(text);
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setText(value);
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className={cn('flex flex-col gap-4', className)}>
        <DialogHeader>
          <DialogTitle>{t('chat.until_end', 'Until End')}</DialogTitle>
        </DialogHeader>
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
