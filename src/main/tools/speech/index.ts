import BaseToolkit, { BaseToolkitParams } from '../base-toolkit';

export interface SpeechToolkitParams extends BaseToolkitParams {}

export class SpeechToolkit extends BaseToolkit {
  id: string = 'SpeechToolkit';

  constructor(params?: SpeechToolkitParams) {
    super([], params);
  }

  getTools() {
    return this.tools;
  }
}
