import type { Instances } from '@/entities/instances';

export enum InstanceType {
  BROWSER = 'browser',
}

export type BrowserType = 'chrome' | 'edge' | 'chromium';

export interface BrowserExecutableOption {
  browser: BrowserType;
  label: string;
  executablePath?: string;
  installed: boolean;
}

export interface BrowserProfile {
  name: string;
  userDataPath: string;
  browser: BrowserType;
  executablePath?: string;
  isBuiltIn?: boolean;
  availableBrowsers?: BrowserExecutableOption[];
}

export interface InstanceInfo extends Instances {
  status: 'running' | 'stop';
  webSocketUrl?: string;
}
