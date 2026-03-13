import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useHeader } from '@/renderer/hooks/use-title';
import {
  ChannelEvent,
  ChannelInfo,
  ChannelPairedEventPayload,
  ChannelPairingCodeResult,
  ChannelPairingExpiredEventPayload,
  SaveChannelInput,
} from '@/types/channel';
import { Button } from '@/renderer/components/ui/button';
import { Badge } from '@/renderer/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/renderer/components/ui/dialog';
import { Input } from '@/renderer/components/ui/input';
import { InputPassword } from '@/renderer/components/ui/input-password';
import { Label } from '@/renderer/components/ui/label';
import { ScrollArea } from '@/renderer/components/ui/scroll-area';
import { Switch } from '@/renderer/components/ui/switch';
import { Textarea } from '@/renderer/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/renderer/components/ui/alert-dialog';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemHeader,
  ItemSeparator,
  ItemTitle,
} from '@/renderer/components/ui/item';
import {
  IconPlayerPause,
  IconPlayerPlay,
  IconPlugConnected,
  IconRefresh,
  IconTrash,
  IconPlus,
} from '@tabler/icons-react';

type PairingGuideState = {
  open: boolean;
  channelId: string;
  channelName: string;
  code: string;
  expiresAt: string;
};

type ChannelFormState = {
  id?: string;
  name: string;
  enabled: boolean;
  autoStart: boolean;
  token: string;
  defaultChatId: string;
  allowedChatIdsText: string;
  pairingCode: string;
  pairingCodeExpiresAt: string;
};

const createEmptyForm = (): ChannelFormState => ({
  name: '',
  enabled: true,
  autoStart: true,
  token: '',
  defaultChatId: '',
  allowedChatIdsText: '',
  pairingCode: '',
  pairingCodeExpiresAt: '',
});

function getStatusVariant(
  status: ChannelInfo['status'],
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'running') return 'default';
  if (status === 'error') return 'destructive';
  if (status === 'starting' || status === 'stopping') return 'secondary';
  return 'outline';
}

function toFormState(channel: ChannelInfo): ChannelFormState {
  return {
    id: channel.id,
    name: channel.name,
    enabled: channel.enabled,
    autoStart: channel.autoStart,
    token: '',
    defaultChatId: channel.config.defaultChatId || '',
    allowedChatIdsText: (channel.config.allowedChatIds || []).join('\n'),
    pairingCode: channel.pairingCode || '',
    pairingCodeExpiresAt: channel.pairingCodeExpiresAt || '',
  };
}

