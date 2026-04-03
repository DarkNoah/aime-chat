import type { BotCommand } from 'grammy/types';

export type ChannelType = 'telegram' | 'discord' | 'weixin';

export type ChannelStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error';

export type ChannelQuickCommand = {
  command: string;
  description: string;
  replyText: string;
};

export type TelegramChannelConfig = {
  token?: string;
  defaultChatId?: string;
  allowedChatIds?: string[];
  currentThreadId?: string;
  currentProjectId?: string;
};

export type WeixinChannelConfig = {
  botToken?: string;
  accountId?: string;
  baseUrl?: string;
  cdnBaseUrl?: string;
  routeTag?: string;
  loginUserId?: string;
  getUpdatesBuf?: string;
  currentThreadId?: string;
  currentProjectId?: string;
};

export type ChannelBase = {
  id: string;
  type: ChannelType;
  name: string;
  enabled: boolean;
  autoStart: boolean;
};

export type TelegramChannel = ChannelBase & {
  type: 'telegram';
  config: TelegramChannelConfig;
};

export type WeixinChannel = ChannelBase & {
  type: 'weixin';
  config: WeixinChannelConfig;
};

export type ChannelConfig = TelegramChannel | WeixinChannel;

export type ChannelInfo = Omit<ChannelConfig, 'config'> & {
  status: ChannelStatus;
  errorMessage?: string;
  lastEventAt?: string;
  lastEventSummary?: string;
  metadata?: {
    username?: string;
    firstName?: string;
    botId?: number;
    accountId?: string;
    userId?: string;
    baseUrl?: string;
    loginStatus?: WeixinLoginStatus;
  };
  pairingCode?: string;
  pairingCodeExpiresAt?: string;
  pairCommand?: string;
  config: (TelegramChannelConfig &
    WeixinChannelConfig & {
      token?: string;
      botToken?: string;
      defaultChatId?: string;
      allowedChatIds?: string[];
      accountId?: string;
      baseUrl?: string;
      cdnBaseUrl?: string;
      routeTag?: string;
      loginUserId?: string;
    }) & {
    hasToken: boolean;
  };
};

export type SaveTelegramChannelInput = Omit<TelegramChannel, 'id'> & {
  id?: string;
};

export type SaveWeixinChannelInput = Omit<WeixinChannel, 'id'> & {
  id?: string;
};

export type SaveChannelInput = SaveTelegramChannelInput | SaveWeixinChannelInput;

export type ChannelTestResult = {
  ok: boolean;
  message: string;
  info?: {
    username?: string;
    firstName?: string;
    botId?: number;
    accountId?: string;
    userId?: string;
    baseUrl?: string;
  };
};

export type SendChannelMessageInput = {
  chatId?: string;
  text: string;
};

export type SendChannelFileInput = {
  chatId?: string;
  filePath: string;
  caption?: string;
};

export type ChannelCommandsResult = {
  commands: BotCommand[];
};

export type ChannelPairingCodeResult = {
  code: string;
  expiresAt: string;
  command: string;
  message: string;
};

export type WeixinLoginStatus =
  | 'idle'
  | 'wait'
  | 'scaned'
  | 'confirmed'
  | 'expired'
  | 'cancelled';

export type WeixinLoginStartResult = {
  sessionKey: string;
  qrcodeBase64: string;
  expiresAt: string;
  message: string;
};

export type WeixinLoginStatusResult = {
  sessionKey?: string;
  status: WeixinLoginStatus;
  qrcodeBase64?: string;
  expiresAt?: string;
  message: string;
  connected?: boolean;
  accountId?: string;
  userId?: string;
  baseUrl?: string;
};

export type ChannelPairedEventPayload = {
  channelId: string;
  channelName: string;
  chatId: string;
  title?: string;
  defaultChatId?: string;
};

export type ChannelPairingExpiredEventPayload = {
  channelId: string;
  channelName: string;
  failedAttempts: number;
};

export enum ChannelEvent {
  Paired = 'channel:event:paired',
  PairingExpired = 'channel:event:pairingExpired',
}
