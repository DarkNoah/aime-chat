import { Instances } from "@/entities/instances";

export enum InstanceType {
  BROWSER = 'browser',
}


export interface InstanceInfo extends Instances {
  status: 'running' | 'stop';
  webSocketUrl?: string;
}
