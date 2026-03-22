import type { BotCommand } from 'grammy/types';

export type ChannelType = 'telegram' | 'discord';

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
  appId?: string;
  appSecret?: string;
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


export type ChannelInfo = Omit<TelegramChannel, 'config'> & {
  status: ChannelStatus;
  errorMessage?: string;
  lastEventAt?: string;
  lastEventSummary?: string;
  metadata?: {
    username?: string;
    firstName?: string;
    botId?: number;
  };
  pairingCode?: string;
  pairingCodeExpiresAt?: string;
  pairCommand?: string;
  config: TelegramChannelConfig & {
    token?: string;
    hasToken: boolean;
  };
};

export type SaveChannelInput = Omit<TelegramChannel, 'id'> & {
  id?: string;
};

export type ChannelTestResult = {
  ok: boolean;
  message: string;
  info?: {
    username?: string;
    firstName?: string;
    botId?: number;
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
