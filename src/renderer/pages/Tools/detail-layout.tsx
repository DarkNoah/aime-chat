import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IconArrowLeft, IconLoader2, IconTrash } from '@tabler/icons-react';
import { cn } from '@/renderer/lib/utils';
import { useHeader } from '@/renderer/hooks/use-title';
import { Button } from '@/renderer/components/ui/button';
import { Switch } from '@/renderer/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/renderer/components/ui/alert-dialog';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from '@/renderer/components/ui/empty';
import { HubTab, hubTabPath } from './hub-model';
import { TAB_META } from './hub-visuals';

export function useDetailBreadcrumb(
  tab: HubTab,
  label: string | undefined,
  path: string,
) {
  const { t } = useTranslation();
  const { setTitle } = useHeader();
  useEffect(() => {
    setTitle([
      { title: t(`tools_hub.tabs.${tab}`), path: hubTabPath(tab) },
      ...(label ? [{ title: label, path }] : []),
    ]);
  }, [setTitle, t, tab, label, path]);
}

export function DetailPage({
  children,
  footer,
  className,
}: {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={cn(
            'mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6',
            className,
          )}
        >
          {children}
        </div>
      </div>
      {footer}
    </div>
  );
}

export function DetailHeader({
  media,
  title,
  meta,
  actions,
  children,
}: {
  media: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-4">
        {media}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="text-xl font-semibold leading-tight text-balance break-words">
            {title}
          </h1>
          {meta ? (
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
              {meta}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </header>
  );
}

export function DetailSection({
  title,
  count,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  count?: number;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-2.5', className)}>
      <div className="flex min-h-8 items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="inline-flex items-baseline gap-1.5 text-sm font-semibold">
            {title}
            {count !== undefined ? (
              <span className="text-xs font-normal tabular-nums text-muted-foreground">
                {count}
              </span>
            ) : null}
          </h2>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
      <div className={cn('rounded-xl border bg-card p-4', bodyClassName)}>
        {children}
      </div>
    </section>
  );
}

export function LabeledSwitch({
  checked,
  disabled,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        'flex h-8 cursor-pointer items-center gap-2 rounded-md border bg-background px-2.5 text-sm shadow-xs dark:bg-input/30',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
      {label}
    </label>
  );
}

export function ConfirmDeleteButton({
  label,
  title,
  description,
  onConfirm,
  disabled,
  iconOnly = false,
}: {
  label: string;
  title: string;
  description: string;
  onConfirm: () => Promise<void> | void;
  disabled?: boolean;
  iconOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size={iconOnly ? 'icon-sm' : 'sm'}
          disabled={disabled}
          aria-label={iconOnly ? label : undefined}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive dark:text-destructive-foreground"
        >
          <IconTrash />
          {iconOnly ? null : label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              handleConfirm();
            }}
            className="bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive/60"
          >
            {busy ? <IconLoader2 className="animate-spin" /> : null}
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DetailLoading() {
  return (
    <DetailPage>
      <div className="flex items-start gap-4">
        <div className="size-12 animate-pulse rounded-xl bg-accent" />
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <div className="h-5 w-48 animate-pulse rounded bg-accent" />
          <div className="h-3 w-72 animate-pulse rounded bg-accent" />
        </div>
      </div>
      <div className="h-40 animate-pulse rounded-xl bg-accent/60" />
      <div className="h-64 animate-pulse rounded-xl bg-accent/60" />
    </DetailPage>
  );
}

export function DetailNotFound({
  tab,
  message,
}: {
  tab: HubTab;
  message: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const TabIcon = TAB_META[tab].icon;
  return (
    <DetailPage>
      <Empty className="border border-dashed py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TabIcon />
          </EmptyMedia>
          <EmptyDescription>{message}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(hubTabPath(tab))}
          >
            <IconArrowLeft />
            {t('tools_hub.back_to', { name: t(`tools_hub.tabs.${tab}`) })}
          </Button>
        </EmptyContent>
      </Empty>
    </DetailPage>
  );
}
