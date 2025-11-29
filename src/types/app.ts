export class AppInfo {
  name: string;
  appPath: string;
  userData: string;
  appData: string;
  homePath: string;
  dataPath: string;
  modelPath: string;
  version: string;
  platform: string;
  resourcesPath: string;
  cwd: string;
  execPath: string;
  type: string;
  systemVersion: string;
  isPackaged: boolean;
  theme: string;
  shouldUseDarkColors: boolean;
  defaultModel: {
    model: string;
    fastModel: string;
    visionModel: string;
  };
  proxy: AppProxy;
  apiServer: {
    status: 'running' | 'stopped';
    enabled: boolean;
    port: number;
  };
}

export class AppProxy {
  mode: 'system' | 'custom' | 'noproxy';
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  proxyType?: 'http' | 'https' | 'socks5';
}
