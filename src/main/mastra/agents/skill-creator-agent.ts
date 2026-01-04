import {
  Agent,
  AgentConfig,
  DynamicAgentInstructions,
} from '@mastra/core/agent';
import { BaseAgent, BaseAgentParams } from './base-agent';
import { ToolType } from '@/types/tool';
import { TodoWrite } from '@/main/tools/common/todo-write';
import { AskUserQuestion } from '@/main/tools/common/ask-user-question';
import { Read } from '@/main/tools/file-system/read';
import { Write } from '@/main/tools/file-system/write';
import { Bash } from '@/main/tools/file-system/bash';
import { Edit } from '@/main/tools/file-system/edit';
import { Glob } from '@/main/tools/file-system/glob';
import { Grep } from '@/main/tools/file-system/grep';
import { WebFetch } from '@/main/tools/web/web-fetch';
import { WebSearch } from '@/main/tools/web/web-search';
import { CodeExecution } from '@/main/tools/code/code-execution';
import { RequestContext } from '@mastra/core/request-context';
import { ChatRequestContext } from '@/types/chat';
import { Mastra } from '@mastra/core';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { Skill } from '@/main/tools/common/skill';
import { app } from 'electron';

export class SkillCreator extends BaseAgent {
  id: string = 'SkillCreator';
  name: string = 'SkillCreator';
  description?: string = `Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends agent capabilities with specialized knowledge, workflows, or tool integrations.`;
  instructions: DynamicAgentInstructions = ({
    requestContext,
    mastra,
  }: {
    requestContext: RequestContext<ChatRequestContext>;
    mastra: Mastra;
  }) => {
    return {
      role: 'system',
      content: `You are a file search specialist. You excel at thoroughly navigating and exploring codebases.


Here is useful information about the environment you are running in:
<env>
Working directory: ${path.join(app.getPath('userData'), 'skills')}
Platform: ${process.platform}
OS Version: ${os.type()} ${os.release()}
Today's date: ${new Date().toISOString().split('T')[0]}
</env>`,
    };
  };
  isHidden = true;
  // model: string = 'openai/gpt-4o-mini';
  tools: string[] = [
    `${ToolType.BUILD_IN}:${TodoWrite.name}`,
    // `${ToolType.BUILD_IN}:${AskUserQuestion.name}`,
    // `${ToolType.BUILD_IN}:${Task.name}`,
    `${ToolType.BUILD_IN}:${Bash.name}`,
    `${ToolType.BUILD_IN}:${Read.name}`,
    `${ToolType.BUILD_IN}:${Write.name}`,
    `${ToolType.BUILD_IN}:${Edit.name}`,
    `${ToolType.BUILD_IN}:${Glob.name}`,
    `${ToolType.BUILD_IN}:${Grep.name}`,
    `${ToolType.BUILD_IN}:${WebFetch.name}`,
    `${ToolType.BUILD_IN}:${WebSearch.name}`,
    `${ToolType.BUILD_IN}:${CodeExecution.name}`,
    `${ToolType.BUILD_IN}:${Skill.name}`,
  ];
  constructor(params: BaseAgentParams) {
    super(params);
  }
}
