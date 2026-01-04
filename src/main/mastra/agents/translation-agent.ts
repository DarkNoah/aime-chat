import {
  Agent,
  AgentConfig,
  DynamicAgentInstructions,
} from '@mastra/core/agent';
import { BaseAgent, BaseAgentParams } from './base-agent';
import { RequestContext } from '@mastra/core/request-context';
import { ChatRequestContext } from '@/types/chat';
import { Mastra } from '@mastra/core';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { Skill } from '@/main/tools/common/skill';
import { app } from 'electron';

export class Translation extends BaseAgent {
  id: string = 'Translation';
  name: string = 'Translation';
  description?: string = `translation expert`;
  instructions: DynamicAgentInstructions = ({ requestContext, mastra }) => {
    return {
      role: 'system',
      content: `You are a translation expert.`,
    };
  };

  isHidden = true;
  tools: string[] = [];
  constructor(params: BaseAgentParams) {
    super(params);
  }
}
