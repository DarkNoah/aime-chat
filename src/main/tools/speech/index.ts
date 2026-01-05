import BaseToolkit, { BaseToolkitParams } from '../base-toolkit';

export interface SpeechToolkitParams extends BaseToolkitParams {}

export class SpeechToolkit extends BaseToolkit {
  static readonly toolName = 'SpeechToolkit';
  id: string = 'SpeechToolkit';

  constructor(params?: SpeechToolkitParams) {
    super([], params);
  }

  getTools() {
    return this.tools;
  }
}
