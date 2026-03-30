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
  WeixinLoginStatusResult,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select';
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
import { Project } from '@/types/project';
import {
  IconPlayerPause,
  IconPlayerPlay,
  IconPlugConnected,
  IconRefresh,
  IconTrash,
  IconPlus,
  IconQrcode,
} from '@tabler/icons-react';

type PairingGuideState = {
  open: boolean;
  channelId: string;
  channelName: string;
  code: string;
  expiresAt: string;
};

type TelegramFormState = {
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

type WeixinFormState = {
  id?: string;
  name: string;
  enabled: boolean;
  autoStart: boolean;
  baseUrl: string;
  cdnBaseUrl: string;
  routeTag: string;
  currentProjectId: string;
};

type WeixinQrState = {
  open: boolean;
  channelId: string;
  sessionKey: string;
  status: WeixinLoginStatusResult['status'];
  qrcodeBase64: string;
  expiresAt: string;
  message: string;
  connected: boolean;
  loading: boolean;
};

type ProjectOption = Pick<Project, 'id' | 'title'>;

const EMPTY_PROJECT_VALUE = '__none__';

const createEmptyTelegramForm = (): TelegramFormState => ({
  name: '',
  enabled: true,
  autoStart: true,
  token: '',
  defaultChatId: '',
  allowedChatIdsText: '',
  pairingCode: '',
  pairingCodeExpiresAt: '',
});

const createEmptyWeixinForm = (): WeixinFormState => ({
  name: '',
  enabled: true,
  autoStart: true,
  baseUrl: '',
  cdnBaseUrl: '',
  routeTag: '',
  currentProjectId: '',
});

const createEmptyWeixinQr = (): WeixinQrState => ({
  open: false,
  channelId: '',
  sessionKey: '',
  status: 'idle',
  qrcodeBase64: '',
  expiresAt: '',
  message: '',
  connected: false,
  loading: false,
});

function getStatusVariant(
  status: ChannelInfo['status'],
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'running') return 'default';
  if (status === 'error') return 'destructive';
  if (status === 'starting' || status === 'stopping') return 'secondary';
  return 'outline';
}

