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

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
  files?: Array<{
    url: string;
    sha512?: string;
    size?: number;
  }>;
}

export interface UpdateProgress {
  bytesPerSecond: number;
  percent: number;
  transferred: number;
  total: number;
}

export interface UpdateState {
  status: UpdateStatus;
  updateInfo?: UpdateInfo;
  progress?: UpdateProgress;
  error?: string;
}

// Screen Capture Types
export type ScreenCaptureMode = 'fullscreen' | 'selection' | 'window';

export interface ScreenCaptureOptions {
  mode: ScreenCaptureMode;
  sourceId?: string; // 用于窗口模式
}

export interface ScreenCaptureResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string; // base64
}

export interface RuntimeInfo {
  uv?: {
    status: 'installed' | 'not_installed' | 'installing';
    installed: boolean;
    path?: string;
    dir?: string;
    version?: string;
  };
  bun: {
    status: 'installed' | 'not_installed' | 'installing';
    installed: boolean;
    path?: string;
    dir?: string;
    version?: string;
  };
  node: {
    installed: boolean;
    path?: string;
    dir?: string;
    version?: string;
  };
  paddleOcr: {
    status: 'installed' | 'not_installed' | 'installing';
    installed: boolean;
    path?: string;
    dir?: string;
    version?: string;
    mode: 'default' | 'pp-structurev3' | 'paddleocr-vl';
  };
}
