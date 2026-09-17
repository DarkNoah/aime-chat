import type { Instances } from '@/entities/instances';

export enum InstanceType {
  BROWSER = 'browser',
}

export interface InstanceInfo extends Instances {
  status: 'running' | 'stop';
  config: { engine: 'electron-chromium'; userDataPath: string };
  tabCount: number;
  threadCount: number;
  chromiumVersion: string;
}