function toTelegramForm(channel: ChannelInfo): TelegramFormState {
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

function toWeixinForm(channel: ChannelInfo): WeixinFormState {
  return {
    id: channel.id,
    name: channel.name,
    enabled: channel.enabled,
    autoStart: channel.autoStart,
    baseUrl: channel.config.baseUrl || '',
    cdnBaseUrl: channel.config.cdnBaseUrl || '',
    routeTag: channel.config.routeTag || '',
    currentProjectId: channel.config.currentProjectId || '',
  };
}

export default function Channels() {
  const { t } = useTranslation();
  const { setTitle } = useHeader();
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [weixinDialogOpen, setWeixinDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>(
    {},
  );
  const [form, setForm] = useState<TelegramFormState>(
    createEmptyTelegramForm(),
  );
  const [weixinForm, setWeixinForm] = useState<WeixinFormState>(
    createEmptyWeixinForm(),
  );
  const [pairingLoading, setPairingLoading] = useState<Record<string, boolean>>(
    {},
  );
  const [weixinQr, setWeixinQr] = useState<WeixinQrState>(
    createEmptyWeixinQr(),
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

  const loadProjects = async () => {
    try {
      const data = await window.electron.projects.getList({
        page: 0,
        size: 100,
      });
      setProjects(data.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
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
            setForm(toTelegramForm(data));
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
            setForm(toTelegramForm(data));
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

  useEffect(() => {
    loadProjects().catch(() => {});
  }, []);

  const runningCount = useMemo(
    () => channels.filter((item) => item.status === 'running').length,
    [channels],
  );

  const projectNameMap = useMemo(
    () =>
      new Map(
        projects.map((item) => [item.id || '', item.title || item.id || '']),
      ),
    [projects],
  );

  const openCreateTelegram = () => {
    setForm(createEmptyTelegramForm());
    setDialogOpen(true);
  };

  const openEditTelegram = async (channelId: string) => {
    try {
      const data = await window.electron.channels.get(channelId);
      setForm(toTelegramForm(data));
      setDialogOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const openEditWeixin = async (channelId: string) => {
    try {
      const data = await window.electron.channels.get(channelId);
      setWeixinForm(toWeixinForm(data));
      setWeixinDialogOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleSaveTelegram = async () => {
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

  const handleSaveWeixin = async () => {
    setSaving(true);
    try {
      const payload: SaveChannelInput = {
        id: weixinForm.id,
        type: 'weixin',
        name: weixinForm.name,
        enabled: weixinForm.enabled,
        autoStart: weixinForm.autoStart,
        config: {
          baseUrl: weixinForm.baseUrl,
          cdnBaseUrl: weixinForm.cdnBaseUrl,
          routeTag: weixinForm.routeTag,
          currentProjectId: weixinForm.currentProjectId,
        },
      };
      await window.electron.channels.save(payload);
      setWeixinDialogOpen(false);
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

  // --- Weixin QR flow ---

  const startWeixinQrLogin = async (channelId: string) => {
    setWeixinQr((prev) => ({ ...prev, loading: true }));
    try {
      const result = await window.electron.channels.weixinStartLogin(channelId);
      setWeixinQr({
        open: true,
        channelId,
        sessionKey: result.sessionKey,
        status: 'wait',
        qrcodeBase64: result.qrcodeBase64,
        expiresAt: result.expiresAt,
        message: result.message,
        connected: false,
        loading: false,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      setWeixinQr((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleAddWeixin = async () => {
    setWeixinQr((prev) => ({ ...prev, loading: true }));
    try {
      const saved = await window.electron.channels.save({
        type: 'weixin',
        name: `WeChat-${Date.now().toString(36)}`,
        enabled: true,
        autoStart: true,
        config: {},
      });
      await loadChannels();
      await startWeixinQrLogin(saved.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      setWeixinQr((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleWeixinReconnect = async (channelId: string) => {
    await startWeixinQrLogin(channelId);
  };

  const closeWeixinQr = () => {
    const { channelId } = weixinQr;
    if (channelId) {
      window.electron.channels.weixinCancelLogin(channelId).catch(() => {});
    }
    setWeixinQr(createEmptyWeixinQr());
  };

  useEffect(() => {
    if (
      !weixinQr.open ||
      !weixinQr.channelId ||
      !weixinQr.sessionKey ||
      !['wait', 'scaned'].includes(weixinQr.status)
    ) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const poll = async () => {
        try {
          const result = await window.electron.channels.weixinCheckLoginStatus(
            weixinQr.channelId,
            weixinQr.sessionKey,
          );

          setWeixinQr((prev) => ({
            ...prev,
            sessionKey: result.sessionKey || prev.sessionKey,
            status: result.status,
            qrcodeBase64: result.qrcodeBase64 || prev.qrcodeBase64,
            expiresAt: result.expiresAt || prev.expiresAt,
            message: result.message,
            connected: Boolean(result.connected),
          }));

          if (result.status === 'confirmed') {
            toast.success('微信连接成功');
            await loadChannels();
          }
        } catch (error) {
          toast.error(error instanceof Error ? error.message : String(error));
        }
      };

      poll().catch(() => {});
    }, 2000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [weixinQr.open, weixinQr.channelId, weixinQr.sessionKey, weixinQr.status]);

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
          <Button onClick={openCreateTelegram}>
            <IconPlus className="mr-1 size-4" />
            Telegram
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              handleAddWeixin().catch(() => {});
            }}
            disabled={weixinQr.loading}
          >
            <IconQrcode className="mr-1 size-4" />
            微信
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
                    {channel.type === 'telegram' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditTelegram(channel.id)}
                      >
                        {t('common.edit')}
                      </Button>
                    )}
                    {channel.type === 'weixin' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditWeixin(channel.id)}
                        >
                          {t('common.edit')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            handleWeixinReconnect(channel.id).catch(() => {});
                          }}
                          disabled={weixinQr.loading}
                        >
                          <IconQrcode className="mr-1 size-4" />
                          扫码连接
                        </Button>
                      </>
                    )}
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
                    <span>
                      {t('channels.type')}:{' '}
                      {channel.type === 'weixin' ? '微信' : 'Telegram'}
                    </span>
                    {channel.type === 'telegram' ? (
                      <>
                        <span>
                          {t('channels.default_chat_id')}:{' '}
                          {channel.config.defaultChatId || '-'}
                        </span>
                        <span>
                          {t('channels.allowed_chat_ids')}:{' '}
                          {(channel.config.allowedChatIds || []).join(', ') ||
                            '-'}
                        </span>
                        <span>
                          {t('channels.bot_identity')}:{' '}
                          {channel.metadata?.username
                            ? `@${channel.metadata.username}`
                            : '-'}
                        </span>
                      </>
                    ) : (
                      <>
                        <span>
                          Account:{' '}
                          {channel.metadata?.accountId ||
                            channel.config.accountId ||
                            '-'}
                        </span>
                        <span>
                          User:{' '}
                          {channel.metadata?.userId ||
                            channel.config.loginUserId ||
                            '-'}
                        </span>
                        <span>
                          项目:{' '}
                          {projectNameMap.get(
                            channel.config.currentProjectId || '',
                          ) ||
                            channel.config.currentProjectId ||
                            '-'}
                        </span>
                      </>
                    )}
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
                  {channel.type === 'telegram' && (
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
                  )}
                </div>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </ScrollArea>

      {/* Telegram edit dialog */}
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
                handleSaveTelegram().catch(() => {});
              }}
              disabled={saving}
            >
              {saving ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={weixinDialogOpen} onOpenChange={setWeixinDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑微信渠道</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>{t('common.name')}</Label>
                <Input
                  value={weixinForm.name}
                  onChange={(event) =>
                    setWeixinForm((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Project</Label>
                <Select
                  value={weixinForm.currentProjectId || EMPTY_PROJECT_VALUE}
                  onValueChange={(value) =>
                    setWeixinForm((prev) => ({
                      ...prev,
                      currentProjectId:
                        value === EMPTY_PROJECT_VALUE ? '' : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择一个项目" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_PROJECT_VALUE}>
                      不绑定项目
                    </SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id || ''}>
                        {project.title || project.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={weixinForm.enabled}
                    onCheckedChange={(value) =>
                      setWeixinForm((prev) => ({ ...prev, enabled: value }))
                    }
                  />
                  <Label>{t('common.active')}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={weixinForm.autoStart}
                    onCheckedChange={(value) =>
                      setWeixinForm((prev) => ({
                        ...prev,
                        autoStart: value,
                      }))
                    }
                  />
                  <Label>{t('channels.auto_start')}</Label>
                </div>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setWeixinDialogOpen(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                handleSaveWeixin().catch(() => {});
              }}
              disabled={saving}
            >
              {saving ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Weixin QR code login dialog */}
      <Dialog
        open={weixinQr.open}
        onOpenChange={(open) => {
          if (!open) closeWeixinQr();
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>微信扫码连接</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <Badge variant={weixinQr.connected ? 'default' : 'outline'}>
              {weixinQr.status === 'wait' && '等待扫码'}
              {weixinQr.status === 'scaned' && '已扫码，请在手机上确认'}
              {weixinQr.status === 'confirmed' && '连接成功'}
              {weixinQr.status === 'expired' && '二维码已过期'}
              {weixinQr.status === 'cancelled' && '已取消'}
              {weixinQr.status === 'idle' && '准备中'}
            </Badge>

            {weixinQr.qrcodeBase64 &&
              !weixinQr.connected &&
              weixinQr.status !== 'expired' && (
                <div className="rounded-lg border bg-white p-3">
                  <img
                    src={weixinQr.qrcodeBase64}
                    alt="WeChat QR"
                    className="h-52 w-52"
                  />
                </div>
              )}

            {weixinQr.connected && (
              <div className="text-center text-sm text-green-600">
                微信已连接成功，可以关闭此窗口。
              </div>
            )}

            {weixinQr.status === 'expired' && (
              <div className="flex flex-col items-center gap-2">
                <div className="text-sm text-muted-foreground">
                  {weixinQr.message}
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    startWeixinQrLogin(weixinQr.channelId).catch(() => {});
                  }}
                  disabled={weixinQr.loading}
                >
                  <IconRefresh className="mr-1 size-4" />
                  重新获取二维码
                </Button>
              </div>
            )}

            {weixinQr.message &&
              !weixinQr.connected &&
              weixinQr.status !== 'expired' && (
                <div className="text-xs text-muted-foreground">
                  {weixinQr.message}
                </div>
              )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeWeixinQr}>
              {weixinQr.connected ? '关闭' : '取消'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Telegram pairing guide */}
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