export default function Channels() {
  const { t } = useTranslation();
  const { setTitle } = useHeader();
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>(
    {},
  );
  const [form, setForm] = useState<ChannelFormState>(createEmptyForm());
  const [pairingLoading, setPairingLoading] = useState<Record<string, boolean>>(
    {},
  );
  const [pairingGuide, setPairingGuide] = useState<PairingGuideState>({
    open: false,
    channelId: '',
    channelName: '',
    code: '',
    expiresAt: '',
  });

  setTitle(t('settings.channels'));

  const loadChannels = async () => {
    setLoading(true);
    try {
      const data = await window.electron.channels.getList();
      setChannels(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChannels().catch(() => {});

    const unsubscribePaired = window.electron.ipcRenderer.on(
      ChannelEvent.Paired,
      async (payload) => {
        const event = payload as ChannelPairedEventPayload;
        await loadChannels();
        if (form.id === event.channelId) {
          try {
            const data = await window.electron.channels.get(event.channelId);
            setForm(toFormState(data));
          } catch (error) {
            toast.error(error instanceof Error ? error.message : String(error));
          }
        }
        toast.success(
          event.title
            ? t('channels.paired_toast_with_title', {
                channel: event.channelName,
                title: event.title,
                chatId: event.chatId,
              })
            : t('channels.paired_toast', {
                channel: event.channelName,
                chatId: event.chatId,
              }),
        );
        setPairingGuide((prev) =>
          prev.channelId === event.channelId
            ? {
                open: false,
                channelId: '',
                channelName: '',
                code: '',
                expiresAt: '',
              }
            : prev,
        );
      },
    );

    const unsubscribePairingExpired = window.electron.ipcRenderer.on(
      ChannelEvent.PairingExpired,
      async (payload) => {
        const event = payload as ChannelPairingExpiredEventPayload;
        await loadChannels();
        if (form.id === event.channelId) {
          try {
            const data = await window.electron.channels.get(event.channelId);
            setForm(toFormState(data));
          } catch (error) {
            toast.error(error instanceof Error ? error.message : String(error));
          }
        }
        toast.error(
          t('channels.pairing_expired_toast', {
            channel: event.channelName,
            count: event.failedAttempts,
          }),
        );
        setPairingGuide((prev) =>
          prev.channelId === event.channelId
            ? {
                open: false,
                channelId: '',
                channelName: '',
                code: '',
                expiresAt: '',
              }
            : prev,
        );
      },
    );

    return () => {
      unsubscribePaired();
      unsubscribePairingExpired();
    };
  }, [form.id, t]);

  const runningCount = useMemo(
    () => channels.filter((item) => item.status === 'running').length,
    [channels],
  );

  const openCreate = () => {
    setForm(createEmptyForm());
    setDialogOpen(true);
  };

  const openEdit = async (channelId: string) => {
    try {
      const data = await window.electron.channels.get(channelId);
      setForm(toFormState(data));
      setDialogOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: SaveChannelInput = {
        id: form.id,
        type: 'telegram',
        name: form.name,
        enabled: form.enabled,
        autoStart: form.autoStart,
        config: {
          token: form.token,
          defaultChatId: form.defaultChatId,
          allowedChatIds: form.allowedChatIdsText
            .split(/[\n,]/)
            .map((item) => item.trim())
            .filter(Boolean),
        },
      };
      await window.electron.channels.save(payload);
      setDialogOpen(false);
      await loadChannels();
      toast.success(t('channels.saved'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const withAction = async (channelId: string, action: () => Promise<void>) => {
    setActionLoading((prev) => ({ ...prev, [channelId]: true }));
    try {
      await action();
      await loadChannels();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setActionLoading((prev) => ({ ...prev, [channelId]: false }));
    }
  };

  const handleDelete = async (channelId: string) => {
    await withAction(channelId, async () => {
      await window.electron.channels.delete(channelId);
      toast.success(t('channels.deleted'));
    });
  };

  const handleGeneratePairingCode = async (channelId: string) => {
    setPairingLoading((prev) => ({ ...prev, [channelId]: true }));
    try {
      const response: ChannelPairingCodeResult =
        await window.electron.channels.generatePairingCode(channelId);
      setForm((prev) =>
        prev.id === channelId
          ? {
              ...prev,
              pairingCode: response.code,
              pairingCodeExpiresAt: response.expiresAt,
            }
          : prev,
      );
      await loadChannels();
      const channelName =
        channels.find((item) => item.id === channelId)?.name ||
        form.name ||
        'Telegram';
      setPairingGuide({
        open: true,
        channelId,
        channelName,
        code: response.code,
        expiresAt: response.expiresAt,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setPairingLoading((prev) => ({ ...prev, [channelId]: false }));
    }
  };

  const formatPairingExpiresAt = (value?: string) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  };

  const closePairingGuide = async () => {
    const { channelId } = pairingGuide;
    setPairingGuide({
      open: false,
      channelId: '',
      channelName: '',
      code: '',
      expiresAt: '',
    });

    if (!channelId) return;

    try {
      await window.electron.channels.clearPairingCode(channelId);
      await loadChannels();
      setForm((prev) =>
        prev.id === channelId
          ? {
              ...prev,
              pairingCode: '',
              pairingCodeExpiresAt: '',
            }
          : prev,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const pairCommand = 'pair';

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <Item variant="outline">
        <ItemContent>
          <ItemTitle>{t('settings.channels')}</ItemTitle>
          <ItemDescription>
            {t('channels.summary', {
              count: channels.length,
              running: runningCount,
            })}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button onClick={openCreate}>
            <IconPlus className="mr-1 size-4" />
            {t('channels.add_telegram')}
          </Button>
        </ItemActions>
      </Item>

      <ScrollArea className="flex-1 pr-2">
        <ItemGroup className="gap-3">
          {channels.map((channel) => (
            <Item key={channel.id} variant="outline" className="items-start">
              <ItemContent className="min-w-0 gap-3">
                <ItemHeader>
                  <div className="flex items-center gap-2">
                    <ItemTitle>{channel.name}</ItemTitle>
                    <Badge variant={getStatusVariant(channel.status)}>
                      {channel.status}
                    </Badge>
                    {!channel.enabled && (
                      <Badge variant="outline">disabled</Badge>
                    )}
                  </div>
                  <ItemActions>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(channel.id)}
                    >
                      {t('common.edit')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        handleDelete(channel.id).catch(() => {});
                      }}
                      disabled={actionLoading[channel.id]}
                    >
                      <IconTrash className="size-4" />
                    </Button>
                  </ItemActions>
                </ItemHeader>
                <ItemDescription>
                  <div className="mt-2 flex flex-col gap-1 text-xs">
                    <span>{t('channels.type')}: Telegram</span>
                    <span>
                      {t('channels.default_chat_id')}:{' '}
                      {channel.config.defaultChatId || '-'}
                    </span>
                    <span>
                      {t('channels.allowed_chat_ids')}:{' '}
                      {(channel.config.allowedChatIds || []).join(', ') || '-'}
                    </span>
                    <span>
                      {t('channels.bot_identity')}:{' '}
                      {channel.metadata?.username
                        ? `@${channel.metadata.username}`
                        : '-'}
                    </span>
                  </div>
                </ItemDescription>
                <ItemSeparator />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      actionLoading[channel.id] || channel.status === 'running'
                    }
                    onClick={() => {
                      withAction(channel.id, async () => {
                        const response = await window.electron.channels.start(
                          channel.id,
                        );
                        toast.success(response.status);
                      });
                    }}
                  >
                    <IconPlayerPlay className="mr-1 size-4" />
                    {t('channels.connect')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      actionLoading[channel.id] || channel.status === 'stopped'
                    }
                    onClick={() => {
                      withAction(channel.id, async () => {
                        const response = await window.electron.channels.stop(
                          channel.id,
                        );
                        toast.success(response.status);
                      });
                    }}
                  >
                    <IconPlayerPause className="mr-1 size-4" />
                    {t('channels.disconnect')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionLoading[channel.id]}
                    onClick={() => {
                      withAction(channel.id, async () => {
                        const response = await window.electron.channels.restart(
                          channel.id,
                        );
                        toast.success(response.status);
                      });
                    }}
                  >
                    <IconRefresh className="mr-1 size-4" />
                    {t('channels.restart')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pairingLoading[channel.id]}
                    onClick={() => {
                      handleGeneratePairingCode(channel.id).catch(() => {});
                    }}
                  >
                    <IconPlugConnected className="mr-1 size-4" />
                    {t('channels.generate_pairing_code')}
                  </Button>
                </div>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </ScrollArea>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {form.id ? t('channels.edit_channel') : t('channels.add_channel')}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>{t('common.name')}</Label>
                <Input
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>{t('channels.bot_token')}</Label>
                <InputPassword
                  value={form.token}
                  placeholder={
                    form.id ? t('channels.keep_token_placeholder') : ''
                  }
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, token: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>{t('channels.default_chat_id')}</Label>
                <Input
                  value={form.defaultChatId}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      defaultChatId: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>{t('channels.allowed_chat_ids')}</Label>
                <Textarea
                  value={form.allowedChatIdsText}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      allowedChatIdsText: event.target.value,
                    }))
                  }
                  placeholder={t('channels.allowed_chat_ids_placeholder')}
                />
              </div>
              <div className="grid gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(value) =>
                      setForm((prev) => ({ ...prev, enabled: value }))
                    }
                  />
                  <Label>{t('common.active')}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.autoStart}
                    onCheckedChange={(value) =>
                      setForm((prev) => ({ ...prev, autoStart: value }))
                    }
                  />
                  <Label>{t('channels.auto_start')}</Label>
                </div>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                handleSave().catch(() => {});
              }}
              disabled={saving}
            >
              {saving ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pairingGuide.open}
        onOpenChange={(open) => {
          if (open) {
            setPairingGuide((prev) => ({ ...prev, open: true }));
            return;
          }
          closePairingGuide().catch(() => {});
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('channels.pairing_dialog_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('channels.pairing_dialog_description', {
                channel: pairingGuide.channelName,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2 text-sm">
            <div>{t('channels.pairing_dialog_waiting')}</div>
            <div>{t('channels.pairing_dialog_close_hint')}</div>
            <div>
              <strong>{t('channels.pairing_code')}:</strong>{' '}
              {pairingGuide.code || '-'}
            </div>
            <div>
              <strong>{t('channels.pairing_expires_at')}:</strong>{' '}
              {formatPairingExpiresAt(pairingGuide.expiresAt)}
            </div>
            <div>{t('channels.pairing_step_1')}</div>
            <div>
              {t('channels.pairing_step_2', {
                command: pairCommand,
                code: pairingGuide.code,
              })}
            </div>
            <div>{t('channels.pairing_step_3')}</div>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction>{t('common.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {loading && (
        <div className="text-sm text-muted-foreground">
          {t('common.loading')}
        </div>
      )}
    </div>
  );
}
